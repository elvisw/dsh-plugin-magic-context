"""Reproduce the T38 report: buttons on a draft remote provider, before/after Save."""

from __future__ import annotations

import json
import os
from pathlib import Path
import re
import subprocess
import sys
import time

REPORT_DIR = Path(__file__).resolve().parent
NODE_EXE = Path(r"C:\Users\elvis\AppData\Local\Author Software\nvm\installs\v24.21.0\node.exe")
DSH_BIN = Path(
    r"C:\Users\elvis\AppData\Local\Temp\opencode\t35-rc5-root2"
    r"\host\node_modules\@deepseek-ai\dsh\lib\bin.js"
)


def host_env(root: Path) -> dict[str, str]:
    env = dict(os.environ)
    for name, sub in {
        "DSH_HOME": "dsh-home", "HOME": "user-home", "USERPROFILE": "user-home",
        "XDG_CONFIG_HOME": "xdg-config", "XDG_DATA_HOME": "xdg-data", "XDG_CACHE_HOME": "xdg-cache",
        "XDG_STATE_HOME": "xdg-state", "APPDATA": "appdata", "LOCALAPPDATA": "localappdata",
        "TEMP": "tmp", "TMP": "tmp",
    }.items():
        env[name] = str(root / sub)
    env["CI"] = "1"
    env["DSH_TELEMETRY_MODE"] = "DISABLED"
    return env


def main() -> None:
    prepare = subprocess.run(
        [sys.executable, str(REPORT_DIR / "prepare_t38.py"), "--fake-port", "9"],
        cwd=REPORT_DIR, capture_output=True, text=True, encoding="utf-8",
    )
    if prepare.returncode != 0:
        raise SystemExit(f"prepare failed: {prepare.stderr}")
    root = Path(json.loads(prepare.stdout)["root"])
    port = 18812
    log_path = root / "evidence" / "probe-server.log"
    log = log_path.open("w", encoding="utf-8")
    process = subprocess.Popen(
        [str(NODE_EXE), str(DSH_BIN), "--profile", "t38", "--no-open", "--host", "127.0.0.1", "--port", str(port)],
        cwd=root / "workspace", env=host_env(root), stdout=log, stderr=subprocess.STDOUT)
    url = None
    deadline = time.time() + 150
    while time.time() < deadline:
        time.sleep(0.5)
        text = log_path.read_text(encoding="utf-8", errors="replace")
        match = re.search(r"http://127\.0\.0\.1:" + str(port) + r"/\?token=[^\s]+", text)
        if match:
            url = match.group(0)
            break
        if process.poll() is not None:
            raise SystemExit("host exited: " + text[-800:])
    if url is None:
        process.terminate()
        raise SystemExit("no url")
    (root / "evidence" / "server.json").write_text(
        json.dumps({"url": url, "port": port, "pid": process.pid, "fake_port": 9}, indent=2) + "\n",
        encoding="utf-8", newline="\n")
    try:
        probe = subprocess.run(["node", str(REPORT_DIR / "t38_probe.cjs")], capture_output=True, text=True, timeout=600)
        print(probe.stdout[-4000:], probe.stderr[-2000:])
    finally:
        process.terminate()
        try:
            process.wait(timeout=10)
        except subprocess.TimeoutExpired:
            process.kill()


if __name__ == "__main__":
    main()
