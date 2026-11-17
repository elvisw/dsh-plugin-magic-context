from __future__ import annotations

import json
import os
from pathlib import Path
import re
import socket
import subprocess
import time

ROOT = Path(r"C:\Users\elvis\AppData\Local\Temp\opencode\dsh-mc-wrapup-20261117-1700")
NODE = Path(r"C:\Users\elvis\AppData\Local\Author Software\nvm\installs\v24.21.0\node.exe")
DSH = Path(r"C:\Users\elvis\AppData\Local\Temp\opencode\mc-t0-2026-11-13\tools\dsh\node_modules\@deepseek-ai\dsh\lib\bin.js")
TOOLS_BIN = Path(r"C:\Users\elvis\AppData\Local\Temp\opencode\mc-t0-2026-11-13\tools\bin")


def free_port() -> int:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        sock.bind(("127.0.0.1", 0))
        return int(sock.getsockname()[1])


def main() -> None:
    for name in ("dsh-home", "user-home", "xdg-data", "xdg-cache", "appdata", "localappdata", "workspace", "plugin-data", "evidence", "screenshots"):
        (ROOT / name).mkdir(parents=True, exist_ok=True)
    port = free_port()
    log_path = ROOT / "evidence" / "server.log"
    log = log_path.open("w", encoding="utf-8")
    env = {
        **os.environ,
        "DSH_HOME": str(ROOT / "dsh-home"),
        "HOME": str(ROOT / "user-home"),
        "USERPROFILE": str(ROOT / "user-home"),
        "XDG_DATA_HOME": str(ROOT / "xdg-data"),
        "XDG_CACHE_HOME": str(ROOT / "xdg-cache"),
        "APPDATA": str(ROOT / "appdata"),
        "LOCALAPPDATA": str(ROOT / "localappdata"),
        "PATH": str(TOOLS_BIN) + os.pathsep + os.environ.get("PATH", ""),
        "CI": "1",
        "DSH_TELEMETRY_MODE": "DISABLED",
    }
    process = subprocess.Popen(
        [
            str(NODE), str(DSH),
            "--profile", "wrapup",
            "--patch", str(ROOT / "overlays" / "wrapup.yml"),
            "--no-open",
            "--port", str(port),
        ],
        cwd=ROOT / "workspace",
        env=env,
        stdout=log,
        stderr=subprocess.STDOUT,
    )
    deadline = time.time() + 120
    url = None
    while time.time() < deadline:
        time.sleep(0.5)
        text = log_path.read_text(encoding="utf-8", errors="replace")
        match = re.search(r"http://127\.0\.0\.1:" + str(port) + r"/\?token=[^\s]+", text)
        if match is not None:
            url = match.group(0)
            break
        if process.poll() is not None:
            break
    if url is None:
        process.terminate()
        raise SystemExit(f"server did not start; log: {log_path}")
    state = {"pid": process.pid, "port": port, "url": url}
    (ROOT / "evidence" / "server.json").write_text(json.dumps(state, indent=2) + "\n", encoding="utf-8", newline="\n")
    safe = re.sub(r"(\?token=)[^\s&\"']+", r"\1<redacted>", log_path.read_text(encoding="utf-8", errors="replace"))
    (ROOT / "evidence" / "server-log.txt").write_text(safe, encoding="utf-8", newline="\n")
    print(json.dumps({"root": str(ROOT), "pid": process.pid, "port": port, "url": "<redacted>"}, indent=2))


if __name__ == "__main__":
    main()
