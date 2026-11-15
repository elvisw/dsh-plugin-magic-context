"""Prepare one fresh isolated DSH profile for the V1.1 range/verbose gate.

The profile is created from scratch. The plugin under test is the locally built
tarball for this working tree (packed before this script runs); the script pins
its SHA-256 and the git HEAD/diff so the build is reproducible. No daily DSH
profile, session store, prior experiment root, or daily plugin data is touched.
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
PACK = Path(os.environ.get(
    "V11_PACK",
    r"C:\Users\elvis\AppData\Local\Temp\opencode\v11-host-pack\elvisw-dsh-plugin-magic-context-0.12.3.tgz",
))
POINTER = REPORT_DIR / "experiment-root.json"
NODE_EXE = Path(r"C:\Users\elvis\AppData\Local\Author Software\nvm\installs\v24.21.0\node.exe")
DSH_BIN = Path(
    r"C:\Users\elvis\AppData\Local\Temp\opencode\mc-t0-2026-11-13"
    r"\tools\dsh\node_modules\@deepseek-ai\dsh\lib\bin.js"
)
DSH_CMD = [str(NODE_EXE), str(DSH_BIN)]
TOOLS_BIN = Path(r"C:\Users\elvis\AppData\Local\Temp\opencode\mc-t0-2026-11-13\tools\bin")
OBSERVER_SOURCE = REPO / "_bmad-output" / "initiative-dsh-magic-context" / "acceptance-windows-dsh-2026-11-13" / "observer.mjs"
OLD_ROOTS = (
    "dsh-mc-acceptance-0112-j4ydat07",
    "dsh-mc-t2-20261114-010407",
    "dsh-mc-t3-20261114-161041",
    "dsh-mc-t4-20261114-174313",
    "dsh-mc-vector-20261114",
    "dsh-mc-combined-20261115",
)


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


def write_text(path: Path, text: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(text, encoding="utf-8")


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


def main() -> None:
    if POINTER.exists():
        raise SystemExit("V1.1 experiment already prepared; refusing to overwrite its pointer.")
    if not PACK.exists():
        raise SystemExit(f"missing local V1.1 tarball: {PACK}")
    if not NODE_EXE.exists() or not DSH_BIN.exists():
        raise SystemExit(f"missing DSH runtime: {NODE_EXE} / {DSH_BIN}")
    if not OBSERVER_SOURCE.exists():
        raise SystemExit(f"missing observer source: {OBSERVER_SOURCE}")

    root = TOOLS_BIN.parent / f"dsh-mc-v11-{time.strftime('%Y%m%d-%H%M%S')}"
    if root.exists():
        raise SystemExit(f"experiment root already exists: {root}")
    for directory in [
        "workspace", "evidence", "downloads", "artifact", "overlays",
        "plugin-data", "evidence/session-observer",
    ]:
        (root / directory).mkdir(parents=True)

    nonce = secrets.token_hex(16)
    write_text(
        root / "workspace" / "fixture.txt",
        "V11_RANGE_FIXTURE\n"
        "The acceptance nonce is stored in the payload; it must survive the round trip.\n"
        f"nonce={nonce}\n",
    )
    write_text(
        root / "workspace" / "historian-fixture.txt",
        "V11_HISTORIAN_FIXTURE\n"
        "This synthetic transcript exists only so the real Historian has a stable span to publish.\n"
        + "\n".join(f"line {index}: retain the V1.1 provenance marker {nonce}." for index in range(1, 90))
        + "\n",
    )

    shutil.copyfile(OBSERVER_SOURCE, root / "observer.mjs")
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

    bootstrap = dsh("bootstrap-profile", ["--profile", "headless", "--dump-config"], root)
    if bootstrap["exit_code"] != 0:
        raise SystemExit(f"profile bootstrap failed: {bootstrap['stderr']}")
    add = dsh("add-local", ["plugin", "--profile", "headless", "add", str(PACK), "--ignore-scripts"], root, 600)
    if add["exit_code"] != 0:
        raise SystemExit(f"local tarball install failed: {add['stderr']}")

    installed = root / "dsh-home" / "profiles" / "headless" / "node_modules" / "@elvisw" / "dsh-plugin-magic-context"
    if not installed.exists():
        raise SystemExit(f"installed package missing: {installed}")
    installed_pkg = json.loads((installed / "package.json").read_text(encoding="utf-8"))
    if installed_pkg.get("name") != PACKAGE:
        raise SystemExit(f"installed package name mismatch: {installed_pkg.get('name')}")
    if installed_pkg.get("version") != "0.12.3":
        raise SystemExit(f"installed package version mismatch: {installed_pkg.get('version')}")
    profile_pkg = json.loads((root / "dsh-home" / "profiles" / "headless" / "package.json").read_text(encoding="utf-8"))
    profile_spec = profile_pkg.get("dependencies", {}).get(PACKAGE, "")
    if not profile_spec.startswith("file:"):
        raise SystemExit(f"profile dependency is not the local tarball: {profile_spec!r}")

    base = overlay_base(root)
    base.append(observer_entry(root))
    base.append({"insert": [{"id": "acceptance-test-driver", "name": f"file:///{str(root / 'dsh-home' / 'profiles' / 'headless' / 'acceptance-test-driver.mjs').replace(chr(92), '/')}"}]})
    write_text(root / "overlays" / "base.yml", json.dumps(base, indent=2))

    historian = overlay_base(root)
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

    dump = dsh("dump-historian", ["--profile", "headless", "--patch", str(root / "overlays" / "historian.yml"), "--dump-config"], root)
    settle_dump = dsh("dump-settle", ["--profile", "headless", "--patch", str(root / "overlays" / "settle.yml"), "--dump-config"], root)
    if PACKAGE not in dump["stdout"] + dump["stderr"]:
        raise SystemExit("historian dump does not show the scoped package name")
    if "reasoningEffort" not in settle_dump["stdout"]:
        raise SystemExit("settle dump does not show the llm route")

    overlay_texts = {path.name: path.read_text(encoding="utf-8") for path in (root / "overlays").glob("*.yml")}
    for name, text in overlay_texts.items():
        if any(old in text for old in OLD_ROOTS):
            raise SystemExit(f"overlay {name} references an old experiment root")
        if str(root) not in text and root.as_posix() not in text:
            raise SystemExit(f"overlay {name} does not reference this root")

    with tarfile.open(PACK, "r:gz") as package:
        package.extractall(root / "artifact", filter="data")
    artifact = root / "artifact" / "package"
    hashes = {}
    for relative in [
        "lib/index.js",
        "lib/dsh/tool-bridge.js",
        "lib/dsh/seams.js",
    ]:
        hashes[relative] = {"installed": sha256(installed / relative), "artifact": sha256(artifact / relative)}
    if any(value["installed"] != value["artifact"] for value in hashes.values()):
        raise SystemExit("installed package does not match the local tarball")
    bridge_text = (installed / "lib" / "dsh" / "tool-bridge.js").read_text(encoding="utf-8")
    if "renderRangeTranscript" not in bridge_text or "locator" not in bridge_text:
        raise SystemExit("installed tool-bridge does not contain the V1.1 range implementation")

    preflight = {
        "root": str(root),
        "nonce": nonce,
        "package": PACKAGE,
        "version": installed_pkg["version"],
        "profile_specifier": profile_spec,
        "tarball": str(PACK),
        "tarball_sha256": sha256(PACK),
        "installed_hashes": hashes,
        "git_head": subprocess.run(
            ["git", "rev-parse", "HEAD"], cwd=REPO, capture_output=True, text=True,
            encoding="utf-8", errors="replace", timeout=60,
        ).stdout.strip(),
        "git_status": subprocess.run(
            ["git", "status", "--porcelain"], cwd=REPO, capture_output=True, text=True,
            encoding="utf-8", errors="replace", timeout=60,
        ).stdout,
        "git_diff_sha256": sha256_text(subprocess.run(
            ["git", "diff", "--binary"], cwd=REPO, capture_output=True, text=True,
            encoding="utf-8", errors="replace", timeout=60,
        ).stdout),
        "deepseek_key_present": bool(os.environ.get("DEEPSEEK_API_KEY")),
        "host_version": run("host-version", [*DSH_CMD, "--version"], root)["stdout"].strip(),
        "dump_exit": dump["exit_code"],
        "settle_dump_exit": settle_dump["exit_code"],
        "overlays": list(overlay_texts),
        "tool_bridge_has_range": "renderRangeTranscript" in bridge_text,
    }
    write_text(root / "evidence" / "preflight.json", json.dumps(preflight, ensure_ascii=False, indent=2))
    POINTER.write_text(json.dumps({"root": str(root)}, indent=2), encoding="utf-8")
    print(json.dumps({
        "root": str(root),
        "nonce": nonce,
        "tarball_sha256": preflight["tarball_sha256"],
        "installed_hashes": hashes,
        "git_head": preflight["git_head"],
    }, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
