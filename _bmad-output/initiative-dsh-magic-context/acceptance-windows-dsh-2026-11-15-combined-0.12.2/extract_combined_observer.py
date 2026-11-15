"""Produce a compact, auditable observer extract for the combined run."""

from __future__ import annotations

import json
from pathlib import Path

REPORT_DIR = Path(__file__).resolve().parent
ROOT = Path(json.loads((REPORT_DIR / "experiment-root.json").read_text(encoding="utf-8"))["root"])
EVIDENCE = ROOT / "evidence"
STATE = json.loads((EVIDENCE / "combined-state.json").read_text(encoding="utf-8"))


def text_of(event: dict) -> str:
    data = event.get("data") or {}
    message = data.get("message") or {}
    content = message.get("content") if isinstance(message, dict) else None
    if content is None:
        content = data.get("content")
    if isinstance(content, str):
        return content
    if not isinstance(content, list):
        return ""
    return "".join(block.get("text", "") for block in content if isinstance(block, dict) and block.get("type") == "text")


def compact(event: dict) -> dict:
    data = event.get("data") or {}
    kind = event.get("type")
    out = {"seq": event.get("seq"), "type": kind, "time": event.get("time")}
    if kind == "tool/call":
        out.update({"callId": data.get("callId"), "name": data.get("name"), "input": data.get("input")})
    elif kind == "tool/result":
        message = data.get("message") or {}
        out.update({"callId": message.get("toolCallId"), "text": text_of(event), "isError": message.get("isError")})
    elif kind in ("command/run", "command/done"):
        out["data"] = data
    elif kind == "user/message":
        out["text"] = text_of(event)[:1000]
    else:
        text = text_of(event)
        if text:
            out["text"] = text[:300]
        if data.get("sourceEventSeqs"):
            out["sourceEventSeqs"] = data["sourceEventSeqs"]
    return out


def last_snapshot(session_id: str) -> dict:
    path = EVIDENCE / "session-observer" / f"{session_id}.jsonl"
    rows = [json.loads(line) for line in path.read_text(encoding="utf-8").splitlines() if line.strip()]
    return rows[-1]


final_sessions = {
    STATE["recovery"]["record"]["session_id"],
    STATE["historian"]["sessionId"],
    STATE["flush"]["sessionId"],
    STATE["vector"]["record"]["session_id"],
}
sessions = {}
for session_id in sorted(final_sessions):
    snap = last_snapshot(session_id)
    sessions[session_id] = {
        "processId": snap.get("processId"),
        "trigger": snap.get("trigger"),
        "surface": snap.get("surface"),
        "events": [compact(event) for event in snap.get("events") or []],
    }

discarded = {}
for path in sorted((EVIDENCE / "session-observer").glob("session-*.jsonl")):
    if path.stem in final_sessions:
        continue
    snap = last_snapshot(path.stem)
    prompt = next((
        text_of(event) for event in snap.get("events") or []
        if event.get("type") == "user/message" and "combined" in text_of(event).lower()
    ), "")
    discarded[path.stem] = {
        "snapshots": sum(1 for _ in path.open(encoding="utf-8")),
        "lastProcessId": snap.get("processId"),
        "prompt": prompt[:300],
        "surface": snap.get("surface"),
    }

extract = {
    "source": str(EVIDENCE / "session-observer"),
    "sessions": sessions,
    "discardedSessions": discarded,
    "engineOwners": (EVIDENCE / "session-observer" / "engine-owners.jsonl").read_text(encoding="utf-8").splitlines(),
}
out = EVIDENCE / "combined-observer-extract.json"
out.write_text(json.dumps(extract, ensure_ascii=False, indent=2), encoding="utf-8")
print(json.dumps({
    "sessions": {sid: {"processId": row["processId"], "events": len(row["events"]), "surface": len(row["surface"] or [])} for sid, row in sessions.items()},
    "discarded": list(discarded),
    "bytes": out.stat().st_size,
}, ensure_ascii=False, indent=2))
