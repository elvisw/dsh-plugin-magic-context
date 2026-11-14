"""Run one real model smoke through the registry-installed package."""

from __future__ import annotations

import json
import os
from pathlib import Path
import re
import subprocess
import time

from prepare_package_host import DSH_CMD, REPORT_DIR, isolated_env


def redact(text: str) -> str:
    for name, value in os.environ.items():
        if re.search(r"KEY|TOKEN|PASSWORD|SECRET", name, re.I) and len(value) >= 8:
            text = text.replace(value, "[REDACTED]")
    return text


def main() -> None:
    root = Path(json.loads((REPORT_DIR / "registry-experiment-root.json").read_text(encoding="utf-8"))["root"])
    args = [
        "--profile", "headless",
        "--patch", str(root / "overlays" / "base-control.yml"),
        "--json",
        "--permission-mode", "read-only",
        "--approval-policy", "never",
        "This is an isolated registry-package smoke test. Reply with exactly REGISTRY_PACKAGE_OK and nothing else.",
    ]
    started = time.monotonic()
    result = subprocess.run(
        [*DSH_CMD, *args],
        cwd=root / "workspace",
        env=isolated_env(root),
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="replace",
        timeout=300,
    )
    stdout, stderr = redact(result.stdout), redact(result.stderr)
    (root / "evidence" / "smoke.stdout.txt").write_text(stdout, encoding="utf-8")
    (root / "evidence" / "smoke.stderr.txt").write_text(stderr, encoding="utf-8")

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
    record = {
        "args": args,
        "exit_code": result.returncode,
        "seconds": round(time.monotonic() - started, 3),
        "session_id": session.get("sessionId") if session else None,
        "final_reason": final.get("reason") if final else None,
        "final_text": final.get("text") if final else None,
    }
    (root / "evidence" / "smoke.json").write_text(json.dumps(record, indent=2), encoding="utf-8")
    print(json.dumps(record, ensure_ascii=False, indent=2))
    if result.returncode != 0 or not final or "REGISTRY_PACKAGE_OK" not in (final.get("text") or ""):
        raise SystemExit(1)


if __name__ == "__main__":
    main()
