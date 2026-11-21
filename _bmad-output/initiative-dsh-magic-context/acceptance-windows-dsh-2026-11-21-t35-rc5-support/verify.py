"""T35: install the patch release into an isolated rc.5 host through `dsh plugin add`."""
from __future__ import annotations

import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import socket
import subprocess
import sys
import queue
import threading
import time

PLUGIN = "@elvisw/dsh-magic-context"
RC = "0.2.2-rc.5"
VERSION = "0.18.9"
HOME = Path(os.environ["LOCALAPPDATA"])
NODE = HOME / "Author Software/nvm/installs/v24.21.0/node.exe"
PLAYWRIGHT = Path.home() / "node_modules/.deno/playwright@1.63.0/node_modules/playwright"
EDGE = Path(r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe")
HERE = Path(__file__).resolve().parent
ANSI = re.compile(r"\x1b\[[0-?]*[ -/]*[@-~]")
PROFILE = "t35"


def save(path: Path, value) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def sha(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def home_manifests() -> dict:
    result = {}
    for name in ("package.json", "package-lock.json", "node_modules/.package-lock.json"):
        path = Path.home() / name
        result[name] = {"exists": path.is_file(), "sha256": sha(path) if path.is_file() else None}
    return result


def isolated_env(profile: Path) -> dict:
    env = {key: os.environ[key] for key in (
        "SystemRoot", "SystemDrive", "WINDIR", "ComSpec", "PATHEXT",
        "PROCESSOR_ARCHITECTURE", "NUMBER_OF_PROCESSORS",
        "HTTPS_PROXY", "HTTP_PROXY", "NO_PROXY", "NODE_EXTRA_CA_CERTS",
    ) if key in os.environ}
    paths = {
        "DSH_HOME": "dsh-home", "HOME": "user-home", "USERPROFILE": "user-home",
        "XDG_CONFIG_HOME": "xdg-config", "XDG_DATA_HOME": "xdg-data",
        "XDG_CACHE_HOME": "xdg-cache", "XDG_STATE_HOME": "xdg-state",
        "APPDATA": "appdata", "LOCALAPPDATA": "localappdata", "TEMP": "tmp", "TMP": "tmp",
        "npm_config_cache": "npm-cache", "COREPACK_HOME": "corepack",
        "PNPM_HOME": "pnpm-home",
    }
    for key, name in paths.items():
        target = profile / name
        target.mkdir(exist_ok=True)
        assert target.resolve().is_relative_to(profile.resolve()), key
        env[key] = str(target)
    for key, name in (("npm_config_userconfig", "user.npmrc"), ("npm_config_globalconfig", "global.npmrc")):
        target = profile / name
        target.touch()
        env[key] = str(target)
    env.update({
        "PATH": str(NODE.parent) + os.pathsep + os.environ.get("PATH", ""),
        "CI": "1", "DSH_TELEMETRY_MODE": "DISABLED",
        "npm_config_registry": "https://registry.npmjs.org/",
    })
    return env


def main() -> None:
    root = Path(sys.argv[1]).resolve()
    assert "t35" in root.name.lower() and root.is_dir()
    profile = root / "profile"
    profile.mkdir(exist_ok=True)
    assert profile.resolve().is_relative_to(root.resolve())
    evidence = root / "evidence"
    evidence.mkdir(exist_ok=True)
    tarball = Path(sys.argv[2]).resolve()
    assert tarball.is_file()

    before = home_manifests()
    env = isolated_env(profile)
    assert env["DSH_HOME"] == str(profile / "dsh-home")
    assert Path(env["DSH_HOME"]).resolve().is_relative_to(root)
    assert Path(env["HOME"]).resolve().is_relative_to(root)
    assert Path(env["USERPROFILE"]).resolve().is_relative_to(root)

    resolved = {}
    for key in ("cache", "userconfig", "globalconfig"):
        with __import__("tempfile").TemporaryDirectory() as tmp:
            result = subprocess.run([str(NODE), str(NODE.parent / "node_modules/npm/bin/npm-cli.js"),
                                     "config", "get", key], env=env, capture_output=True, text=True,
                                    encoding="utf-8", errors="replace", cwd=tmp)
        resolved[key] = ANSI.sub("", result.stdout).strip()
    assert Path(resolved["cache"]).resolve().is_relative_to(root), resolved
    assert Path(resolved["userconfig"]).resolve().is_relative_to(root), resolved
    assert Path(resolved["globalconfig"]).resolve().is_relative_to(root), resolved

    pnpm = shutil.which("pnpm") or shutil.which("pnpm.cmd") or shutil.which("pnpm.exe")
    assert pnpm, "pnpm not available"
    pnpm_store = subprocess.run([pnpm, "store", "path"], env=env, capture_output=True, text=True,
                                encoding="utf-8", errors="replace", timeout=120)
    pnpm_globalconfig = subprocess.run([pnpm, "config", "get", "globalconfig"], env=env, capture_output=True,
                                       text=True, encoding="utf-8", errors="replace", timeout=120)
    pnpm_paths = {
        "store": ANSI.sub("", pnpm_store.stdout).strip(),
        "globalconfig": ANSI.sub("", pnpm_globalconfig.stdout).strip(),
    }
    assert pnpm_store.returncode == 0 and Path(pnpm_paths["store"]).resolve().is_relative_to(root), pnpm_paths
    assert pnpm_globalconfig.returncode == 0 and Path(pnpm_paths["globalconfig"]).resolve().is_relative_to(root), pnpm_paths
    isolation = {
        **{key: str(Path(env[key]).resolve()) for key in
           ("DSH_HOME", "HOME", "USERPROFILE", "XDG_CONFIG_HOME", "XDG_DATA_HOME", "XDG_CACHE_HOME",
            "XDG_STATE_HOME", "PNPM_HOME", "npm_config_cache")},
        "pnpmStore": str(Path(pnpm_paths["store"]).resolve()),
        "pnpmGlobalconfig": str(Path(pnpm_paths["globalconfig"]).resolve()),
        "npmResolved": resolved,
    }
    for key, value in isolation.items():
        if key == "npmResolved":
            continue
        assert Path(value).resolve().is_relative_to(root), (key, value)

    host = root / "host"
    npm = [str(NODE), str(NODE.parent / "node_modules/npm/bin/npm-cli.js")]
    install_host = subprocess.run([*npm, "--prefix", str(host), "install", "--no-audit", "--no-fund",
                                   f"@deepseek-ai/dsh@{RC}"], env=env, capture_output=True, text=True,
                                  encoding="utf-8", errors="replace", timeout=900)
    save(evidence / "host-install.json", {
        "exitCode": install_host.returncode, "prefix": str(host.relative_to(root)),
        "cliVersion": RC, "isolation": isolation,
        "diagnostics": ANSI.sub("", install_host.stdout + install_host.stderr).splitlines()[-8:],
    })
    assert install_host.returncode == 0, "host install failed"

    bin_js = host / "node_modules/@deepseek-ai/dsh/lib/bin.js"
    assert bin_js.is_file()
    version = subprocess.run([str(NODE), str(bin_js), "--version"], env=env, capture_output=True, text=True,
                             encoding="utf-8", errors="replace", timeout=120)
    cli_version = ANSI.sub("", version.stdout + version.stderr).strip()
    assert cli_version == RC, cli_version
    saved = json.loads((evidence / "host-install.json").read_text(encoding="utf-8"))
    saved["cliVersion"] = cli_version
    save(evidence / "host-install.json", saved)

    workspace = profile / "workspace"
    workspace.mkdir(exist_ok=True)
    bootstrap = subprocess.run([str(NODE), str(bin_js), "--profile", PROFILE,
                                "--from-default-profile", "web", "--dump-config"],
                               cwd=workspace, env=env, capture_output=True, text=True,
                               encoding="utf-8", errors="replace", timeout=300)
    assert bootstrap.returncode == 0, "profile bootstrap failed"
    config_root = profile / "dsh-home/profiles" / PROFILE
    assert config_root.resolve().is_relative_to(profile)
    assert not (config_root / "compatibility.json").exists()

    add = subprocess.run([str(NODE), str(bin_js), "plugin", "--profile", PROFILE, "add", str(tarball)],
                         cwd=workspace, env=env, capture_output=True, text=True,
                         encoding="utf-8", errors="replace", timeout=900)
    raw = ANSI.sub("", add.stdout + "\n" + add.stderr)
    diagnostics = [line for line in raw.splitlines()
                   if PLUGIN in line or re.search(r"incompatib|allow.version|skipp|ERR_|error", line, re.I)]
    save(evidence / "plugin-add.json", {
        "exitCode": add.returncode, "spec": tarball.name, "diagnostics": diagnostics[-20:],
        "allowVersionUsed": "allow-version" in raw,
    })
    assert add.returncode == 0, "dsh plugin add failed"
    assert "allow-version" not in raw
    assert not re.search(r"incompatib|exact-version exemption|skipping profile plugin", raw, re.I)

    package_path = config_root / "node_modules" / PLUGIN
    assert package_path.is_dir() and package_path.resolve().is_relative_to(profile)
    manifest = json.loads((package_path / "package.json").read_text(encoding="utf-8"))
    assert manifest["name"] == PLUGIN and manifest["version"] == VERSION
    profile_manifest = json.loads((config_root / "package.json").read_text(encoding="utf-8"))
    assert PLUGIN in profile_manifest.get("dependencies", {})
    bundles = profile_manifest.get("dsh", {}).get("profile", {}).get("bundles", [])
    assert PLUGIN in bundles, bundles
    assert not (config_root / "compatibility.json").exists()
    save(evidence / "installed.json", {
        "version": manifest["version"], "enginesDsh": manifest["engines"]["dsh"],
        "dependency": PLUGIN in profile_manifest.get("dependencies", {}),
        "profileBundle": True,
        "tarballSha256": sha(tarball),
    })

    # Real startup: the loader must not skip the row, and the settings section must render.
    with socket.socket() as listener:
        listener.bind(("127.0.0.1", 0))
        port = listener.getsockname()[1]
    child = subprocess.Popen([str(NODE), str(bin_js), "--profile", PROFILE, "--no-open",
                              "--host", "127.0.0.1", "--port", str(port)],
                             cwd=workspace, env=env, stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
                             text=True, encoding="utf-8", errors="replace")
    startup: queue.Queue = queue.Queue()
    lines: list[str] = []
    ready = re.compile(rf"http://127\.0\.0\.1:{port}/\?token=[A-Za-z0-9_.~%+-]+")

    def read_stream() -> None:
        for line in child.stdout:
            clean = ANSI.sub("", line).strip()
            match = ready.search(clean)
            if match:
                startup.put(match.group())
                continue
            if "?token=" in clean or "Bearer " in clean:
                continue
            if re.search(r"magic.context|allow.version|incompatib|skipp|error|warn", clean, re.I):
                lines.append(clean[:900])
        startup.put(None)

    reader = threading.Thread(target=read_stream, daemon=True)
    reader.start()
    url = None
    try:
        try:
            url = startup.get(timeout=120)
        except queue.Empty:
            pass
        assert url, "Web server did not emit the localhost startup URL"
        assert not [line for line in lines if re.search(r"incompatib|skipping profile plugin", line, re.I)]
        assert EDGE.is_file()
        browser = subprocess.run([str(NODE), str(HERE / "web.cjs"), str(PLAYWRIGHT), str(root), "settings",
                                  str(EDGE)], cwd=workspace, env=env,
                                 input=json.dumps({"url": url, "prompts": {}}), text=True,
                                 encoding="utf-8", capture_output=True, timeout=300)
        save(evidence / "settings.json", {
            "exitCode": browser.returncode,
            "failureType": json.loads((evidence / "web-settings.json").read_text(encoding="utf-8")).get("failureType")
            if (evidence / "web-settings.json").is_file() else None,
        })
        assert browser.returncode == 0, "settings Web step failed"
    finally:
        if child.poll() is None:
            child.terminate()
            try:
                child.wait(timeout=10)
            except subprocess.TimeoutExpired:
                child.kill()
                child.wait()
        reader.join(timeout=5)
        save(evidence / "startup.json", {
            "pid": child.pid, "localhostReady": bool(url), "diagnostics": lines[:30],
        })

    after = home_manifests()
    save(evidence / "home-isolation.json", {
        "baseline": "state after the T34 installation incident; the three manifests below were already changed before this run",
        "before": before, "after": after,
        "unchanged": all(before[name] == after[name] for name in before),
    })
    assert all(before[name] == after[name] for name in before), "home manifests changed during the run"
    print(json.dumps({"ok": True, "root": str(root), "version": VERSION, "cli": cli_version}, indent=2))


if __name__ == "__main__":
    main()
