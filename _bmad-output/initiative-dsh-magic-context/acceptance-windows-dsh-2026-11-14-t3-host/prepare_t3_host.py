"""Prepare an isolated DSH profile for the T3 post-Historian acceptance run.

The profile is copied from the completed T2 workspace, then its installed plugin
is replaced by the locally built T3 tarball. No daily DSH profile, session
store, or plugin data directory is touched.
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
T2_REPORT_DIR = REPO / "_bmad-output" / "initiative-dsh-magic-context" / "acceptance-windows-dsh-2026-11-14-t2-host"
T0B_REPORT_DIR = REPO / "_bmad-output" / "initiative-dsh-magic-context" / "acceptance-windows-dsh-2026-11-13"
POINTER = REPORT_DIR / "experiment-root.json"
T2_ROOT = Path(r"C:\Users\elvis\AppData\Local\Temp\opencode\dsh-mc-t2-20261114-010407")
OLD_ROOT = Path(r"C:\Users\elvis\AppData\Local\Temp\opencode\dsh-mc-acceptance-0112-j4ydat07")
PACK = Path(r"C:\Users\elvis\AppData\Local\Temp\opencode\t3-host-pack\dsh-plugin-magic-context-0.11.2.tgz")
NODE_EXE = Path(r"C:\Users\elvis\AppData\Local\Author Software\nvm\installs\v24.21.0\node.exe")
DSH_BIN = Path(
    r"C:\Users\elvis\AppData\Local\Temp\opencode\mc-t0-2026-11-13"
    r"\tools\dsh\node_modules\@deepseek-ai\dsh\lib\bin.js"
)
DSH_CMD = [str(NODE_EXE), str(DSH_BIN)]


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


def rewrite_paths(text: str, root: Path) -> str:
    text = text.replace(str(OLD_ROOT), str(root))
    text = text.replace(OLD_ROOT.as_posix(), root.as_posix())
    text = text.replace(str(T2_ROOT), str(root))
    text = text.replace(T2_ROOT.as_posix(), root.as_posix())
    if str(OLD_ROOT) in text or OLD_ROOT.as_posix() in text:
        raise SystemExit("overlay still references the T0-B root")
    if str(T2_ROOT) in text or T2_ROOT.as_posix() in text:
        raise SystemExit("overlay still references the T2 root")
    return text


def git(*args: str) -> str:
    result = subprocess.run(
        ["git", *args], cwd=REPO, capture_output=True, text=True,
        encoding="utf-8", errors="replace", timeout=60,
    )
    if result.returncode != 0:
        raise SystemExit(f"git {' '.join(args)} failed: {result.stderr}")
    return result.stdout


def main() -> None:
    if POINTER.exists():
        raise SystemExit("T3 experiment already prepared; refusing to overwrite its pointer.")
    if not PACK.exists():
        raise SystemExit(f"missing T3 tarball: {PACK}")
    stamp = time.strftime("%Y%m%d-%H%M%S")
    root = Path(r"C:\Users\elvis\AppData\Local\Temp\opencode") / f"dsh-mc-t3-{stamp}"
    for directory in ["workspace", "evidence", "downloads", "plugin", "overlays", "plugin-data"]:
        (root / directory).mkdir(parents=True)

    # Copy the complete installed headless profile, not any session or data.
    shutil.copytree(T2_ROOT / "dsh-home" / "profiles" / "headless", root / "dsh-home" / "profiles" / "headless")
    plugin_target = root / "dsh-home" / "profiles" / "headless" / "node_modules" / "dsh-plugin-magic-context"
    shutil.rmtree(plugin_target)
    with tarfile.open(PACK, "r:gz") as package:
        package.extractall(root / "plugin", filter="data")
    shutil.move(str(root / "plugin" / "package"), str(plugin_target))

    # Test-only observer and its archived driver profile entry.
    shutil.copyfile(T0B_REPORT_DIR / "observer.mjs", root / "observer.mjs")
    historian_template = (OLD_ROOT / "overlays" / "historian.yml").read_text(encoding="utf-8")
    historian_text = rewrite_paths(historian_template, root)
    historian_text = historian_text.replace(
        (T0B_REPORT_DIR / "observer.mjs").as_posix(),
        (root / "observer.mjs").as_posix(),
    )
    historian_text = historian_text.replace(str(T0B_REPORT_DIR / "observer.mjs"), str(root / "observer.mjs"))
    # Test-profile acceleration only: the synthetic fixture is smaller than a
    # production span, so lower the historian trigger from 5k to 500 tokens.
    historian_text = historian_text.replace(
        '"historianMinNodes": 1,',
        '"historianMinNodes": 1,\n        "historianMinBudgetTokens": 500,',
    )
    (root / "overlays" / "historian.yml").write_text(historian_text, encoding="utf-8")

    # After the target publish, the settle/expand hosts run with Historian off.
    # publishCompartments is still active; the DB precondition in run_t3_scenarios
    # proves there is no unlanded draft left to publish.
    settle_text = historian_text.replace('"historianEnabled": true', '"historianEnabled": false')
    settle_text = settle_text.replace('"executeThreshold": 0', '"executeThreshold": 100')
    (root / "overlays" / "settle.yml").write_text(settle_text, encoding="utf-8")

    template = (T0B_REPORT_DIR / "fixtures" / "fixture-before.txt").read_text(encoding="utf-8")
    nonce = secrets.token_hex(16)
    template = template.replace("nonce=9a601b5765b64bc19ec3c13e5235dd4a", f"nonce={nonce}")
    (root / "workspace" / "fixture.txt").write_text(template, encoding="utf-8")
    (root / "workspace" / "fixture-original.txt").write_text(template, encoding="utf-8")
    shutil.copyfile(OLD_ROOT / "workspace" / "historian-fixture.txt", root / "workspace" / "historian-fixture.txt")

    built_bridge = REPO / "lib" / "dsh" / "tool-bridge.js"
    installed_bridge = plugin_target / "lib" / "dsh" / "tool-bridge.js"
    built_seams = REPO / "lib" / "dsh" / "seams.js"
    installed_seams = plugin_target / "lib" / "dsh" / "seams.js"
    bridge_text = installed_bridge.read_text(encoding="utf-8")
    seams_text = installed_seams.read_text(encoding="utf-8")
    preflight = {
        "root": str(root),
        "nonce": nonce,
        "fixture_sha256": sha256(root / "workspace" / "fixture.txt"),
        "plugin_package": json.loads((plugin_target / "package.json").read_text(encoding="utf-8"))["version"],
        "installed_tool_bridge_sha256": sha256(installed_bridge),
        "built_tool_bridge_sha256": sha256(built_bridge),
        "installed_seams_sha256": sha256(installed_seams),
        "built_seams_sha256": sha256(built_seams),
        "tarball_sha256": sha256(PACK),
        "git_head": git("rev-parse", "HEAD").strip(),
        "git_diff_sha256": sha256_text(git("diff", "--binary")),
        "tool_bridge_has_message": "message" in bridge_text and "toolResultAt" in bridge_text,
        "seams_has_tool_result_at": "toolResultAt" in seams_text,
        "deepseek_key_present": bool(os.environ.get("DEEPSEEK_API_KEY")),
    }
    if preflight["installed_tool_bridge_sha256"] != preflight["built_tool_bridge_sha256"]:
        raise SystemExit("installed plugin tool-bridge does not match the locally built lib")
    if preflight["installed_seams_sha256"] != preflight["built_seams_sha256"]:
        raise SystemExit("installed plugin seams does not match the locally built lib")
    if not preflight["tool_bridge_has_message"] or not preflight["seams_has_tool_result_at"]:
        raise SystemExit("installed lib does not expose the T3 message/toolResultAt surface")
    (root / "evidence" / "preflight.json").write_text(json.dumps(preflight, indent=2), encoding="utf-8")

    for label, args in [
        ("host-version", ["--version"]),
        ("headless-config", ["--profile", "headless", "--dump-config"]),
        ("historian-config", ["--profile", "headless", "--patch", str(root / "overlays" / "historian.yml"), "--dump-config"]),
    ]:
        result = subprocess.run(
            [*DSH_CMD, *args], cwd=root / "workspace", env=isolated_env(root),
            capture_output=True, text=True, encoding="utf-8", errors="replace", timeout=60,
        )
        (root / "evidence" / f"{label}.txt").write_text(result.stdout + "\n--- stderr ---\n" + result.stderr, encoding="utf-8")
        preflight[label] = result.returncode
    POINTER.write_text(json.dumps({"root": str(root)}, indent=2), encoding="utf-8")
    print(json.dumps(preflight, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
