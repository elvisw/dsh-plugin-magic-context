"""Summarize the V1.1 range/verbose host evidence and extract the compact observer view.

Reads the isolated experiment root from experiment-root.json and writes only
small, reproducible evidence into this report directory. The raw 100MB observer
JSONL remains in the isolated root; its SHA-256 is recorded here.
"""

from __future__ import annotations

import hashlib
import json
from pathlib import Path
import re

REPORT_DIR = Path(__file__).resolve().parent
ROOT = Path(json.loads((REPORT_DIR / "experiment-root.json").read_text(encoding="utf-8"))["root"])
EVIDENCE = ROOT / "evidence"
OUT = REPORT_DIR / "evidence"
OUT.mkdir(parents=True, exist_ok=True)

state = json.loads((EVIDENCE / "v11-state.json").read_text(encoding="utf-8"))
preflight = json.loads((EVIDENCE / "preflight.json").read_text(encoding="utf-8"))
session_id = state["sessionId"]
observer = EVIDENCE / "session-observer" / f"{session_id}.jsonl"


def sha256_bytes(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def sha256_text(text: str) -> str:
    return sha256_bytes(text.encode("utf-8"))


def event_text(event: dict) -> str:
    data = event.get("data") or {}
    content = (data.get("message") or {}).get("content") or data.get("content") or []
    return "".join(block.get("text", "") for block in content if block.get("type") == "text")


raw = observer.read_bytes()
rows = [json.loads(line) for line in raw.decode("utf-8").splitlines() if line.strip()]
latest = rows[-1]
events = latest["events"]
by_seq = {int(event["seq"]): event for event in events}
identity = state["identity"]
target = state["target"]
watch = state["precondition"]["watchSeqs"]
result_seqs = {
    name: state[name]["result"]["resultSeq"]
    for name in ("v11-r1-range", "v11-r2-verbose", "v11-r3-tag", "v11-r3-message")
    if name in state
}
extract_seqs = sorted({
    int(identity["originalSeq"]),
    int(identity["placeholderSeq"]),
    int(target["publishSeq"]),
    *[int(seq) for seq in watch],
    *result_seqs.values(),
})
compact_events = []
for seq in extract_seqs:
    event = by_seq.get(seq)
    if event is None:
        compact_events.append({"seq": seq, "present": False})
        continue
    compact_events.append({
        "seq": seq,
        "present": True,
        "type": event.get("type"),
        "surfaceOp": event.get("surfaceOp"),
        "sourceEventSeqs": event.get("sourceEventSeqs"),
        "text": event_text(event),
        "textSha256": sha256_text(event_text(event)),
    })

def parsed_input(entry: dict) -> dict:
    raw = entry["result"].get("input")
    if isinstance(raw, str):
        try:
            return json.loads(raw)
        except json.JSONDecodeError:
            return {"raw": raw}
    return raw if isinstance(raw, dict) else {}


windows = {}
for name in ("v11-r1-range", "v11-r2-verbose", "v11-r3-tag", "v11-r3-message"):
    if name not in state:
        continue
    entry = state[name]
    window = entry["window"]
    windows[name] = {
        "parsedInput": parsed_input(entry),
        "ok": window["ok"],
        "errors": window["errors"],
        "tagDelta": window["tagDelta"],
        "agentUsageDelta": window["agentUsageDelta"],
        "input": entry["result"]["input"],
        "callSeq": entry["result"]["callSeq"],
        "resultSeq": entry["result"]["resultSeq"],
        "resultTextSha256": sha256_text(entry["result"]["resultText"]),
        "resultTextHead": entry["result"]["resultText"][:1200],
        "eventsAfterResult": [
            {"seq": event.get("seq"), "type": event.get("type")}
            for event in entry["result"]["eventsAfterResult"]
        ],
        "watchEqual": window["watch"]["before"] == window["watch"]["after"],
        "before": {
            "compartmentSha256": window["pre"]["compartmentSha256"],
            "baselineCount": window["pre"]["baselineCount"],
            "historian": window["pre"]["journal"]["historian"]["count"],
            "published": window["pre"]["journal"]["compartment-published"]["count"],
            "pending": window["pre"]["pendingDrops"],
            "tags": window["pre"]["tags"],
        },
        "after": {
            "compartmentSha256": window["post"]["compartmentSha256"],
            "baselineCount": window["post"]["baselineCount"],
            "historian": window["post"]["journal"]["historian"]["count"],
            "published": window["post"]["journal"]["compartment-published"]["count"],
            "pending": window["post"]["pendingDrops"],
            "tags": window["post"]["tags"],
        },
    }

analysis = {
    "root": str(ROOT),
    "sessionId": session_id,
    "preflight": {
        "tarball": preflight["tarball"],
        "tarball_sha256": preflight["tarball_sha256"],
        "git_head": preflight["git_head"],
        "git_diff_sha256": preflight["git_diff_sha256"],
        "profile_specifier": preflight["profile_specifier"],
        "host_version": preflight.get("host_version"),
        "installed_hashes": preflight["installed_hashes"],
        "tool_bridge_has_range": preflight["tool_bridge_has_range"],
    },
    "identity": identity,
    "target": target,
    "precondition": {
        "unlanded": state["precondition"]["unlanded"],
        "targetLandedEventSeq": state["precondition"]["target"]["landed_event_seq"],
        "passId": state["precondition"]["pass"]["id"],
        "passPublished": state["precondition"]["pass"]["data"].get("published"),
        "passHistorianStarted": state["precondition"]["pass"]["data"].get("historianStarted"),
        "watchSeqs": watch,
    },
    "windows": windows,
    "observer": {
        "path": str(observer),
        "bytes": len(raw),
        "sha256": sha256_bytes(raw),
        "snapshotLine": latest.get("_line"),
        "snapshotAt": latest.get("at"),
        "processId": latest.get("processId"),
        "surfaceSha256": sha256_text(json.dumps(latest.get("surface"), sort_keys=True)),
        "events": compact_events,
    },
}
assert windows["v11-r1-range"]["parsedInput"] == {
    "start": str(identity["originalSeq"]),
    "end": str(identity["placeholderSeq"]),
}
assert windows["v11-r2-verbose"]["parsedInput"] == {
    "start": str(identity["originalSeq"]),
    "end": str(identity["placeholderSeq"]),
    "verbose": True,
}
assert windows["v11-r3-tag"]["parsedInput"] == {"tag": str(identity["tag"])}
assert windows["v11-r3-message"]["parsedInput"] == {"message": str(identity["originalSeq"])}
for name, window in windows.items():
    assert window["ok"], f"{name}: {window['errors']}"
    assert window["watchEqual"], f"{name}: watched event bytes changed"
assert windows["v11-r1-range"]["tagDelta"] == 1
assert windows["v11-r2-verbose"]["tagDelta"] == 1
assert windows["v11-r3-tag"]["tagDelta"] == 1
assert windows["v11-r3-message"]["tagDelta"] == 1
assert "[dropped §%d§]" % identity["tag"] in windows["v11-r1-range"]["resultTextHead"]
assert "verbose;" in windows["v11-r2-verbose"]["resultTextHead"]
for name in ("v11-r3-tag", "v11-r3-message"):
    assert preflight["nonce"] in windows[name]["resultTextHead"]

(OUT / "v11-analysis.json").write_text(json.dumps(analysis, ensure_ascii=False, indent=2), encoding="utf-8")
(OUT / "v11-observer-extract.json").write_text(
    json.dumps({
        "sessionId": session_id,
        "rawPath": str(observer),
        "rawBytes": len(raw),
        "rawSha256": sha256_bytes(raw),
        "snapshotLine": latest.get("_line"),
        "surface": latest.get("surface"),
        "events": compact_events,
    }, ensure_ascii=False, indent=2),
    encoding="utf-8",
)
print(json.dumps({
    "sessionId": session_id,
    "windows": {name: {"ok": entry["ok"], "tagDelta": entry["tagDelta"]} for name, entry in windows.items()},
    "observerBytes": len(raw),
    "observerSha256": sha256_bytes(raw),
}, ensure_ascii=False, indent=2))
