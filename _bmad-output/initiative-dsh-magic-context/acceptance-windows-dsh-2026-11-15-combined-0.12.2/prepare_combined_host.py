"""Prepare one fresh isolated DSH profile for the published 0.12.2 combined gate.

The profile is created from scratch and the plugin is installed by the public
registry specifier. No daily profile, prior experiment root, local tarball or
working-tree build is used.
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
PACKAGE = "@elvisw/dsh-plugin-magic-context"
VERSION = "0.12.2"
SPEC = f"{PACKAGE}@{VERSION}"
POINTER = REPORT_DIR / "experiment-root.json"
NODE_EXE = Path(r"C:\Users\elvis\AppData\Local\Author Software\nvm\installs\v24.21.0\node.exe")
DSH_BIN = Path(
    r"C:\Users\elvis\AppData\Local\Temp\opencode\mc-t0-2026-11-13"
    r"\tools\dsh\node_modules\@deepseek-ai\dsh\lib\bin.js"
)
DSH_CMD = [str(NODE_EXE), str(DSH_BIN)]
TOOLS_BIN = Path(r"C:\Users\elvis\AppData\Local\Temp\opencode\mc-t0-2026-11-13\tools\bin")
OLD_ROOTS = (
    "dsh-mc-acceptance-0112-j4ydat07",
    "dsh-mc-t2-20261114-010407",
    "dsh-mc-t3-20261114-161041",
    "dsh-mc-t4-20261114-174313",
    "dsh-mc-vector-20261114",
)


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


def dsh(label: str, args: list[str], root: Path, timeout: int = 180) -> dict:
    return run(label, [*DSH_CMD, *args], root, timeout)


def overlay_base(root: Path) -> list[dict]:
    return [
        {
            "id": "magic-context-dsh",
            "name": PACKAGE,
            "config": {
                "dataDir": str(root / "plugin-data").replace("\\", "/"),
                "registerCompactionEngine": False,
                "historianEnabled": False,
                "policy": {"executeThreshold": 100, "ttlMs": 999999999},
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
        {"id": "session-title-llm", "name": "@deepseek-ai/dsh-session-title-first-prompt-llm", "disabled": True},
    ]


def observer_entry(root: Path) -> dict:
    return {
        "insert": [{
            "id": "acceptance-observer",
            "name": f"file:///{str(root / 'observer.mjs').replace(chr(92), '/')}",
            "config": {"outDir": str(root / "evidence" / "session-observer").replace("\\", "/")},
        }],
    }


def write_text(path: Path, text: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(text, encoding="utf-8")


def main() -> None:
    if POINTER.exists():
        raise SystemExit("combined experiment already prepared; refusing to overwrite its pointer.")
    if not NODE_EXE.exists() or not DSH_BIN.exists():
        raise SystemExit(f"missing DSH runtime: {NODE_EXE} / {DSH_BIN}")

    root = TOOLS_BIN.parent / f"dsh-mc-combined-{time.strftime('%Y%m%d-%H%M%S')}"
    if root.exists():
        raise SystemExit(f"experiment root already exists: {root}")
    for directory in ["workspace", "evidence", "downloads", "artifact", "overlays", "plugin-data", "evidence/session-observer"]:
        (root / directory).mkdir(parents=True)

    nonce = secrets.token_hex(16)
    write_text(root / "workspace" / "fixture.txt",
               "COMBINED_RECOVERY_FIXTURE\n"
               "The acceptance nonce is stored in the payload; it must survive the round trip.\n"
               f"nonce={nonce}\n")
    write_text(root / "workspace" / "historian-fixture.txt",
               "COMBINED_HISTORIAN_FIXTURE\n"
               "This synthetic transcript exists only so the real Historian has a stable span to publish.\n"
               + "\n".join(f"line {index}: retain the combined-build provenance marker {nonce}." for index in range(1, 90))
               + "\n")

    observer = Path(r"C:\Users\elvis\AppData\Local\Temp\opencode\dsh-mc-t3-20261114-161041\observer.mjs")
    if not observer.exists():
        raise SystemExit(f"missing observer source: {observer}")
    shutil.copyfile(observer, root / "observer.mjs")

    write_text(root / "dsh-home" / "profiles" / "headless" / "acceptance-test-driver.mjs", """
