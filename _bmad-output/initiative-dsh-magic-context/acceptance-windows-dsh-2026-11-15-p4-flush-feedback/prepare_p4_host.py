"""Prepare a fresh isolated DSH profile for the P4 `/ctx-flush` feedback gate.

This script does not copy any prior experiment profile. It bootstraps a new
headless profile, installs the locally packed build, and writes a new observer,
test-only command driver and scoped overlays. The daily DSH profile is never
used.
"""

from __future__ import annotations

import hashlib
import json
import os
from pathlib import Path
import secrets
import subprocess
import sys
import time

REPORT_DIR = Path(__file__).resolve().parent
REPO = Path(r"C:\Users\elvis\Documents\dev\plugin\dsh-plugin-magic-context")
PACKAGE = "@elvisw/dsh-plugin-magic-context"
PACK = Path(r"C:\Users\elvis\AppData\Local\Temp\opencode\p4-host-pack\elvisw-dsh-plugin-magic-context-0.12.2.tgz")
NODE_EXE = Path(r"C:\Users\elvis\AppData\Local\Author Software\nvm\installs\v24.21.0\node.exe")
DSH_BIN = Path(
    r"C:\Users\elvis\AppData\Local\Temp\opencode\mc-t0-2026-11-13"
    r"\tools\dsh\node_modules\@deepseek-ai\dsh\lib\bin.js"
)
DSH_CMD = [str(NODE_EXE), str(DSH_BIN)]
TOOLS_BIN = Path(r"C:\Users\elvis\AppData\Local\Temp\opencode\mc-t0-2026-11-13\tools\bin")
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
            "id": "p4-observer",
            "name": f"file:///{str(root / 'observer.mjs').replace(chr(92), '/')}",
            "config": {"outDir": str(root / "evidence" / "session-observer").replace("\\", "/")},
        }],
    }


def driver_entry(root: Path) -> dict:
    return {
        "insert": [{
            "id": "p4-flush-driver",
            "name": f"file:///{str(root / 'driver-flush.mjs').replace(chr(92), '/')}",
        }],
    }


