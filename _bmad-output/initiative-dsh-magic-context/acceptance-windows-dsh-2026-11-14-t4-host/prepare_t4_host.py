"""Prepare an isolated DSH profile for the `/ctx-flush` host gate.

No daily profile, session store, or plugin database is touched. The profile is
copied from the completed T3 root, its plugin is replaced with the locally
packed T4 build, and the command driver is a test-only file plugin.
"""

from __future__ import annotations

import hashlib
import json
import os
from pathlib import Path
import secrets
import shutil
import subprocess
import tarfile
import time

REPORT_DIR = Path(__file__).resolve().parent
REPO = Path(r"C:\Users\elvis\Documents\dev\plugin\dsh-plugin-magic-context")
T3_ROOT = Path(r"C:\Users\elvis\AppData\Local\Temp\opencode\dsh-mc-t3-20261114-161041")
PACK = Path(r"C:\Users\elvis\AppData\Local\Temp\opencode\t4-host-pack\dsh-plugin-magic-context-0.11.2.tgz")
NODE_EXE = Path(r"C:\Users\elvis\AppData\Local\Author Software\nvm\installs\v24.21.0\node.exe")
DSH_BIN = Path(
    r"C:\Users\elvis\AppData\Local\Temp\opencode\mc-t0-2026-11-13"
    r"\tools\dsh\node_modules\@deepseek-ai\dsh\lib\bin.js"
)
DSH_CMD = [str(NODE_EXE), str(DSH_BIN)]
POINTER = REPORT_DIR / "experiment-root.json"


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1 << 20), b""):
            digest.update(chunk)
    return digest.hexdigest()


