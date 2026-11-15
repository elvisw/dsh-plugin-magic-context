"""Registry-install smoke for @elvisw/dsh-plugin-magic-context@0.12.3.

This is a user-path check, not a daily-profile test: it installs the published
artifact by specifier into a fresh isolated profile and runs one real-model
request. The P4 command behavior itself was verified in the separate local-build
host gate.
"""

from __future__ import annotations

import hashlib
import json
from pathlib import Path
import subprocess
import sys
import time

REPO = Path(r"C:\Users\elvis\Documents\dev\plugin\dsh-plugin-magic-context")
P4_DIR = REPO / "_bmad-output" / "initiative-dsh-magic-context" / "acceptance-windows-dsh-2026-11-15-p4-flush-feedback"
sys.path.insert(0, str(P4_DIR))

from prepare_p4_host import dsh, isolated_env, overlay_base, write_text  # noqa: E402

REPORT_DIR = Path(__file__).resolve().parent.parent
TOOLS_BIN = Path(r"C:\Users\elvis\AppData\Local\Temp\opencode\mc-t0-2026-11-13\tools\bin")
PACKAGE_NAME = "@elvisw/dsh-plugin-magic-context"
SPEC = f"{PACKAGE_NAME}@0.12.3"


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1 << 20), b""):
            digest.update(chunk)
    return digest.hexdigest()


def main() -> None:
    root = TOOLS_BIN.parent / f"dsh-mc-registry-0123-{time.strftime('%Y%m%d-%H%M%S')}"
    if root.exists():
        raise SystemExit(f"root exists: {root}")
    for directory in ("workspace", "evidence", "overlays", "plugin-data"):
        (root / directory).mkdir(parents=True)

    overlay = overlay_base(root)
    write_text(root / "overlays" / "registry-e2e.yml", json.dumps(overlay, indent=2))

    bootstrap = dsh("bootstrap", ["--profile", "headless", "--dump-config"], root)
    if bootstrap["exit_code"] != 0:
        raise SystemExit(f"profile bootstrap failed: {bootstrap['stderr']}")

    add = dsh(
        "add-registry",
        ["plugin", "--profile", "headless", "add", SPEC, "--ignore-scripts"],
        root,
        900,
    )
    if add["exit_code"] != 0:
        raise SystemExit(f"registry install failed: {add['stderr']}")

    installed = root / "dsh-home" / "profiles" / "headless" / "node_modules" / "@elvisw" / "dsh-plugin-magic-context"
    installed_pkg = installed / "package.json"
    if not installed_pkg.exists():
        raise SystemExit(f"installed package missing: {installed_pkg}")
    installed_data = json.loads(installed_pkg.read_text(encoding="utf-8"))
    if installed_data.get("version") != "0.12.3":
        raise SystemExit(f"installed version mismatch: {installed_data.get('version')}")

    dump = dsh(
        "dump-config",
        ["--profile", "headless", "--patch", str(root / "overlays" / "registry-e2e.yml"), "--dump-config"],
        root,
    )
    if dump["exit_code"] != 0:
        raise SystemExit(f"dump-config failed: {dump['stderr']}")
    if PACKAGE_NAME not in dump["stdout"]:
        raise SystemExit("dump-config does not show the scoped plugin")

    smoke = dsh(
        "smoke",
        [
            "--profile", "headless",
            "--patch", str(root / "overlays" / "registry-e2e.yml"),
            "--json",
            "--permission-mode", "read-only",
            "--approval-policy", "never",
            "Reply exactly REGISTRY_0123_OK. Do not call any tool.",
        ],
        root,
        300,
    )
    if smoke["exit_code"] != 0:
        raise SystemExit(f"model smoke failed: {smoke['stderr']}")
    if "REGISTRY_0123_OK" not in smoke["stdout"]:
        raise SystemExit("model smoke did not return REGISTRY_0123_OK")

    preflight = {
        "root": str(root),
        "specifier": SPEC,
        "installedVersion": installed_data.get("version"),
        "installedPackage": str(installed_pkg),
        "installedFlushCommandSha256": sha256(installed / "lib" / "dsh" / "flush-command.js"),
        "dumpConfigMentionsSpecifier": True,
        "modelSmoke": "REGISTRY_0123_OK",
        "overlay": str(root / "overlays" / "registry-e2e.yml"),
    }
    write_text(root / "evidence" / "registry-e2e.json", json.dumps(preflight, ensure_ascii=False, indent=2))
    print(json.dumps(preflight, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
