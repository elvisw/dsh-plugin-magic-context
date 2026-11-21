"""Prepare T34 from verified npm tarballs; never use the user's DSH profile."""
from __future__ import annotations

import base64
import gzip
import hashlib
import io
import json
import os
from pathlib import Path
import subprocess
import sys
import tarfile
import tempfile
from urllib.request import urlopen

HOST = "@deepseek-ai/dsh"
RC = "0.2.2-rc.5"
PLUGIN = "@elvisw/dsh-magic-context"
RELEASE = "0.18.8"
CANDIDATE = "0.18.8-t34.rc5.1"
GIT_HEAD = "a72f808e3dd7d7983ae139f2c4c9afd603824216"
HOME = Path(os.environ["LOCALAPPDATA"])
TEMP = HOME / "Temp" / "opencode"
NODE = HOME / "Author Software/nvm/installs/v24.21.0/node.exe"
NPM = NODE.parent / "node_modules/npm/bin/npm-cli.js"
PLAYWRIGHT = Path.home() / "node_modules/.deno/playwright@1.63.0/node_modules/playwright"
REGISTRY = "https://registry.npmjs.org/"
PROFILES = ("release", "candidate")


def save(path, value):
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def isolated_env(profile, *, model=False):
    # An allowlist prevents inherited overrides for DSH paths, npm and credentials.
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
        "npm_config_cache": "npm-cache",
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
        "CI": "1", "DSH_TELEMETRY_MODE": "DISABLED", "npm_config_registry": REGISTRY,
        "COREPACK_HOME": str(profile / "corepack"),
    })
    if model:
        assert profile.name == "candidate" and os.environ.get("DEEPSEEK_API_KEY"), "missing authorized model environment"
        env["DEEPSEEK_API_KEY"] = os.environ["DEEPSEEK_API_KEY"]
    return env


def fetch(package, version, dest):
    with urlopen(f"{REGISTRY}{package.replace('/', '%2F')}/{version}", timeout=30) as response:
        meta = json.load(response)
    assert (meta["name"], meta["version"]) == (package, version)
    dist = meta["dist"]
    assert dist["tarball"].startswith(REGISTRY)
    with urlopen(dist["tarball"], timeout=60) as response:
        data = response.read()
    integrity = "sha512-" + base64.b64encode(hashlib.sha512(data).digest()).decode()
    assert integrity == dist["integrity"]
    dest.write_bytes(data)
    return meta


def members(path):
    with tarfile.open(path, "r:gz") as tar:
        result = {}
        for item in tar:
            assert item.name not in result and item.name.startswith("package/") and ".." not in item.name.split("/")
            assert item.isfile(), item.name
            result[item.name] = (item, tar.extractfile(item).read())
    return result


def repackage(original, candidate):
    before = members(original)
    name = "package/package.json"
    old = json.loads(before[name][1])
    assert (old["name"], old["version"]) == (PLUGIN, RELEASE)
    expected_range = old["engines"]["dsh"] + " || " + RC
    assert RC not in old["engines"]["dsh"].split(" || ")
    new = json.loads(before[name][1])
    new["engines"]["dsh"] = expected_range
    new["version"] = CANDIDATE
    payload = json.dumps(new, ensure_ascii=False, indent=2).encode() + b"\n"
    with candidate.open("wb") as target, gzip.GzipFile(filename="", fileobj=target, mode="wb", mtime=0) as zipped:
        with tarfile.open(fileobj=zipped, mode="w", format=tarfile.PAX_FORMAT) as tar:
            for key, (item, data) in before.items():
                if key == name:
                    data = payload
                item.size = len(data)
                tar.addfile(item, io.BytesIO(data))
    after = members(candidate)
    assert list(before) == list(after)
    changed = [key for key in before if before[key][1] != after[key][1]]
    assert changed == [name], changed
    for key in before:
        for field in ("mode", "mtime", "uid", "gid", "uname", "gname", "type", "linkname", "pax_headers"):
            assert getattr(before[key][0], field) == getattr(after[key][0], field), (key, field)
    check = json.loads(after[name][1])
    assert check["version"] == CANDIDATE and check["engines"]["dsh"] == expected_range
    check["version"], check["engines"]["dsh"] = old["version"], old["engines"]["dsh"]
    assert check == old
    return {
        "members": len(before), "onlyChangedPayload": changed,
        "fields": {"version": [RELEASE, CANDIDATE], "engines.dsh": [old["engines"]["dsh"], expected_range]},
        "releaseSha256": hashlib.sha256(original.read_bytes()).hexdigest(),
        "candidateSha256": hashlib.sha256(candidate.read_bytes()).hexdigest(),
    }


def host_cmd(root):
    return [str(NODE), str(root / "host/node_modules/@deepseek-ai/dsh/lib/bin.js")]


