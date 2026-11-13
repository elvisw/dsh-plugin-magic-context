"""Prepare an isolated DSH acceptance workspace without loading the target plugin."""

from __future__ import annotations

import base64
import hashlib
import json
import os
from pathlib import Path
import re
import subprocess
import tarfile
import tempfile
import urllib.request


REPORT_DIR = Path(__file__).resolve().parent
POINTER = REPORT_DIR / "experiment-root.json"
DSH_EXE = Path(r"C:\Users\elvis\AppData\Local\Author Software\nvm\.nodejs\dsh.exe")


def redact(text: str) -> str:
    for name, value in os.environ.items():
        if re.search(r"KEY|TOKEN|PASSWORD|SECRET", name, re.I) and len(value) >= 8:
            text = text.replace(value, "[REDACTED]")
    return text


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
    for name, path in paths.items():
        path.mkdir(parents=True, exist_ok=True)
        env[name] = str(path)
    env["CI"] = "1"
    env["DSH_TELEMETRY_MODE"] = "DISABLED"
    env["npm_config_store_dir"] = str(root / "pnpm-store")
    env["npm_config_cache"] = str(root / "npm-cache")
    return env


def run_capture(root: Path, name: str, args: list[str]) -> dict[str, object]:
    try:
        result = subprocess.run(
            [str(DSH_EXE), *args], cwd=root / "workspace", env=isolated_env(root),
            capture_output=True, text=True, encoding="utf-8", errors="replace", timeout=30,
        )
        text = redact(result.stdout + "\n--- stderr ---\n" + result.stderr)
        record: dict[str, object] = {"args": args, "exit_code": result.returncode}
    except subprocess.TimeoutExpired as exc:
        text = redact(str(exc))
        record = {"args": args, "status": "timeout"}
    (root / "evidence" / f"{name}.txt").write_text(text, encoding="utf-8")
    return record


def main() -> None:
    if POINTER.exists():
        raise SystemExit("Experiment already prepared; refusing to overwrite its pointer.")
    parent = Path(r"C:\Users\elvis\AppData\Local\Temp\opencode")
    root = Path(tempfile.mkdtemp(prefix="dsh-mc-acceptance-", dir=parent))
    for directory in ["workspace", "evidence", "downloads", "plugin"]:
        (root / directory).mkdir()
    POINTER.write_text(json.dumps({"root": str(root)}, indent=2), encoding="utf-8")
    url = "https://registry.npmjs.org/dsh-plugin-magic-context/0.11.1"
    with urllib.request.urlopen(url, timeout=30) as response:
        metadata = json.load(response)
    archive = root / "downloads" / "dsh-plugin-magic-context-0.11.1.tgz"
    with urllib.request.urlopen(metadata["dist"]["tarball"], timeout=60) as response:
        archive.write_bytes(response.read())
    digest = base64.b64encode(hashlib.sha512(archive.read_bytes()).digest()).decode()
    if f"sha512-{digest}" != metadata["dist"]["integrity"]:
        raise SystemExit("Package integrity mismatch; nothing extracted or executed.")
    with tarfile.open(archive, "r:gz") as package:
        members = package.getmembers()
        if any(member.issym() or member.islnk() for member in members):
            raise SystemExit("Unexpected archive links; refusing extraction.")
        package.extractall(root / "plugin", filter="data")
    (root / "evidence" / "plugin-registry.json").write_text(
        json.dumps(metadata, indent=2), encoding="utf-8",
    )
    records = [
        run_capture(root, "host-version", ["--version"]),
        run_capture(root, "headless-help", ["--profile", "headless", "--help"]),
        run_capture(root, "headless-config", ["--profile", "headless", "--dump-config"]),
    ]
    summary = {"root": str(root), "plugin": metadata["version"], "integrity_verified": True,
               "package_files": len(members), "host_probes": records,
               "deepseek_key_present": bool(os.environ.get("DEEPSEEK_API_KEY"))}
    (root / "evidence" / "preflight.json").write_text(json.dumps(summary, indent=2), encoding="utf-8")
    print(json.dumps(summary, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
