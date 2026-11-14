"""Drive the `/ctx-flush` host gate through the isolated real DSH host.

Sequence: seed (real read + ctx_reduce, pressure/TTL deliberately below the
execute band) -> resume and invoke the REAL command registry via a test-only
plugin -> next request must contain the placeholder. No daily profile is used.
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

from prepare_t4_host import DSH_CMD, REPORT_DIR, isolated_env

POINTER = REPORT_DIR / "experiment-root.json"
ROOT = Path(json.loads(POINTER.read_text(encoding="utf-8"))["root"])
EVIDENCE = ROOT / "evidence"
WORKSPACE = ROOT / "workspace"
SEED_OVERLAY = ROOT / "overlays" / "seed.yml"
FLUSH_OVERLAY = ROOT / "overlays" / "flush.yml"
FORCE_OVERLAY = ROOT / "overlays" / "flush-exec.yml"
DB = ROOT / "plugin-data" / "dsh-magic-context.db"
PREFLIGHT = json.loads((EVIDENCE / "preflight.json").read_text(encoding="utf-8"))


def ensure_force_overlay() -> None:
    if FORCE_OVERLAY.exists():
        return
    data = json.loads(FLUSH_OVERLAY.read_text(encoding="utf-8"))
    policy = data[0]["config"]["policy"]
    policy["executeThreshold"] = 0
    policy["forceThreshold"] = 0
    policy["ttlMs"] = 0
    FORCE_OVERLAY.write_text(json.dumps(data, indent=2), encoding="utf-8")


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


def run_host(label: str, args: list[str], env_extra: dict[str, str] | None = None, timeout: int = 240) -> dict:
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
    tag_match = re.match(r"^§(\d+)§ ", event_text(original))
    if tag_match is None:
        raise SystemExit("fixture result has no leading tag")
    tag = int(tag_match.group(1))
    call_id = original["data"]["message"]["toolCallId"]
    return {
        "tag": tag,
        "callId": call_id,
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
        journal = {}
        for kind in ("drop-landed", "pass", "emergency-reclaim", "historian", "compartment-published"):
            rows = [dict(row) for row in connection.execute(
                "SELECT id, at, kind, summary, data FROM journal WHERE session_id = ? AND kind = ? ORDER BY id",
                (session_id, kind),
            )]
            journal[kind] = {
                "count": len(rows),
                "maxId": rows[-1]["id"] if rows else None,
                "rows": rows,
            }
        usage = {}
        for table in [row[0] for row in connection.execute(
            "SELECT name FROM sqlite_master WHERE type = 'table' AND name LIKE '%usage%'",
        )]:
            try:
                usage[table] = connection.execute(f"SELECT COUNT(*) FROM {table}").fetchone()[0]
            except sqlite3.Error as error:
                usage[table] = f"error: {error}"
        return {"pendingDrops": pending, "tags": tags, "journal": journal, "usage": usage}
    finally:
        connection.close()


def command_events(session_id: str) -> list[dict]:
    snap = snapshot(session_id)
    return [
        {
            "seq": int(event["seq"]),
            "type": event["type"],
            "data": event.get("data") or {},
        }
        for event in snap["events"]
        if event.get("type") in ("command/run", "command/done")
    ]


def main() -> None:
    ensure_force_overlay()
    parser = argparse.ArgumentParser()
    parser.add_argument("--only", choices=["seed", "flush", "seed-force", "flush-force"], required=True)
    parser.add_argument("--session-id")
    args = parser.parse_args()
    variant = "force" if args.only.endswith("-force") else "normal"
    prefix = f"t4-{variant}"
    overlay = FORCE_OVERLAY if variant == "force" else (SEED_OVERLAY if args.only.startswith("seed") else FLUSH_OVERLAY)

    if args.only in ("seed", "seed-force"):
        prompt = (
            "This is an isolated T4 /ctx-flush acceptance seed. Follow this exact sequence, one tool call per model step. "
            "(1) read fixture.txt with the file read tool and note the actual §N§ tag on its result. "
            "(2) call ctx_reduce with drop set to ONLY that tag. "
            "(3) after it returns, respond exactly T4_DROP_READY plus the tag number. "
            "Do not call ctx_expand, do not reread the file, and do not batch calls."
        )
        record = run_host(f"{prefix}-seed", common(prompt, SEED_OVERLAY))
        if not record.get("session_id"):
            raise SystemExit("seed host returned no session id")
        identity = seed_identity(record["session_id"])
        state = db_state(record["session_id"])
        (EVIDENCE / f"{prefix}-seed.identity.json").write_text(json.dumps(identity, indent=2), encoding="utf-8")
        (EVIDENCE / f"{prefix}-seed.db.json").write_text(json.dumps(state, indent=2), encoding="utf-8")
        print(json.dumps({"identity": identity, "pendingDrops": state["pendingDrops"]}, indent=2))
        return

    if not args.session_id:
        raise SystemExit("flush stage requires --session-id")
    flush_evidence = EVIDENCE / f"{prefix}-flush-command.jsonl"
    prompt = (
        "This is a NEW host process resuming the T4 acceptance session. Do NOT read any file and do NOT call tools. "
        "The /ctx-flush command has already run through the host command registry. "
        "Report exactly T4_FLUSH_OK followed by the exact current text of the fixture tool result, "
        "including any [dropped §N§] marker you see. Do not reconstruct missing content."
    )
    record = run_host(
        f"{prefix}-flush",
        common(prompt, overlay, args.session_id),
        env_extra={
            "MC_T4_SESSION_ID": args.session_id,
            "MC_T4_FLUSH_EVIDENCE": str(flush_evidence),
        },
    )
    state = db_state(args.session_id)
    snap = snapshot(args.session_id)
    events = snap["events"]
    identity = json.loads((EVIDENCE / f"{prefix}-seed.identity.json").read_text(encoding="utf-8"))
    placeholder = [
        event for event in events
        if event.get("type") == "tool/result"
        and event_text(event).startswith("[dropped §")
        and event.get("data", {}).get("message", {}).get("toolCallId") == identity["callId"]
    ]
    command_rows = command_events(args.session_id)
    result = {
        "variant": variant,
        "sessionId": args.session_id,
        "host": record,
        "commandEvidence": [
            json.loads(line) for line in flush_evidence.read_text(encoding="utf-8").splitlines() if line.strip()
        ] if flush_evidence.exists() else [],
        "commandEvents": command_rows,
        "placeholder": placeholder,
        "db": state,
        "preflight": PREFLIGHT,
    }
    (EVIDENCE / f"{prefix}-analysis.json").write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps({
        "sessionId": args.session_id,
        "commandEvidence": result["commandEvidence"],
        "commandEvents": command_rows,
        "placeholderSeqs": [event["seq"] for event in placeholder],
        "pendingDrops": state["pendingDrops"],
        "journal": {kind: value["count"] for kind, value in state["journal"].items()},
    }, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
