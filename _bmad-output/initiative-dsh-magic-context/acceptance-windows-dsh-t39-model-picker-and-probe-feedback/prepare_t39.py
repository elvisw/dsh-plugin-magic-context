"""Prepare one isolated DSH Web profile for the T39 model-picker gate."""

from __future__ import annotations

import argparse
import hashlib
import json
import os
from pathlib import Path
import subprocess
import tarfile
import time

REPORT_DIR = Path(__file__).resolve().parent
PACK = Path(os.environ.get(
    "T39_PACK",
    r"C:\Users\elvis\AppData\Local\Temp\opencode\t39-pack\elvisw-dsh-magic-context-0.18.11.tgz",
))
NODE_EXE = Path(r"C:\Users\elvis\AppData\Local\Author Software\nvm\installs\v24.21.0\node.exe")
DSH_BIN = Path(
    r"C:\Users\elvis\AppData\Local\Temp\opencode\t35-rc5-root2"
    r"\host\node_modules\@deepseek-ai\dsh\lib\bin.js"
)
DSH_CMD = [str(NODE_EXE), str(DSH_BIN)]
PACKAGE = "@elvisw/dsh-magic-context"
TARGET_ID = "magic-context-dsh"
PROFILE = "t39"


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1 << 20), b""):
            digest.update(chunk)
    return digest.hexdigest()


def isolated_env(root: Path) -> dict[str, str]:
    env = dict(os.environ)
    for name, sub in {
        "DSH_HOME": "dsh-home", "HOME": "user-home", "USERPROFILE": "user-home",
        "XDG_CONFIG_HOME": "xdg-config", "XDG_DATA_HOME": "xdg-data", "XDG_CACHE_HOME": "xdg-cache",
        "XDG_STATE_HOME": "xdg-state", "APPDATA": "appdata", "LOCALAPPDATA": "localappdata",
        "TEMP": "tmp", "TMP": "tmp",
    }.items():
        path = root / sub
        path.mkdir(parents=True, exist_ok=True)
        env[name] = str(path)
    env["npm_config_store_dir"] = str(root / "pnpm-store")
    env["npm_config_cache"] = str(root / "npm-cache")
    env["CI"] = "1"
    env["DSH_TELEMETRY_MODE"] = "DISABLED"
    return env


def run(label: str, args: list[str], root: Path, timeout: int = 420) -> dict:
    result = subprocess.run(
        args, cwd=root / "workspace", env=isolated_env(root),
        capture_output=True, text=True, encoding="utf-8", errors="replace", timeout=timeout,
    )
    (root / "evidence" / f"{label}.txt").write_text(
        result.stdout + "\n--- stderr ---\n" + result.stderr, encoding="utf-8", newline="\n")
    return {"exit_code": result.returncode, "stdout": result.stdout, "stderr": result.stderr}


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--fake-port", type=int, required=True)
    args = parser.parse_args()
    if not PACK.exists() or not DSH_BIN.exists():
        raise SystemExit("missing tarball or DSH runtime")

    root = Path(r"C:\Users\elvis\AppData\Local\Temp\opencode") / ("dsh-mc-t39-" + time.strftime("%Y%m%d-%H%M%S"))
    for directory in ["workspace", "evidence", "plugin-data", "screenshots"]:
        (root / directory).mkdir(parents=True, exist_ok=True)

    bootstrap = run("bootstrap", [*DSH_CMD, PROFILE, "--from-default-profile", "web", "--dump-config"], root)
    if bootstrap["exit_code"] != 0:
        raise SystemExit("profile bootstrap failed: " + bootstrap["stderr"])
    add = run("add", [*DSH_CMD, "plugin", "--profile", PROFILE, "add", str(PACK), "--ignore-scripts"], root, 600)
    if add["exit_code"] != 0:
        raise SystemExit("local tarball install failed: " + add["stderr"])

    endpoint = "http://127.0.0.1:" + str(args.fake_port) + "/v1"
    patch = root / "dsh-home" / "profiles" / PROFILE / "cordis.patch.yml"
    patch.parent.mkdir(parents=True, exist_ok=True)
    patch.write_text(
        "# T39 isolated Web gate layer.\n"
        "- id: " + TARGET_ID + "\n"
        "  name: '" + PACKAGE + "'\n"
        "  config:\n"
        "    dataDir: " + json.dumps(str(root / "plugin-data").replace("\\", "/")) + "\n"
        "    registerCompactionEngine: false\n"
        "    historianEnabled: false\n"
        "    maintenance:\n"
        "      enabled: false\n"
        "    policy:\n"
        "      executeThreshold: 100\n"
        "      ttlMs: 999999999\n"
        "    memory:\n"
        "      enabled: true\n"
        "      embedBackfill: false\n"
        "      vectorBackfill: false\n"
        "      global:\n"
        "        machine:\n"
        "          enabled: false\n"
        "        user:\n"
        "          render: false\n"
        "          collect: false\n"
        "          review: false\n"
        "    embedding:\n"
        "      provider: openai-compatible\n"
        "      preset: custom\n"
        "      endpoint: " + json.dumps(endpoint) + "\n"
        "      authHeader: authorization\n"
        "      model: ''\n"
        "      apiKeyEnv: SILICONFLOW_API_KEY\n"
        "      dimensions: 0\n"
        "      timeoutMs: 8000\n"
        "      queryTimeoutMs: 2500\n"
        "      batchSize: 2\n",
        encoding="utf-8", newline="\n")

    with tarfile.open(PACK, "r:gz") as archive:
        files = sum(1 for member in archive.getmembers() if member.isfile())
    state = {
        "root": str(root), "profile": PROFILE, "endpoint": endpoint,
        "tarball": str(PACK), "tarball_sha256": sha256(PACK),
        "tarball_bytes": PACK.stat().st_size, "tarball_files": files,
        "dsh_version": json.loads((DSH_BIN.parent.parent / "package.json").read_text(encoding="utf-8"))["version"],
    }
    (root / "evidence" / "prepare.json").write_text(json.dumps(state, indent=2) + "\n", encoding="utf-8", newline="\n")
    (REPORT_DIR / "experiment-root.json").write_text(
        json.dumps({"root": str(root), "fake_port": args.fake_port}, indent=2) + "\n", encoding="utf-8", newline="\n")
    print(json.dumps(state, indent=2))


if __name__ == "__main__":
    main()
