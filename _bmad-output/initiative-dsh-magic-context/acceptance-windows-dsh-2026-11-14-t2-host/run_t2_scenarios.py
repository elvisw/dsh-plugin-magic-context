"""Run the T2 host acceptance scenarios against the isolated DSH profile."""

from __future__ import annotations

import json
import os
from pathlib import Path
import re
import secrets
import subprocess
import sys
import time

from prepare_t2_host import DSH_CMD, REPORT_DIR, isolated_env

POINTER = REPORT_DIR / "experiment-root.json"
ROOT = Path(json.loads(POINTER.read_text(encoding="utf-8"))["root"])
EVIDENCE = ROOT / "evidence"
WORKSPACE = ROOT / "workspace"
OVERLAY = ROOT / "overlays" / "base-control.yml"


def redact(text: str) -> str:
    for name, value in os.environ.items():
        if re.search(r"KEY|TOKEN|PASSWORD|SECRET", name, re.I) and len(value) >= 8:
            text = text.replace(value, "[REDACTED]")
    return text


def common(prompt: str) -> list[str]:
    return [
        "--profile", "headless",
        "--patch", str(OVERLAY),
        "--json",
        "--permission-mode", "read-only",
        "--approval-policy", "never",
        prompt,
    ]


def run_host(label: str, args: list[str], timeout: int = 240) -> dict:
    started = time.monotonic()
    try:
        result = subprocess.run(
            [*DSH_CMD, *args], cwd=WORKSPACE, env=isolated_env(ROOT),
            capture_output=True, text=True, encoding="utf-8", errors="replace", timeout=timeout,
        )
        stdout, stderr = redact(result.stdout), redact(result.stderr)
        record = {"args": args, "exit_code": result.returncode, "mode": "real-host"}
    except subprocess.TimeoutExpired as exc:
        stdout = redact((exc.stdout or b"").decode("utf-8", errors="replace"))
        stderr = redact((exc.stderr or b"").decode("utf-8", errors="replace"))
        record = {"args": args, "status": "timeout", "mode": "real-host"}
    record["seconds"] = round(time.monotonic() - started, 3)
    (EVIDENCE / f"{label}.stdout.txt").write_text(stdout, encoding="utf-8")
    (EVIDENCE / f"{label}.stderr.txt").write_text(stderr, encoding="utf-8")

    rows = []
    for line in stdout.splitlines():
        try:
            row = json.loads(line)
        except json.JSONDecodeError:
            continue
        if isinstance(row, dict):
            rows.append(row)
    session = next((row for row in rows if row.get("type") == "session"), None)
    final = next((row for row in reversed(rows) if row.get("type") == "final"), None)
    record.update({
        "session_id": session.get("sessionId") if session else None,
        "final_reason": final.get("reason") if final else None,
        "final_text": final.get("text") if final else None,
        "tool_calls": [
            {"tool": row.get("tool"), "input": row.get("input")}
            for row in rows if row.get("type") == "tool_call"
        ],
        "tool_results": [
            {"callId": row.get("callId"), "status": row.get("status"), "result": row.get("result")}
            for row in rows if row.get("type") == "tool_result"
        ],
    })
    (EVIDENCE / f"{label}.driver.json").write_text(json.dumps(record, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps({
        "label": label, "exit_code": record.get("exit_code"), "session_id": record["session_id"],
        "tool_calls": [entry["tool"] for entry in record["tool_calls"]],
        "final_reason": record["final_reason"],
    }, ensure_ascii=False))
    return record


def scenario_roundtrip() -> dict:
    prompt = (
        "This is an isolated T2 host acceptance test. Follow this exact sequence, one tool call per model step. "
        "(1) read fixture.txt with the file read tool and note the actual §N§ tag on its result. "
        "(2) call ctx_reduce with drop set to ONLY that tag. "
        "(3) in a NEW model step after ctx_reduce returns, call ctx_expand with tag set to that SAME old tag. "
        "(4) in a NEW model step after ctx_expand returns, call ctx_reduce again with drop set to that SAME old tag; "
        "report the exact receipt you receive, including whether it says already dropped. "
        "(5) respond exactly T2_OLD_TAG_OK plus the nonce from the expanded original. "
        "Do not reread the file, do not use other tools, and do not batch calls."
    )
    return run_host("t2-roundtrip", common(prompt))


def scenario_lifecycle() -> dict:
    prompt = (
        "This is an isolated T2 new-tag lifecycle acceptance test. Follow this exact sequence, one tool call per model step. "
        "(1) read fixture.txt and note its actual §N§ tag. "
        "(2) call ctx_reduce with drop set to that tag. "
        "(3) after it returns, call ctx_expand with tag set to that same old tag. "
        "(4) the ctx_expand result begins with a NEW §M§ marker; note M, then call ctx_reduce with drop set to M. "
        "(5) after it returns, call ctx_expand with tag set to M. "
        "(6) respond exactly T2_NEW_TAG_OK plus the nonce from the second expanded original. "
        "Do not reread the file, do not use other tools, and do not batch calls."
    )
    return run_host("t2-lifecycle", common(prompt))


def scenario_restart() -> dict:
    first = run_host(
        "t2-restart-drop",
        common(
            "T2 host acceptance, first half. Read fixture.txt once, note the actual §N§ tag on its result, "
            "then call ctx_reduce with drop set to ONLY that tag. After it returns, respond only DROP_READY "
            "and that tag number; do not call ctx_expand and do not reread. Exactly one read and one reduce."
        ),
    )
    if not first.get("session_id"):
        raise SystemExit("restart first half did not return a session id")
    fixture = WORKSPACE / "fixture.txt"
    text = fixture.read_text(encoding="utf-8")
    nonce = secrets.token_hex(16)
    updated, count = re.subn(r"nonce=[0-9a-f]{32}", f"nonce={nonce}", text)
    if count != 1:
        raise SystemExit("fixture nonce pattern not found exactly once")
    fixture.write_text(updated, encoding="utf-8")
    second = run_host(
        "t2-restart-expand",
        [
            "--profile", "headless",
            "--patch", str(OVERLAY),
            "--json",
            "--session-id", first["session_id"],
            "--permission-mode", "read-only",
            "--approval-policy", "never",
            "This is a NEW host process resuming the persisted T2 acceptance session. The disk fixture has "
            "changed, so DO NOT read any file. Call ONLY ctx_expand with tag 1, then in a NEW model step call "
            "ctx_reduce with drop 1 and report the exact receipt. Respond exactly T2_RESTART_OK plus the original "
            "nonce from the expanded result. Do not reconstruct missing content and do not batch calls.",
        ],
    )
    return {"first": first, "second": second, "fixture_disk_nonce": nonce}


def scenario_alias_failures() -> dict:
    prompt = (
        "This is an isolated T2 alias/failure acceptance test. Follow this exact sequence, one tool call per model step. "
        "(1) read fixture.txt once and note the actual §N§ tag A on its result. "
        "(2) read fixture.txt again and note the actual §N§ tag B on the second result. "
        "(3) call ctx_reduce with drop set to ONLY A. "
        "(4) call ctx_reduce with drop set to ONLY B. "
        "(5) in a NEW step, call ctx_expand with the deprecated tags parameter set to A,B in that order. "
        "(6) the expand result begins with a NEW §M§ marker; note M, then call ctx_reduce with drop set to M. "
        "(7) in a NEW step, call ctx_expand with tag set to M and note the nonce. "
        "(8) call ctx_expand with tag set to 999 and report the exact refusal receipt. "
        "(9) read fixture.txt once more and note its actual tag D; do NOT drop D. Then call ctx_expand with tag set to D and report the exact refusal receipt. "
        "(10) call ctx_expand with the deprecated tags parameter set to A,999 and report the exact receipt. "
        "(11) respond exactly T2_ALIAS_FAILURES_OK with A, B, M, D and the three exact refusal receipts. "
        "Do not batch calls, do not use other tools, and do not read more than the three specified times."
    )
    return run_host("t2-alias-failures", common(prompt), timeout=300)


def main() -> None:
    parser = __import__("argparse").ArgumentParser()
    parser.add_argument(
        "--only",
        choices=["roundtrip", "lifecycle", "restart", "alias-failures"],
        action="append",
    )
    options = parser.parse_args()
    selected = options.only or ["roundtrip", "lifecycle", "restart"]
    scenarios = {
        "roundtrip": scenario_roundtrip,
        "lifecycle": scenario_lifecycle,
        "restart": scenario_restart,
        "alias-failures": scenario_alias_failures,
    }
    summary = {}
    for name in selected:
        summary[name] = scenarios[name]()
    (EVIDENCE / "t2-driver-summary.json").write_text(json.dumps(summary, ensure_ascii=False, indent=2), encoding="utf-8")


if __name__ == "__main__":
    main()
