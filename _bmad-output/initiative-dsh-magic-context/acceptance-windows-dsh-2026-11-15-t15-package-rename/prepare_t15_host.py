"""Isolated 0.12.3 -> 0.13.0 package-rename gate.

Creates a fresh DSH_HOME/HOME, installs the published 0.12.3 package, writes a
real profile patch row with a custom dataDir and a non-default threshold,
replaces the package with the local 0.13.0 tarball, runs the migration helper,
and asserts the effective config and data directory survive. Also migrates a
home patch and an overlay fixture, and checks the installer text.

No daily profile, credential, model call or registry publish is involved.
"""

from __future__ import annotations

import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import tarfile
import time

REPORT_DIR = Path(__file__).resolve().parent
REPO = Path(r"C:\Users\elvis\Documents\dev\plugin\dsh-plugin-magic-context")
PACK = Path(os.environ.get("T15_PACK", r"C:\Users\elvis\AppData\Local\Temp\opencode\t15-pack-gate\elvisw-dsh-magic-context-0.13.0.tgz"))
NODE_EXE = Path(r"C:\Users\elvis\AppData\Local\Author Software\nvm\installs\v24.21.0\node.exe")
DSH_BIN = Path(
    r"C:\Users\elvis\AppData\Local\Temp\opencode\mc-t0-2026-11-13"
    r"\tools\dsh\node_modules\@deepseek-ai\dsh\lib\bin.js"
)
DSH_CMD = [str(NODE_EXE), str(DSH_BIN)]
OLD_PKG = "@elvisw/dsh-plugin-magic-context"
NEW_PKG = "@elvisw/dsh-magic-context"
OLD_VERSION = "0.12.3"
TARGET_ID = "magic-context-dsh"
HELPER = REPO / "tools" / "migrate-profile-package-name.mjs"


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


def run(label: str, args: list[str], root: Path, timeout: int = 420) -> dict:
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


def dsh(label: str, args: list[str], root: Path, timeout: int = 420) -> dict:
    return run(label, [*DSH_CMD, *args], root, timeout)


def helper(label: str, patch: Path, root: Path) -> dict:
    return run(label, [str(NODE_EXE), str(HELPER), "--patch", str(patch)], root, timeout=120)


def profile_patch(root: Path) -> Path:
    return root / "dsh-home" / "profiles" / "web" / "cordis.patch.yml"


def write_profile_patch(root: Path, name: str, data_dir: Path) -> None:
    path = profile_patch(root)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(
        "- id: " + TARGET_ID + "\n"
        "  name: '" + name + "'\n"
        "  config:\n"
        "    dataDir: " + json.dumps(str(data_dir)) + "\n"
        "    historianEnabled: false\n"
        "    policy:\n"
        "      executeThreshold: 42\n",
        encoding="utf-8",
    )


def search_remove_specifier(command: str) -> str | None:
    match = re.search(r"\bremove\s+(\S+)", command)
    return None if match is None else match.group(1)


