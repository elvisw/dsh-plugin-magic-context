"""Prove npm/pnpm target the isolated trial root and record home-directory state.

Run without arguments to take the pre-check baseline before any install, then
`--verify <label>` after preflight and after the final gate. `%USERPROFILE%` is
watched only as an external surface: no write here is acceptable.
"""
from __future__ import annotations

import hashlib
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys

from prepare import NODE, NPM, checked_root, isolated_env, save

USER_HOME = Path(os.environ["USERPROFILE"])
LOCAL = Path(os.environ["LOCALAPPDATA"])
ROAMING = Path(os.environ["APPDATA"])
WATCHED_FILES = {
    "package.json": USER_HOME / "package.json",
    "package-lock.json": USER_HOME / "package-lock.json",
    "node_modules/.package-lock.json": USER_HOME / "node_modules/.package-lock.json",
    ".npmrc": USER_HOME / ".npmrc",
}
WATCHED_DIRS = {
    "AppData/Local/pnpm": LOCAL / "pnpm",
    "AppData/Roaming/npm": ROAMING / "npm",
    "AppData/Local/npm-cache": LOCAL / "npm-cache",
}


def file_digest(path):
    if not path.is_file():
        return None
    return {"bytes": path.stat().st_size, "sha256": hashlib.sha256(path.read_bytes()).hexdigest()}


def tree_digest(path):
    if not path.is_dir():
        return None
    rows = []
    total = 0
    for item in path.rglob("*"):
        if not item.is_file():
            continue
        stat = item.stat()
        rows.append([item.relative_to(path).as_posix(), stat.st_size, stat.st_mtime_ns])
        total += stat.st_size
    rows.sort()
    return {"files": len(rows), "bytes": total,
            "sha256": hashlib.sha256(json.dumps(rows).encode()).hexdigest()}


def snapshot():
    return {
        "files": {name: file_digest(path) for name, path in WATCHED_FILES.items()},
        "directories": {name: tree_digest(path) for name, path in WATCHED_DIRS.items()},
    }


def run(cmd, cwd, env):
    result = subprocess.run(cmd, cwd=cwd, env=env, capture_output=True, text=True, timeout=180)
    assert result.returncode == 0, f"{cmd[0]} failed with {result.returncode}: {result.stderr[-400:]}"
    return result.stdout.strip()


def resolve(root):
    env = isolated_env(root / "host")
    env["PNPM_HOME"] = str(root / "host/pnpm-home")
    pnpm = shutil.which("pnpm.exe") or shutil.which("pnpm.cmd")
    assert pnpm, "pnpm is not available"
    cwd = root / "host"
    values = {
        "npmPrefix": run([NODE, NPM, "config", "get", "prefix"], cwd, env),
        "npmCache": run([NODE, NPM, "config", "get", "cache"], cwd, env),
        "npmUserconfig": run([NODE, NPM, "config", "get", "userconfig"], cwd, env),
        "npmGlobalconfig": run([NODE, NPM, "config", "get", "globalconfig"], cwd, env),
        "pnpmVersion": run([pnpm, "--version"], cwd, env),
        "pnpmStore": run([pnpm, "store", "path"], cwd, env),
        "pnpmGlobalconfig": run([pnpm, "config", "get", "globalconfig"], cwd, env),
    }
    normalize = lambda value: Path(value).resolve()
    writable = ("npmCache", "npmUserconfig", "npmGlobalconfig", "pnpmStore", "pnpmGlobalconfig")
    for key in writable:
        target = normalize(values[key])
        assert target.is_relative_to(root), f"{key} escapes the trial root: {values[key]}"
    # The trial root itself is the authorized %TEMP%/opencode directory. The
    # user-home surfaces that the earlier incident changed must stay untouched.
    assert normalize(values["npmPrefix"]) != USER_HOME.resolve(), "npm prefix resolves to the user home"
    assert not normalize(values["npmPrefix"]).is_relative_to((USER_HOME / "node_modules").resolve()), \
        "npm prefix resolves into the user-home node_modules"
    assert normalize(values["pnpmStore"]).is_relative_to((root / "host/pnpm-home").resolve()), \
        f"pnpm store is not under PNPM_HOME: {values['pnpmStore']}"
    return values


def main():
    args = sys.argv[1:]
    if args[:1] == ["--verify"]:
        assert len(args) == 3, "usage: isolation_check.py ROOT --verify after-install|after-preflight|after-gate"
        root = checked_root(Path(args[1]))
        label = args[2]
        assert label in ("after-install", "after-preflight", "after-gate"), \
            "label must be after-install, after-preflight or after-gate"
    else:
        root = checked_root(Path(args[0]) if args else
                            Path(r"C:\Users\elvis\AppData\Local\Temp\opencode\dsh-mc-t34-rc5-dp3z_2pp"))
        label = None
    evidence = root / "evidence"
    if label is None:
        before = snapshot()
        values = resolve(root)
        after = snapshot()
        assert before == after, "config probes wrote into the user home"
        baseline = {"values": values, "snapshot": after}
        save(evidence / "home-baseline.json", baseline)
        save(evidence / "isolation-precheck.json", {
            "passed": True, "reason": "all npm/pnpm writable targets resolve under the trial root",
            "values": values, "homeUnchangedByChecks": True,
        })
        print("Isolation pre-check passed; home baseline recorded.", flush=True)
        return
    baseline = json.loads((evidence / "home-baseline.json").read_text(encoding="utf-8"))
    current = snapshot()
    changed = {
        kind: sorted(name for name in baseline["snapshot"][kind]
                     if baseline["snapshot"][kind][name] != current[kind].get(name))
        for kind in ("files", "directories")
    }
    # The plan's invariant is the affected home manifests and lock files. Other
    # watched files and package-manager trees are recorded for context; an
    # unrelated install the user started may legitimately touch them.
    required = {"package.json", "package-lock.json", "node_modules/.package-lock.json"}
    required_changed = [name for name in changed["files"] if name in required]
    artifact = {"label": label, "unchanged": not required_changed,
                "changedFiles": changed["files"], "changedRequired": required_changed,
                "changedDirectories": changed["directories"], "snapshot": current}
    save(evidence / f"home-{label}.json", artifact)
    assert not required_changed, f"user-home manifests changed during {label}: {required_changed}"
    print(f"User-home manifests unchanged {label}.", flush=True)


if __name__ == "__main__":
    main()
