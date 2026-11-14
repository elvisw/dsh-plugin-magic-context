"""Drive the T3 post-Historian acceptance through the isolated real host.

Sequence: seed (real Historian) -> bounded wait -> settle -> prove no unlanded
compartment -> E1 (tag) and E2 (message) in separate hosts, each with its own
pre/post snapshots. The script never edits the daily DSH profile or session DB.
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

from prepare_t3_host import DSH_CMD, REPORT_DIR, isolated_env

POINTER = REPORT_DIR / "experiment-root.json"
ROOT = Path(json.loads(POINTER.read_text(encoding="utf-8"))["root"])
EVIDENCE = ROOT / "evidence"
WORKSPACE = ROOT / "workspace"
HISTORIAN = ROOT / "overlays" / "historian.yml"
SETTLE = ROOT / "overlays" / "settle.yml"
DB = ROOT / "plugin-data" / "dsh-magic-context.db"


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


def run_host(label: str, args: list[str], timeout: int = 240) -> dict:
    started = time.monotonic()
    try:
        result = subprocess.run(
            [*DSH_CMD, *args], cwd=WORKSPACE, env=isolated_env(ROOT),
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
            "SELECT tag_number, queued_at, landed_event_seq FROM pending_drops WHERE session_id = ? ORDER BY tag_number",
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


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--only", choices=["seed", "wait", "settle", "e1", "e2"], action="append")
    options = parser.parse_args()
    selected = options.only or ["seed", "wait", "settle", "e1", "e2"]
    state_path = EVIDENCE / "t3-state.json"
    state = json.loads(state_path.read_text(encoding="utf-8")) if state_path.exists() else {}
    preflight = json.loads((EVIDENCE / "preflight.json").read_text(encoding="utf-8"))

    if "seed" in selected:
        seed = run_host(
            "t3-seed",
            common(
                "This is an isolated T3 post-Historian acceptance seed. In separate sequential model steps: "
                "read fixture.txt once and note the actual §N§ tag on its result; call ctx_reduce with drop set "
                "to ONLY that tag; read historian-fixture.txt once. Then respond only SEED_READY and that tag "
                "number. Do not call ctx_expand, do not reread, do not quote either file, and do not use other tools.",
                HISTORIAN,
            ),
            timeout=240,
        )
        if not seed.get("session_id"):
            raise SystemExit("seed did not return a session id")
        state.update({"sessionId": seed["session_id"], "seed": seed})
        identity = seed_identity(seed["session_id"], preflight["nonce"])
        state["identity"] = identity
        state_path.write_text(json.dumps(state, ensure_ascii=False, indent=2), encoding="utf-8")

    session_id = state.get("sessionId")
    if not session_id:
        raise SystemExit("run seed first")
    identity = state.get("identity") or seed_identity(session_id, preflight["nonce"])
    state["identity"] = identity

    if "wait" in selected:
        waits = []
        for attempt in range(1, 5):
            record = run_host(
                f"t3-wait-{attempt}",
                common(
                    "Call acceptance_wait with seconds 20, then respond only WAIT_DONE. Do not use any other tool.",
                    HISTORIAN,
                    session_id,
                ),
                timeout=240,
            )
            waits.append(record)
            current_identity = seed_identity(session_id, preflight["nonce"])
            state["identity"] = current_identity
            placeholder = current_identity.get("placeholderSeq")
            if placeholder is not None:
                target = target_publish(session_id, placeholder)
                if target.get("ok"):
                    state["target"] = target
                    break
        state["waits"] = waits
        state_path.write_text(json.dumps(state, ensure_ascii=False, indent=2), encoding="utf-8")

    if "settle" in selected:
        settle = run_host(
            "t3-settle",
            common(
                "Call acceptance_wait with seconds 5, then respond only SETTLE_DONE. Do not use any other tool.",
                SETTLE,
                session_id,
            ),
            timeout=180,
        )
        state["settle"] = settle
        state_path.write_text(json.dumps(state, ensure_ascii=False, indent=2), encoding="utf-8")

    if "e1" in selected or "e2" in selected:
        if "target" not in state:
            raise SystemExit("target publish is not recorded; run wait first")
        if "placeholderSeq" not in identity or identity["placeholderSeq"] is None:
            raise SystemExit("placeholder seq is not recorded")
        target = state["target"]
        compartment_id = target["compartmentId"]
        before = db_state(session_id)
        assert_no_unlanded(before, "before E1/E2")
        pass_row = find_pass_row(before, compartment_id)
        if pass_row is None:
            raise SystemExit("target compartment has no pass journal row")
        state["precondition"] = {
            "unlanded": before["unlanded"],
            "target": next((row for row in before["compartments"]
                            if row["compartment_id"] == compartment_id
                            and row["landed_event_seq"] == target["publishSeq"]), None),
            "pass": pass_row,
        }
        if state["precondition"]["target"] is None:
            raise SystemExit("target compartment row is not landed at the publish seq")

    if "e1" in selected:
        pre = db_state(session_id)
        record = run_host(
            "t3-e1-tag",
            common(
                f"Resume the persisted T3 session. Call ONLY ctx_expand with tag set to {identity['tag']}. "
                "Do not call any other tool and do not read any file. Respond E1_OK plus the nonce from the restored "
                "original if it is available; otherwise report the exact refusal.",
                SETTLE,
                session_id,
            ),
            timeout=180,
        )
        post = db_state(session_id)
        result = find_expand_result(session_id, 0)
        state["e1"] = {"record": record, "result": result, "window": compare_window(pre, post, "e1")}
        state_path.write_text(json.dumps(state, ensure_ascii=False, indent=2), encoding="utf-8")

    if "e2" in selected:
        pre = db_state(session_id)
        record = run_host(
            "t3-e2-message",
            common(
                f"Resume the persisted T3 session. Call ONLY ctx_expand with message set to the decimal string "
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
        state["e2"] = {"record": record, "result": result, "window": compare_window(pre, post, "e2")}
        state_path.write_text(json.dumps(state, ensure_ascii=False, indent=2), encoding="utf-8")

    state_path.write_text(json.dumps(state, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps({
        "sessionId": session_id,
        "tag": state.get("identity", {}).get("tag"),
        "originalSeq": state.get("identity", {}).get("originalSeq"),
        "placeholderSeq": state.get("identity", {}).get("placeholderSeq"),
        "target": state.get("target"),
        "precondition": state.get("precondition"),
        "e1": state.get("e1", {}).get("window"),
        "e2": state.get("e2", {}).get("window"),
    }, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
