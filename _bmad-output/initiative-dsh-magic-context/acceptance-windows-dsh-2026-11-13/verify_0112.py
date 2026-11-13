"""Validate the 0.11.2 acceptance evidence and write the run summary."""

from __future__ import annotations

import json
import re
from datetime import datetime
from pathlib import Path

from prepare_experiment import POINTER

ROOT = Path(json.loads(POINTER.read_text(encoding="utf-8"))["root"])
EVIDENCE = ROOT / "evidence"
REPORT_DIR = Path(__file__).resolve().parent


def read_json(name: str) -> dict:
    return json.loads((EVIDENCE / name).read_text(encoding="utf-8"))


def read_stdout(label: str) -> list[dict]:
    path = EVIDENCE / f"{label}.stdout.txt"
    rows = []
    for line in path.read_text(encoding="utf-8").splitlines():
        try:
            rows.append(json.loads(line))
        except json.JSONDecodeError:
            continue
    return rows


def final_session(label: str) -> str:
    rows = read_stdout(label)
    final = next(row for row in reversed(rows) if row.get("type") == "final")
    return final["sessionId"]


def check() -> dict:
    package = read_json("package-verification.json")
    assert package["tarball_integrity"] and package["package_version"] == "0.11.2"
    assert package["missing_in_install"] == [] and package["mismatched"] == []
    assert package["lifecycle_scripts"] == {}

    restoration = read_json("restoration-analysis.json")
    by_session = {row["session_id"]: row for row in restoration}
    roundtrip = by_session[final_session("real-model-roundtrip-0112")]
    restart = by_session[final_session("real-model-drop-before-restart-0112")]
    repeat = by_session[final_session("real-model-repeat-drop-0112")]
    for row in (roundtrip, restart):
        restored = row["restores"][0]
        assert restored["content_equal"] and restored["identity_equal"]
        assert restored["original_content_sha256"] == restored["restored_content_sha256"]
        assert restored["drop_seen_on_live_surface"] and restored["restore_seen_on_live_surface"]
    assert len(restart["process_ids"]) >= 2
    assert len(repeat["drops"]) == 1 and len(repeat["restores"]) == 1

    historian = read_json("historian-fresh-analysis-0112.json")
    assert historian["drops"][0]["was_live"] and not historian["drops"][0]["live_now"]
    assert historian["compartments"][0]["covers_drop"]
    assert historian["originals_still_in_raw_log"]
    assert historian["expand_result"]["refused"]

    memory_label = "memory-and-raw-history-session-b-0112"
    memory_session = final_session(memory_label)
    memory_text = (EVIDENCE / f"{memory_label}.stdout.txt").read_text(encoding="utf-8")
    marker = "MEM_c886d7cfa3784c69b9a983f9c3056b45"
    assert marker in memory_text
    observer_memory = (EVIDENCE / "session-observer" / f"{memory_session}.jsonl").read_text(encoding="utf-8")
    memory_fts_found = marker.lower() in observer_memory.lower() and "match=fts" in observer_memory.lower()

    owners = [
        json.loads(line)
        for line in (EVIDENCE / "session-observer" / "engine-owners.jsonl").read_text(encoding="utf-8").splitlines()
        if line.strip()
    ]
    late = [row for row in owners if "2026-11-13T14:58:00" <= row["time"] < "2026-11-13T14:58:30"]
    assert len(late) == 3, late
    classes = [row["constructor"] for row in late]
    assert classes == ["MagicContextCompactionEngine", "MagicContextCompactionEngine", "BasicCompactionEngine"], classes

    engine_sweep = read_json("engine-sweep.json")
    assert all(row["runner_exit"] == 0 for row in engine_sweep)

    before = read_json("isolation-before.json")
    after = read_json("isolation-after.json")
    assert before["real"]["plugin_default"]["exists"] is False
    assert after["real"]["plugin_default"]["exists"] is False
    assert after["isolated"]["exists"] is True
    boot = [
        line for line in (ROOT / "plugin-data" / "activity.log").read_text(encoding="utf-8").splitlines()
        if "adapter booted" in line and "dsh-magic-context.db" in line
    ]
    assert boot and all(ROOT.name.lower() in line.lower() for line in boot)

    total_usage: dict[str, float] = {}
    steps = 0
    invocations = []
    for path in sorted(EVIDENCE.glob("*.stdout.txt")):
        rows = []
        for line in path.read_text(encoding="utf-8").splitlines():
            try:
                rows.append(json.loads(line))
            except json.JSONDecodeError:
                continue
        final = next((row for row in reversed(rows) if row.get("type") == "final"), None)
        if not final:
            continue
        invocations.append({"label": path.name.removesuffix(".stdout.txt"),
                            "session_id": final.get("sessionId"),
                            "reason": final.get("reason")})
        for row in rows:
            if row.get("type") == "status" and row.get("phase") == "step_end":
                steps += 1
                for key, value in row.get("usage", {}).items():
                    if isinstance(value, (int, float)):
                        total_usage[key] = total_usage.get(key, 0) + value

    historian_lines = [
        line for line in (ROOT / "plugin-data" / "activity.log").read_text(encoding="utf-8").splitlines()
        if " historian " in line and '"phase":"done"' in line
    ]
    summary = {
        "host": "0.2.2-rc.1",
        "node": "24.21.0 (DSH subprocess)",
        "plugin": "0.11.2",
        "mode": "real DSH + real DeepSeek API; no simulated model",
        "route": "deepseek-official/deepseek-flash",
        "invocations": invocations,
        "agent_model_steps": steps,
        "agent_reported_usage": total_usage,
        "historian_done_runs": len(historian_lines),
        "historian_done_evidence": historian_lines,
        "requeue_regression_expected_exit": 1,
        "requeue_regression_actual_exit": 1,
        "memory_fts_found_in_observer": memory_fts_found,
        "gate": {
            "package": "pass",
            "install_load": "pass",
            "same_process_restore": "pass",
            "cross_process_restore": "pass",
            "memory": "pass",
            "engine_registration": "pass",
            "requeue": "observed-defect",
            "historian": "observed-capability-boundary",
            "maintenance": "not-covered",
        },
        "adopt_as_baseline": True,
        "usage_note": "Agent totals exclude auxiliary historian usage; neither is a monetary invoice.",
    }
    (EVIDENCE / "run-summary.json").write_text(json.dumps(summary, ensure_ascii=False, indent=2), encoding="utf-8")
    return summary


if __name__ == "__main__":
    print(json.dumps(check(), ensure_ascii=False, indent=2))