def checked_root(path):
    root = path.resolve(strict=True)
    assert root.parent == TEMP.resolve() and root.name.startswith("dsh-mc-t34-rc5-")
    return root


def prepare_artifacts():
    root = Path(tempfile.mkdtemp(prefix="dsh-mc-t34-rc5-", dir=TEMP)).resolve()
    print(f"T34 root: {root}", flush=True)
    for name in ("evidence", "host", "downloads", *PROFILES):
        (root / name).mkdir()
    for name in PROFILES:
        profile = root / name
        for directory in ("workspace", "plugin-data"):
            (profile / directory).mkdir()
        isolated_env(profile)
    node = subprocess.check_output([NODE, "--version"], text=True).strip()
    assert node == "v24.21.0"
    host_tar = root / "downloads/dsh-0.2.2-rc.5.tgz"
    release_tar = root / "downloads/dsh-magic-context-0.18.8.tgz"
    candidate = root / f"downloads/dsh-magic-context-{CANDIDATE}.tgz"
    host_meta = fetch(HOST, RC, host_tar)
    plugin_meta = fetch(PLUGIN, RELEASE, release_tar)
    assert plugin_meta["gitHead"] == GIT_HEAD
    proof = repackage(release_tar, candidate)
    proof.update({
        "node": node, "hostSpec": f"{HOST}@{RC}", "hostIntegrity": host_meta["dist"]["integrity"],
        "releaseSpec": f"{PLUGIN}@{RELEASE}", "releaseIntegrity": plugin_meta["dist"]["integrity"],
        "releaseGitHead": plugin_meta["gitHead"], "profileRoots": list(PROFILES),
    })
    save(root / "evidence/artifacts.json", proof)
    return root


def install_host(root, *, allow_mirror=False):
    proof = json.loads((root / "evidence/artifacts.json").read_text(encoding="utf-8"))
    host_tar = root / "downloads/dsh-0.2.2-rc.5.tgz"
    assert proof["hostIntegrity"] == "sha512-" + base64.b64encode(hashlib.sha512(host_tar.read_bytes()).digest()).decode()
    flags = []
    if allow_mirror:
        # npm 12 blocks the host graph's explicit Playwright URL by default.
        # Only opt in for this isolated subprocess, after verifying mirror bytes.
        url = "https://registry.npmmirror.com/playwright/-/playwright-1.60.0.tgz"
        with urlopen(REGISTRY + "playwright/1.60.0", timeout=30) as response:
            expected = json.load(response)["dist"]["integrity"]
        with urlopen(url, timeout=30) as response:
            actual = "sha512-" + base64.b64encode(hashlib.sha512(response.read()).digest()).decode()
        assert actual == expected, "Playwright mirror bytes differ from npm registry"
        flags.append("--allow-remote=all")
        proof["hostInstallResume"] = {"prior": "EALLOWREMOTE", "playwrightMirrorIntegrityMatched": actual}
    # npm walks upward to find a package root even when cwd and its cache
    # are isolated. Anchor the operation and fail closed if npm disagrees.
    install_root = (root / "host").resolve(strict=True)
    if not install_root.is_relative_to(root):
        raise RuntimeError("Host installation directory is outside the experiment root")
    manifest = install_root / "package.json"
    if not manifest.exists():
        save(manifest, {"name": "dsh-t34-host-install", "version": "0.0.0", "private": True})
    env = isolated_env(install_root)
    npm = [NODE, NPM, "--prefix", str(install_root)]
    prefix = subprocess.check_output([*npm, "prefix"], cwd=install_root, env=env, text=True, timeout=15)
    if Path(prefix.strip()).resolve() != install_root:
        raise RuntimeError("npm prefix does not resolve to the experiment host directory")
    install = subprocess.run(
        [*npm, "install", "--ignore-scripts", "--no-audit", "--no-fund", *flags, str(host_tar)],
        cwd=install_root, env=env,
        text=True, capture_output=True, timeout=420,
    )
    if install.returncode:
        print(f"Official host installation failed (exit {install.returncode}); npm logs in isolated cache")
        raise SystemExit(1)
    command = host_cmd(root)
    actual = subprocess.check_output([*command, "--version"], cwd=root / "release/workspace",
                                     env=isolated_env(root / "release"), text=True, timeout=60).strip()
    assert actual == RC, f"unexpected host version: {actual!r}"
    proof["hostCliVersion"] = actual
    save(root / "evidence/artifacts.json", proof)
    print("Verified isolated rc.5 host and both artifacts.", flush=True)


if __name__ == "__main__":
    if len(sys.argv) == 1:
        install_host(prepare_artifacts())
    elif len(sys.argv) == 3 and sys.argv[1] == "--resume-with-verified-mirror":
        install_host(checked_root(Path(sys.argv[2])), allow_mirror=True)
    else:
        raise SystemExit("usage: prepare.py [--resume-with-verified-mirror ROOT]")
