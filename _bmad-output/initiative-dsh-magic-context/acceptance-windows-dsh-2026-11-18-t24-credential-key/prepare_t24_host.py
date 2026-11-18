"""Prepare one fresh isolated DSH Web profile for the T24 credential-key gate."""

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
PACK_DIR = Path(os.environ.get(
    "T24_PACK_DIR",
    r"C:\Users\elvis\AppData\Local\Temp\opencode\t24-pack",
))
NODE_EXE = Path(r"C:\Users\elvis\AppData\Local\Author Software\nvm\installs\v24.21.0\node.exe")
DSH_BIN = Path(
    r"C:\Users\elvis\AppData\Local\Temp\opencode\mc-t0-2026-11-13"
    r"\tools\dsh\node_modules\@deepseek-ai\dsh\lib\bin.js"
)
DSH_CMD = [str(NODE_EXE), str(DSH_BIN)]
TOOLS_BIN = Path(r"C:\Users\elvis\AppData\Local\Temp\opencode\mc-t0-2026-11-13\tools\bin")
PROFILE = "t24"
PACKAGE = "@elvisw/dsh-magic-context"
TARGET_ID = "magic-context-dsh"


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1 << 20), b""):
            digest.update(chunk)
    return digest.hexdigest()


def find_pack() -> Path:
    if "T24_PACK" in os.environ:
        return Path(os.environ["T24_PACK"])
    candidates = sorted(PACK_DIR.glob("*.tgz"), key=lambda path: path.stat().st_mtime)
    if not candidates:
        raise SystemExit(f"no tarball in {PACK_DIR}; run npm pack first")
    return candidates[-1]


def isolated_env(root: Path) -> dict[str, str]:
    env = dict(os.environ)
    # The gate must prove the credential store, not the environment fallback.
    env.pop("SILICONFLOW_API_KEY", None)
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


def write_profile_patch(root: Path, fake_port: int) -> Path:
    patch = root / "dsh-home" / "profiles" / PROFILE / "cordis.patch.yml"
    patch.parent.mkdir(parents=True, exist_ok=True)
    patch.write_text(
        "# T24 isolated Web gate profile layer (settings can edit this row).\n"
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
        "      vectorBackfillLimit: 2\n"
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
        "      endpoint: 'http://127.0.0.1:" + str(fake_port) + "/v1'\n"
        "      authHeader: authorization\n"
        "      model: fixture-embed-a\n"
        "      apiKeyEnv: SILICONFLOW_API_KEY\n"
        "      dimensions: 0\n"
        "      timeoutMs: 8000\n"
        "      queryTimeoutMs: 2500\n"
        "      batchSize: 2\n",
        encoding="utf-8",
    )
    return patch


def write_overlay(root: Path) -> Path:
    overlay = root / "overlays" / "t24.yml"
    overlay.parent.mkdir(parents=True, exist_ok=True)
    overlay.write_text(
        "# T24 isolated Web gate overlay: only the LLM adapter is overridden.\n"
        "- id: llm-deepseek\n"
        "  name: '@deepseek-ai/dsh-llm-deepseek-api-key'\n"
        "  config:\n"
        "    apiKeyEnv: DEEPSEEK_API_KEY\n"
        "    thinking: enabled\n"
        "    reasoningEffort: low\n",
        encoding="utf-8",
    )
    return overlay


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--fake-port", type=int, required=True)
    args = parser.parse_args()
    pack = find_pack()
    if not pack.exists():
        raise SystemExit(f"missing tarball: {pack}")
    if not NODE_EXE.exists() or not DSH_BIN.exists():
        raise SystemExit(f"missing DSH runtime: {NODE_EXE} / {DSH_BIN}")

    stamp = time.strftime("%Y%m%d-%H%M%S")
    root = Path(r"C:\Users\elvis\AppData\Local\Temp\opencode") / f"dsh-mc-t24-{stamp}"
    for directory in ["workspace", "evidence", "plugin-data", "overlays", "screenshots"]:
        (root / directory).mkdir(parents=True, exist_ok=True)

    bootstrap = dsh("bootstrap-web-template", [PROFILE, "--from-default-profile", "web", "--dump-config"], root)
    if bootstrap["exit_code"] != 0:
        raise SystemExit(f"profile bootstrap failed: {bootstrap['stderr']}")

    add = dsh("add-local-tarball", ["plugin", "--profile", PROFILE, "add", str(pack), "--ignore-scripts"], root, 600)
    if add["exit_code"] != 0:
        raise SystemExit(f"local tarball install failed: {add['stderr']}")

    overlay = write_overlay(root)
    profile_patch = write_profile_patch(root, args.fake_port)
    dump = dsh("dump-overlay", ["--profile", PROFILE, "--patch", str(overlay), "--dump-config"], root)
    if dump["exit_code"] != 0:
        raise SystemExit(f"overlay dump failed: {dump['stderr']}")

    with tarfile.open(pack, "r:gz") as archive:
        files = sum(1 for member in archive.getmembers() if member.isfile())

    profile_pkg = json.loads((root / "dsh-home" / "profiles" / PROFILE / "package.json").read_text(encoding="utf-8"))
    spec = profile_pkg.get("dependencies", {}).get(PACKAGE, "")
    if not spec.startswith("file:"):
        raise SystemExit("profile dependency is not the local tarball")
    for needle in (PACKAGE, TARGET_ID, "embedding", "SILICONFLOW_API_KEY", "fixture-embed-a"):
        if needle not in dump["stdout"]:
            raise SystemExit(f"dump-config does not show {needle}")

    state = {
        "root": str(root),
        "profile": PROFILE,
        "overlay": str(overlay),
        "profile_patch": str(profile_patch),
        "profile_patch_sha256": sha256(profile_patch),
        "tarball": str(pack),
        "tarball_sha256": sha256(pack),
        "tarball_bytes": pack.stat().st_size,
        "tarball_files": files,
        "profile_dependency": spec,
        "fake_port": args.fake_port,
        "bootstrap_exit_code": bootstrap["exit_code"],
        "add_exit_code": add["exit_code"],
        "dump_exit_code": dump["exit_code"],
        "dump_has_embedding": "openai-compatible" in dump["stdout"],
        "deepseek_key_present": bool(os.environ.get("DEEPSEEK_API_KEY")),
        "siliconflow_key_present": False,
    }
    (root / "evidence" / "prepare.json").write_text(json.dumps(state, indent=2) + "\n", encoding="utf-8")
    (REPORT_DIR / "experiment-root.json").write_text(json.dumps({
        "root": str(root),
        "overlay": str(overlay),
        "tarball_sha256": state["tarball_sha256"],
    }, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(state, indent=2))


if __name__ == "__main__":
    main()
