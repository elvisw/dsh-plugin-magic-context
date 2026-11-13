"""Snapshot real user data directories and the isolated plugin data directory."""

from __future__ import annotations

import argparse
import json
import os
from pathlib import Path

from prepare_experiment import POINTER

ROOT = Path(json.loads(POINTER.read_text(encoding="utf-8"))["root"])
HOME = Path.home()
LOCAL = Path(os.environ.get("LOCALAPPDATA", HOME / "AppData/Local"))
ROAMING = Path(os.environ.get("APPDATA", HOME / "AppData/Roaming"))

REAL = {
    "plugin_default": HOME / ".local/share/cortexkit/magic-context-dsh-poc",
    "upstream_store": HOME / ".local/share/cortexkit/magic-context",
    "cortexkit_config": HOME / ".config/cortexkit",
    "opencode_data": HOME / ".local/share/opencode",
    "dashboard": LOCAL / "com.cortexkit.magic-context-dashboard",
    "opencode_desktop": ROAMING / "ai.opencode.desktop",
}


def snapshot(path: Path) -> dict:
    if not path.exists():
        return {"exists": False}
    files = [row for row in path.rglob("*") if row.is_file()]
    return {
        "exists": True,
        "files": len(files),
        "bytes": sum(row.stat().st_size for row in files),
        "max_mtime_ns": max((row.stat().st_mtime_ns for row in files), default=0),
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--phase", choices=["before", "after"], required=True)
    options = parser.parse_args()
    payload = {
        "phase": options.phase,
        "real": {name: snapshot(path) for name, path in REAL.items()},
        "isolated": snapshot(ROOT / "plugin-data"),
    }
    target = ROOT / "evidence" / f"isolation-{options.phase}.json"
    target.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps(payload, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
