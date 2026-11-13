"""Summarize T2 host evidence: surface nodes, placeholder survival, restored results."""

from __future__ import annotations

import hashlib
import json
from pathlib import Path
import re

REPORT_DIR = Path(__file__).resolve().parent
ROOT = Path(json.loads((REPORT_DIR / "experiment-root.json").read_text(encoding="utf-8"))["root"])
EVIDENCE = ROOT / "evidence"
OBSERVER = EVIDENCE / "session-observer"


def text_of(event: dict) -> str:
    content = event.get("data", {}).get("message", {}).get("content", [])
    return "".join(block.get("text", "") for block in content if block.get("type") == "text")


def digest(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


def analyze_session(path: Path) -> dict:
    last = None
    for line in path.read_text(encoding="utf-8").splitlines():
        try:
            row = json.loads(line)
        except json.JSONDecodeError:
            continue
        last = row
    if last is None:
        return {"file": path.name, "error": "empty observer log"}
    surface = last.get("surface", [])
    events = last.get("events", [])
    tool_results = []
    placeholders = []
    for event in events:
        if event.get("type") != "tool/result":
            continue
        text = text_of(event)
        if re.fullmatch(r"\[dropped §\d+§\]", text):
            placeholders.append({"seq": event["seq"], "text": text, "onSurface": event["seq"] in surface})
        else:
            tool_results.append({
                "seq": event["seq"],
                "text": text,
                "onSurface": event["seq"] in surface,
                "sourceEventSeqs": event.get("sourceEventSeqs"),
            })
    # Every restored result has one outer adapter marker. Stripping it must
    # reproduce an earlier stored result exactly (the read, or the prior expand).
    existing = {entry["text"] for entry in tool_results}
    for entry in tool_results:
        match = re.match(r"^(§\d+§ )(.*)$", entry["text"], re.S)
        entry["stripped_sha256"] = digest(match.group(2)) if match else None
        entry["stripped_matches_earlier_result"] = bool(match and match.group(2) in existing)
    return {
        "file": path.name,
        "surface": surface,
        "placeholders": placeholders,
        "tool_results": tool_results,
        "tool_result_count": len(tool_results),
    }


def main() -> None:
    sessions = {}
    for path in sorted(OBSERVER.glob("session-*.jsonl")):
        sessions[path.stem] = analyze_session(path)
    driver_summary = json.loads((EVIDENCE / "t2-driver-summary.json").read_text(encoding="utf-8"))
    analysis = {
        "root": str(ROOT),
        "sessions": sessions,
        "driver": {
            "roundtrip": driver_summary["roundtrip"]["final_text"],
            "lifecycle": driver_summary["lifecycle"]["final_text"],
            "restart_first": driver_summary["restart"]["first"]["final_text"],
            "restart_second": driver_summary["restart"]["second"]["final_text"],
            "fixture_disk_nonce": driver_summary["restart"]["fixture_disk_nonce"],
        },
    }
    (EVIDENCE / "t2-analysis.json").write_text(json.dumps(analysis, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps({
        "sessions": len(sessions),
        "placeholders": {key: value["placeholders"] for key, value in sessions.items()},
        "driver": analysis["driver"],
    }, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
