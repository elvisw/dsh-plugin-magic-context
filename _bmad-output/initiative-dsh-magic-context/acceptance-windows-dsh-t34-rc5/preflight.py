"""Install into two isolated Web profiles and verify real startup before any prompt."""
from __future__ import annotations

from contextlib import contextmanager
import hashlib
import json
import os
from pathlib import Path
import queue
import re
import shutil
import socket
import subprocess
import sys
import threading
import time

from prepare import (CANDIDATE, NODE, PLAYWRIGHT, PLUGIN, RC, RELEASE, checked_root,
                     host_cmd, isolated_env, members, save)

HERE = Path(__file__).resolve().parent
PROFILE = "t34"
ANSI = re.compile(r"\x1b\[[0-?]*[ -/]*[@-~]")
OBSERVER = HERE.parent / "acceptance-windows-dsh-2026-11-13/observer.mjs"
EDGE = Path(r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe")


def check_root(path):
    root = checked_root(path)
    assert json.loads((root / "evidence/artifacts.json").read_text())["hostCliVersion"] == RC
    return root


def checked_dsh(root, name, args, label):
    profile = root / name
    result = subprocess.run([*host_cmd(root), *args], cwd=profile / "workspace",
                            env=isolated_env(profile), capture_output=True, text=True,
                            encoding="utf-8", errors="replace", timeout=400)
    # These operations run without model credentials. Retain only bounded diagnostics.
    raw = ANSI.sub("", result.stdout + "\n" + result.stderr)
    relevant = [line for line in raw.splitlines()
                if PLUGIN in line or re.search(r"\b(error|warning|ERR_PNPM)\b", line, re.I)]
    artifact = {"exitCode": result.returncode, "diagnostics": relevant[-15:]}
    save(root / "evidence" / f"{name}-{label}.json", artifact)
    assert result.returncode == 0, f"{name} {label} exited {result.returncode}"


def configure(root, name):
    profile = root / name
    config_root = profile / "dsh-home/profiles" / PROFILE
    assert config_root.resolve().is_relative_to(profile.resolve())
    assert not (config_root / "compatibility.json").exists(), "unexpected profile compatibility file"
    override = {
        "id": "magic-context-dsh", "name": PLUGIN, "config": {
            "dataDir": (profile / "plugin-data").as_posix(),
            "registerCompactionEngine": False, "historianEnabled": False,
            "policy": {"executeThreshold": 100, "ttlMs": 999999999},
            "maintenance": {"enabled": False},
            "memory": {"embedBackfill": False, "vectorBackfill": False,
                       "global": {"machine": {"enabled": False},
                                  "user": {"render": False, "collect": False, "review": False}}},
        },
    }
    inserts = [{
        "id": "llm-deepseek", "name": "@deepseek-ai/dsh-llm-deepseek-api-key",
        "config": {"apiKeyEnv": "DEEPSEEK_API_KEY", "thinking": "disabled"},
    }, {
        "id": "session-title-llm", "name": "@deepseek-ai/dsh-session-title-first-prompt-llm", "disabled": True,
    }]
    if name == "candidate":
        # The package declares dsh.bundle: selecting it as a profile bundle loads
        # its patch layer and the Web client half, which a bare plugin row omits.
        manifest_path = config_root / "package.json"
        manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
        bundles = manifest.setdefault("dsh", {}).setdefault("profile", {}).setdefault("bundles", [])
        if PLUGIN not in bundles:
            bundles.append(PLUGIN)
            save(manifest_path, manifest)
        observed = profile / "observer"
        observed.mkdir(exist_ok=True)
        observer_module = config_root / "acceptance-observer.mjs"
        observer_module.write_bytes(OBSERVER.read_bytes())
        inserts.append({
            "id": "acceptance-observer", "name": observer_module.as_uri(), "config": {"outDir": observed.as_posix()},
        })
    if name == "candidate":
        patch = [override, {"insert": inserts}]
    else:
        patch = [{"insert": [override, *inserts]}]
    # This dedicated isolated profile owns the file; a deterministic rewrite also
    # drops host-written UI state such as the welcome-notice version.
    save(config_root / "cordis.patch.yml", patch)
    return config_root


def installed(root, name):
    profile = root / name
    config_root = profile / "dsh-home/profiles" / PROFILE
    package_path = config_root / "node_modules" / PLUGIN
    assert package_path.is_dir() and package_path.resolve().is_relative_to(profile.resolve())
    version = RELEASE if name == "release" else CANDIDATE
    tar = root / "downloads" / f"dsh-magic-context-{version}.tgz"
    expected = members(tar)
    actual = {p.relative_to(package_path).as_posix() for p in package_path.rglob("*") if p.is_file()}
    assert actual == {key.removeprefix("package/") for key in expected}, "installed member list differs"
    for key, (_, data) in expected.items():
        path = package_path / key.removeprefix("package/")
        assert path.resolve().is_relative_to(profile.resolve()) and path.read_bytes() == data, key
    manifest = json.loads((package_path / "package.json").read_text(encoding="utf-8"))
    assert manifest["name"] == PLUGIN and manifest["version"] == version
    profile_manifest = json.loads((config_root / "package.json").read_text(encoding="utf-8"))
    assert PLUGIN in profile_manifest["dependencies"]
    if name == "candidate":
        assert PLUGIN in profile_manifest["dsh"]["profile"]["bundles"], "candidate is not selected as a profile bundle"
    save(root / "evidence" / f"{name}-installed.json", {
        "spec": f"{PLUGIN}@{version}", "packagePath": package_path.relative_to(root).as_posix(),
        "matchedTarMembers": len(actual), "tarSha256": hashlib.sha256(tar.read_bytes()).hexdigest(),
        "dshEngine": manifest["engines"]["dsh"], "isolationRoot": name,
        "profileBundle": name == "candidate",
    })


def install(root, name):
    profile = root / name
    config_root = profile / "dsh-home/profiles" / PROFILE
    if not (config_root / "package.json").is_file():
        checked_dsh(root, name, [PROFILE, "--from-default-profile", "web", "--dump-config"], "bootstrap")
    spec = (f"{PLUGIN}@{RELEASE}" if name == "release" else
            str(root / "downloads" / f"dsh-magic-context-{CANDIDATE}.tgz"))
    # rc.5 `dsh plugin add` pre-rejects the published version and would leave
    # nothing for Web startup to reject. Install package bytes without invoking
    # the plugin manager so the real boot loader can exercise its own check.
    if not (config_root / "node_modules" / PLUGIN / "package.json").is_file():
        pnpm = shutil.which("pnpm.exe") or shutil.which("pnpm.cmd")
        assert pnpm, "pnpm not available"
        env = isolated_env(profile)
        env["PNPM_HOME"] = str(profile / "pnpm-home")
        result = subprocess.run([pnpm, "add", "--ignore-scripts", "--store-dir", str(profile / "pnpm-store"),
                                 "--registry", env["npm_config_registry"], spec],
                                cwd=config_root, env=env, capture_output=True, text=True,
                                encoding="utf-8", errors="replace", timeout=360)
        save(root / "evidence" / f"{name}-add.json", {
            "exitCode": result.returncode, "method": "isolated pnpm add",
            "diagnostics": ANSI.sub("", result.stdout + "\n" + result.stderr).splitlines()[-10:],
        })
        assert result.returncode == 0, f"{name}: isolated pnpm add failed"
    # Reruns after a later-phase failure keep the same composition; the patch is
    # idempotent, so the already verified package bytes are never installed twice.
    configure(root, name)
    assert not (config_root / "compatibility.json").exists(), "unexpected profile compatibility file"
    installed(root, name)


@contextmanager
def web_host(root, name, phase, *, model=False):
    profile = root / name
    with socket.socket() as listener:
        listener.bind(("127.0.0.1", 0))
        port = listener.getsockname()[1]
    command = [*host_cmd(root), "--profile", PROFILE, "--no-open", "--host", "127.0.0.1", "--port", str(port)]
    child = subprocess.Popen(command, cwd=profile / "workspace", env=isolated_env(profile, model=model),
                             stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True,
                             encoding="utf-8", errors="replace")
    startup = queue.Queue()
    lines = []
    credentials = [os.environ.get("DEEPSEEK_API_KEY")] if model else []
    ready = re.compile(rf"http://127\.0\.0\.1:{port}/\?token=[A-Za-z0-9_.~%+-]+")

    def read_stream():
        for line in child.stdout:
            clean = ANSI.sub("", line).strip()
            match = ready.search(clean)
            if match:
                startup.put(match.group())
                continue  # Never save, print or serialize the Web auth URL.
            if "?token=" in clean or "Bearer " in clean:
                continue
            for credential in credentials:
                if credential:
                    clean = clean.replace(credential, "<redacted>")
            if re.search(r"magic.context|allow.version|error|warn", clean, re.I):
                lines.append(clean[:900])
        startup.put(None)

    reader = threading.Thread(target=read_stream, daemon=True)
    reader.start()
    url = None
    try:
        try:
            url = startup.get(timeout=100)
        except queue.Empty:
            pass
        assert url, f"{phase}: Web server did not emit localhost startup URL"
        yield url, child.pid, lines
    finally:
        if child.poll() is None:
            child.terminate()
            try:
                child.wait(timeout=10)
            except subprocess.TimeoutExpired:
                child.kill()
                child.wait()
        reader.join(timeout=5)
        save(root / "evidence" / f"{phase}-startup.json", {
            "phase": phase, "profile": name, "pid": child.pid, "localhostReady": bool(url),
            "modelCredentialPassed": model, "diagnostics": lines[:30],
        })


def browser(root, url, stage, prompts=None):
    assert EDGE.is_file(), "installed Microsoft Edge is required for the Web steps"
    result = subprocess.run(
        [NODE, HERE / "web.cjs", str(PLAYWRIGHT), str(root), stage, str(EDGE)],
        cwd=root / "candidate/workspace", env=isolated_env(root / "candidate"),
        input=json.dumps({"url": url, "prompts": prompts or {}}), text=True,
        encoding="utf-8", capture_output=True, timeout=460,
    )
    assert result.returncode == 0, f"Web step failed: {stage}; see phase result in isolated evidence"


def main():
    root = check_root(Path(sys.argv[1]))
    # A resume after the candidate phase failed keeps the already captured release rejection.
    if "--candidate-only" not in sys.argv:
        install(root, "release")
        with web_host(root, "release", "release-web") as (_, __, lines):
            deadline = time.monotonic() + 10
            while time.monotonic() < deadline:
                refusals = [line for line in lines if re.search(r"incompatib|skipp|not compatib", line, re.I)
                            and re.search(r"magic.context|engines\.dsh|allow.version", line, re.I)]
                if refusals:
                    break
                time.sleep(.15)
            assert refusals, "no version rejection in actual release Web startup"
            assert any(RC in line for line in refusals), "rejection did not name rc.5"
            assert any(re.search(r"Exact-version exemption: not active", line, re.I)
                       for line in refusals), "startup did not establish absence of version waiver"
        print("Release Web startup reproduced version rejection.", flush=True)
    install(root, "candidate")
    with web_host(root, "candidate", "candidate-preflight") as (url, _, __):
        browser(root, url, "settings")
        db = root / "candidate/plugin-data/dsh-magic-context.db"
        assert db.is_file() and db.resolve().is_relative_to((root / "candidate").resolve())
    save(root / "evidence/non-model-preflight.json", {"passed": True})
    print("Candidate bytes and Web settings passed without a model call.", flush=True)


if __name__ == "__main__":
    main()
