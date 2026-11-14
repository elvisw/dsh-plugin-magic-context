"""Prepare an isolated DSH profile for the package-identity host check.

The profile is copied from the completed 0.11.2 baseline (model route only),
the old package is removed, and the locally packed scoped tarball is installed
through the real `dsh plugin add` path. No daily profile or data directory is
touched.
"""

from __future__ import annotations

import hashlib
import json
import os
from pathlib import Path
import subprocess
import time

REPORT_DIR = Path(__file__).resolve().parent
REPO = Path(r"C:\Users\elvis\Documents\dev\plugin\dsh-plugin-magic-context")
PACK = Path(r"C:\Users\elvis\AppData\Local\Temp\opencode\pkg-012\elvisw-dsh-plugin-magic-context-0.12.0.tgz")
NODE_EXE = Path(r"C:\Users\elvis\AppData\Local\Author Software\nvm\installs\v24.21.0\node.exe")
DSH_BIN = Path(
    r"C:\Users\elvis\AppData\Local\Temp\opencode\mc-t0-2026-11-13"
    r"\tools\dsh\node_modules\@deepseek-ai\dsh\lib\bin.js"
)
DSH_CMD = [str(NODE_EXE), str(DSH_BIN)]
NEW_PKG = "@elvisw/dsh-plugin-magic-context"


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1 << 20), b""):
            digest.update(chunk)
    return digest.hexdigest()


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
    env["PATH"] = (
        str(Path(r"C:\Users\elvis\AppData\Local\Temp\opencode\mc-t0-2026-11-13\tools\bin"))
        + os.pathsep
        + env.get("PATH", "")
    )
    env["CI"] = "1"
    env["DSH_TELEMETRY_MODE"] = "DISABLED"
    env["npm_config_store_dir"] = str(root / "pnpm-store")
    env["npm_config_cache"] = str(root / "npm-cache")
    return env


def run(label: str, args: list[str], root: Path, timeout: int = 240) -> dict:
    result = subprocess.run(
        [*DSH_CMD, *args],
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


def main() -> None:
    stamp = time.strftime("%Y%m%d-%H%M%S")
    root = Path(r"C:\Users\elvis\AppData\Local\Temp\opencode") / f"dsh-mc-pkg-{stamp}"
    for directory in ["workspace", "evidence", "plugin-data", "overlays"]:
        (root / directory).mkdir(parents=True)

    bootstrap = run("bootstrap-profile", ["--profile", "headless", "--dump-config"], root)

    overlay = [
        {
            "id": "magic-context-dsh",
            "name": NEW_PKG,
            "config": {
                "dataDir": str(root / "plugin-data").replace("\\", "/"),
                "registerCompactionEngine": False,
                "historianEnabled": False,
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
    (root / "overlays" / "base-control.yml").write_text(json.dumps(overlay, indent=2), encoding="utf-8")
    if str(OLD_ROOT) in (root / "overlays" / "base-control.yml").read_text(encoding="utf-8"):
        raise SystemExit("overlay still references the old root")

    add = run("add-new", ["plugin", "--profile", "headless", "add", str(PACK), "--ignore-scripts"], root, timeout=360)
    dump = run("dump-config", ["--profile", "headless", "--patch", str(root / "overlays" / "base-control.yml"), "--dump-config"], root)

    profile = json.loads((root / "dsh-home" / "profiles" / "headless" / "package.json").read_text(encoding="utf-8"))
    installed = root / "dsh-home" / "profiles" / "headless" / "node_modules" / "dsh-plugin-magic-context"
    scoped_installed = root / "dsh-home" / "profiles" / "headless" / "node_modules" / "@elvisw" / "dsh-plugin-magic-context"
    preflight = {
        "root": str(root),
        "tarball_sha256": sha256(PACK),
        "bootstrap_exit_code": bootstrap["exit_code"],
        "add_exit_code": add["exit_code"],
        "dump_exit_code": dump["exit_code"],
        "profile_dependencies": profile.get("dependencies"),
        "profile_bundles": profile.get("dsh", {}).get("profile", {}).get("bundles"),
        "old_installed": installed.exists(),
        "new_installed": scoped_installed.exists(),
        "new_installed_package_name": (
            json.loads((scoped_installed / "package.json").read_text(encoding="utf-8")).get("name")
            if scoped_installed.exists()
            else None
        ),
        "dump_has_new_name": NEW_PKG in dump["stdout"],
        "dump_has_old_name": f'"{OLD_PKG}"' in dump["stdout"],
        "deepseek_key_present": bool(os.environ.get("DEEPSEEK_API_KEY")),
    }
    (root / "evidence" / "preflight.json").write_text(json.dumps(preflight, indent=2), encoding="utf-8")
    (REPORT_DIR / "experiment-root.json").write_text(json.dumps({"root": str(root)}, indent=2), encoding="utf-8")
    print(json.dumps(preflight, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
