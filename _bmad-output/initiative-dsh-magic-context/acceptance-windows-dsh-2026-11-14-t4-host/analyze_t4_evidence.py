"""Recompute the `/ctx-flush` host-gate claims from the raw evidence."""

from __future__ import annotations

import hashlib
import json
from pathlib import Path
import sqlite3

HERE = Path(__file__).resolve().parent
ROOT = Path(json.loads((HERE / "experiment-root.json").read_text(encoding="utf-8"))["root"])
EVIDENCE = ROOT / "evidence"
DB = ROOT / "plugin-data" / "dsh-magic-context.db"


def load(name: str) -> dict:
    return json.loads((EVIDENCE / name).read_text(encoding="utf-8"))


def sha(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


def event_text(event: dict) -> str:
    data = event.get("data") or {}
    content = (data.get("message") or {}).get("content") or data.get("content") or []
    return "".join(block.get("text", "") for block in content if block.get("type") == "text")


def snapshot(path: str) -> dict:
    rows = [json.loads(line) for line in Path(path).read_text(encoding="utf-8").splitlines() if line.strip()]
    return rows[-1]


def check_variant(label: str, expect_execute: bool) -> dict:
    analysis = load(f"{label}-analysis.json")
    identity = load(f"{label}-seed.identity.json")
    command = [
        row for row in analysis["commandEvidence"]
        if row.get("sessionId") == analysis["sessionId"] and row.get("target") == analysis["sessionId"]
    ]
    assert len(command) == 1, f"{label}: expected one command execution for the target session"
    record = command[0]
    assert record["definition"]["name"] == "ctx-flush", f"{label}: wrong command"
    assert record["execution"]["kind"] == "success", f"{label}: command failed"
    assert "requested 1" in record["execution"]["text"], f"{label}: missing requested count"
    assert "processed 0" in record["execution"]["text"], f"{label}: fabricated processed count"

    run = [event for event in analysis["commandEvents"] if event["type"] == "command/run"]
    done = [event for event in analysis["commandEvents"] if event["type"] == "command/done"]
    assert len(run) == 1 and len(done) == 1, f"{label}: command lifecycle missing"
    assert run[0]["data"]["name"] == "ctx-flush", f"{label}: command/run name"
    assert done[0]["data"]["kind"] == "success", f"{label}: command/done kind"
    assert run[0]["data"]["commandId"] == done[0]["data"]["commandId"], f"{label}: command pairing"
    assert analysis["host"]["tool_calls"] == [], f"{label}: flush host made a tool call"
    final_text = analysis["host"]["final_text"] or ""
    assert final_text.startswith("T4_FLUSH_OK") and "[dropped §1§]" in final_text, (
        f"{label}: next request did not report the placeholder: {final_text!r}"
    )

    placeholders = analysis["placeholder"]
    assert len(placeholders) == 1, f"{label}: expected one placeholder"
    assert placeholders[0]["seq"] == 42, f"{label}: placeholder seq"
    assert event_text(placeholders[0]) == "[dropped §1§]", f"{label}: placeholder text"

    snap = snapshot(identity["sourceFile"])
    events = {int(event["seq"]): event for event in snap["events"]}
    original = events[identity["originalSeq"]]
    assert sha(event_text(original)) == identity["originalSha256"], f"{label}: original event changed"
    assert event_text(original) != event_text(placeholders[0]), f"{label}: original was overwritten"

    rows = analysis["db"]["pendingDrops"]
    assert len(rows) == 1, f"{label}: pending row count"
    assert rows[0]["tag_number"] == 1, f"{label}: pending tag"
    assert rows[0]["landed_event_seq"] == 42, f"{label}: landed seq"
    assert rows[0]["flush_requested"] == 0, f"{label}: marker not cleared"
    assert analysis["db"]["journal"]["historian"]["count"] == 0, f"{label}: historian ran"
    assert analysis["db"]["journal"]["compartment-published"]["count"] == 0, f"{label}: compartment published"
    assert analysis["db"]["journal"]["drop-landed"]["count"] == 1, f"{label}: drop-landed count"

    passes = [json.loads(row["data"]) for row in analysis["db"]["journal"]["pass"]["rows"]]
    if expect_execute:
        assert any(row.get("decision") == "execute" for row in passes), f"{label}: no execute pass"
        execute = next(row for row in passes if row.get("decision") == "execute")
        assert execute.get("pressureStale") is True, f"{label}: flush did not stale pressure"
        assert execute.get("forceDropped") == 0, f"{label}: force band dropped content"
        assert execute.get("landed") == [], f"{label}: execute re-landed a drop"
        assert execute.get("published") == [], f"{label}: execute published"
        assert execute.get("historianStarted") is False, f"{label}: execute started historian"
        reclaim = analysis["db"]["journal"]["emergency-reclaim"]["rows"]
        assert len(reclaim) == 1, f"{label}: expected the skipped-stale force evaluation"
        reclaim_data = json.loads(reclaim[0]["data"])
        assert reclaim_data.get("reason") == "stale-reading", f"{label}: force not skipped as stale"
        assert reclaim_data.get("tier") == "skipped-stale-reading", f"{label}: force tier"
        assert reclaim_data.get("dropped") == 0, f"{label}: force dropped content"
    else:
        assert all(row.get("decision") == "defer" for row in passes), f"{label}: unexpected execute pass"

    return {
        "label": label,
        "sessionId": analysis["sessionId"],
        "command": record["execution"],
        "commandSeqs": [run[0]["seq"], done[0]["seq"]],
        "placeholderSeq": placeholders[0]["seq"],
        "originalSeq": identity["originalSeq"],
        "passes": passes,
        "hasExecute": any(row.get("decision") == "execute" for row in passes),
    }


def main() -> None:
    normal = check_variant("t4-normal", expect_execute=False)
    force = check_variant("t4-force", expect_execute=True)
    result = {"ok": True, "normal": normal, "force": force}
    (EVIDENCE / "t4-analysis-summary.json").write_text(
        json.dumps(result, ensure_ascii=False, indent=2), encoding="utf-8",
    )
    print(json.dumps(result, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
