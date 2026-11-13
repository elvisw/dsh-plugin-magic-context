"""Analyze the historian masking scenario from observer + activity + DB evidence."""

from __future__ import annotations

import json
import re
import sqlite3
from pathlib import Path

from prepare_experiment import POINTER

ROOT = Path(json.loads(POINTER.read_text(encoding="utf-8"))["root"])
SESSION = "session-47130071-e625-4c8e-bd50-a61da6b7d70a"
OBSERVER = ROOT / "evidence" / "session-observer" / f"{SESSION}.jsonl"
ACTIVITY = ROOT / "plugin-data" / "activity.log"
DB = ROOT / "plugin-data" / "dsh-magic-context.db"
OUT = ROOT / "evidence" / "historian-fresh-analysis-0112.json"


def log_rows() -> list[dict]:
    rows = []
    short = f"session-{SESSION.split('-')[1][:4]}"
    for line in ACTIVITY.read_text(encoding="utf-8").splitlines():
        if short not in line:
            continue
        match = re.search(r"\{.*\}$", line)
        if not match:
            continue
        try:
            payload = json.loads(match.group(0))
        except json.JSONDecodeError:
            continue
        rows.append({"raw": line, **payload})
    return rows


def main() -> None:
    records = [json.loads(line) for line in OBSERVER.read_text(encoding="utf-8").splitlines()]
    last = records[-1]
    events = last["events"]
    by_seq = {event["seq"]: event for event in events}
    drop = None
    for event in events:
        if event["type"] != "tool/result":
            continue
        content = event.get("data", {}).get("message", {}).get("content", [])
        text = content[0].get("text", "") if content else ""
        if re.fullmatch(r"\[dropped §\d+§\]", text):
            drop = {
                "seq": event["seq"],
                "placeholder": text,
                "original": event.get("sourceEventSeqs", []),
            }
            break
    if drop is None:
        raise SystemExit("no drop event found")
    drop_seq = drop["seq"]
    original_seq = drop["original"][0] if drop["original"] else None
    rows = log_rows()
    stored = next((row for row in rows if row.get("phase") == "stored"), None)
    published = next((row for row in rows if "compartment-published" in row["raw"]), None)
    expand = next((row for row in reversed(rows) if row.get("tool") == "ctx_expand"), None)
    connection = sqlite3.connect(f"file:{DB.as_posix()}?mode=ro", uri=True)
    connection.row_factory = sqlite3.Row
    compartment = dict(connection.execute(
        "select * from compartments where session_id = ?", (SESSION,)
    ).fetchone())
    connection.close()
    covered = json.loads(compartment["covered_seqs"])
    result = {
        "session": SESSION,
        "drops": [{
            "seq": drop_seq,
            "original": drop["original"],
            "was_live": any(drop_seq in record["surface"] for record in records),
            "live_now": drop_seq in last["surface"],
        }],
        "compartments": [{
            "seq": compartment["landed_event_seq"],
            "compartment_id": compartment["compartment_id"],
            "covered_start_seq": compartment["covered_start_seq"],
            "covered_end_seq": compartment["covered_end_seq"],
            "covered_seqs": covered,
            "covers_drop": drop_seq in covered,
            "stored_log": stored,
            "published_log": published,
        }],
        "originals_still_in_raw_log": original_seq in by_seq if original_seq is not None else False,
        "expand_result": expand,
    }
    OUT.write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps(result, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
