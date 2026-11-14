"""Prepare an isolated DSH profile that installs the published registry package."""

from __future__ import annotations

import json
import os
from pathlib import Path
import subprocess
import time

from prepare_package_host import DSH_CMD, REPORT_DIR, isolated_env

SPEC = "@elvisw/dsh-plugin-magic-context@0.12.0"
NEW_PKG = "@elvisw/dsh-plugin-magic-context"


def main() -> None:
    stamp = time.strftime("%Y%m%d-%H%M%S")
    root = Path(r"C:\Users\elvis\AppData\Local\Temp\opencode") / f"dsh-mc-pkgreg-{stamp}"
    for directory in ["workspace", "evidence", "plugin-data", "overlays"]:
        (root / directory).mkdir(parents=True)

    def run(label: str, args: list[str], timeout: int = 360) -> dict:
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

    bootstrap = run("bootstrap-profile", ["--profile", "headless", "--dump-config"])
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

    add = run("add-registry", ["plugin", "--profile", "headless", "add", SPEC, "--ignore-scripts"])
    dump = run("dump-config", ["--profile", "headless", "--patch", str(root / "overlays" / "base-control.yml"), "--dump-config"])

    profile = json.loads((root / "dsh-home" / "profiles" / "headless" / "package.json").read_text(encoding="utf-8"))
    installed = root / "dsh-home" / "profiles" / "headless" / "node_modules" / "@elvisw" / "dsh-plugin-magic-context"
    installed_meta = json.loads((installed / "package.json").read_text(encoding="utf-8")) if installed.exists() else {}
    preflight = {
        "root": str(root),
        "spec": SPEC,
        "bootstrap_exit_code": bootstrap["exit_code"],
        "add_exit_code": add["exit_code"],
        "dump_exit_code": dump["exit_code"],
        "profile_dependencies": profile.get("dependencies"),
        "profile_bundles": profile.get("dsh", {}).get("profile", {}).get("bundles"),
        "new_installed": installed.exists(),
        "new_installed_package_name": installed_meta.get("name"),
        "new_installed_version": installed_meta.get("version"),
        "dump_has_new_name": NEW_PKG in dump["stdout"],
        "deepseek_key_present": bool(os.environ.get("DEEPSEEK_API_KEY")),
    }
    (root / "evidence" / "preflight.json").write_text(json.dumps(preflight, indent=2), encoding="utf-8")
    (REPORT_DIR / "registry-experiment-root.json").write_text(json.dumps({"root": str(root)}, indent=2), encoding="utf-8")
    print(json.dumps(preflight, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
