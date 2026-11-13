"""Drive the 0.11.2 DSH acceptance scenarios through the isolated real host."""

from __future__ import annotations

import argparse
import json
from pathlib import Path
import re
import secrets
import subprocess
import sys

from prepare_experiment import POINTER, REPORT_DIR

ROOT = Path(json.loads(POINTER.read_text(encoding="utf-8"))["root"])
EVIDENCE = ROOT / "evidence"
WORKSPACE = ROOT / "workspace"
BASE = ROOT / "overlays" / "base-control.yml"
HISTORIAN = ROOT / "overlays" / "historian.yml"


def run_host(label: str, args: list[str], timeout: int = 180) -> dict:
    command = [
        sys.executable,
        str(REPORT_DIR / "run_host.py"),
        "--label",
        label,
        "--timeout",
        str(timeout),
        "--",
        *args,
    ]
    result = subprocess.run(
        command,
        cwd=REPORT_DIR,
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="replace",
        timeout=timeout + 60,
    )
    stdout_path = EVIDENCE / f"{label}.stdout.txt"
    rows = []
    if stdout_path.exists():
        for line in stdout_path.read_text(encoding="utf-8").splitlines():
            try:
                rows.append(json.loads(line))
            except json.JSONDecodeError:
                continue
    final = next((row for row in reversed(rows) if row.get("type") == "final"), None)
    record = {
        "label": label,
        "exit_code": result.returncode,
        "session_id": final.get("sessionId") if final else None,
        "final_reason": final.get("reason") if final else None,
        "final_text": final.get("text") if final else None,
        "tool_calls": [
            row.get("data", {}).get("name")
            for row in rows
            if row.get("type") == "tool/call"
        ],
    }
    (EVIDENCE / f"{label}.driver.json").write_text(
        json.dumps(record, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    print(json.dumps(record, ensure_ascii=False))
    return record


def common(prompt: str) -> list[str]:
    return [
        "--profile",
        "headless",
        "--patch",
        str(BASE),
        "--json",
        "--permission-mode",
        "read-only",
        "--approval-policy",
        "never",
        prompt,
    ]


def scenario_roundtrip() -> dict:
    prompt = (
        "This is an isolated context restoration acceptance test. In this exact order: "
        "(1) read fixture.txt with the file read tool and note its actual section-number tag; "
        "(2) call ctx_reduce for ONLY that tag; "
        "(3) in a NEW model step after ctx_reduce returns, call ctx_expand for that same tag; "
        "(4) respond RESTORE_OK and the nonce from the restored original. "
        "Make exactly these three sequential tool calls, never batch ctx_reduce and ctx_expand together. "
        "Do not reread the file or use any other tools. If a step fails, report it honestly."
    )
    return run_host("real-model-roundtrip-0112", common(prompt))


def scenario_repeat() -> dict:
    prompt = (
        "Acceptance regression test with Historian disabled. Use this exact sequential sequence, "
        "one tool call per model step: read fixture.txt once; ctx_reduce the actual tag on that read result; "
        "ctx_expand that tag; ctx_reduce that SAME tag again; ctx_expand that SAME tag again. "
        "Do not reread or use any other tools. Report each actual result honestly, especially whether "
        "the second restore succeeds or is refused. Do not infer success just because reduce says queued."
    )
    return run_host("real-model-repeat-drop-0112", common(prompt))


def replace_fixture_nonce() -> str:
    fixture = WORKSPACE / "fixture.txt"
    text = fixture.read_text(encoding="utf-8")
    new_nonce = secrets.token_hex(16)
    updated, count = re.subn(r"nonce=[0-9a-f]{32}", f"nonce={new_nonce}", text)
    if count != 1:
        raise SystemExit("fixture nonce pattern not found exactly once")
    fixture.write_text(updated, encoding="utf-8")
    return new_nonce


def scenario_restart() -> dict:
    first = run_host(
        "real-model-drop-before-restart-0112",
        common(
            "Acceptance test, first half only. Read fixture.txt once. Note the actual section-number "
            "tag on that tool output, then call ctx_reduce for ONLY that tag. After ctx_reduce returns, "
            "do NOT call ctx_expand and do NOT reread anything. Respond only DROP_READY and that tag "
            "number, without quoting the file contents or nonce. Use exactly the file read and "
            "ctx_reduce tools, sequentially."
        ),
    )
    if not first.get("session_id"):
        raise SystemExit("first half did not return a session id")
    replace_fixture_nonce()
    second = run_host(
        "real-model-expand-after-restart-0112",
        [
            "--profile",
            "headless",
            "--patch",
            str(BASE),
            "--json",
            "--session-id",
            first["session_id"],
            "--permission-mode",
            "read-only",
            "--approval-policy",
            "never",
            "This is a NEW host process resuming the persisted acceptance session. The disk fixture "
            "has changed, so DO NOT read any file. Call ONLY ctx_expand with tags 1, then report "
            "RESTORED_AFTER_RESTART and the original nonce if the restored item is available. "
            "Do not reconstruct missing content; report failures honestly. Exactly one tool call.",
        ],
    )
    return {"first": first, "second": second}


def scenario_memory() -> dict:
    write = run_host(
        "memory-write-session-a-0112",
        common(
            "Call ctx_memory exactly once, action write, category CONFIG_VALUES, content "
            "'Acceptance project persistent marker is MEM_c886d7cfa3784c69b9a983f9c3056b45.', "
            "importance 50. This is synthetic acceptance data. Do not use other tools. Report the actual result."
        ),
    )
    search = run_host(
        "memory-and-raw-history-session-b-0112",
        common(
            "This is a NEW acceptance session, not a resume. First call ctx_memory action search with "
            "query 'Acceptance project persistent marker' and report the marker actually found. Then, "
            "in a separate model step, call ctx_expand with tags 1 once to test whether that tag can "
            "recover a fixture.txt raw tool output from another session. Do not read files, search "
            "filesystem, use shell, or invent historical content. Report both actual results and whether "
            "your context tools provide cross-session RAW history search, distinct from project memories. "
            "Exactly these two tool calls."
        ),
    )
    return {"write": write, "search": search}


def scenario_historian() -> dict:
    seed = run_host(
        "historian-fresh-seed-0112",
        [
            "--profile",
            "headless",
            "--patch",
            str(HISTORIAN),
            "--json",
            "--permission-mode",
            "read-only",
            "--approval-policy",
            "never",
            "Fresh-session acceptance seed. In separate sequential model steps: read fixture.txt once; "
            "call ctx_reduce for ONLY the actual tag of that read result; read historian-fixture.txt once. "
            "Then respond only HISTORY_READY and the first read's tag number. Do not call ctx_expand, "
            "repeat a drop, quote either file, or use other tools. This must be a first-time drop, not "
            "re-dropping an expanded item.",
        ],
        timeout=180,
    )
    if not seed.get("session_id"):
        raise SystemExit("historian seed did not return a session id")
    expand = run_host(
        "historian-fresh-publish-and-expand-0112",
        [
            "--profile",
            "headless",
            "--patch",
            str(HISTORIAN),
            "--json",
            "--session-id",
            seed["session_id"],
            "--permission-mode",
            "read-only",
            "--approval-policy",
            "never",
            "Acceptance continuation of the first-time-drop session. First call acceptance_wait with "
            "seconds 20. In a NEW model step after it returns, call acceptance_wait with seconds 20 again. "
            "In a NEW model step after that returns, call ctx_expand for tag 1 once. Do not read any file, "
            "retry, or reconstruct the missing original. Report the exact result honestly. Exactly these "
            "three sequential tool calls.",
        ],
        timeout=180,
    )
    return {"seed": seed, "expand": expand}


def scenario_engine() -> dict:
    result = subprocess.run(
        [sys.executable, str(REPORT_DIR / "run_engine_sweep.py")],
        cwd=REPORT_DIR,
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="replace",
        timeout=360,
    )
    print(result.stdout)
    if result.returncode != 0:
        print(result.stderr, file=sys.stderr)
    return {"exit_code": result.returncode}


SCENARIOS = {
    "roundtrip": scenario_roundtrip,
    "repeat": scenario_repeat,
    "restart": scenario_restart,
    "memory": scenario_memory,
    "historian": scenario_historian,
    "engine": scenario_engine,
}


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--only", choices=sorted(SCENARIOS), action="append")
    options = parser.parse_args()
    selected = options.only or ["roundtrip", "repeat", "restart", "memory", "historian", "engine"]
    summary = {}
    for name in selected:
        summary[name] = SCENARIOS[name]()
    (EVIDENCE / "driver-summary.json").write_text(
        json.dumps(summary, ensure_ascii=False, indent=2), encoding="utf-8"
    )


if __name__ == "__main__":
    main()