// Test-only synchronization tool; it never reads or mutates session history.
import { defineTool } from '@deepseek-ai/dsh-tools';

export const name = 'acceptance-test-driver';
export const inject = ['tools'];

export function apply(ctx) {
  ctx.tools.register(defineTool({
    name: 'acceptance_wait',
    description: 'Acceptance-test synchronization: wait up to 20 seconds for an asynchronous historian, then return. Does not change history.',
    parameters: { seconds: { type: 'integer', required: true } },
    output: { schema: { type: 'json' }, render: (_args, value) => [{ type: 'text', text: `Waited ${value.seconds} seconds.` }] },
    async execute(args) {
      const seconds = Math.max(0, Math.min(20, args.seconds));
      await new Promise(resolve => setTimeout(resolve, seconds * 1000));
      return { seconds };
    },
  }));
}
""".lstrip())
    write_text(root / "dsh-home" / "profiles" / "headless" / "vector-driver.mjs", """
// Test-only synchronization tool; it never reads or mutates history.
import { defineTool } from '@deepseek-ai/dsh-tools';

export const name = 'vector-test-driver';
export const inject = ['tools'];

export function apply(ctx) {
  ctx.tools.register(defineTool({
    name: 'vector_wait',
    description: 'Acceptance-test synchronization: wait up to 120 seconds for the maintenance tick.',
    parameters: { seconds: { type: 'integer', required: true } },
    output: { schema: { type: 'json' }, render: (_args, value) => [{ type: 'text', text: `Waited ${value.seconds} seconds.` }] },
    async execute(args) {
      const seconds = Math.max(0, Math.min(120, args.seconds));
      await new Promise(resolve => setTimeout(resolve, seconds * 1000));
      return { seconds };
    },
  }));
}
""".lstrip())
    shutil.copyfile(
        Path(r"C:\Users\elvis\Documents\dev\plugin\dsh-plugin-magic-context\_bmad-output\initiative-dsh-magic-context\acceptance-windows-dsh-2026-11-14-t4-host\driver-flush.mjs"),
        root / "driver-flush.mjs",
    )

    # Fresh profile, then registry install by specifier.
    bootstrap = dsh("bootstrap-profile", ["--profile", "headless", "--dump-config"], root)
    if bootstrap["exit_code"] != 0:
        raise SystemExit(f"profile bootstrap failed: {bootstrap['stderr']}")
    npm = shutil.which("npm.cmd") or shutil.which("npm")
    if npm is None:
        raise SystemExit("npm not found")
    view = run("npm-view", [npm, "view", SPEC, "version", "dist-tags", "dist.attestations", "gitHead", "dist.tarball", "dist.shasum", "--prefer-online", "--json"], root)
    pack = run("npm-pack", [npm, "pack", SPEC, "--pack-destination", str(root / "downloads")], root)
    tarballs = sorted((root / "downloads").glob("*.tgz"))
    if pack["exit_code"] != 0 or not tarballs:
        raise SystemExit(f"registry pack failed: {pack['stderr']}")
    tarball = tarballs[-1]
    with tarfile.open(tarball, "r:gz") as package:
        package.extractall(root / "artifact", filter="data")
    artifact = root / "artifact" / "package"
    artifact_pkg = json.loads((artifact / "package.json").read_text(encoding="utf-8"))
    if artifact_pkg.get("name") != PACKAGE or artifact_pkg.get("version") != VERSION:
        raise SystemExit(f"registry artifact identity mismatch: {artifact_pkg.get('name')}@{artifact_pkg.get('version')}")

    add = dsh("add-registry", ["plugin", "--profile", "headless", "add", SPEC, "--ignore-scripts"], root, 600)
    if add["exit_code"] != 0:
        raise SystemExit(f"registry install failed (ticket blocked): {add['stderr']}")
    profile_pkg_path = root / "dsh-home" / "profiles" / "headless" / "package.json"
    profile_pkg = json.loads(profile_pkg_path.read_text(encoding="utf-8"))
    spec_in_profile = profile_pkg.get("dependencies", {}).get(PACKAGE, "")
    if spec_in_profile.startswith("file:") or spec_in_profile == "":
        raise SystemExit(f"profile dependency is not a registry specifier: {spec_in_profile!r}")

    installed = root / "dsh-home" / "profiles" / "headless" / "node_modules" / "@elvisw" / "dsh-plugin-magic-context"
    if not installed.exists():
        raise SystemExit(f"installed package missing: {installed}")
    installed_pkg = json.loads((installed / "package.json").read_text(encoding="utf-8"))
    if installed_pkg.get("version") != VERSION:
        raise SystemExit(f"installed version mismatch: {installed_pkg.get('version')}")

    # Overlays: recovery (historian off), historian (accelerated), settle,
    # flush (real command driver), vector (maintenance) and config-only effort.
    recovery = overlay_base(root)
    # The recovery lifecycle deliberately opens the execute band so the
    # reduce lands before the immediately following expand; no Historian is
    # involved in this session.
    recovery[0]["config"]["policy"] = {"executeThreshold": 0, "ttlMs": 0}
    recovery.append({"insert": [{"id": "acceptance-test-driver", "name": f"file:///{str(root / 'dsh-home' / 'profiles' / 'headless' / 'acceptance-test-driver.mjs').replace(chr(92), '/')}"}]})
    recovery.append(observer_entry(root))
    write_text(root / "overlays" / "recovery.yml", json.dumps(recovery, indent=2))

    historian = overlay_base(root)
    # The direct DeepSeek adapter is the route the Historian uses for the
    # compaction-purpose stream; the base agent row alone is not enough.
    historian.append({
        "id": "llm-deepseek",
        "name": "@deepseek-ai/dsh-llm-deepseek-api-key",
        "config": {
            "models": [{"id": "deepseek-flash", "contextWindow": 32768, "maxTokens": 8192}],
            "maxTokens": 4096,
            "reasoningEffort": "off",
        },
    })
    historian[0]["config"].update({
        "historianEnabled": True,
        "policy": {
            "executeThreshold": 0,
            "historianProtectedNodes": 1,
            "historianMinNodes": 1,
            "historianMinBudgetTokens": 500,
            "historianTimeoutMs": 120000,
        },
    })
    historian.append({"insert": [{"id": "acceptance-test-driver", "name": f"file:///{str(root / 'dsh-home' / 'profiles' / 'headless' / 'acceptance-test-driver.mjs').replace(chr(92), '/')}"}]})
    historian.append(observer_entry(root))
    write_text(root / "overlays" / "historian.yml", json.dumps(historian, indent=2))

    settle = json.loads(json.dumps(historian))
    settle[0]["config"]["historianEnabled"] = False
    settle[0]["config"]["policy"] = {"executeThreshold": 100, "ttlMs": 999999999}
    write_text(root / "overlays" / "settle.yml", json.dumps(settle, indent=2))

    flush = overlay_base(root)
    flush[0]["config"]["policy"] = {"executeThreshold": 100, "ttlMs": 999999999}
    flush.append(observer_entry(root))
    flush.append({"insert": [{"id": "acceptance-flush-driver", "name": f"file:///{str(root / 'driver-flush.mjs').replace(chr(92), '/')}"}]})
    write_text(root / "overlays" / "flush.yml", json.dumps(flush, indent=2))

    vector = overlay_base(root)
    vector[0]["config"].update({
        "maintenance": {"enabled": True, "intervalMs": 60000},
        "memory": {
            "embedBackfill": False,
            "vectorBackfill": True,
            "global": {
                "machine": {"enabled": False},
                "user": {"render": False, "collect": False, "review": False},
            },
        },
    })
    vector.append(observer_entry(root))
    vector.append({"insert": [{"id": "vector-test-driver", "name": f"file:///{str(root / 'dsh-home' / 'profiles' / 'headless' / 'vector-driver.mjs').replace(chr(92), '/')}"}]})
    write_text(root / "overlays" / "vector.yml", json.dumps(vector, indent=2))

    effort = json.loads(json.dumps(historian))
    effort[0]["config"]["historian"] = {"reasoningEffort": "low"}
    write_text(root / "overlays" / "effort.yml", json.dumps(effort, indent=2))

    # Dump configs; scoped name and the config-only effort must be visible.
    dump = dsh("dump-historian", ["--profile", "headless", "--patch", str(root / "overlays" / "historian.yml"), "--dump-config"], root)
    effort_dump = dsh("dump-effort", ["--profile", "headless", "--patch", str(root / "overlays" / "effort.yml"), "--dump-config"], root)
    if PACKAGE not in dump["stdout"] + dump["stderr"]:
        raise SystemExit("historian dump does not show the scoped package name")
    if "reasoningEffort" not in effort_dump["stdout"] or "low" not in effort_dump["stdout"]:
        raise SystemExit("effort dump does not show historian.reasoningEffort=low")

    overlay_texts = {path.name: path.read_text(encoding="utf-8") for path in (root / "overlays").glob("*.yml")}
    for name, text in overlay_texts.items():
        if any(old in text for old in OLD_ROOTS):
            raise SystemExit(f"overlay {name} references an old experiment root")
        if str(root) not in text and root.as_posix() not in text:
            raise SystemExit(f"overlay {name} does not reference this root")

    installed_hashes = {
        relative: sha256(installed / relative)
        for relative in [
            "lib/index.js",
            "lib/dsh/historian.js",
            "lib/dsh/drop-landing.js",
            "lib/dsh/memory-lane.js",
            "lib/dsh/tool-bridge.js",
            "lib/dsh/flush-command.js",
        ]
    }
    artifact_hashes = {
        relative: sha256(artifact / relative)
        for relative in installed_hashes
    }
    if installed_hashes != artifact_hashes:
        raise SystemExit("installed package does not match the registry artifact")
    preflight = {
        "root": str(root),
        "nonce": nonce,
        "package": PACKAGE,
        "version": VERSION,
        "specifier": SPEC,
        "profile_specifier": spec_in_profile,
        "tarball": str(tarball),
        "tarball_sha256": sha256(tarball),
        "artifact_package": artifact_pkg,
        "installed_hashes": installed_hashes,
        "git_head": subprocess.run(
            ["git", "rev-parse", "HEAD"], cwd=REPO, capture_output=True, text=True,
            encoding="utf-8", errors="replace", timeout=60,
        ).stdout.strip(),
        "deepseek_key_present": bool(os.environ.get("DEEPSEEK_API_KEY")),
        "npm_view": view["stdout"],
        "add_exit": add["exit_code"],
        "dump_exit": dump["exit_code"],
        "effort_dump_exit": effort_dump["exit_code"],
        "overlays": list(overlay_texts),
    }
    write_text(root / "evidence" / "preflight.json", json.dumps(preflight, ensure_ascii=False, indent=2))
    POINTER.write_text(json.dumps({"root": str(root)}, indent=2), encoding="utf-8")
    print(json.dumps({
        "root": str(root),
        "package": PACKAGE,
        "version": VERSION,
        "specifier": SPEC,
        "profile_specifier": spec_in_profile,
        "tarball_sha256": preflight["tarball_sha256"],
        "installed_hashes": installed_hashes,
        "deepseek_key_present": preflight["deepseek_key_present"],
    }, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