def main() -> None:
    if POINTER.exists():
        raise SystemExit("P4 experiment already prepared; refusing to overwrite its pointer.")
    if not NODE_EXE.exists() or not DSH_BIN.exists():
        raise SystemExit(f"missing DSH runtime: {NODE_EXE} / {DSH_BIN}")
    if not PACK.exists():
        raise SystemExit(f"missing local P4 tarball: {PACK}")

    root = TOOLS_BIN.parent / f"dsh-mc-p4-{time.strftime('%Y%m%d-%H%M%S')}"
    if root.exists():
        raise SystemExit(f"experiment root already exists: {root}")
    for directory in [
        "workspace", "evidence", "overlays", "plugin-data",
        "evidence/session-observer",
    ]:
        (root / directory).mkdir(parents=True)

    nonce = secrets.token_hex(16)
    write_text(
        root / "workspace" / "fixture.txt",
        "P4_FLUSH_FEEDBACK_FIXTURE\n"
        "The acceptance nonce is stored in the payload; it must survive the round trip.\n"
        f"nonce={nonce}\n",
    )

    write_text(root / "observer.mjs", """// P4 test-only instrumentation: record real host events for the command window.
import { appendFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

export const name = 'dsh-p4-observer';

export function apply(ctx, config) {
  mkdirSync(config.outDir, { recursive: true });
  const secrets = Object.entries(process.env)
    .filter(([key, value]) => /KEY|TOKEN|PASSWORD|SECRET/i.test(key) && value?.length >= 8)
    .map(([, value]) => value);
  ctx.on('session/event', (session, event) => {
    if (!['user/message', 'assistant/message', 'tool/result', 'command/run', 'command/done', 'compaction/end'].includes(event.type)) return;
    let text = JSON.stringify({
      processId: process.pid,
      sessionId: session.id,
      trigger: { type: event.type, seq: event.seq },
      surface: [...session.surface.nodes],
      events: session.snapshotEvents(),
    });
    for (const secret of secrets) text = text.replaceAll(secret, '[REDACTED]');
    appendFileSync(join(config.outDir, `${session.id.replace(/[^a-zA-Z0-9_-]/g, '_')}.jsonl`), `${text}\\n`, 'utf8');
  });
}
""")

    # Test-only command driver: exactly one real commands.execute per process.
    write_text(root / "driver-flush.mjs", """// P4 test-only command driver. One execute per process, real registry only.
import { appendFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';

export const name = 'dsh-p4-flush-driver';
export const inject = ['commands'];

export function apply(ctx) {
  const target = process.env.P4_SESSION_ID;
  const outFile = process.env.P4_FLUSH_EVIDENCE;
  const dbPath = process.env.P4_DB;
  if (!target || !outFile || !dbPath) throw new Error('P4_SESSION_ID, P4_FLUSH_EVIDENCE and P4_DB are required');
  const count = (table, extra = '') => {
    const db = new DatabaseSync(dbPath);
    try {
      const row = db.prepare(`SELECT COUNT(*) AS n FROM ${table} WHERE session_id = ?${extra}`).get(target);
      return Number(row.n);
    } finally {
      db.close();
    }
  };
  let executed = false;
  ctx.inject(['commands'], scope => {
    scope.on('agent/created', async ({ agent }) => {
      if (executed || agent.session.id !== target) return;
      executed = true;
      const definition = scope.commands.find(agent, 'ctx-flush');
      const record = {
        processId: process.pid,
        sessionId: agent.session.id,
        target,
        definition: definition === undefined ? null : { name: definition.name, description: definition.description },
      };
      appendFileSync(outFile, `${JSON.stringify(record)}\\n`, 'utf8');
      if (definition === undefined) return;
      try {
        const before = {
          usage: count('usage_records'),
          pending: count('pending_drops'),
          tags: count('tags'),
          dropLanded: count('journal', " AND kind = 'drop-landed'"),
        };
        const execution = await scope.commands.execute(agent, '/ctx-flush', [], new AbortController().signal);
        const after = {
          usage: count('usage_records'),
          pending: count('pending_drops'),
          tags: count('tags'),
          dropLanded: count('journal', " AND kind = 'drop-landed'"),
        };
        appendFileSync(outFile, `${JSON.stringify({
          ...record,
          before,
          after,
          execution: execution === undefined ? null : {
            commandId: execution.commandId,
            kind: execution.result.kind,
            text: execution.result.text ?? null,
          },
        })}\\n`, 'utf8');
      } catch (error) {
        appendFileSync(outFile, `${JSON.stringify({ ...record, error: String(error) })}\\n`, 'utf8');
      }
    });
  });
}
""")

    bootstrap = dsh("bootstrap-profile", ["--profile", "headless", "--dump-config"], root)
    if bootstrap["exit_code"] != 0:
        raise SystemExit(f"profile bootstrap failed: {bootstrap['stderr']}")

    add = dsh("add-local", ["plugin", "--profile", "headless", "add", str(PACK), "--ignore-scripts"], root, 600)
    if add["exit_code"] != 0:
        raise SystemExit(f"local install failed (blocked): {add['stderr']}")

    installed = root / "dsh-home" / "profiles" / "headless" / "node_modules" / "@elvisw" / "dsh-plugin-magic-context"
    if not installed.exists():
        raise SystemExit(f"installed package missing: {installed}")
    lib = installed / "lib" / "dsh" / "flush-command.js"
    built = REPO / "lib" / "dsh" / "flush-command.js"
    if sha256(lib) != sha256(built):
        raise SystemExit("installed flush-command.js does not match the local build")

    seed = overlay_base(root)
    seed.append(observer_entry(root))
    write_text(root / "overlays" / "p4-seed.yml", json.dumps(seed, indent=2))

    flush = overlay_base(root)
    flush.append(observer_entry(root))
    flush.append(driver_entry(root))
    write_text(root / "overlays" / "p4-flush.yml", json.dumps(flush, indent=2))

    for overlay_path in (root / "overlays" / "p4-seed.yml", root / "overlays" / "p4-flush.yml"):
        text = overlay_path.read_text(encoding="utf-8")
        for marker in ("dsh-mc-t3-", "dsh-mc-t4-", "dsh-mc-combined-", "dsh-mc-p4-20261115-112657"):
            if marker in text:
                raise SystemExit(f"overlay references an old root marker {marker}: {overlay_path}")
        if root.as_posix() not in text and str(root) not in text:
            raise SystemExit(f"overlay does not point at the new root: {overlay_path}")

    head = subprocess.run(
        ["git", "rev-parse", "HEAD"], cwd=REPO, capture_output=True, text=True, check=True,
    ).stdout.strip()
    preflight = {
        "root": str(root),
        "package": PACKAGE,
        "version": "0.12.2",
        "tarball": str(PACK),
        "tarballSha256": sha256(PACK),
        "gitHead": head,
        "installedFlushCommandSha256": sha256(lib),
        "builtFlushCommandSha256": sha256(built),
        "profile": str(root / "dsh-home" / "profiles" / "headless"),
        "overlays": {
            "seed": str(root / "overlays" / "p4-seed.yml"),
            "flush": str(root / "overlays" / "p4-flush.yml"),
        },
        "seedPrompt": "read fixture.txt once, note the actual tag, ctx_reduce that tag only",
        "nonce": nonce,
    }
    (root / "evidence" / "preflight.json").write_text(json.dumps(preflight, ensure_ascii=False, indent=2), encoding="utf-8")
    POINTER.write_text(json.dumps({"root": str(root)}, indent=2), encoding="utf-8")
    print(json.dumps({"root": str(root), "preflight": preflight}, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    try:
        main()
    except Exception as exc:
        print(f"P4 prepare failed: {exc}", file=sys.stderr)
        raise