def sha256_text(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


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
    env["PATH"] = str(Path(r"C:\Users\elvis\AppData\Local\Temp\opencode\mc-t0-2026-11-13\tools\bin")) + os.pathsep + env.get("PATH", "")
    env["CI"] = "1"
    env["DSH_TELEMETRY_MODE"] = "DISABLED"
    env["npm_config_store_dir"] = str(root / "pnpm-store")
    env["npm_config_cache"] = str(root / "npm-cache")
    return env


def rewrite_old_root(text: str, root: Path) -> str:
    for old in (T3_ROOT,):
        text = text.replace(str(old), str(root))
        text = text.replace(old.as_posix(), root.as_posix())
    if str(T3_ROOT) in text or T3_ROOT.as_posix() in text:
        raise SystemExit("overlay still references the T3 root")
    return text


def git(*args: str) -> str:
    result = subprocess.run(
        ["git", *args], cwd=REPO, capture_output=True, text=True,
        encoding="utf-8", errors="replace", timeout=60,
    )
    if result.returncode != 0:
        raise SystemExit(f"git {' '.join(args)} failed: {result.stderr}")
    return result.stdout


def overlay(root: Path, plugin: Path, driver: bool) -> None:
    data_dir = str(root / "plugin-data").replace("\\", "/")
    observer = str(root / "observer.mjs").replace("\\", "/")
    entries = [
        {
            "id": "magic-context-dsh",
            "name": "dsh-plugin-magic-context",
            "config": {
                "dataDir": data_dir,
                "registerCompactionEngine": False,
                "historianEnabled": False,
                "policy": {
                    "executeThreshold": 100,
                    "ttlMs": 999999999,
                },
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
        {
            "id": "session-title-llm",
            "name": "@deepseek-ai/dsh-session-title-first-prompt-llm",
            "disabled": True,
        },
        {
            "insert": [
                {
                    "id": "acceptance-observer",
                    "name": f"file:///{observer}",
                    "config": {"outDir": str(root / "evidence" / "session-observer").replace("\\", "/")},
                }
            ]
        },
    ]
    if driver:
        entries.append({
            "insert": [
                {
                    "id": "acceptance-flush-driver",
                    "name": f"file:///{str(plugin).replace('\\', '/')}",
                }
            ]
        })
    (root / "overlays" / ("flush.yml" if driver else "seed.yml")).write_text(
        json.dumps(entries, indent=2), encoding="utf-8",
    )


def main() -> None:
    if POINTER.exists():
        raise SystemExit("T4 experiment already prepared; refusing to overwrite its pointer.")
    if not PACK.exists():
        raise SystemExit(f"missing T4 tarball: {PACK}")
    stamp = time.strftime("%Y%m%d-%H%M%S")
    root = Path(r"C:\Users\elvis\AppData\Local\Temp\opencode") / f"dsh-mc-t4-{stamp}"
    for directory in ["workspace", "evidence", "downloads", "plugin", "overlays", "plugin-data"]:
        (root / directory).mkdir(parents=True)

    shutil.copytree(T3_ROOT / "dsh-home" / "profiles" / "headless", root / "dsh-home" / "profiles" / "headless")
    plugin_target = root / "dsh-home" / "profiles" / "headless" / "node_modules" / "dsh-plugin-magic-context"
    shutil.rmtree(plugin_target)
    with tarfile.open(PACK, "r:gz") as package:
        package.extractall(root / "plugin", filter="data")
    shutil.move(str(root / "plugin" / "package"), str(plugin_target))

    shutil.copyfile(T3_ROOT / "observer.mjs", root / "observer.mjs")
    shutil.copyfile(REPORT_DIR / "driver-flush.mjs", root / "driver-flush.mjs")
    overlay(root, root / "driver-flush.mjs", driver=False)
    overlay(root, root / "driver-flush.mjs", driver=True)

    template = (T3_ROOT / "workspace" / "fixture-original.txt")
    if not template.exists():
        template = (T3_ROOT / "workspace" / "fixture.txt")
    text = template.read_text(encoding="utf-8")
    nonce = secrets.token_hex(16)
    updated, count = __import__("re").subn(r"nonce=[0-9a-f]{32}", f"nonce={nonce}", text)
    if count != 1:
        raise SystemExit("fixture nonce pattern not found exactly once")
    (root / "workspace" / "fixture.txt").write_text(updated, encoding="utf-8")

    checks = {}
    for area, name in [
        ("dsh", "flush-command.js"),
        ("dsh", "drop-landing.js"),
        ("core", "stores.js"),
        ("dsh", "pre-step.js"),
    ]:
        built = REPO / "lib" / area / name
        installed = plugin_target / "lib" / area / name
        checks[f"{area}/{name}"] = {
            "built": sha256(built),
            "installed": sha256(installed),
        }
    if any(value["built"] != value["installed"] for value in checks.values()):
        raise SystemExit("installed plugin lib does not match the local build")
    flush_text = (plugin_target / "lib" / "dsh" / "flush-command.js").read_text(encoding="utf-8")
    landing_text = (plugin_target / "lib" / "dsh" / "drop-landing.js").read_text(encoding="utf-8")
    preflight = {
        "root": str(root),
        "nonce": nonce,
        "fixture_sha256": sha256(root / "workspace" / "fixture.txt"),
        "plugin_package": json.loads((plugin_target / "package.json").read_text(encoding="utf-8"))["version"],
        "tarball_sha256": sha256(PACK),
        "hashes": checks,
        "flush_command_has_name": "ctx-flush" in flush_text,
        "drop_landing_has_helper": "landPendingDrops" in landing_text,
        "git_head": git("rev-parse", "HEAD").strip(),
        "git_status_sha256": sha256_text(git("status", "--porcelain")),
        "git_diff_sha256": sha256_text(git("diff", "--binary")),
        "deepseek_key_present": bool(os.environ.get("DEEPSEEK_API_KEY")),
    }
    if not preflight["flush_command_has_name"] or not preflight["drop_landing_has_helper"]:
        raise SystemExit("installed lib lacks the flush command/helper surface")
    (root / "evidence" / "preflight.json").write_text(json.dumps(preflight, indent=2), encoding="utf-8")
    POINTER.write_text(json.dumps({"root": str(root)}, indent=2), encoding="utf-8")
    print(json.dumps(preflight, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
