"""Prepare an isolated DSH profile for the T2 host acceptance run.

The profile is copied from the completed 0.11.2 baseline workspace, then its
installed plugin is replaced by the locally built tarball. No daily DSH profile,
session store, or plugin data directory is touched.
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
OLD_REPORT_DIR = REPO / "_bmad-output" / "initiative-dsh-magic-context" / "acceptance-windows-dsh-2026-11-13"
POINTER = REPORT_DIR / "experiment-root.json"
OLD_ROOT = Path(r"C:\Users\elvis\AppData\Local\Temp\opencode\dsh-mc-acceptance-0112-j4ydat07")
PACK = Path(r"C:\Users\elvis\AppData\Local\Temp\opencode\t2-host-pack\dsh-plugin-magic-context-0.11.2.tgz")
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


def main() -> None:
    if POINTER.exists():
        raise SystemExit("T2 experiment already prepared; refusing to overwrite its pointer.")
    stamp = time.strftime("%Y%m%d-%H%M%S")
    root = Path(r"C:\Users\elvis\AppData\Local\Temp\opencode") / f"dsh-mc-t2-{stamp}"
    for directory in ["workspace", "evidence", "downloads", "plugin", "overlays", "plugin-data"]:
        (root / directory).mkdir(parents=True)

    # Copy the complete installed headless profile, not any session or data.
    shutil.copytree(OLD_ROOT / "dsh-home" / "profiles" / "headless", root / "dsh-home" / "profiles" / "headless")
    plugin_target = root / "dsh-home" / "profiles" / "headless" / "node_modules" / "dsh-plugin-magic-context"
    shutil.rmtree(plugin_target)
    with tarfile.open(PACK, "r:gz") as package:
        package.extractall(root / "plugin", filter="data")
    shutil.move(str(root / "plugin" / "package"), str(plugin_target))

    # The observer is test-only; it captures the host surface/events.
    shutil.copyfile(OLD_REPORT_DIR / "observer.mjs", root / "observer.mjs")

    old_overlay = OLD_ROOT / "overlays" / "base-control.yml"
    overlay_text = old_overlay.read_text(encoding="utf-8")
    # The baseline overlay was written with forward slashes; replace both forms
    # so no path can silently keep the old root.
    overlay_text = overlay_text.replace(str(OLD_ROOT), str(root))
    overlay_text = overlay_text.replace(OLD_ROOT.as_posix(), root.as_posix())
    # Point the observer at the copied instance, not the archived report path.
    overlay_text = overlay_text.replace((OLD_REPORT_DIR / "observer.mjs").as_posix(), (root / "observer.mjs").as_posix())
    if str(OLD_ROOT) in overlay_text or OLD_ROOT.as_posix() in overlay_text:
        raise SystemExit("overlay still references the baseline root")
    (root / "overlays" / "base-control.yml").write_text(overlay_text, encoding="utf-8")

    template = (OLD_REPORT_DIR / "fixtures" / "fixture-before.txt").read_text(encoding="utf-8")
    nonce = secrets.token_hex(16)
    template = template.replace("nonce=9a601b5765b64bc19ec3c13e5235dd4a", f"nonce={nonce}")
    (root / "workspace" / "fixture.txt").write_text(template, encoding="utf-8")
    (root / "workspace" / "fixture-original.txt").write_text(template, encoding="utf-8")

    built = REPO / "lib" / "dsh" / "tool-bridge.js"
    installed = plugin_target / "lib" / "dsh" / "tool-bridge.js"
    preflight = {
        "root": str(root),
        "nonce": nonce,
        "fixture_sha256": sha256(root / "workspace" / "fixture.txt"),
        "plugin_package": json.loads((plugin_target / "package.json").read_text(encoding="utf-8"))["version"],
        "installed_tool_bridge_sha256": sha256(installed),
        "built_tool_bridge_sha256": sha256(built),
        "tarball_sha256": sha256(PACK),
        "deepseek_key_present": bool(os.environ.get("DEEPSEEK_API_KEY")),
    }
    if preflight["installed_tool_bridge_sha256"] != preflight["built_tool_bridge_sha256"]:
        raise SystemExit("installed plugin does not match the locally built lib")
    (root / "evidence" / "preflight.json").write_text(json.dumps(preflight, indent=2), encoding="utf-8")

    for label, args in [
        ("host-version", ["--version"]),
        ("headless-config", ["--profile", "headless", "--dump-config"]),
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
