"""Exercise conflict, explicit takeover, and fallback in separate real processes."""

from __future__ import annotations

import json
from pathlib import Path
import subprocess
import sys

from prepare_experiment import POINTER, REPORT_DIR


def main() -> None:
    root = Path(json.loads(POINTER.read_text(encoding="utf-8"))["root"])
    activity = root / "plugin-data" / "activity.log"
    records = []
    for label in ["conflict", "takeover", "fallback"]:
        before = len(activity.read_text(encoding="utf-8"))
        args = [sys.executable, str(REPORT_DIR / "run_host.py"), "--label", f"engine-{label}",
                "--timeout", "60", "--", "--profile", "headless", "--patch",
                str(root / "overlays" / f"{label}.yml"), "--json", "--permission-mode",
                "read-only", "--approval-policy", "never", f"Respond exactly ENGINE_{label.upper()}_OK. Do not use tools."]
        result = subprocess.run(args, capture_output=True, text=True, encoding="utf-8", timeout=80)
        delta = activity.read_text(encoding="utf-8")[before:]
        (root / "evidence" / f"engine-{label}.journal.txt").write_text(delta, encoding="utf-8")
        engine_lines = [line for line in delta.splitlines() if ' engine ' in line]
        entry = {"scenario": label, "runner_exit": result.returncode,
                 "runner_summary": result.stdout.strip(), "engine_journal": engine_lines}
        records.append(entry)
        print(json.dumps(entry, ensure_ascii=False), flush=True)
    (root / "evidence" / "engine-sweep.json").write_text(json.dumps(records, indent=2), encoding="utf-8")


if __name__ == "__main__":
    main()