def main() -> None:
    daily_paths = [
        Path(r"C:\Users\elvis\.dsh"),
        Path(r"C:\Users\elvis\.local\share\cortexkit\magic-context-dsh-poc"),
    ]

    def daily_mtimes() -> dict[str, int | None]:
        result: dict[str, int | None] = {}
        for path in daily_paths:
            try:
                result[str(path)] = path.stat().st_mtime_ns
            except OSError:
                result[str(path)] = None
        return result

    daily_before = daily_mtimes()
    stamp = time.strftime("%Y%m%d-%H%M%S")
    root = Path(r"C:\Users\elvis\AppData\Local\Temp\opencode") / f"dsh-mc-t15-{stamp}"
    for directory in ["workspace", "evidence", "plugin-data", "plugin-data-custom", "overlays"]:
        (root / directory).mkdir(parents=True, exist_ok=True)
    if not PACK.exists():
        raise SystemExit(f"missing tarball: {PACK}")
    if not HELPER.exists():
        raise SystemExit(f"missing helper: {HELPER}")

    bootstrap = dsh("bootstrap-profile", ["--profile", "web", "--dump-config"], root)
    old_add = dsh("add-old", ["plugin", "--profile", "web", "add", f"{OLD_PKG}@{OLD_VERSION}", "--ignore-scripts"], root, timeout=600)
    write_profile_patch(root, OLD_PKG, root / "plugin-data-custom")
    old_dump = dsh("dump-old", ["--profile", "web", "--dump-config"], root)

    remove_old = dsh("remove-old", ["plugin", "--profile", "web", "remove", OLD_PKG], root, timeout=300)
    new_add = dsh("add-new", ["plugin", "--profile", "web", "add", str(PACK), "--ignore-scripts"], root, timeout=600)
    before = profile_patch(root).read_text(encoding="utf-8")
    migrate = helper("migrate-profile", profile_patch(root), root)
    after = profile_patch(root).read_text(encoding="utf-8")
    new_dump = dsh("dump-new", ["--profile", "web", "--dump-config"], root)
    second = helper("migrate-profile-second", profile_patch(root), root)

    home = root / "dsh-home" / "cordis.patch.yml"
    home.write_text(
        "- id: " + TARGET_ID + "\n"
        "  name: '" + OLD_PKG + "'\n"
        "  config:\n"
        "    historianEnabled: false\n",
        encoding="utf-8",
    )
    home_migrate = helper("migrate-home", home, root)
    home_after = home.read_text(encoding="utf-8")
    home_dump = dsh("dump-home", ["--profile", "web", "--patch", str(home), "--dump-config"], root)

    overlay = root / "overlays" / "t15-overlay.yml"
    overlay.write_text(
        "- id: " + TARGET_ID + "\n"
        "  name: '" + OLD_PKG + "'\n"
        "  config:\n"
        "    dataDir: " + json.dumps(str(root / "plugin-data")) + "\n",
        encoding="utf-8",
    )
    overlay_migrate = helper("migrate-overlay", overlay, root)
    overlay_after = overlay.read_text(encoding="utf-8")
    overlay_dump = dsh("dump-overlay", ["--profile", "web", "--patch", str(overlay), "--dump-config"], root)

    installer = (REPO / "tools" / "install-magic-context.bat").read_text(encoding="utf-8", errors="replace")
    installer_removal_commands = [
        line.strip()
        for line in installer.splitlines()
        if "plugin --profile" in line and " remove " in line
    ]
    installer_removal_specifiers = []
    for line in installer_removal_commands:
        match = search_remove_specifier(line)
        if match is not None:
            installer_removal_specifiers.append(match.replace("%PKG%", NEW_PKG))
    installer_removes_upstream = NEW_PKG in installer_removal_specifiers and "dsh-plugin-magic-context" in installer_removal_specifiers
    installer_removes_old_fork = OLD_PKG in installer_removal_specifiers
    installer_removal_set = set(installer_removal_specifiers)
    fresh_root = Path(r"C:\Users\elvis\AppData\Local\Temp\opencode") / f"dsh-mc-t15-fresh-{stamp}"
    for directory in ["workspace", "evidence", "plugin-data"]:
        (fresh_root / directory).mkdir(parents=True, exist_ok=True)
    fresh_dump = dsh("fresh-dump", ["--profile", "web", "--dump-config"], fresh_root)
    fresh_add = dsh("fresh-add", ["plugin", "--profile", "web", "add", str(PACK), "--ignore-scripts"], fresh_root, timeout=600)
    fresh_after = dsh("fresh-dump-after", ["--profile", "web", "--dump-config"], fresh_root)
    conflict_add = dsh(
        "conflict-add-old",
        ["plugin", "--profile", "web", "add", f"{OLD_PKG}@{OLD_VERSION}", "--ignore-scripts"],
        fresh_root,
        timeout=600,
    )
    conflict_dump = dsh("conflict-dump", ["--profile", "web", "--dump-config"], fresh_root)

    with tarfile.open(PACK, "r:gz") as archive:
        tarball_files = sum(1 for member in archive.getmembers() if member.isfile())

    state = {
        "root": str(root),
        "fresh_root": str(fresh_root),
        "tarball": str(PACK),
        "tarball_sha256": sha256(PACK),
        "tarball_bytes": PACK.stat().st_size,
        "tarball_files": tarball_files,
        "helper_sha256": sha256(HELPER),
        "bootstrap_exit_code": bootstrap["exit_code"],
        "old_add_exit_code": old_add["exit_code"],
        "old_dump_exit_code": old_dump["exit_code"],
        "remove_old_exit_code": remove_old["exit_code"],
        "new_add_exit_code": new_add["exit_code"],
        "new_dump_exit_code": new_dump["exit_code"],
        "fresh_dump_exit_code": fresh_dump["exit_code"],
        "fresh_add_exit_code": fresh_add["exit_code"],
        "fresh_dump_after_exit_code": fresh_after["exit_code"],
        "conflict_add_exit_code": conflict_add["exit_code"],
        "conflict_dump_exit_code": conflict_dump["exit_code"],
        "conflict_dump_has_old_name": OLD_PKG in conflict_dump["stdout"],
        "conflict_dump_has_new_name": NEW_PKG in conflict_dump["stdout"],
        "before_has_old_name": OLD_PKG in before,
        "after_has_new_name": NEW_PKG in after,
        "profile_migrate_exit": migrate["exit_code"],
        "profile_migrate_second_exit": second["exit_code"],
        "profile_second_stdout": second["stdout"],
        "home_migrate_exit": home_migrate["exit_code"],
        "home_after_has_new_name": NEW_PKG in home_after,
        "home_dump_has_new_name": NEW_PKG in home_dump["stdout"],
        "overlay_migrate_exit": overlay_migrate["exit_code"],
        "overlay_after_has_new_name": NEW_PKG in overlay_after,
        "overlay_dump_has_new_name": NEW_PKG in overlay_dump["stdout"],
        "new_dump_has_new_name": NEW_PKG in new_dump["stdout"],
        "new_dump_has_old_name": OLD_PKG in new_dump["stdout"],
        "new_dump_has_custom_data_dir": str(root / "plugin-data-custom") in new_dump["stdout"],
        "new_dump_has_execute_threshold": "executeThreshold: 42" in new_dump["stdout"] or '"executeThreshold": 42' in new_dump["stdout"],
        "fresh_dump_has_new_name": NEW_PKG in fresh_after["stdout"],
        "fresh_dump_has_old_name": OLD_PKG in fresh_after["stdout"],
        "installer_has_helper": "migrate-profile-package-name.mjs" in installer,
        "installer_has_old_specifier_removal": installer_removal_set == {NEW_PKG, OLD_PKG, "dsh-plugin-magic-context"},
        "installer_removal_commands": installer_removal_commands,
        "installer_removal_specifiers": installer_removal_specifiers,
        "installer_removal_count": len(installer_removal_specifiers),
        "installer_has_profile_prompt": "ACTION REQUIRED" in installer,
        "daily_profile_mtime_before": daily_before,
        "daily_profile_mtime_after": daily_mtimes(),
        "daily_profile_touched": daily_before != daily_mtimes(),
    }
    (REPORT_DIR / "t15-state.json").write_text(json.dumps(state, indent=2), encoding="utf-8")
    (REPORT_DIR / "experiment-root.json").write_text(
        json.dumps(
            {
                "root": str(root),
                "fresh_root": str(fresh_root),
                "tarball_bytes": PACK.stat().st_size,
                "tarball_files": tarball_files,
            },
            indent=2,
        ),
        encoding="utf-8",
    )
    print(json.dumps(state, indent=2))
    if any(
        value
        for value in [
            state["old_add_exit_code"],
            state["old_dump_exit_code"],
            state["remove_old_exit_code"],
            state["new_add_exit_code"],
            state["new_dump_exit_code"],
            state["profile_migrate_exit"],
            state["profile_migrate_second_exit"],
            state["home_migrate_exit"],
            state["overlay_migrate_exit"],
            state["fresh_add_exit_code"],
            state["fresh_dump_after_exit_code"],
        ]
    ):
        raise SystemExit("one or more host commands failed")
    if not all(
        [
            state["before_has_old_name"],
            state["after_has_new_name"],
            state["home_after_has_new_name"],
            state["home_dump_has_new_name"],
            state["overlay_after_has_new_name"],
            state["overlay_dump_has_new_name"],
            state["new_dump_has_new_name"],
            not state["new_dump_has_old_name"],
            state["new_dump_has_custom_data_dir"],
            state["new_dump_has_execute_threshold"],
            state["fresh_dump_has_new_name"],
            not state["fresh_dump_has_old_name"],
            state["installer_has_helper"],
            state["installer_has_old_specifier_removal"],
            state["installer_removal_count"] == 3,
            state["installer_has_profile_prompt"],
            state["conflict_add_exit_code"] == 0,
            state["conflict_dump_has_old_name"] and state["conflict_dump_has_new_name"],
            state["daily_profile_touched"] is False,
        ]
    ):
        raise SystemExit("one or more assertions failed")


if __name__ == "__main__":
    main()
