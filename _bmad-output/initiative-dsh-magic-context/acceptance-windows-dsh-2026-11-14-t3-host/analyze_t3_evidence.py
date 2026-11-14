"""Analyze T3 host evidence without touching the host or model.

Produces `t3-analysis.json` and a concise pass/fail table for the report.
"""

from __future__ import annotations

import hashlib
import json
import re
from pathlib import Path
import sys

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
import run_t3_scenarios as run  # noqa: E402

STATE = json.loads((run.EVIDENCE / "t3-state.json").read_text(encoding="utf-8"))
PREFLIGHT = json.loads((run.EVIDENCE / "preflight.json").read_text(encoding="utf-8"))
SESSION = STATE["sessionId"]
IDENTITY = STATE["identity"]
TARGET = STATE["target"]


def sha(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


def strip_outer_tag(text: str) -> str:
    return re.sub(r"^§\d+§ ", "", text, count=1)


def observer_lines() -> list[dict]:
    path = Path(IDENTITY["sourceFile"])
    rows = []
    for number, line in enumerate(path.read_text(encoding="utf-8").splitlines(), start=1):
        try:
            row = json.loads(line)
        except json.JSONDecodeError:
            continue
        row["_line"] = number
        rows.append(row)
    return rows


def first_seen(seq: int) -> dict:
    for row in observer_lines():
        for event in row.get("events") or []:
            if int(event.get("seq", -1)) == seq:
                return {"file": str(Path(IDENTITY["sourceFile"])), "line": row["_line"], "eventSha256": sha(json.dumps(event, sort_keys=True, ensure_ascii=False))}
    return {}


def event_hash_stable(seq: int) -> bool:
    hashes = set()
    for row in observer_lines():
        for event in row.get("events") or []:
            if int(event.get("seq", -1)) == seq:
                hashes.add(sha(json.dumps(event, sort_keys=True, ensure_ascii=False)))
    return len(hashes) == 1


def content_check(name: str) -> dict:
    payload = STATE[name]
    result_text = payload["result"]["resultText"]
    stripped = strip_outer_tag(result_text)
    calls = payload["record"].get("tool_calls") or []
    return {
        "hostExit": payload["record"].get("exit_code"),
        "finalReason": payload["record"].get("final_reason"),
        "toolCalls": calls,
        "locatorOk": len(calls) == 1 and calls[0].get("tool") == "ctx_expand"
            and (
                (name == "e1" and calls[0].get("input") == {"tag": str(IDENTITY["tag"])})
                or (name == "e2" and calls[0].get("input") == {"message": str(IDENTITY["originalSeq"])})
            ),
        "resultSeq": payload["result"]["resultSeq"],
        "eventsAfterResult": [event["type"] for event in payload["result"]["eventsAfterResult"]],
        "resultSha256": sha(result_text),
        "strippedSha256": sha(stripped),
        "originalSha256": IDENTITY["originalSha256"],
        "byteEqual": stripped == IDENTITY["originalText"],
        "windowOk": payload["window"]["ok"],
        "windowErrors": payload["window"]["errors"],
        "agentUsageDelta": payload["window"].get("agentUsageDelta"),
    }


def call_counts() -> dict:
    snap = run.snapshot(SESSION)
    events = snap["events"]
    call_id = IDENTITY["callId"]
    calls = [e for e in events if e.get("type") == "tool/call" and (e.get("data") or {}).get("callId") == call_id]
    results = [e for e in events if e.get("type") == "tool/result" and (e.get("data") or {}).get("message", {}).get("toolCallId") == call_id]
    return {
        "calls": len(calls),
        "results": len(results),
        "resultSeqs": [int(e["seq"]) for e in results],
    }


def window_events_clean(name: str) -> dict:
    payload = STATE[name]
    result_seq = payload["result"]["resultSeq"]
    after = [e for e in payload["result"]["eventsAfterResult"] if int(e.get("seq", -1)) > result_seq]
    publish_after = [e for e in after if e.get("type") == "user/message" and "compacted" in run.event_text(e)]
    return {"eventsAfterCount": len(after), "compactedAfter": len(publish_after)}


def main() -> None:
    state = run.db_state(SESSION)
    target_row = next((row for row in state["compartments"] if row["compartment_id"] == TARGET["compartmentId"]), None)
    pass_row = run.find_pass_row(state, TARGET["compartmentId"])
    pending_tag1 = [row for row in state["pendingDrops"] if row["tag_number"] == IDENTITY["tag"]]
    tag1 = next((row for row in state["tags"] if row["tag_number"] == IDENTITY["tag"]), None)
    pre = STATE["precondition"]
    fixture = run.WORKSPACE / "fixture.txt"
    fixture_sha = hashlib.sha256(fixture.read_bytes()).hexdigest()
    activity = (run.ROOT / "plugin-data" / "activity.log").read_text(encoding="utf-8")
    boot_db_paths = sorted(set(
        path.replace("\\\\", "\\") for path in re.findall(r'"dbPath":"([^"]+)"', activity)
    ))
    analysis = {
        "sessionId": SESSION,
        "preflight": PREFLIGHT,
        "fixtureSha256": fixture_sha,
        "fixtureUnchanged": fixture_sha == PREFLIGHT["fixture_sha256"],
        "bootDbPaths": boot_db_paths,
        "bootDbPathInRoot": bool(boot_db_paths) and all(str(run.ROOT) in path for path in boot_db_paths),
        "identity": {
            **IDENTITY,
            "originalFirstSeen": first_seen(IDENTITY["originalSeq"]),
            "placeholderFirstSeen": first_seen(IDENTITY["placeholderSeq"]),
            "originalStableAcrossSnapshots": event_hash_stable(IDENTITY["originalSeq"]),
            "placeholderStableAcrossSnapshots": event_hash_stable(IDENTITY["placeholderSeq"]),
        },
        "target": {
            **TARGET,
            "publishFirstSeen": first_seen(TARGET["publishSeq"]),
            "publishStableAcrossSnapshots": event_hash_stable(TARGET["publishSeq"]),
            "rowLandedAtPublishSeq": target_row is not None and target_row["landed_event_seq"] == TARGET["publishSeq"],
            "passRow": pass_row,
        },
        "precondition": {
            "unlanded": pre["unlanded"] if pre else None,
            "emptyUnlanded": (pre is not None and not pre["unlanded"]),
            "targetRow": pre["target"] if pre else None,
            "passRow": pre["pass"] if pre else None,
        },
        "e1Tag": content_check("e1"),
        "e2Message": content_check("e2"),
        "originalCall": call_counts(),
        "windowEvents": {"e1": window_events_clean("e1"), "e2": window_events_clean("e2")},
        "dropState": {
            "tag": tag1,
            "pendingRowsForTag": pending_tag1,
            "landedEventSeq": pending_tag1[-1]["landed_event_seq"] if pending_tag1 else None,
            "noNewPendingRow": len(pending_tag1) == 1,
        },
        "historianUsageScoped": {
            "historianRows": state["journal"]["historian"]["count"],
            "publishedRows": state["journal"]["compartment-published"]["count"],
        },
    }
    checks = {
        "buildHashesMatch": PREFLIGHT["installed_tool_bridge_sha256"] == PREFLIGHT["built_tool_bridge_sha256"]
            and PREFLIGHT["installed_seams_sha256"] == PREFLIGHT["built_seams_sha256"],
        "targetPublishedOnce": TARGET.get("ok") is True,
        "targetCoversPlaceholder": str(IDENTITY["placeholderSeq"]) in [str(seq) for seq in TARGET["sourceEventSeqs"]],
        "targetLandedAtPublishSeq": analysis["target"]["rowLandedAtPublishSeq"],
        "passRowFound": pass_row is not None,
        "emptyUnlandedBeforeExpand": analysis["precondition"]["emptyUnlanded"],
        "emptyUnlandedAfterE1": not STATE["e1"]["window"]["post"]["unlanded"],
        "emptyUnlandedAfterE2": not STATE["e2"]["window"]["post"]["unlanded"],
        "e1ByteEqual": analysis["e1Tag"]["byteEqual"],
        "e2ByteEqual": analysis["e2Message"]["byteEqual"],
        "e1WindowOk": analysis["e1Tag"]["windowOk"],
        "e2WindowOk": analysis["e2Message"]["windowOk"],
        "e1LocatorOnlyTag": analysis["e1Tag"]["locatorOk"],
        "e2LocatorOnlyMessage": analysis["e2Message"]["locatorOk"],
        "oneOriginalCall": analysis["originalCall"]["calls"] == 1,
        "twoOriginalResults": analysis["originalCall"]["results"] == 2,
        "noCompactedAfterExpand": analysis["windowEvents"]["e1"]["compactedAfter"] == 0
            and analysis["windowEvents"]["e2"]["compactedAfter"] == 0,
        "tagStaysLanded": analysis["dropState"]["landedEventSeq"] == IDENTITY["placeholderSeq"],
        "noNewPendingRow": analysis["dropState"]["noNewPendingRow"],
        "fixtureUnchanged": analysis["fixtureUnchanged"],
        "bootDbPathInRoot": analysis["bootDbPathInRoot"],
        "eventsStable": analysis["identity"]["originalStableAcrossSnapshots"]
            and analysis["identity"]["placeholderStableAcrossSnapshots"]
            and analysis["target"]["publishStableAcrossSnapshots"],
    }
    analysis["checks"] = checks
    analysis["ok"] = all(checks.values())
    (run.EVIDENCE / "t3-analysis.json").write_text(json.dumps(analysis, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps({
        "ok": analysis["ok"],
        "sessionId": SESSION,
        "tag": IDENTITY["tag"],
        "originalSeq": IDENTITY["originalSeq"],
        "placeholderSeq": IDENTITY["placeholderSeq"],
        "target": TARGET,
        "checks": checks,
        "e1": {key: analysis["e1Tag"][key] for key in ("hostExit", "finalReason", "resultSeq", "byteEqual", "windowOk")},
        "e2": {key: analysis["e2Message"][key] for key in ("hostExit", "finalReason", "resultSeq", "byteEqual", "windowOk")},
    }, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
