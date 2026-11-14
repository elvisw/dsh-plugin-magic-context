"""Prepare an isolated DSH profile for the vector first-writer host gate.

No daily profile or data directory is touched. The profile is newly created,
the locally packed tarball is installed through the real `dsh plugin add` path,
and the test-only driver only adds a bounded sleep tool.
"""

from __future__ import annotations

import hashlib
import json
import os
from pathlib import Path
import subprocess
import time

REPORT_DIR = Path(__file__).resolve().parent
REPO = Path(r"C:\Users\elvis\Documents\dev\plugin\dsh-plugin-magic-context")
PACK = Path(r"C:\Users\elvis\AppData\Local\Temp\opencode\vector-host-pack\elvisw-dsh-plugin-magic-context-0.12.1.tgz")
NODE_EXE = Path(r"C:\Users\elvis\AppData\Local\Author Software\nvm\installs\v24.21.0\node.exe")
DSH_BIN = Path(
    r"C:\Users\elvis\AppData\Local\Temp\opencode\mc-t0-2026-11-13"
    r"\tools\dsh\node_modules\@deepseek-ai\dsh\lib\bin.js"
)
DSH_CMD = [str(NODE_EXE), str(DSH_BIN)]
NEW_PKG = "@elvisw/dsh-plugin-magic-context"
POINTER = REPORT_DIR / "experiment-root.json"


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


def run(label: str, args: list[str], root: Path, timeout: int = 300) -> dict:
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


def main() -> None:
    if POINTER.exists():
        raise SystemExit("vector experiment already prepared; refusing to overwrite its pointer.")
    if not PACK.exists():
        raise SystemExit(f"missing vector tarball: {PACK}")
    stamp = time.strftime("%Y%m%d-%H%M%S")
    root = Path(r"C:\Users\elvis\AppData\Local\Temp\opencode") / f"dsh-mc-vector-{stamp}"
    for directory in ["workspace", "evidence", "plugin-data", "overlays", "downloads"]:
        (root / directory).mkdir(parents=True)

    (root / "workspace" / "fixture.txt").write_text(
        "VECTOR_BOOTSTRAP_FIXTURE: citrus fruit is stored in the cold cellar.\n",
        encoding="utf-8",
    )
    # The driver must live inside the profile so `@deepseek-ai/dsh-tools`
    # resolves from the profile's own node_modules. A file at the experiment
    # root cannot resolve the Host package (attempt 1 failed exactly there).
    profile_dir = root / "dsh-home" / "profiles" / "headless"
    profile_dir.mkdir(parents=True, exist_ok=True)
    (profile_dir / "vector-driver.mjs").write_text(
        """// Test-only synchronization tool; it never reads or mutates history.
import { defineTool } from '@deepseek-ai/dsh-tools';

export const name = 'vector-test-driver';
export const inject = ['tools'];

export function apply(ctx) {
  ctx.tools.register(defineTool({
    name: 'vector_wait',
    description: 'Acceptance-test synchronization: wait up to 120 seconds for the maintenance tick.',
    parameters: { seconds: { type: 'integer', required: true } },
    output: {
      schema: { type: 'json' },
      render: (_args, value) => [{ type: 'text', text: `Waited ${value.seconds} seconds.` }],
    },
    async execute(args) {
      const seconds = Math.max(0, Math.min(120, args.seconds));
      await new Promise(resolve => setTimeout(resolve, seconds * 1000));
      return { seconds };
    },
  }));
}
""",
        encoding="utf-8",
    )
    observer = (root / "observer.mjs")
    observer.write_text(
        (REPORT_DIR.parent / "acceptance-windows-dsh-2026-11-14-t4-host" / "evidence" / "observer.mjs").read_text(encoding="utf-8")
        if (REPORT_DIR.parent / "acceptance-windows-dsh-2026-11-14-t4-host" / "evidence" / "observer.mjs").exists()
        else "export const name = 'vector-noop-observer';\nexport function apply() {}\n",
        encoding="utf-8",
    )

    bootstrap = run("bootstrap-profile", ["--profile", "headless", "--dump-config"], root)
    overlay = [
        {
            "id": "magic-context-dsh",
            "name": NEW_PKG,
            "config": {
                "dataDir": str(root / "plugin-data").replace("\\", "/"),
                "registerCompactionEngine": False,
                "historianEnabled": False,
                "policy": {"executeThreshold": 100, "ttlMs": 999999999},
                "maintenance": {"enabled": True, "intervalMs": 60000},
                "memory": {
                    "embedBackfill": False,
                    "vectorBackfill": True,
                    "global": {
                        "machine": {"enabled": False},
                        "user": {"render": False, "collect": False, "review": False},
                    },
                },
            },
        },
        {"id": "session-title-llm", "name": "@deepseek-ai/dsh-session-title-first-prompt-llm", "disabled": True},
        {"insert": [{"id": "acceptance-observer", "name": f"file:///{str(observer).replace(chr(92), '/')}", "config": {"outDir": str(root / "evidence" / "session-observer").replace("\\", "/")}}]},
        {"insert": [{"id": "vector-test-driver", "name": f"file:///{str(profile_dir / 'vector-driver.mjs').replace(chr(92), '/')}"}]},
    ]
    overlay_path = root / "overlays" / "vector.yml"
    overlay_path.write_text(json.dumps(overlay, indent=2), encoding="utf-8")
    overlay_text = overlay_path.read_text(encoding="utf-8")
    if str(root) not in overlay_text and root.as_posix() not in overlay_text:
        raise SystemExit("overlay does not reference this root")

    add = run("add-new", ["plugin", "--profile", "headless", "add", str(PACK), "--ignore-scripts"], root, timeout=360)
    dump = run("dump-config", ["--profile", "headless", "--patch", str(overlay_path), "--dump-config"], root)

    profile = json.loads((root / "dsh-home" / "profiles" / "headless" / "package.json").read_text(encoding="utf-8"))
    installed = root / "dsh-home" / "profiles" / "headless" / "node_modules" / "@elvisw" / "dsh-plugin-magic-context"
    preflight = {
        "root": str(root),
        "tarball_sha256": sha256(PACK),
        "bootstrap_exit_code": bootstrap["exit_code"],
        "add_exit_code": add["exit_code"],
        "dump_exit_code": dump["exit_code"],
        "profile_dependencies": profile.get("dependencies"),
        "new_installed": installed.exists(),
        "new_installed_package_name": (
            json.loads((installed / "package.json").read_text(encoding="utf-8")).get("name")
            if installed.exists()
            else None
        ),
        "dump_has_new_name": NEW_PKG in dump["stdout"],
        "dump_has_maintenance": "intervalMs" in dump["stdout"] or "maintenance" in dump["stdout"],
        "deepseek_key_present": bool(os.environ.get("DEEPSEEK_API_KEY")),
    }
    (root / "evidence" / "preflight.json").write_text(json.dumps(preflight, indent=2), encoding="utf-8")
    POINTER.write_text(json.dumps({"root": str(root)}, indent=2), encoding="utf-8")
    print(json.dumps(preflight, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
