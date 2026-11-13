"""Summarize a historian observer session without printing session text."""

from __future__ import annotations

import json
import sys
from collections import Counter
from pathlib import Path


def main() -> None:
    path = Path(sys.argv[1])
    records = [json.loads(line) for line in path.read_text(encoding="utf-8").splitlines()]
    last = records[-1]
    events = last["events"]
    print(json.dumps({
        "session": last["sessionId"],
        "snapshots": len(records),
        "events": len(events),
        "types": Counter(event["type"] for event in events),
    }, ensure_ascii=False, default=dict))
    for event in events:
        if event["type"] != "compaction/end":
            continue
        data = event.get("data", {})
        print(json.dumps({
            "compaction_seq": event["seq"],
            "data_keys": sorted(data.keys()),
            "data_type": type(data).__name__,
        }, ensure_ascii=False))
        for key, value in data.items():
            if isinstance(value, list):
                print(json.dumps({
                    "key": key,
                    "len": len(value),
                    "first_keys": sorted(value[0].keys()) if value and isinstance(value[0], dict) else None,
                }, ensure_ascii=False))
                for item in value[:3]:
                    if isinstance(item, dict):
                        print(json.dumps({
                            "key": key,
                            "seq": item.get("seq"),
                            "sourceEventSeqs": item.get("sourceEventSeqs"),
                            "keys": sorted(item.keys()),
                        }, ensure_ascii=False))
            elif isinstance(value, dict):
                print(json.dumps({"key": key, "keys": sorted(value.keys())}, ensure_ascii=False))
    for event in events:
        if event["type"] != "tool/result":
            continue
        content = event.get("data", {}).get("message", {}).get("content", [])
        text = content[0].get("text", "") if content else ""
        if text.startswith("[dropped"):
            print(json.dumps({
                "drop_seq": event["seq"],
                "placeholder": text,
                "sourceEventSeqs": event.get("sourceEventSeqs"),
                "in_final_surface": event["seq"] in last["surface"],
            }, ensure_ascii=False))


if __name__ == "__main__":
    main()
