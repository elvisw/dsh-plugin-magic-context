"""Drive the V1.1 range/verbose acceptance through the isolated real host.

Sequence: seed (real Historian) -> bounded wait -> settle -> prove no unlanded
compartment -> R1 (range) -> R2 (verbose) -> R3-tag -> R3-message, each in its
own host process and each with its own pre/post snapshot. The script never edits
the daily DSH profile or session database.
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
import time

from prepare_v11_host import DSH_CMD, REPORT_DIR, isolated_env

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
                usage[table] = connection.execute(f"SELECT COUNT(*) FROM {table}").fetchone()[0]
            except sqlite3.Error as error:
                usage[table] = f"error: {error}"
        tags = [dict(row) for row in connection.execute(
            "SELECT tag_number, target_kind, target_id FROM tags WHERE session_id = ? ORDER BY tag_number",
            (session_id,),
        )]
        pending = [dict(row) for row in connection.execute(
            "SELECT tag_number, queued_at, landed_event_seq, flush_requested "
            "FROM pending_drops WHERE session_id = ? ORDER BY tag_number",
            (session_id,),
        )]
        baseline_count = 0
        baseline_tables = [row[0] for row in connection.execute(
            "SELECT name FROM sqlite_master WHERE type = 'table' AND name LIKE '%baseline%'",
        )]
        for table in baseline_tables:
            try:
                baseline_count += connection.execute(f"SELECT COUNT(*) FROM {table}").fetchone()[0]
            except sqlite3.Error:
                pass
    finally:
        connection.close()
    return {
        "compartments": compartments,
        "unlanded": unlanded,
        "journal": journal,
        "usageTables": usage,
        "tags": tags,
        "pendingDrops": pending,
        "baselineCount": baseline_count,
        "compartmentSha256": hashlib.sha256(
            json.dumps(compartments, sort_keys=True, ensure_ascii=False).encode("utf-8")
        ).hexdigest(),
    }


def surface_hashes(session_id: str, seqs: list[int]) -> dict:
    events = {int(event["seq"]): event for event in snapshot(session_id)["events"]}
    return {
        str(seq): {
            "present": seq in events,
            "type": events.get(seq, {}).get("type"),
            "sha256": hashlib.sha256(event_text(events[seq]).encode("utf-8")).hexdigest()
            if seq in events else None,
        }
        for seq in seqs
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
        "input": (call.get("data") or {}).get("arguments"),
        "resultSeq": int(result["seq"]),
        "resultText": event_text(result),
        "eventsAfterResult": [event for event in events if int(event["seq"]) > int(result["seq"])],
    }


def compare_window(pre: dict, post: dict, label: str, watch: dict | None = None) -> dict:
    errors = []
    if pre["compartmentSha256"] != post["compartmentSha256"]:
        errors.append("compartment rows changed")
    if pre["baselineCount"] != post["baselineCount"]:
        errors.append("baseline rows changed")
    for kind in ("historian", "compartment-published"):
        if pre["journal"][kind]["count"] != post["journal"][kind]["count"]:
            errors.append(f"{kind} journal count changed")
    if pre["pendingDrops"] != post["pendingDrops"]:
        errors.append("pending drops changed")
    if watch is not None and watch["before"] != watch["after"]:
        errors.append("placeholder/covered event bytes changed")
    return {
        "label": label,
        "ok": not errors,
        "errors": errors,
        "tagDelta": len(post["tags"]) - len(pre["tags"]),
        "agentUsageDelta": {
            table: post["usageTables"].get(table, 0) - count
            for table, count in pre["usageTables"].items()
        },
        "watch": watch,
        "pre": pre,
        "post": post,
    }


def assert_window(window: dict, label: str, expected_tags: int) -> None:
    if not window["ok"]:
        raise SystemExit(f"{label}: {window['errors']}")
    if window["tagDelta"] != expected_tags:
        raise SystemExit(f"{label}: tag delta {window['tagDelta']} != {expected_tags}")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--only",
        choices=["seed", "wait", "settle", "r1", "r2", "r3-tag", "r3-message"],
        action="append",
    )
    options = parser.parse_args()
    selected = options.only or ["seed", "wait", "settle", "r1", "r2", "r3-tag", "r3-message"]
    state_path = EVIDENCE / "v11-state.json"
    state = json.loads(state_path.read_text(encoding="utf-8")) if state_path.exists() else {}
    preflight = json.loads((EVIDENCE / "preflight.json").read_text(encoding="utf-8"))

    if "seed" in selected:
        seed = run_host(
            "v11-seed",
            common(
                "This is an isolated V1.1 range/verbose acceptance seed. In separate sequential model steps: "
                "read fixture.txt once and note the actual §N§ tag on its result; call ctx_reduce exactly once with "
                "drop set to ONLY that fixture tag (do not reduce any other tag and do not call ctx_reduce again); "
                "read historian-fixture.txt once. Then respond only SEED_READY and that tag number. Do not call "
                "ctx_expand, do not reread, do not quote either file, and do not use other tools.",
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
                f"v11-wait-{attempt}",
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
            "v11-settle",
            common(
                "Call acceptance_wait with seconds 5, then respond only SETTLE_DONE. Do not use any other tool.",
                SETTLE,
                session_id,
            ),
            timeout=180,
        )
        state["settle"] = settle
        state_path.write_text(json.dumps(state, ensure_ascii=False, indent=2), encoding="utf-8")

    if any(stage in selected for stage in ("r1", "r2", "r3-tag", "r3-message")):
        if "target" not in state:
            raise SystemExit("target publish is not recorded; run wait first")
        if "placeholderSeq" not in identity or identity["placeholderSeq"] is None:
            raise SystemExit("placeholder seq is not recorded")
        target = state["target"]
        compartment_id = target["compartmentId"]
        before = db_state(session_id)
        assert_no_unlanded(before, "before range windows")
        pass_row = find_pass_row(before, compartment_id)
        if pass_row is None:
            raise SystemExit("target compartment has no pass journal row")
        target_row = next((row for row in before["compartments"]
                           if row["compartment_id"] == compartment_id
                           and row["landed_event_seq"] == target["publishSeq"]), None)
        if target_row is None:
            raise SystemExit("target compartment row is not landed at the publish seq")
        covered = json.loads(target_row["covered_seqs"] or "[]") if isinstance(target_row["covered_seqs"], str) else target_row["covered_seqs"] or []
        state["precondition"] = {
            "unlanded": before["unlanded"],
            "target": target_row,
            "pass": pass_row,
            "watchSeqs": sorted({int(identity["originalSeq"]), int(identity["placeholderSeq"]), *[int(seq) for seq in covered]}),
        }
        state_path.write_text(json.dumps(state, ensure_ascii=False, indent=2), encoding="utf-8")

    def run_window(label: str, prompt: str, expected_tags: int) -> dict:
        watch_seqs = state["precondition"]["watchSeqs"]
        pre = db_state(session_id)
        before_hash = surface_hashes(session_id, watch_seqs)
        record = run_host(label, common(prompt, SETTLE, session_id), timeout=180)
        after_hash = surface_hashes(session_id, watch_seqs)
        post = db_state(session_id)
        result = find_expand_result(session_id, 0)
        window = compare_window(pre, post, label, {"before": before_hash, "after": after_hash})
        assert_window(window, label, expected_tags)
        state[label] = {"record": record, "result": result, "window": window}
        state_path.write_text(json.dumps(state, ensure_ascii=False, indent=2), encoding="utf-8")
        return state[label]

    if "r1" in selected:
        tag = identity["tag"]
        start = identity["originalSeq"]
        end = identity["placeholderSeq"]
        run_window(
            "v11-r1-range",
            f"Resume the persisted V1.1 session. Call ONLY ctx_expand with start set to the decimal string "
            f"\"{start}\" and end set to the decimal string \"{end}\". Do not pass tag, tags, or message; do not "
            "call any other tool and do not read any file. Respond R1_OK plus the nonce from the transcript if it "
            "is available; otherwise report the exact refusal.",
            1,
        )
        result = state["v11-r1-range"]["result"]
        if preflight["nonce"] not in result["resultText"]:
            raise SystemExit("R1 result does not contain the fixture nonce")
        if f"[dropped §{tag}§]" not in result["resultText"]:
            raise SystemExit("R1 result does not contain the literal dropped placeholder")
        if "Content restored" in result["resultText"]:
            raise SystemExit("R1 result looks like a restore payload")

    if "r2" in selected:
        start = identity["originalSeq"]
        end = identity["placeholderSeq"]
        run_window(
            "v11-r2-verbose",
            f"Resume the persisted V1.1 session. Call ONLY ctx_expand with start set to the decimal string "
            f"\"{start}\", end set to the decimal string \"{end}\", and verbose set to true. Do not pass tag, tags, "
            "or message; do not call any other tool and do not read any file. Respond R2_OK plus the nonce from the "
            "preview if it is available; otherwise report the exact refusal.",
            1,
        )
        result = state["v11-r2-verbose"]["result"]
        if "verbose;" not in result["resultText"]:
            raise SystemExit("R2 result is not a verbose transcript")

    if "r3-tag" in selected:
        run_window(
            "v11-r3-tag",
            f"Resume the persisted V1.1 session. Call ONLY ctx_expand with tag set to {identity['tag']}. "
            "Do not pass tags, message, start, or end; do not call any other tool and do not read any file. "
            "Respond R3_TAG_OK plus the nonce from the restored original if it is available; otherwise report "
            "the exact refusal.",
            1,
        )
        result = state["v11-r3-tag"]["result"]
        if preflight["nonce"] not in result["resultText"]:
            raise SystemExit("R3 tag result does not contain the fixture nonce")

    if "r3-message" in selected:
        run_window(
            "v11-r3-message",
            f"Resume the persisted V1.1 session. Call ONLY ctx_expand with message set to the decimal string "
            f"\"{identity['originalSeq']}\". Do not pass tag, tags, start, or end; do not call any other tool and "
            "do not read any file. Respond R3_MESSAGE_OK plus the nonce from the restored original if it is "
            "available; otherwise report the exact refusal.",
            1,
        )
        result = state["v11-r3-message"]["result"]
        if preflight["nonce"] not in result["resultText"]:
            raise SystemExit("R3 message result does not contain the fixture nonce")

    state_path.write_text(json.dumps(state, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps({
        "sessionId": session_id,
        "tag": identity.get("tag"),
        "originalSeq": identity.get("originalSeq"),
        "placeholderSeq": identity.get("placeholderSeq"),
        "target": state.get("target"),
        "precondition": state.get("precondition"),
        "windows": {
            name: state.get(name, {}).get("window", {}).get("ok")
            for name in ("v11-r1-range", "v11-r2-verbose", "v11-r3-tag", "v11-r3-message")
        },
    }, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
