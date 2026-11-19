"""Isolated install smoke for the published 0.18.1.

What this can prove, and what it deliberately does not:

- **Proves:** the registry artifact installs into a fresh profile, the loader row is
  present, and the installed `lib/index.js` is byte-identical to the build the unit tests
  ran against. That byte identity is what carries the schema assertions in
  `tests/config-schema.spec.ts` over to the published artifact.
- **Does not prove:** loader-level schema validation. `--dump-config` echoes the composed
  loader rows and never mounts the plugin, so it cannot exercise the schema; and importing
  the installed `lib/index.js` needs `@deepseek-ai/schemastery`, which the host provides and
  an isolated profile does not have. Running a real host would mean a model call for a
  change whose browser client and vendor payload are byte-identical to 0.18.0.

Everything lives under a fresh %TEMP% root; the daily ~/.dsh is never touched.
"""
import hashlib
import json
import os
import pathlib
import shutil
import subprocess
import sys

ROOT = pathlib.Path(os.environ["TEMP"]) / "opencode" / "v0181-smoke"
REPO = pathlib.Path(__file__).resolve().parents[3]
NODE = shutil.which("node") or "node"
DSH_BIN = (pathlib.Path(os.environ["TEMP"]) / "opencode" / "mc-t0-2026-11-13" / "tools"
           / "dsh" / "node_modules" / "@deepseek-ai" / "dsh" / "lib" / "bin.js")
SPEC = "@elvisw/dsh-magic-context@0.18.1"
ROW = "magic-context-dsh"
PROFILE = ROOT / "dsh-home" / "profiles" / "headless"
INSTALLED = PROFILE / "node_modules" / "@elvisw" / "dsh-magic-context"

if not DSH_BIN.exists():
    raise SystemExit(f"dsh entrypoint missing: {DSH_BIN}")


def sha256(path: pathlib.Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def env():
    e = dict(os.environ)
    e["DSH_HOME"] = str(ROOT / "dsh-home")
    e["HOME"] = str(ROOT / "home")
    e["USERPROFILE"] = str(ROOT / "home")
    e.pop("SILICONFLOW_API_KEY", None)
    e.pop("DEEPSEEK_API_KEY", None)
    return e


def run(label, cmd, timeout=600):
    proc = subprocess.run(
        cmd, cwd=str(ROOT), env=env(), capture_output=True, text=True,
        encoding="utf-8", errors="replace", timeout=timeout,
    )
    evidence = ROOT / "evidence"
    evidence.mkdir(parents=True, exist_ok=True)
    (evidence / f"{label}.txt").write_text(
        f"$ {' '.join(str(c) for c in cmd)}\nexit={proc.returncode}\n"
        f"--- stdout ---\n{proc.stdout}\n--- stderr ---\n{proc.stderr}",
        encoding="utf-8", newline="\n")
    return proc


def main():
    if ROOT.exists():
        shutil.rmtree(ROOT, ignore_errors=True)
    for name in ("dsh-home", "home", "workspace"):
        (ROOT / name).mkdir(parents=True)

    install = run("install", [NODE, str(DSH_BIN), "plugin", "--profile", "headless", "add", SPEC, "--ignore-scripts"])
    if install.returncode != 0:
        raise SystemExit(f"install failed: {install.stderr[:500]}")

    profile_pkg = json.loads((PROFILE / "package.json").read_text(encoding="utf-8"))
    version = profile_pkg["dependencies"].get("@elvisw/dsh-magic-context")

    dump = run("dump-config", [NODE, str(DSH_BIN), "--profile", "headless", "--dump-config"])
    dump_text = dump.stdout + dump.stderr

    installed_index = INSTALLED / "lib" / "index.js"
    repo_index = REPO / "lib" / "index.js"
    installed_bytes = installed_index.read_text(encoding="utf-8")

    # Independent of byte identity: the four unions and their constants are present in the
    # shipped file, with the labels the phone shows.
    enum_markers = {
        "provider": ["z.const('local')", "z.const('openai-compatible')", "z.const('off')"],
        "preset": ["z.const('siliconflow')", "z.const('custom')"],
        "authHeader": ["z.const('authorization')", "z.const('api-key')"],
        "journalLevel": ["z.const('info')", "z.const('warn')", "z.const('error')"],
    }
    markers_ok = all(
        all(marker in installed_bytes for marker in markers)
        for markers in enum_markers.values()
    )

    checks = {
        "installExitZero": install.returncode == 0,
        "installedVersion": version,
        "dumpExitZero": dump.returncode == 0,
        "pluginRowPresent": ROW in dump_text,
        "installedMatchesTestedBuild": sha256(installed_index) == sha256(repo_index),
        "installedLibSha256": sha256(installed_index),
        "enumConstantsPresent": markers_ok,
        "stayedOutOfDailyHome": "Users\\elvis\\.dsh" not in dump_text,
    }
    hard = [v for k, v in checks.items() if k not in ("installedVersion", "installedLibSha256")]
    result = {
        "spec": SPEC,
        "root": str(ROOT),
        "checks": checks,
        "allPass": all(hard),
        "notCovered": [
            "loader-level schema validation (dump-config echoes composed rows; it does not mount the plugin)",
            "any model call",
            "the phone rendering itself",
        ],
    }
    (ROOT / "evidence" / "smoke.json").write_text(
        json.dumps(result, indent=2) + "\n", encoding="utf-8", newline="\n")
    print(json.dumps(result, indent=2))
    return 0 if result["allPass"] else 1


if __name__ == "__main__":
    sys.exit(main())
