"""Summarize the T2 alias/failure host scenario from raw evidence."""

from __future__ import annotations

import json
from pathlib import Path
import re
import sqlite3

REPORT_DIR = Path(__file__).resolve().parent
ROOT = Path(json.loads((REPORT_DIR / "experiment-root.json").read_text(encoding="utf-8"))["root"])
EVIDENCE = ROOT / "evidence"
DRIVER = EVIDENCE / "t2-alias-failures.driver.json"
OBSERVER = EVIDENCE / "session-observer"
DB = ROOT / "plugin-data" / "dsh-magic-context.db"


def result_text(driver: dict, call_id: str) -> str:
    for entry in driver["tool_results"]:
        if entry["callId"] == call_id:
            return entry["result"]
    raise KeyError(call_id)


def prefix_tag(text: str) -> int:
    match = re.match(r"^§(\d+)§ ", text)
    if not match:
        raise ValueError("no outer tag")
    return int(match.group(1))


def main() -> None:
    driver = json.loads(DRIVER.read_text(encoding="utf-8"))
    session = driver["session_id"]
    rows = [
        json.loads(line)
        for line in (OBSERVER / f"{session}.jsonl").read_text(encoding="utf-8").splitlines()
        if line.strip()
    ]
    last = rows[-1]
    events = {event["seq"]: event for event in last["events"]}
    surface = last["surface"]

    def surface_text(seq: int) -> str:
        event = events[seq]
        content = event.get("data", {}).get("message", {}).get("content", [])
        return "".join(block.get("text", "") for block in content if block.get("type") == "text")

    pairs = list(zip(driver["tool_calls"], driver["tool_results"]))
    tool_results = [result["result"] for result in driver["tool_results"]]
    alias = next(
        result["result"]
        for call, result in pairs
        if call["tool"] == "ctx_expand" and call["input"].get("tags") == "1,2"
    )
    new_tag = prefix_tag(alias)
    old_placeholders = {
        str(tag): any(
            surface_text(seq) == f"[dropped §{tag}§]" for seq in surface if seq in events
        )
        for tag in (1, 2)
    }
    new_placeholder = any(
        surface_text(seq) == f"[dropped §{new_tag}§]" for seq in surface if seq in events
    )

    with sqlite3.connect(DB) as con:
        drops = {
            int(tag): {"queued_at": queued, "landed_event_seq": landed}
            for tag, queued, landed in con.execute(
                "SELECT tag_number, queued_at, landed_event_seq FROM pending_drops WHERE session_id = ?",
                (session,),
            )
        }

    failures = {
        "unknown_tag": next(
            result for result in tool_results if "§999§ not restored: no such tag." in result
        ),
        "active_tag": next(
            result for result in tool_results if "§9§ not restored: not dropped." in result
        ),
    }
    partial = next(
        result
        for call, result in pairs
        if call["tool"] == "ctx_expand" and call["input"].get("tags") == "1,999"
        for result in [result["result"]]
    )
    new_tag_expand = next(
        result["result"]
        for call, result in pairs
        if call["tool"] == "ctx_expand" and call["input"].get("tag") == str(new_tag)
    )

    proof = {
        "session": session,
        "exit_code": driver["exit_code"],
        "final_text": driver["final_text"],
        "chars": {
            "A=1": "first read result",
            "B=2": "second read result",
            "M=5": "new tag created by tags alias",
            "D=9": "third read result, left active",
        },
        "alias": {
            "requested": "1,2",
            "new_tag": new_tag,
            "contains_separator": "\n\n---\n\n" in alias,
            "contains_original_1": "§1§ <path>" in alias,
            "contains_original_2": "§2§ <path>" in alias,
            "old_placeholders_on_surface": old_placeholders,
        },
        "new_tag_cycle": {
            "tag": new_tag,
            "landed_event_seq": drops.get(new_tag, {}).get("landed_event_seq"),
            "placeholder_on_surface": new_placeholder,
            "expand_outer_tag": prefix_tag(new_tag_expand),
            "expand_contains_original_1": "§1§ <path>" in new_tag_expand,
        },
        "failures": {
            "unknown_tag": failures["unknown_tag"],
            "active_tag": failures["active_tag"],
            "partial_tags_1_999": {
                "restored_original_1": "§1§ <path>" in partial,
                "refused_999": "§999§ not restored: no such tag." in partial,
                "raw": partial,
            },
        },
        "drops": {str(tag): drops.get(tag) for tag in (1, 2, new_tag)},
    }
    (EVIDENCE / "t2-alias-failures.analysis.json").write_text(
        json.dumps(proof, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    print(json.dumps(proof, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
