"""Prepare two isolated DSH Web profiles for the T37 preset/key-row gate.

Profile t37: local provider, no stored key. Profile t37b: remote provider with
the SiliconFlow preset and a non-default saved endpoint, to prove the inputs stay
visible with the precedence notice.
"""

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
REPO = Path(r"C:\Users\elvis\Documents\dev\plugin\dsh-plugin-magic-context")
PACK = Path(os.environ.get(
    "T37_PACK",
    r"C:\Users\elvis\AppData\Local\Temp\opencode\t37-pack\elvisw-dsh-magic-context-0.18.9.tgz",
))
NODE_EXE = Path(r"C:\Users\elvis\AppData\Local\Author Software\nvm\installs\v24.21.0\node.exe")
DSH_BIN = Path(
    r"C:\Users\elvis\AppData\Local\Temp\opencode\t35-rc5-root2"
    r"\host\node_modules\@deepseek-ai\dsh\lib\bin.js"
)
DSH_CMD = [str(NODE_EXE), str(DSH_BIN)]
PACKAGE = "@elvisw/dsh-magic-context"
TARGET_ID = "magic-context-dsh"


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1 << 20), b""):
            digest.update(chunk)
    return digest.hexdigest()


def isolated_env(root: Path) -> dict[str, str]:
    paths = {
        "DSH_HOME": root / "dsh-home",
        "HOME": root / "user-home",
        "USERPROFILE": root / "user-home",
        "XDG_CONFIG_HOME": root / "xdg-config",
        "XDG_DATA_HOME": root / "xdg-data",
        "XDG_CACHE_HOME": root / "xdg-cache",
        "XDG_STATE_HOME": root / "xdg-state",
        "APPDATA": root / "appdata",
        "LOCALAPPDATA": root / "localappdata",
        "TEMP": root / "tmp",
        "TMP": root / "tmp",
    }
    for path in paths.values():
        path.mkdir(parents=True, exist_ok=True)
    env = dict(os.environ)
    env.update({name: str(path) for name, path in paths.items()})
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
    text = result.stdout + "\n--- stderr ---\n" + result.stderr
    (root / "evidence" / f"{label}.txt").write_text(text, encoding="utf-8")
    return {"args": args, "exit_code": result.returncode, "stdout": result.stdout, "stderr": result.stderr}


def patch_text(root: Path, endpoint: str) -> str:
    return (
        "# T37 isolated Web gate layer.\n"
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
        "      provider: " + ("local" if endpoint == "" else "openai-compatible") + "\n"
        "      preset: siliconflow\n"
        "      endpoint: " + json.dumps(endpoint) + "\n"
        "      authHeader: authorization\n"
        "      model: " + json.dumps("" if endpoint == "" else "fixture-embed-a") + "\n"
        "      apiKeyEnv: SILICONFLOW_API_KEY\n"
        "      dimensions: 0\n"
        "      timeoutMs: 8000\n"
        "      queryTimeoutMs: 2500\n"
        "      batchSize: 2\n"
    )


def write_patch(root: Path, profile: str, endpoint: str) -> Path:
    patch = root / "dsh-home" / "profiles" / profile / "cordis.patch.yml"
    patch.parent.mkdir(parents=True, exist_ok=True)
    patch.write_text(patch_text(root, endpoint), encoding="utf-8")
    return patch


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--endpoint", default="")
    args = parser.parse_args()
    if not PACK.exists():
        raise SystemExit(f"missing tarball: {PACK}")
    if not NODE_EXE.exists() or not DSH_BIN.exists():
        raise SystemExit("missing DSH runtime")

    root = Path(r"C:\Users\elvis\AppData\Local\Temp\opencode") / ("dsh-mc-t37-" + time.strftime("%Y%m%d-%H%M%S"))
    for directory in ["workspace", "evidence", "plugin-data", "screenshots"]:
        (root / directory).mkdir(parents=True, exist_ok=True)

    profiles = {"t37": "", "t37b": args.endpoint or "http://127.0.0.1:9/v1"}
    for profile, endpoint in profiles.items():
        bootstrap = run(f"bootstrap-{profile}", [*DSH_CMD, profile, "--from-default-profile", "web", "--dump-config"], root)
        if bootstrap["exit_code"] != 0:
            raise SystemExit(f"profile bootstrap failed ({profile}): {bootstrap['stderr']}")
        add = run(f"add-{profile}", [*DSH_CMD, "plugin", "--profile", profile, "add", str(PACK), "--ignore-scripts"], root, 600)
        if add["exit_code"] != 0:
            raise SystemExit(f"local tarball install failed ({profile}): {add['stderr']}")
        write_patch(root, profile, endpoint)

    with tarfile.open(PACK, "r:gz") as archive:
        files = sum(1 for member in archive.getmembers() if member.isfile())

    state = {
        "root": str(root),
        "profiles": profiles,
        "tarball": str(PACK),
        "tarball_sha256": sha256(PACK),
        "tarball_bytes": PACK.stat().st_size,
        "tarball_files": files,
        "node": subprocess.run([str(NODE_EXE), "--version"], capture_output=True, text=True).stdout.strip(),
        "dsh_version": json.loads((DSH_BIN.parent.parent / "package.json").read_text(encoding="utf-8"))["version"],
    }
    (root / "evidence" / "prepare.json").write_text(json.dumps(state, indent=2) + "\n", encoding="utf-8")
    (REPORT_DIR / "experiment-root.json").write_text(json.dumps({
        "root": str(root), "tarball_sha256": state["tarball_sha256"],
    }, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(state, indent=2))


if __name__ == "__main__":
    main()
