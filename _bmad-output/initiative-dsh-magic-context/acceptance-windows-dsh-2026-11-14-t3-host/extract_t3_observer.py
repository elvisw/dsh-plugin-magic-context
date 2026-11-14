"""Build a compact observer extract for the T3 evidence bundle.

The raw observer file is ~90 MB. Keep only the events the T3 gate reasons about,
with the snapshot metadata and source line that produced each one.
"""

from __future__ import annotations

import hashlib
import json
from pathlib import Path
import sys

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
import run_t3_scenarios as run  # noqa: E402

STATE = json.loads((run.EVIDENCE / "t3-state.json").read_text(encoding="utf-8"))
IDENTITY = STATE["identity"]
TARGET = STATE["target"]
RELEVANT = {
    IDENTITY["originalSeq"],
    IDENTITY["placeholderSeq"],
    TARGET["publishSeq"],
    STATE["e1"]["result"]["callSeq"],
    STATE["e1"]["result"]["resultSeq"],
    STATE["e2"]["result"]["callSeq"],
    STATE["e2"]["result"]["resultSeq"],
}


def sha(event: dict) -> str:
    return hashlib.sha256(json.dumps(event, sort_keys=True, ensure_ascii=False).encode("utf-8")).hexdigest()


def main() -> None:
    path = Path(IDENTITY["sourceFile"])
    lines = path.read_text(encoding="utf-8").splitlines()
    snapshots = []
    by_seq: dict[int, dict] = {}
    for number, line in enumerate(lines, start=1):
        try:
            row = json.loads(line)
        except json.JSONDecodeError:
            continue
        events = row.get("events") or []
        selected = [event for event in events if int(event.get("seq", -1)) in RELEVANT]
        if not selected and number != len(lines):
            continue
        snapshot = {
            "line": number,
            "processId": row.get("processId"),
            "sessionId": row.get("sessionId"),
            "trigger": row.get("trigger"),
            "surface": row.get("surface"),
            "events": selected,
        }
        snapshots.append(snapshot)
        for event in selected:
            seq = int(event["seq"])
            record = by_seq.setdefault(seq, {
                "seq": seq,
                "type": event.get("type"),
                "callId": (event.get("data") or {}).get("message", {}).get("toolCallId"),
                "text": run.event_text(event)[:500],
                "sourceEventSeqs": event.get("sourceEventSeqs"),
                "firstSeen": {"file": str(path), "line": number},
                "eventSha256": sha(event),
                "snapshots": [],
            })
            record["snapshots"].append({"line": number, "processId": row.get("processId"), "trigger": row.get("trigger")})
            if record["eventSha256"] != sha(event):
                record["hashMismatch"] = True

    extract = {
        "source": str(path),
        "sourceBytes": path.stat().st_size,
        "sourceLines": len(lines),
        "relevantSeqs": sorted(RELEVANT),
        "events": [by_seq[seq] for seq in sorted(by_seq)],
        "snapshots": snapshots,
        "note": "Events are copied verbatim; snapshots keep metadata and only the relevant events to keep the evidence bundle small.",
    }
    (run.EVIDENCE / "t3-observer-extract.json").write_text(
        json.dumps(extract, ensure_ascii=False, indent=2), encoding="utf-8",
    )
    print(json.dumps({
        "sourceLines": len(lines),
        "sourceBytes": path.stat().st_size,
        "events": len(by_seq),
        "snapshots": len(snapshots),
        "output": str(run.EVIDENCE / "t3-observer-extract.json"),
    }, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
