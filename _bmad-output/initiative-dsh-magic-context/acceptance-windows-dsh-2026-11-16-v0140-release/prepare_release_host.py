"""Prepare one fresh isolated DSH Web profile for the 0.14.0 release smoke.

Installs the candidate tarball into a fresh profile, writes an isolated dataDir
and a DeepSeek adapter overlay, and records the dump-config assertions. No daily
profile, credential or model call is touched.
"""

from __future__ import annotations

import hashlib
import json
import os
from pathlib import Path
import subprocess
import tarfile
import time

REPORT_DIR = Path(__file__).resolve().parent
EVIDENCE = REPORT_DIR / "evidence"
PACK = Path(os.environ.get("V0140_PACK", r"C:\Users\elvis\AppData\Local\Temp\opencode\v0140-pack\elvisw-dsh-magic-context-0.14.0.tgz"))
NODE_EXE = Path(r"C:\Users\elvis\AppData\Local\Author Software\nvm\installs\v24.21.0\node.exe")
DSH_BIN = Path(
    r"C:\Users\elvis\AppData\Local\Temp\opencode\mc-t0-2026-11-13"
    r"\tools\dsh\node_modules\@deepseek-ai\dsh\lib\bin.js"
)
DSH_CMD = [str(NODE_EXE), str(DSH_BIN)]
TOOLS_BIN = Path(r"C:\Users\elvis\AppData\Local\Temp\opencode\mc-t0-2026-11-13\tools\bin")
PROFILE = "v0140"
PACKAGE = "@elvisw/dsh-magic-context"
TARGET_ID = "magic-context-dsh"


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
    env["PATH"] = str(TOOLS_BIN) + os.pathsep + env.get("PATH", "")
    env["CI"] = "1"
    env["DSH_TELEMETRY_MODE"] = "DISABLED"
    env["npm_config_store_dir"] = str(root / "pnpm-store")
    env["npm_config_cache"] = str(root / "npm-cache")
    return env


def run(label: str, args: list[str], root: Path, timeout: int = 600) -> dict:
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


def dsh(label: str, args: list[str], root: Path, timeout: int = 600) -> dict:
    return run(label, [*DSH_CMD, *args], root, timeout)


def write_profile_patch(root: Path) -> Path:
    patch = root / "dsh-home" / "profiles" / PROFILE / "cordis.patch.yml"
    patch.parent.mkdir(parents=True, exist_ok=True)
    patch.write_text(
        "# 0.14.0 isolated Web release smoke profile layer.\n"
        "- id: " + TARGET_ID + "\n"
        "  name: '" + PACKAGE + "'\n"
        "  config:\n"
        "    dataDir: " + json.dumps(str(root / "plugin-data").replace("\\", "/")) + "\n"
        "    registerCompactionEngine: false\n"
        "    historianEnabled: true\n"
        "    historian:\n"
        "      provider: deepseek-official\n"
        "      model: deepseek-flash\n"
        "    maintenance:\n"
        "      enabled: false\n"
        "    policy:\n"
        "      executeThreshold: 100\n"
        "      ttlMs: 999999999\n"
        "    memory:\n"
        "      embedBackfill: false\n"
        "      vectorBackfill: false\n"
        "      global:\n"
        "        machine:\n"
        "          enabled: false\n"
        "        user:\n"
        "          render: false\n"
        "          collect: false\n"
        "          review: false\n",
        encoding="utf-8",
    )
    return patch


def write_overlay(root: Path) -> Path:
    overlay = root / "overlays" / "v0140.yml"
    overlay.parent.mkdir(parents=True, exist_ok=True)
    overlay.write_text(
        "# 0.14.0 isolated Web release smoke overlay: only the LLM adapter is overridden.\n"
        "- id: llm-deepseek\n"
        "  name: '@deepseek-ai/dsh-llm-deepseek-api-key'\n"
        "  config:\n"
        "    apiKeyEnv: DEEPSEEK_API_KEY\n"
        "    thinking: enabled\n"
        "    reasoningEffort: high\n",
        encoding="utf-8",
    )
    return overlay


def main() -> None:
    if not PACK.exists():
        raise SystemExit(f"missing tarball: {PACK}")
    if not NODE_EXE.exists() or not DSH_BIN.exists():
        raise SystemExit(f"missing DSH runtime: {NODE_EXE} / {DSH_BIN}")

    stamp = time.strftime("%Y%m%d-%H%M%S")
    root = Path(r"C:\Users\elvis\AppData\Local\Temp\opencode") / f"dsh-mc-v0140-{stamp}"
    for directory in ["workspace", "evidence", "plugin-data", "overlays", "screenshots"]:
        (root / directory).mkdir(parents=True, exist_ok=True)
    EVIDENCE.mkdir(parents=True, exist_ok=True)

    bootstrap = dsh("bootstrap-web-template", [PROFILE, "--from-default-profile", "web", "--dump-config"], root)
    if bootstrap["exit_code"] != 0:
        raise SystemExit(f"profile bootstrap failed: {bootstrap['stderr']}")

    add = dsh("add-local-tarball", ["plugin", "--profile", PROFILE, "add", str(PACK), "--ignore-scripts"], root)
    if add["exit_code"] != 0:
        raise SystemExit(f"local tarball install failed: {add['stderr']}")

    overlay = write_overlay(root)
    profile_patch = write_profile_patch(root)
    dump = dsh("dump-overlay", ["--profile", PROFILE, "--patch", str(overlay), "--dump-config"], root)
    if dump["exit_code"] != 0:
        raise SystemExit(f"overlay dump failed: {dump['stderr']}")

    with tarfile.open(PACK, "r:gz") as archive:
        files = sum(1 for member in archive.getmembers() if member.isfile())

    profile_pkg = json.loads((root / "dsh-home" / "profiles" / PROFILE / "package.json").read_text(encoding="utf-8"))
    spec = profile_pkg.get("dependencies", {}).get(PACKAGE, "")
    checks = {
        "profile_dependency": bool(spec),
        "dump_has_scoped_package": PACKAGE in dump["stdout"],
        "dump_has_loader_row": TARGET_ID in dump["stdout"],
        "dump_has_data_dir": str(root / "plugin-data").replace("\\", "/") in dump["stdout"],
        "dump_has_deepseek_route": "deepseek-official" in dump["stdout"] and "deepseek-flash" in dump["stdout"],
    }
    state = {
        "root": str(root),
        "profile": PROFILE,
        "overlay": str(overlay),
        "profile_patch": str(profile_patch),
        "tarball": str(PACK),
        "tarball_sha256": sha256(PACK),
        "tarball_bytes": PACK.stat().st_size,
        "tarball_files": files,
        "profile_dependency": spec,
        "bootstrap_exit_code": bootstrap["exit_code"],
        "add_exit_code": add["exit_code"],
        "dump_exit_code": dump["exit_code"],
        **checks,
        "deepseek_key_present": bool(os.environ.get("DEEPSEEK_API_KEY")),
    }
    (REPORT_DIR / "host-state.json").write_text(json.dumps(state, indent=2) + "\n", encoding="utf-8")
    (EVIDENCE / "prepare.json").write_text(json.dumps(state, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(state, indent=2))
    if not all(checks.values()):
        raise SystemExit("one or more dump-config checks failed")


if __name__ == "__main__":
    main()
