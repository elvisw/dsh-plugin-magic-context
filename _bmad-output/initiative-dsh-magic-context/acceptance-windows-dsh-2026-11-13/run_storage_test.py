"""Run the storage-level requeue reproduction with the pinned Node 24 runtime."""

from __future__ import annotations

import json
import subprocess
from pathlib import Path

from prepare_experiment import POINTER, redact

REPORT_DIR = Path(__file__).resolve().parent
NODE = Path(r"C:\Users\elvis\AppData\Local\Author Software\nvm\installs\v24.21.0\node.exe")
SCRIPT = REPORT_DIR / "repro_requeue.mjs"


def main() -> None:
    root = Path(json.loads(POINTER.read_text(encoding="utf-8"))["root"])
    result = subprocess.run(
        [str(NODE), str(SCRIPT)],
        cwd=REPORT_DIR,
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="replace",
        timeout=30,
    )
    output = redact(result.stdout + "\n--- stderr ---\n" + result.stderr)
    (root / "evidence" / "requeue-regression-0112.txt").write_text(output, encoding="utf-8")
    print(json.dumps({"exit_code": result.returncode, "output": output}, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
