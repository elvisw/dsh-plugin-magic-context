"""Drive the P4 `/ctx-flush` empty-queue feedback host gate.

Host 1 seeds a real pending drop, host 2 invokes the real `/ctx-flush` command
and lets the next request land it, host 3 is a new process that invokes the
command again on the empty queue. All hosts use the fresh profile prepared by
prepare_p4_host.py; no daily profile or prior experiment root is touched.
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

from prepare_p4_host import DSH_CMD, REPORT_DIR, isolated_env

POINTER = REPORT_DIR / "experiment-root.json"
ROOT = Path(json.loads(POINTER.read_text(encoding="utf-8"))["root"])
EVIDENCE = ROOT / "evidence"
WORKSPACE = ROOT / "workspace"
SEED_OVERLAY = ROOT / "overlays" / "p4-seed.yml"
FLUSH_OVERLAY = ROOT / "overlays" / "p4-flush.yml"
PREFLIGHT = json.loads((EVIDENCE / "preflight.json").read_text(encoding="utf-8"))
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


def run_host(label: str, args: list[str], env_extra: dict[str, str] | None = None, timeout: int = 300) -> dict:
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
        "label": label,
        "exit_code": record.get("exit_code"),
        "session_id": record["session_id"],
        "tool_calls": [entry["tool"] for entry in record["tool_calls"]],
        "final_reason": record["final_reason"],
    }, ensure_ascii=False))
    return record


def observer_path(session_id: str) -> Path:
    name = session_id if session_id.startswith("session-") else f"session-{session_id}"
    return EVIDENCE / "session-observer" / f"{name}.jsonl"


def observer_rows(session_id: str) -> list[dict]:
    path = observer_path(session_id)
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
    return rows


def snapshot(session_id: str) -> dict:
    rows = observer_rows(session_id)
    return {"path": str(observer_path(session_id)), "line": rows[-1]["_line"], **rows[-1]}


def command_surface_hashes(session_id: str, command_id: str) -> dict[str, str | None]:
    result: dict[str, str | None] = {"command/run": None, "command/done": None}
    for row in observer_rows(session_id):
        trigger = row.get("trigger") or {}
        if trigger.get("type") not in result:
            continue
        event = next((event for event in row.get("events", []) if event.get("seq") == trigger.get("seq")), None)
        if event is None:
            continue
        if (event.get("data") or {}).get("commandId") != command_id:
            continue
        result[trigger["type"]] = hashlib.sha256(
            json.dumps(row.get("surface"), sort_keys=True).encode(),
        ).hexdigest()
    return result


def event_text(event: dict) -> str:
    data = event.get("data") or {}
    content = (data.get("message") or {}).get("content") or data.get("content") or []
    return "".join(block.get("text", "") for block in content if block.get("type") == "text")


def seed_identity(session_id: str) -> dict:
    snap = snapshot(session_id)
    events = snap["events"]
    original = None
    read_call = None
    for event in events:
        if event.get("type") != "tool/result":
            continue
        text = event_text(event)
        if f"nonce={PREFLIGHT['nonce']}" not in text:
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
    match = re.match(r"^§(\d+)§ ", event_text(original))
    if match is None:
        raise SystemExit("fixture result has no leading tag")
    return {
        "tag": int(match.group(1)),
        "callId": original["data"]["message"]["toolCallId"],
        "tool": (read_call.get("data") or {}).get("name") if read_call else None,
        "originalSeq": int(original["seq"]),
        "originalText": event_text(original),
        "originalSha256": hashlib.sha256(event_text(original).encode("utf-8")).hexdigest(),
        "sourceFile": snap["path"],
        "sourceLine": snap["line"],
    }


def db_state(session_id: str) -> dict:
    connection = sqlite3.connect(DB)
    connection.row_factory = sqlite3.Row
    try:
        pending = [dict(row) for row in connection.execute(
            "SELECT session_id, tag_number, queued_at, landed_event_seq, flush_requested "
            "FROM pending_drops WHERE session_id = ? ORDER BY tag_number",
            (session_id,),
        )]
        tags = [dict(row) for row in connection.execute(
            "SELECT tag_number, target_kind, target_id FROM tags WHERE session_id = ? ORDER BY tag_number",
            (session_id,),
        )]
        landed = [dict(row) for row in connection.execute(
            "SELECT id, at, kind, summary, data FROM journal "
            "WHERE session_id = ? AND kind = 'drop-landed' ORDER BY id",
            (session_id,),
        )]
        usage = connection.execute(
            "SELECT COUNT(*) AS n FROM usage_records WHERE session_id = ?",
            (session_id,),
        ).fetchone()["n"]
        return {"pendingDrops": pending, "tags": tags, "dropLandedRows": landed, "usageRecords": usage}
    finally:
        connection.close()


def command_rows(path: Path) -> list[dict]:
    if not path.exists():
        return []
    rows = []
    for line in path.read_text(encoding="utf-8").splitlines():
        if line.strip():
            rows.append(json.loads(line))
    return rows


def command_events(session_id: str) -> list[dict]:
    snap = snapshot(session_id)
    return [
        {"seq": int(event["seq"]), "type": event["type"], "data": event.get("data") or {}}
        for event in snap["events"]
        if event.get("type") in ("command/run", "command/done")
    ]


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--only", choices=["seed", "flush", "flush-empty"], required=True)
    parser.add_argument("--session-id")
    args = parser.parse_args()

    if args.only == "seed":
        prompt = (
            "This is an isolated P4 /ctx-flush feedback seed. Follow this exact sequence, one tool call per model step. "
            "(1) read fixture.txt with the file read tool and note the actual §N§ tag on its result. "
            "(2) call ctx_reduce with drop set to ONLY that tag. "
            "(3) after it returns, respond exactly P4_DROP_READY plus the tag number. "
            "Do not call ctx_expand, do not reread the file, and do not batch calls."
        )
        record = run_host("p4-seed", common(prompt, SEED_OVERLAY))
        if not record.get("session_id"):
            raise SystemExit("seed host returned no session id")
        identity = seed_identity(record["session_id"])
        state = db_state(record["session_id"])
        (EVIDENCE / "p4-state.json").write_text(json.dumps({
            "sessionId": record["session_id"],
            "seed": record,
            "identity": identity,
            "seedDb": state,
        }, ensure_ascii=False, indent=2), encoding="utf-8")
        print(json.dumps({"identity": identity, "pendingDrops": state["pendingDrops"]}, ensure_ascii=False, indent=2))
        return

    session_id = args.session_id
    if not session_id and (EVIDENCE / "p4-state.json").exists():
        session_id = json.loads((EVIDENCE / "p4-state.json").read_text(encoding="utf-8"))["sessionId"]
    if not session_id:
        raise SystemExit(f"{args.only} requires --session-id or a prior p4-state.json")

    evidence = EVIDENCE / f"p4-{args.only}-command.jsonl"
    if evidence.exists():
        evidence.unlink()
    env = {
        "P4_SESSION_ID": session_id,
        "P4_FLUSH_EVIDENCE": str(evidence),
        "P4_DB": str(DB),
    }

    if args.only == "flush":
        prompt = (
            "This is a NEW host process resuming the P4 acceptance session. Do NOT read any file and do NOT call tools. "
            "The /ctx-flush command has already run through the host command registry. "
            "Report exactly P4_FLUSH_OK followed by the exact current text of the fixture tool result, "
            "including any [dropped §N§] marker you see. Do not reconstruct missing content."
        )
        record = run_host("p4-flush", common(prompt, FLUSH_OVERLAY, session_id), env_extra=env)
        identity = json.loads((EVIDENCE / "p4-state.json").read_text(encoding="utf-8"))["identity"]
        state = db_state(session_id)
        snap = snapshot(session_id)
        placeholder = [
            {"seq": event["seq"], "type": event["type"], "text": event_text(event)}
            for event in snap["events"]
            if event.get("type") == "tool/result"
            and event_text(event).startswith("[dropped §")
            and (event.get("data") or {}).get("message", {}).get("toolCallId") == identity["callId"]
        ]
        result = {
            "sessionId": session_id,
            "host": record,
            "commandEvidence": command_rows(evidence),
            "commandEvents": command_events(session_id),
            "placeholder": placeholder,
            "db": state,
        }
        (EVIDENCE / "p4-flush.json").write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding="utf-8")
        print(json.dumps({
            "sessionId": session_id,
            "commandEvidence": result["commandEvidence"],
            "commandEvents": result["commandEvents"],
            "placeholderSeqs": [event["seq"] for event in placeholder],
            "pendingDrops": state["pendingDrops"],
            "dropLandedRows": state["dropLandedRows"],
        }, ensure_ascii=False, indent=2))
        return

    before = db_state(session_id)
    before_snap = snapshot(session_id)
    prompt = (
        "This is a NEW host process resuming the P4 acceptance session. Do NOT read any file and do NOT call tools. "
        "The /ctx-flush command has already run through the host command registry. "
        "Reply exactly P4_FLUSH_EMPTY_DONE."
    )
    record = run_host("p4-flush-empty", common(prompt, FLUSH_OVERLAY, session_id), env_extra=env)
    after = db_state(session_id)
    after_snap = snapshot(session_id)
    rows = command_rows(evidence)
    executions = [row for row in rows if row.get("execution") is not None]
    if len(executions) != 1:
        raise SystemExit(f"expected one command execution, got {len(executions)}")
    execution = executions[0]
    if execution["execution"]["kind"] != "success":
        raise SystemExit(f"command was not successful: {execution}")
    text = execution["execution"]["text"] or ""
    expected_count = len(before["dropLandedRows"])
    if expected_count != 1:
        raise SystemExit(f"expected exactly one drop-landed row before empty flush, got {expected_count}")
    if "last drop landing: 1 drop(s) at " not in text:
        raise SystemExit(f"missing landing count/time in command text: {text}")
    if "already in effect" not in text:
        raise SystemExit(f"missing already-in-effect wording: {text}")
    if before["pendingDrops"] != after["pendingDrops"] or before["tags"] != after["tags"]:
        raise SystemExit("pending_drops or tags changed across the empty-queue command")
    if len(after["dropLandedRows"]) != len(before["dropLandedRows"]):
        raise SystemExit("drop-landed row count changed across the empty-queue command")
    window = execution
    if window["before"]["usage"] != window["after"]["usage"]:
        raise SystemExit("usage_records changed inside the command window")
    if window["before"]["pending"] != window["after"]["pending"] or window["before"]["tags"] != window["after"]["tags"]:
        raise SystemExit("pending/tags changed inside the command window")
    if window["before"]["dropLanded"] != window["after"]["dropLanded"]:
        raise SystemExit("journal row count changed inside the command window")

    events = after_snap["events"]
    command_id = execution["execution"]["commandId"]
    window_events = [
        {"seq": int(event["seq"]), "type": event["type"], "data": event.get("data") or {}}
        for event in events
        if event.get("type") in ("command/run", "command/done")
        and (event.get("data") or {}).get("commandId") == command_id
    ]
    command_event_seqs = [event["seq"] for event in window_events]
    assistant_between = [
        int(event["seq"]) for event in events
        if event.get("type") == "assistant/message"
        and command_event_seqs
        and min(command_event_seqs) < int(event["seq"]) < max(command_event_seqs)
    ]
    if assistant_between:
        raise SystemExit(f"assistant message inside command window: {assistant_between}")

    surface_hashes = command_surface_hashes(session_id, command_id)
    result = {
        "sessionId": session_id,
        "host": record,
        "commandEvidence": rows,
        "commandEvents": command_events(session_id),
        "windowEvents": window_events,
        "window": window,
        "before": before,
        "after": after,
        "assistantBetweenCommandEvents": assistant_between,
        "beforeEventsSha256": hashlib.sha256(json.dumps(before_snap["events"], sort_keys=True).encode()).hexdigest(),
        "afterEventsSha256": hashlib.sha256(json.dumps(after_snap["events"], sort_keys=True).encode()).hexdigest(),
        "commandRunSurfaceSha256": surface_hashes["command/run"],
        "commandDoneSurfaceSha256": surface_hashes["command/done"],
        "commandSurfaceEqual": surface_hashes["command/run"] is not None
            and surface_hashes["command/run"] == surface_hashes["command/done"],
    }
    (EVIDENCE / "p4-flush-empty.json").write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps({
        "sessionId": session_id,
        "text": text,
        "window": window,
        "before": before,
        "after": after,
        "commandEvents": result["commandEvents"],
        "assistantBetweenCommandEvents": assistant_between,
    }, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    try:
        main()
    except Exception as exc:
        print(f"P4 run failed: {exc}", file=sys.stderr)
        raise
