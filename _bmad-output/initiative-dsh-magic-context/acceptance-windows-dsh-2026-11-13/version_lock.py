"""Record exact host/plugin/node identities for the 0.11.2 baseline."""

from __future__ import annotations

import hashlib
import json
import subprocess
from pathlib import Path

from prepare_experiment import DSH_BIN, NODE_EXE, POINTER, REPORT_DIR

ROOT = Path(json.loads(POINTER.read_text(encoding="utf-8"))["root"])
TOOLS = Path(r"C:\Users\elvis\AppData\Local\Temp\opencode\mc-t0-2026-11-13\tools\dsh")
HOST_PACKAGE = TOOLS / "node_modules" / "@deepseek-ai" / "dsh" / "package.json"
LOCKFILE = TOOLS / "package-lock.json"
REGISTRY = ROOT / "evidence" / "plugin-registry.json"


def sha256(path: Path) -> str:
    hasher = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            hasher.update(chunk)
    return hasher.hexdigest()


def main() -> None:
    host = json.loads(HOST_PACKAGE.read_text(encoding="utf-8"))
    registry = json.loads(REGISTRY.read_text(encoding="utf-8"))
    local_head = subprocess.run(
        ["git", "rev-parse", "HEAD"],
        cwd=REPORT_DIR.parents[2],
        capture_output=True,
        text=True,
        encoding="utf-8",
        timeout=10,
    ).stdout.strip()
    payload = {
        "host_package": host.get("name"),
        "host_version": host.get("version"),
        "host_package_json_sha256": sha256(HOST_PACKAGE),
        "host_lockfile_sha256": sha256(LOCKFILE) if LOCKFILE.exists() else None,
        "host_bin": str(DSH_BIN),
        "node": str(NODE_EXE),
        "node_version": "24.21.0",
        "plugin": "dsh-plugin-magic-context",
        "plugin_version": registry.get("version"),
        "plugin_tarball_integrity": registry.get("dist", {}).get("integrity"),
        "plugin_gitHead": registry.get("gitHead"),
        "local_head": local_head,
    }
    target = ROOT / "evidence" / "version-lock.json"
    target.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps(payload, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
