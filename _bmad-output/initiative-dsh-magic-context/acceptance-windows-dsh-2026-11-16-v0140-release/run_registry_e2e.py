"""Registry-install smoke for @elvisw/dsh-magic-context@0.14.0.

Installs the published artifact by specifier into a fresh isolated headless
profile, asserts the scoped package/row id/config, and runs one real-model
request. This is a release artifact check; the package-rename host gate is
separate.
"""

from __future__ import annotations

import hashlib
import json
import os
from pathlib import Path
import subprocess
import time

REPORT_DIR = Path(__file__).resolve().parent
TOOLS_BIN = Path(r"C:\Users\elvis\AppData\Local\Temp\opencode\mc-t0-2026-11-13\tools\bin")
NODE_EXE = Path(r"C:\Users\elvis\AppData\Local\Author Software\nvm\installs\v24.21.0\node.exe")
DSH_BIN = Path(
    r"C:\Users\elvis\AppData\Local\Temp\opencode\mc-t0-2026-11-13"
    r"\tools\dsh\node_modules\@deepseek-ai\dsh\lib\bin.js"
)
DSH_CMD = [str(NODE_EXE), str(DSH_BIN)]
PACKAGE = "@elvisw/dsh-magic-context"
SPEC = f"{PACKAGE}@0.14.0"
ROW_ID = "magic-context-dsh"


def isolated_env(root: Path) -> dict[str, str]:
    env = dict(os.environ)
    paths = {
        "DSH_HOME": root / "dsh-home",
        "HOME": root / "user-home",
        "USERPROFILE": root / "user-home",
        "XDG_DATA_HOME": root / "xdg-data",
        "XDG_CACHE_HOME": root / "xdg-cache",
        "APPDATA": root / "appdata",
        "LOCALAPPDATA": root / "localappdata",
    }
    for path in paths.values():
        path.mkdir(parents=True, exist_ok=True)
    for name, path in paths.items():
        env[name] = str(path)
    env["PATH"] = str(TOOLS_BIN) + os.pathsep + env.get("PATH", "")
    env["CI"] = "1"
    env["DSH_TELEMETRY_MODE"] = "DISABLED"
    env["npm_config_store_dir"] = str(root / "pnpm-store")
    env["npm_config_cache"] = str(root / "npm-cache")
    return env


def run(label: str, args: list[str], root: Path, timeout: int = 900) -> dict:
    result = subprocess.run(
        args,
        cwd=root / "workspace",
        env=isolated_env(root),
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="replace",
        timeout=timeout,
    )
    text = result.stdout + "\n--- stderr ---\n" + result.stderr
    (root / "evidence" / f"{label}.txt").write_text(text, encoding="utf-8")
    return {"args": args, "exit_code": result.returncode, "stdout": result.stdout, "stderr": result.stderr}


def dsh(label: str, args: list[str], root: Path, timeout: int = 900) -> dict:
    return run(label, [*DSH_CMD, *args], root, timeout)


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1 << 20), b""):
            digest.update(chunk)
    return digest.hexdigest()


def main() -> None:
    root = TOOLS_BIN.parent / f"dsh-mc-v0140-release-{time.strftime('%Y%m%d-%H%M%S')}"
    if root.exists():
        raise SystemExit(f"root exists: {root}")
    for directory in ("workspace", "evidence", "overlays", "plugin-data"):
        (root / directory).mkdir(parents=True)

    overlay = [
        {
            "id": ROW_ID,
            "name": PACKAGE,
            "config": {
                "dataDir": str(root / "plugin-data").replace("\\", "/"),
                "registerCompactionEngine": False,
                "historianEnabled": False,
                "policy": {"executeThreshold": 100, "ttlMs": 999999999},
                "maintenance": {"enabled": False},
                "memory": {
                    "embedBackfill": False,
                    "vectorBackfill": False,
                    "global": {
                        "machine": {"enabled": False},
                        "user": {"render": False, "collect": False, "review": False},
                    },
                },
            },
        },
        {"id": "session-title-llm", "name": "@deepseek-ai/dsh-session-title-first-prompt-llm", "disabled": True},
    ]
    (root / "overlays" / "registry-e2e.yml").write_text(json.dumps(overlay, indent=2), encoding="utf-8")

    bootstrap = dsh("bootstrap", ["--profile", "headless", "--dump-config"], root)
    if bootstrap["exit_code"] != 0:
        raise SystemExit(f"profile bootstrap failed: {bootstrap['stderr']}")

    add = dsh(
        "add-registry",
        ["plugin", "--profile", "headless", "add", SPEC, "--ignore-scripts"],
        root,
    )
    if add["exit_code"] != 0:
        raise SystemExit(f"registry install failed: {add['stderr']}")

    installed = root / "dsh-home" / "profiles" / "headless" / "node_modules" / "@elvisw" / "dsh-magic-context"
    installed_pkg = installed / "package.json"
    if not installed_pkg.exists():
        raise SystemExit(f"installed package missing: {installed_pkg}")
    installed_data = json.loads(installed_pkg.read_text(encoding="utf-8"))
    if installed_data.get("name") != PACKAGE or installed_data.get("version") != "0.14.0":
        raise SystemExit(f"installed identity mismatch: {installed_data.get('name')}@{installed_data.get('version')}")

    dump = dsh(
        "dump-config",
        ["--profile", "headless", "--patch", str(root / "overlays" / "registry-e2e.yml"), "--dump-config"],
        root,
    )
    if dump["exit_code"] != 0:
        raise SystemExit(f"dump-config failed: {dump['stderr']}")
    if PACKAGE not in dump["stdout"] or ROW_ID not in dump["stdout"]:
        raise SystemExit("dump-config does not show the scoped plugin and row id")

    smoke = dsh(
        "smoke",
        [
            "--profile", "headless",
            "--patch", str(root / "overlays" / "registry-e2e.yml"),
            "--json",
            "--permission-mode", "read-only",
            "--approval-policy", "never",
            "Reply exactly V0140_REGISTRY_OK. Do not call any tool.",
        ],
        root,
        600,
    )
    if smoke["exit_code"] != 0:
        raise SystemExit(f"model smoke failed: {smoke['stderr']}")
    if "V0140_REGISTRY_OK" not in smoke["stdout"]:
        raise SystemExit("model smoke did not return V0140_REGISTRY_OK")

    preflight = {
        "root": str(root),
        "specifier": SPEC,
        "installedName": installed_data.get("name"),
        "installedVersion": installed_data.get("version"),
        "installedPackage": str(installed_pkg),
        "installedHelperSha256": sha256(installed / "tools" / "migrate-profile-package-name.mjs"),
        "installedIndexSha256": sha256(installed / "lib" / "index.js"),
        "dumpConfigMentionsPackage": True,
        "dumpConfigMentionsRowId": True,
        "modelSmoke": "V0140_REGISTRY_OK",
        "overlay": str(root / "overlays" / "registry-e2e.yml"),
    }
    (root / "evidence" / "registry-e2e.json").write_text(
        json.dumps(preflight, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    print(json.dumps(preflight, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
