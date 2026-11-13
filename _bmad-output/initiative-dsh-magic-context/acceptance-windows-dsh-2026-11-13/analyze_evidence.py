"""Verify restoration using recorded real-host events, not model assertions."""

from __future__ import annotations

import hashlib
import json
from pathlib import Path
import re

from prepare_experiment import POINTER


def content_hash(content: object) -> str:
    raw = json.dumps(content, ensure_ascii=False, sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()


def main() -> None:
    root = Path(json.loads(POINTER.read_text(encoding="utf-8"))["root"])
    results = []
    for path in sorted((root / "evidence" / "session-observer").glob("session-*.jsonl")):
        records = [json.loads(line) for line in path.read_text(encoding="utf-8").splitlines()]
        events = records[-1]["events"]
        by_seq = {event["seq"]: event for event in events}
        drops = []
        restores = []
        for event in events:
            if event["type"] != "tool/result":
                continue
            content = event["data"]["message"]["content"]
            first_text = content[0].get("text", "") if content else ""
            refs = event.get("sourceEventSeqs", [])
            if re.fullmatch(r"\[dropped §\d+§\]", first_text):
                drops.append({"seq": event["seq"], "placeholder": first_text, "source": refs})
                continue
            if len(refs) != 1 or refs[0] not in by_seq:
                continue
            source = by_seq[refs[0]]
            if source["type"] != "tool/result":
                continue
            previous_content = source["data"]["message"]["content"]
            previous_text = previous_content[0].get("text", "") if previous_content else ""
            if not re.fullmatch(r"\[dropped §\d+§\]", previous_text):
                continue
            original_refs = source.get("sourceEventSeqs", [])
            if len(original_refs) != 1 or original_refs[0] not in by_seq:
                continue
            original = by_seq[original_refs[0]]["data"]["message"]
            restored = event["data"]["message"]
            original_envelope = {key: value for key, value in original.items() if key != "content"}
            restored_envelope = {key: value for key, value in restored.items() if key != "content"}
            restores.append({
                "seq": event["seq"], "drop_seq": source["seq"], "original_seq": original_refs[0],
                "content_equal": original["content"] == content,
                "identity_equal": original_envelope == restored_envelope,
                "original_content_sha256": content_hash(original["content"]),
                "restored_content_sha256": content_hash(content),
                "original_text_utf8_bytes": sum(len(block.get("text", "").encode("utf-8")) for block in original["content"]),
                "drop_seen_on_live_surface": any(source["seq"] in record["surface"] for record in records),
                "restore_seen_on_live_surface": any(event["seq"] in record["surface"] for record in records),
            })
        results.append({"session_id": records[-1]["sessionId"],
                        "process_ids": sorted({record["processId"] for record in records}),
                        "events": len(events), "snapshots": len(records),
                        "tool_names": sorted({event["data"]["name"] for event in events if event["type"] == "tool/call"}),
                        "drops": drops, "restores": restores})
    output = root / "evidence" / "restoration-analysis.json"
    output.write_text(json.dumps(results, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps(results, ensure_ascii=False, indent=2))
    if any(not all(entry[key] for key in ["content_equal", "identity_equal", "drop_seen_on_live_surface", "restore_seen_on_live_surface"])
           for result in results for entry in result["restores"]):
        raise SystemExit(1)


if __name__ == "__main__":
    main()
