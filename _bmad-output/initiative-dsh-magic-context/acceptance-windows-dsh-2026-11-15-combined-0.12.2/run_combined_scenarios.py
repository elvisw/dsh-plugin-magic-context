"""Drive the 0.12.2 combined-build acceptance through the isolated real host.

Chains: pre-publish recovery lifecycle, post-Historian E1/E2, manual flush and
vector/memory. Each session uses the same installed registry artifact. The
script never edits the daily DSH profile or session DB.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
from pathlib import Path
import re
import sqlite3
import subprocess
import sys
import time

from prepare_combined_host import DSH_CMD, REPORT_DIR, isolated_env

POINTER = REPORT_DIR / "experiment-root.json"
ROOT = Path(json.loads(POINTER.read_text(encoding="utf-8"))["root"])
EVIDENCE = ROOT / "evidence"
WORKSPACE = ROOT / "workspace"
RECOVERY = ROOT / "overlays" / "recovery.yml"
HISTORIAN = ROOT / "overlays" / "historian.yml"
SETTLE = ROOT / "overlays" / "settle.yml"
FLUSH = ROOT / "overlays" / "flush.yml"
VECTOR = ROOT / "overlays" / "vector.yml"
DB = ROOT / "plugin-data" / "dsh-magic-context.db"
PREFLIGHT = json.loads((EVIDENCE / "preflight.json").read_text(encoding="utf-8"))


def redact(text: str) -> str:
    for name, value in os.environ.items():
        if re.search(r"KEY|TOKEN|PASSWORD|SECRET", name, re.I) and len(value) >= 8:
            text = text.replace(value, "[REDACTED]")
    return text


def common(prompt: str, overlay: Path, session_id: str | None = None) -> list[str]:
    args = [
        "--profile", "headless",
        "--patch", str(overlay),
        "--json",
        "--permission-mode", "read-only",
        "--approval-policy", "never",
    ]
    if session_id is not None:
        args.extend(["--session-id", session_id])
    args.append(prompt)
    return args


def run_host(label: str, args: list[str], timeout: int = 240, env_extra: dict[str, str] | None = None) -> dict:
    started = time.monotonic()
    env = isolated_env(ROOT)
    if env_extra:
        env.update(env_extra)
    try:
        result = subprocess.run(
            [*DSH_CMD, *args], cwd=WORKSPACE, env=env,
            capture_output=True, text=True, encoding="utf-8", errors="replace", timeout=timeout,
        )
        stdout, stderr = redact(result.stdout), redact(result.stderr)
        record = {"args": args, "exit_code": result.returncode, "mode": "real-host"}
    except subprocess.TimeoutExpired as exc:
        stdout = redact((exc.stdout or b"").decode("utf-8", errors="replace"))
        stderr = redact((exc.stderr or b"").decode("utf-8", errors="replace"))
        record = {"args": args, "status": "timeout", "mode": "real-host"}
    record["seconds"] = round(time.monotonic() - started, 3)
    (EVIDENCE / f"{label}.stdout.txt").write_text(stdout, encoding="utf-8")
    (EVIDENCE / f"{label}.stderr.txt").write_text(stderr, encoding="utf-8")

    rows = []
    for line in stdout.splitlines():
        try:
            row = json.loads(line)
        except json.JSONDecodeError:
            continue
        if isinstance(row, dict):
            rows.append(row)
    session = next((row for row in rows if row.get("type") == "session"), None)
    final = next((row for row in reversed(rows) if row.get("type") == "final"), None)
    record.update({
        "session_id": session.get("sessionId") if session else None,
        "final_reason": final.get("reason") if final else None,
        "final_text": final.get("text") if final else None,
        "tool_calls": [
            {"tool": row.get("tool"), "input": row.get("input")}
            for row in rows if row.get("type") == "tool_call"
        ],
        "tool_results": [
            {"callId": row.get("callId"), "status": row.get("status"), "result": row.get("result")}
            for row in rows if row.get("type") == "tool_result"
        ],
    })
    (EVIDENCE / f"{label}.driver.json").write_text(json.dumps(record, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps({
        "label": label, "exit_code": record.get("exit_code"), "session_id": record["session_id"],
        "tool_calls": [entry["tool"] for entry in record["tool_calls"]],
        "final_reason": record["final_reason"],
    }, ensure_ascii=False))
    return record


def snapshot(session_id: str) -> dict:
    filename = f"{session_id}.jsonl" if session_id.startswith("session-") else f"session-{session_id}.jsonl"
    path = EVIDENCE / "session-observer" / filename
    if not path.exists():
        raise SystemExit(f"missing observer file: {path}")
    rows = []
    for index, line in enumerate(path.read_text(encoding="utf-8").splitlines(), start=1):
        try:
            row = json.loads(line)
        except json.JSONDecodeError:
            continue
        row["_line"] = index
        rows.append(row)
    if not rows:
        raise SystemExit("observer file is empty")
    latest = rows[-1]
    return {"path": str(path), "line": latest["_line"], **latest}


def event_map(snap: dict) -> dict[int, dict]:
    return {int(event["seq"]): event for event in snap.get("events", [])}


def event_text(event: dict) -> str:
    data = event.get("data") or {}
    content = (data.get("message") or {}).get("content") or data.get("content") or []
    return "".join(block.get("text", "") for block in content if block.get("type") == "text")


def seed_identity(session_id: str, nonce: str) -> dict:
    snap = snapshot(session_id)
    events = snap["events"]
    original = None
    read_call = None
    for event in events:
        if event.get("type") != "tool/result":
            continue
        text = event_text(event)
        if f"nonce={nonce}" not in text:
            continue
        if not re.match(r"^§\d+§ ", text):
            continue
        original = event
        call_id = event.get("data", {}).get("message", {}).get("toolCallId")
        read_call = next(
            (candidate for candidate in events
             if candidate.get("type") == "tool/call"
             and (candidate.get("data") or {}).get("callId") == call_id),
            None,
        )
        break
    if original is None:
        raise SystemExit("could not find the fixture read result in the observer")
    tag_match = re.match(r"^§(\d+)§ ", event_text(original))
    if tag_match is None:
        raise SystemExit("fixture result has no leading tag")
    tag = int(tag_match.group(1))
    call_id = original["data"]["message"]["toolCallId"]
    placeholders = [
        event for event in events
        if event.get("type") == "tool/result"
        and event.get("data", {}).get("message", {}).get("toolCallId") == call_id
        and event_text(event) == f"[dropped §{tag}§]"
    ]
    return {
        "tag": tag,
        "callId": call_id,
        "tool": (read_call.get("data") or {}).get("name") if read_call else None,
        "originalSeq": int(original["seq"]),
        "placeholderSeq": int(placeholders[-1]["seq"]) if placeholders else None,
        "originalText": event_text(original),
        "originalSha256": hashlib.sha256(event_text(original).encode("utf-8")).hexdigest(),
        "sourceFile": snap["path"],
        "sourceLine": snap["line"],
    }


def target_publish(session_id: str, placeholder_seq: int) -> dict:
    snap = snapshot(session_id)
    events = snap["events"]
    matches = []
    for event in events:
        if event.get("type") != "user/message":
            continue
        text = event_text(event)
        match = re.fullmatch(r"\[compacted §C(\d+)§\]", text.strip())
        if match is None:
            continue
        if placeholder_seq not in (event.get("sourceEventSeqs") or []):
            continue
        matches.append({
            "compartmentId": int(match.group(1)),
            "publishSeq": int(event["seq"]),
            "sourceEventSeqs": event.get("sourceEventSeqs") or [],
            "text": text,
        })
    if len(matches) != 1:
        return {"ok": False, "reason": f"expected one target publish, found {len(matches)}", "matches": matches}
    return {"ok": True, **matches[0], "sourceFile": snap["path"], "sourceLine": snap["line"]}


def db_state(session_id: str) -> dict:
    connection = sqlite3.connect(DB)
    connection.row_factory = sqlite3.Row
    try:
        compartments = [dict(row) for row in connection.execute(
            "SELECT compartment_id, tier_p1, tier_p2, tier_p3, tier_p4, facts, events, importance, "
            "covered_start_seq, covered_end_seq, covered_seqs, covered_tokens, baseline_epoch, "
            "landed_event_seq, landed_reason, superseded "
            "FROM compartments WHERE session_id = ? ORDER BY compartment_id, landed_event_seq",
            (session_id,),
        )]
        unlanded = [row for row in compartments
                    if row["landed_event_seq"] is None
                    and row["superseded"] == 0
                    and row["landed_reason"] is None]
        journal = {}
        for kind in ("historian", "compartment-published", "pass"):
            rows = [dict(row) for row in connection.execute(
                "SELECT id, at, kind, summary, data FROM journal WHERE session_id = ? AND kind = ? ORDER BY id",
                (session_id, kind),
            )]
            journal[kind] = {
                "count": len(rows),
                "maxId": rows[-1]["id"] if rows else None,
                "rows": rows,
            }
        usage_tables = [row[0] for row in connection.execute(
            "SELECT name FROM sqlite_master WHERE type = 'table' AND name LIKE '%usage%'",
        )]
        usage = {}
        for table in usage_tables:
            try:
                count = connection.execute(f"SELECT COUNT(*) FROM {table}").fetchone()[0]
                usage[table] = count
            except sqlite3.Error as error:
                usage[table] = f"error: {error}"
        tags = [dict(row) for row in connection.execute(
            "SELECT tag_number, target_kind, target_id FROM tags WHERE session_id = ? ORDER BY tag_number",
            (session_id,),
        )]
        pending = [dict(row) for row in connection.execute(
            "SELECT tag_number, queued_at, landed_event_seq, flush_requested FROM pending_drops WHERE session_id = ? ORDER BY tag_number",
            (session_id,),
        )]
    finally:
        connection.close()
    return {
        "compartments": compartments,
        "unlanded": unlanded,
        "journal": journal,
        "usageTables": usage,
        "tags": tags,
        "pendingDrops": pending,
        "compartmentSha256": hashlib.sha256(
            json.dumps(compartments, sort_keys=True, ensure_ascii=False).encode("utf-8")
        ).hexdigest(),
    }


def assert_no_unlanded(state: dict, label: str) -> None:
    if state["unlanded"]:
        raise SystemExit(f"{label}: {len(state['unlanded'])} unlanded compartment(s) remain")


def find_pass_row(state: dict, compartment_id: int) -> dict | None:
    for row in state["journal"]["pass"]["rows"]:
        try:
            data = json.loads(row["data"] or "{}")
        except json.JSONDecodeError:
            continue
        published = data.get("published") or []
        if compartment_id in published or str(compartment_id) in [str(item) for item in published]:
            return {"id": row["id"], "at": row["at"], "data": data}
    return None


def latest_seq(session_id: str) -> int:
    return max(int(event["seq"]) for event in snapshot(session_id)["events"])


def find_expand_result(session_id: str, before_seq: int) -> dict:
    snap = snapshot(session_id)
    events = snap["events"]
    calls = [event for event in events
             if event.get("type") == "tool/call"
             and (event.get("data") or {}).get("name") == "ctx_expand"
             and int(event["seq"]) >= before_seq]
    if not calls:
        raise SystemExit("no ctx_expand call found")
    call = calls[-1]
    call_id = (call.get("data") or {}).get("callId")
    result = next(
        (event for event in events
         if event.get("type") == "tool/result"
         and (event.get("data") or {}).get("message", {}).get("toolCallId") == call_id),
        None,
    )
    if result is None:
        raise SystemExit("no ctx_expand result found")
    return {
        "callSeq": int(call["seq"]),
        "callId": call_id,
        "resultSeq": int(result["seq"]),
        "resultText": event_text(result),
        "eventsAfterResult": [event for event in events if int(event["seq"]) > int(result["seq"])],
    }


def compare_window(pre: dict, post: dict, label: str) -> dict:
    errors = []
    if pre["compartmentSha256"] != post["compartmentSha256"]:
        errors.append("compartment rows changed")
    for kind in ("historian", "compartment-published"):
        if pre["journal"][kind]["count"] != post["journal"][kind]["count"]:
            errors.append(f"{kind} journal count changed")
    if pre["pendingDrops"] != post["pendingDrops"]:
        errors.append("pending drops changed")
    # Total usage_records always grows with the agent's own model step; the
    # ticket scopes the no-growth claim to the Historian, which is covered by
    # the unchanged `historian` journal count above. Keep the counts in the
    # evidence, but do not treat agent usage as a Historian mutation.
    return {"label": label, "ok": not errors, "errors": errors,
            "agentUsageDelta": {
                table: post["usageTables"].get(table, 0) - count
                for table, count in pre["usageTables"].items()
            },
            "pre": pre, "post": post}


def event_text_blob(snap: dict) -> str:
    return "\n".join(event_text(event) for event in snap.get("events", []))


def command_events(session_id: str) -> list[dict]:
    snap = snapshot(session_id)
    return [event for event in snap["events"] if str(event.get("type", "")).startswith("command/")]


def expand_calls(session_id: str) -> list[dict]:
    snap = snapshot(session_id)
    return [event for event in snap["events"]
            if event.get("type") == "tool/call"
            and (event.get("data") or {}).get("name") == "ctx_expand"]


def recovery_check(session_id: str, identity: dict, record: dict) -> dict:
    calls = [entry["tool"] for entry in record.get("tool_calls", [])]
    expands = expand_calls(session_id)
    if calls.count("ctx_reduce") < 2 or calls.count("ctx_expand") < 2:
        raise SystemExit(f"recovery lifecycle did not run reduce/expand twice: {calls}")
    if len(expands) < 2:
        raise SystemExit("recovery lifecycle did not record two ctx_expand calls")
    final_text = record.get("final_text") or ""
    if "RECOVERY_OK" not in final_text or PREFLIGHT["nonce"] not in final_text:
        raise SystemExit(f"recovery lifecycle did not return the nonce: {final_text[:300]}")
    if not any(identity["tag"] == tag["tag_number"] for tag in db_state(session_id)["tags"]):
        raise SystemExit("recovery original tag missing from tags table")
    return {
        "toolCalls": calls,
        "expandCallSeqs": [int(event["seq"]) for event in expands],
        "db": db_state(session_id),
    }


def memory_db_path() -> Path:
    return ROOT / "plugin-data" / "memories.db"


def count_table(path: Path, table: str) -> int:
    if not path.exists():
        return 0
    connection = sqlite3.connect(path)
    try:
        return connection.execute(f"SELECT COUNT(*) FROM {table}").fetchone()[0]
    finally:
        connection.close()


def vector_state() -> dict:
    memory_db = memory_db_path()
    plugin_db = DB
    embeddings = []
    active = []
    if memory_db.exists():
        connection = sqlite3.connect(memory_db)
        try:
            embeddings = [
                {"model_id": row[0], "rows": row[1]}
                for row in connection.execute(
                    "SELECT model_id, COUNT(*) FROM memory_embeddings GROUP BY model_id ORDER BY model_id"
                )
            ]
            active = [
                {"id": row[0], "status": row[1], "content": row[2][:120]}
                for row in connection.execute("SELECT id, status, content FROM memories ORDER BY id")
            ]
        finally:
            connection.close()
    vector_journal = []
    if plugin_db.exists():
        connection = sqlite3.connect(plugin_db)
        try:
            vector_journal = [
                {"id": row[0], "level": row[1], "summary": row[2],
                 "data": json.loads(row[3]) if row[3] else None}
                for row in connection.execute(
                    "SELECT id, level, summary, data FROM journal WHERE kind = 'vector-lane' ORDER BY id"
                )
            ]
        finally:
            connection.close()
    return {
        "memory_db": str(memory_db),
        "memories": count_table(memory_db, "memories"),
        "memory_embeddings": count_table(memory_db, "memory_embeddings"),
        "spaces": embeddings,
        "active": active,
        "vector_journal": vector_journal,
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--only",
        choices=["recovery", "recovery-old-tag", "seed", "wait", "settle", "e1", "e2", "flush-seed", "flush", "vector"],
        action="append",
    )
    options = parser.parse_args()
    selected = options.only or ["recovery", "recovery-old-tag", "seed", "wait", "settle", "e1", "e2", "flush-seed", "flush", "vector"]
    state_path = EVIDENCE / "combined-state.json"
    state = json.loads(state_path.read_text(encoding="utf-8")) if state_path.exists() else {}
    preflight = json.loads((EVIDENCE / "preflight.json").read_text(encoding="utf-8"))

    def save() -> None:
        state_path.write_text(json.dumps(state, ensure_ascii=False, indent=2), encoding="utf-8")

    if "recovery" in selected:
        record = run_host(
            "combined-recovery",
            common(
                "This is an isolated 0.12.2 combined-build recovery lifecycle test. Follow this exact sequence, "
                "one tool call per model step. (1) Read fixture.txt once and note the actual §N§ tag on its result. "
                "(2) Call ctx_reduce with drop set to ONLY that tag. (3) In a NEW model step, call ctx_expand with "
                "tag set to that SAME old tag. (4) The ctx_expand result begins with a NEW §M§ marker; note M, then "
                "call ctx_reduce with drop set to M. (5) In a NEW step, call ctx_expand with tag set to M and note "
                "the nonce. Respond RECOVERY_OK plus the nonce; otherwise report the exact refusal. Do not read any "
                "other file.",
                RECOVERY,
            ),
            timeout=300,
        )
        if not record.get("session_id"):
            raise SystemExit("recovery did not return a session id")
        identity = seed_identity(record["session_id"], preflight["nonce"])
        state["recovery"] = {
            "record": record,
            "identity": identity,
            "check": recovery_check(record["session_id"], identity, record),
        }
        save()

    if "recovery-old-tag" in selected:
        recovery = state.get("recovery", {})
        recovery_session = (recovery.get("record") or {}).get("session_id")
        old_tag = (recovery.get("identity") or {}).get("tag")
        if not recovery_session or old_tag is None:
            raise SystemExit("run recovery first")
        record = run_host(
            "combined-recovery-old-tag",
            common(
                f"Resume the persisted combined session. Call ONLY ctx_reduce with drop set to {old_tag}, "
                "which is the already-expanded old tag. Then respond OLD_TAG_REDUCE plus the exact tool result. "
                "Do not call ctx_expand, do not read any file, and do not use other tools.",
                RECOVERY,
                recovery_session,
            ),
            timeout=180,
        )
        recovery["oldTagReduce"] = record
        state["recovery"] = recovery
        save()

    if "seed" in selected:
        record = run_host(
            "combined-seed",
            common(
                "This is an isolated 0.12.2 combined-host acceptance seed. In separate sequential model steps: "
                "read fixture.txt once and note the actual §N§ tag on its result; call ctx_reduce with drop set "
                "to ONLY that tag; read historian-fixture.txt once. Then respond only SEED_READY and that tag "
                "number. Do not call ctx_expand, do not reread, do not quote either file, and do not use other tools.",
                HISTORIAN,
            ),
            timeout=240,
        )
        if not record.get("session_id"):
            raise SystemExit("seed did not return a session id")
        identity = seed_identity(record["session_id"], preflight["nonce"])
        state["historian"] = {"sessionId": record["session_id"], "seed": record, "identity": identity}
        save()

    hist = state.get("historian", {})
    session_id = hist.get("sessionId")
    identity = hist.get("identity")

    if "wait" in selected:
        if not session_id:
            raise SystemExit("run seed first")
        waits = []
        for attempt in range(1, 6):
            record = run_host(
                f"combined-wait-{attempt}",
                common(
                    "Call acceptance_wait with seconds 20, then respond only WAIT_DONE. Do not use any other tool.",
                    HISTORIAN,
                    session_id,
                ),
                timeout=240,
            )
            waits.append(record)
            identity = seed_identity(session_id, preflight["nonce"])
            hist["identity"] = identity
            placeholder = identity.get("placeholderSeq")
            if placeholder is not None:
                target = target_publish(session_id, placeholder)
                if target.get("ok"):
                    hist["target"] = target
                    break
        hist["waits"] = waits
        state["historian"] = hist
        save()

    if "settle" in selected:
        if not session_id:
            raise SystemExit("run seed/wait first")
        record = run_host(
            "combined-settle",
            common(
                "Call acceptance_wait with seconds 5, then respond only SETTLE_DONE. Do not use any other tool.",
                SETTLE,
                session_id,
            ),
            timeout=180,
        )
        hist["settle"] = record
        state["historian"] = hist
        save()

    if "e1" in selected or "e2" in selected:
        target = hist.get("target")
        if target is None:
            raise SystemExit("target publish is not recorded; run wait first")
        if not identity or identity.get("placeholderSeq") is None:
            raise SystemExit("placeholder seq is not recorded")
        compartment_id = target["compartmentId"]
        before = db_state(session_id)
        assert_no_unlanded(before, "before E1/E2")
        pass_row = find_pass_row(before, compartment_id)
        if pass_row is None:
            raise SystemExit("target compartment has no pass journal row")
        hist["precondition"] = {
            "unlanded": before["unlanded"],
            "target": next((row for row in before["compartments"]
                            if row["compartment_id"] == compartment_id
                            and row["landed_event_seq"] == target["publishSeq"]), None),
            "pass": pass_row,
        }
        if hist["precondition"]["target"] is None:
            raise SystemExit("target compartment row is not landed at the publish seq")
        state["historian"] = hist
        save()

    if "e1" in selected:
        pre = db_state(session_id)
        record = run_host(
            "combined-e1-tag",
            common(
                f"Resume the persisted combined session. Call ONLY ctx_expand with tag set to {identity['tag']}. "
                "Do not call any other tool and do not read any file. Respond E1_OK plus the nonce from the restored "
                "original if it is available; otherwise report the exact refusal.",
                SETTLE,
                session_id,
            ),
            timeout=180,
        )
        post = db_state(session_id)
        result = find_expand_result(session_id, 0)
        hist["e1"] = {"record": record, "result": result, "window": compare_window(pre, post, "e1")}
        state["historian"] = hist
        save()

    if "e2" in selected:
        pre = db_state(session_id)
        record = run_host(
            "combined-e2-message",
            common(
                f"Resume the persisted combined session. Call ONLY ctx_expand with message set to the decimal string "
                f"\"{identity['originalSeq']}\". Do not pass tag or tags, do not call any other tool, and do not read "
                "any file. Respond E2_OK plus the nonce from the restored original if it is available; otherwise "
                "report the exact refusal.",
                SETTLE,
                session_id,
            ),
            timeout=180,
        )
        post = db_state(session_id)
        result = find_expand_result(session_id, 0)
        hist["e2"] = {"record": record, "result": result, "window": compare_window(pre, post, "e2")}
        state["historian"] = hist
        save()

    if "flush-seed" in selected:
        record = run_host(
            "combined-flush-seed",
            common(
                "This is an isolated 0.12.2 manual-flush seed. Read fixture.txt once and note the actual §N§ tag on "
                "its result; call ctx_reduce with drop set to ONLY that tag. Then respond FLUSH_SEED_READY and that "
                "tag number. Do not call ctx_expand, do not reread, and do not use other tools.",
                FLUSH,
            ),
            timeout=240,
        )
        if not record.get("session_id"):
            raise SystemExit("flush seed did not return a session id")
        flush_identity = seed_identity(record["session_id"], preflight["nonce"])
        state["flush"] = {"sessionId": record["session_id"], "seed": record, "identity": flush_identity}
        save()

    flush_state = state.get("flush", {})
    flush_session = flush_state.get("sessionId")
    if "flush" in selected:
        if not flush_session:
            raise SystemExit("run flush-seed first")
        flush_evidence = EVIDENCE / "flush-command.jsonl"
        if flush_evidence.exists():
            flush_evidence.unlink()
        record = run_host(
            "combined-flush",
            common(
                "Resume the persisted combined session. Do not call any tool. Respond only FLUSH_DONE.",
                FLUSH,
                flush_session,
            ),
            timeout=180,
            env_extra={
                "MC_T4_SESSION_ID": flush_session,
                "MC_T4_FLUSH_EVIDENCE": str(flush_evidence),
            },
        )
        executions = []
        if flush_evidence.exists():
            for line in flush_evidence.read_text(encoding="utf-8").splitlines():
                try:
                    executions.append(json.loads(line))
                except json.JSONDecodeError:
                    continue
        if not any(item.get("execution", {}).get("kind") == "success" for item in executions):
            raise SystemExit(f"real ctx-flush command did not return success: {executions}")
        events = command_events(flush_session)
        if not any(event.get("type") == "command/run" for event in events) \
                or not any(event.get("type") == "command/done" for event in events):
            raise SystemExit("command/run and command/done events are missing")
        post = db_state(flush_session)
        if not post["pendingDrops"]:
            raise SystemExit("flush pending queue is empty")
        if any(row["landed_event_seq"] is None for row in post["pendingDrops"]):
            raise SystemExit("flush left a pending drop unlanded")
        if any(row["flush_requested"] != 0 for row in post["pendingDrops"]):
            raise SystemExit("flush marker was not cleared")
        snap = snapshot(flush_session)
        if f"[dropped §{flush_state['identity']['tag']}§]" not in event_text_blob(snap):
            raise SystemExit("placeholder missing from the flush session surface")
        flush_state.update({
            "record": record,
            "executions": executions,
            "commandEvents": events,
            "db": post,
            "placeholderSeen": True,
        })
        state["flush"] = flush_state
        save()

    if "vector" in selected:
        record = run_host(
            "combined-vector",
            common(
                "Isolated 0.12.2 combined vector smoke. Follow this exact sequence, one tool call per model step. "
                "(1) Call ctx_memory with action \"write\", category \"PROJECT_RULES\", content "
                "\"Always run npm test before committing changes.\". "
                "(2) Call vector_wait with seconds 120. "
                "(3) Call vector_wait with seconds 60. "
                "(4) Call ctx_memory with action \"search\", query \"npm test before committing\", limit 5. "
                "(5) Respond exactly VECTOR_OK. Do not call any other tool.",
                VECTOR,
            ),
            timeout=300,
        )
        vector = vector_state()
        text = json.dumps(record, ensure_ascii=False)
        if vector["memory_embeddings"] < 1:
            raise SystemExit("vector chain wrote no embedding")
        if "match=hybrid" not in text and '"match": "hybrid"' not in text and '"match":"hybrid"' not in text:
            raise SystemExit("ctx_memory search did not report hybrid match")
        state["vector"] = {"record": record, "db": vector}
        save()

    save()
    print(json.dumps({
        "recovery": (state.get("recovery", {}).get("check") or {}).get("toolCalls"),
        "historian": {
            "sessionId": hist.get("sessionId"),
            "tag": (hist.get("identity") or {}).get("tag"),
            "originalSeq": (hist.get("identity") or {}).get("originalSeq"),
            "placeholderSeq": (hist.get("identity") or {}).get("placeholderSeq"),
            "target": hist.get("target"),
            "e1": (hist.get("e1") or {}).get("window"),
            "e2": (hist.get("e2") or {}).get("window"),
        },
        "flush": {
            "sessionId": flush_state.get("sessionId"),
            "executions": flush_state.get("executions"),
            "placeholderSeen": flush_state.get("placeholderSeen"),
        },
        "vector": {
            "sessionId": (state.get("vector", {}).get("record") or {}).get("session_id"),
            "memories": (state.get("vector", {}).get("db") or {}).get("memories"),
            "embeddings": (state.get("vector", {}).get("db") or {}).get("memory_embeddings"),
        },
    }, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
