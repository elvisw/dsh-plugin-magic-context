"""Capture one real DSH invocation with isolated paths and secret redaction."""

from __future__ import annotations

import argparse
import json
from pathlib import Path
import subprocess
import time

from prepare_experiment import DSH_EXE, POINTER, isolated_env, redact


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--label", required=True)
    parser.add_argument("--timeout", type=int, default=120)
    parser.add_argument("--stdin-file", type=Path)
    parser.add_argument("args", nargs=argparse.REMAINDER)
    options = parser.parse_args()
    args = options.args[1:] if options.args[:1] == ["--"] else options.args
    if not options.label.replace("-", "").replace("_", "").isalnum():
        raise SystemExit("Label must be a filename-safe identifier.")
    root = Path(json.loads(POINTER.read_text(encoding="utf-8"))["root"])
    started = time.monotonic()
    payload = options.stdin_file.read_text(encoding="utf-8") if options.stdin_file else None
    try:
        result = subprocess.run(
            [str(DSH_EXE), *args], cwd=root / "workspace", env=isolated_env(root),
            input=payload, capture_output=True, text=True, encoding="utf-8",
            errors="replace", timeout=options.timeout,
        )
        stdout, stderr = redact(result.stdout), redact(result.stderr)
        record = {"args": args, "exit_code": result.returncode, "mode": "real-host"}
    except subprocess.TimeoutExpired as exc:
        stdout = redact((exc.stdout or b"").decode("utf-8", errors="replace"))
        stderr = redact((exc.stderr or b"").decode("utf-8", errors="replace"))
        record = {"args": args, "status": "timeout", "mode": "real-host"}
    record["seconds"] = round(time.monotonic() - started, 3)
    base = root / "evidence" / options.label
    base.with_suffix(".stdout.txt").write_text(stdout, encoding="utf-8")
    base.with_suffix(".stderr.txt").write_text(stderr, encoding="utf-8")
    base.with_suffix(".json").write_text(json.dumps(record, indent=2), encoding="utf-8")
    print(json.dumps({**record, "evidence": str(base), "stdout_chars": len(stdout),
                      "stderr_chars": len(stderr)}, ensure_ascii=False))
    if record.get("status") == "timeout":
        raise SystemExit(124)
    raise SystemExit(int(record["exit_code"]))


if __name__ == "__main__":
    main()
