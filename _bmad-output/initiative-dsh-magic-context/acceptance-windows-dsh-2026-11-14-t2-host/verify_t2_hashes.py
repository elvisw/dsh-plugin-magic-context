"""Write the direct hash pair used by the T2 report.

Compares the full original tool result (event 20) with the expand result
(event 34) after removing only the outer adapter marker (``§3§ ``), and
records the other projection that ``analyze_t2_evidence.py`` reports so the
two values are not confused.
"""

from __future__ import annotations

import hashlib
import json
from pathlib import Path
import re

REPORT_DIR = Path(__file__).resolve().parent
ROOT = Path(json.loads((REPORT_DIR / "experiment-root.json").read_text(encoding="utf-8"))["root"])
OBSERVER = ROOT / "evidence" / "session-observer"
SESSION = OBSERVER / "session-6fc413ae-3cc8-456f-98e6-a839783576ca.jsonl"


def digest(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


def text_of(event: dict) -> str:
    content = event.get("data", {}).get("message", {}).get("content", [])
    return "".join(block.get("text", "") for block in content if block.get("type") == "text")


def main() -> None:
    last = None
    for line in SESSION.read_text(encoding="utf-8").splitlines():
        if line.strip():
            last = json.loads(line)
    if last is None:
        raise SystemExit("empty observer log")
    events = {event["seq"]: event for event in last["events"]}
    original = text_of(events[20])
    expanded = text_of(events[34])
    match = re.match(r"^(§\d+§ )(.*)$", expanded, re.S)
    if not match:
        raise SystemExit("expand result has no outer tag")
    outer_stripped = match.group(2)
    original_match = re.match(r"^(§\d+§ )(.*)$", original, re.S)
    if not original_match:
        raise SystemExit("original result has no adapter tag")
    proof = {
        "session": SESSION.stem,
        "event20_full_sha256": digest(original),
        "event34_outer_stripped_sha256": digest(outer_stripped),
        "event34_outer_marker": match.group(1),
        "event20_marker_stripped_sha256": digest(original_match.group(2)),
        "event20_full_equals_event34_outer_stripped": original == outer_stripped,
        "comparison": (
            "SHA-256(event 20 full text) == SHA-256(event 34 with the outer "
            "§3§ plus one trailing space removed); event20 marker-stripped "
            "hash is a different projection and is not the comparison target."
        ),
    }
    (ROOT / "evidence" / "t2-hash-pair.json").write_text(
        json.dumps(proof, indent=2), encoding="utf-8"
    )
    print(json.dumps(proof, indent=2))


if __name__ == "__main__":
    main()
