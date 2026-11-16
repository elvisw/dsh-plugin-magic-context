"""Start the isolated T18 DSH Web host and record its authenticated URL."""

from __future__ import annotations

import json
import os
from pathlib import Path
import re
import socket
import subprocess
import time

REPORT_DIR = Path(__file__).resolve().parent
ROOT = Path(json.loads((REPORT_DIR / "experiment-root.json").read_text(encoding="utf-8"))["root"])
NODE_EXE = Path(r"C:\Users\elvis\AppData\Local\Author Software\nvm\installs\v24.21.0\node.exe")
DSH_BIN = Path(
    r"C:\Users\elvis\AppData\Local\Temp\opencode\mc-t0-2026-11-13"
    r"\tools\dsh\node_modules\@deepseek-ai\dsh\lib\bin.js"
)
TOOLS_BIN = Path(r"C:\Users\elvis\AppData\Local\Temp\opencode\mc-t0-2026-11-13\tools\bin")


def free_port() -> int:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        sock.bind(("127.0.0.1", 0))
        return int(sock.getsockname()[1])


def env() -> dict[str, str]:
    paths = {
        "DSH_HOME": ROOT / "dsh-home",
        "HOME": ROOT / "user-home",
        "USERPROFILE": ROOT / "user-home",
        "XDG_DATA_HOME": ROOT / "xdg-data",
        "XDG_CACHE_HOME": ROOT / "xdg-cache",
        "APPDATA": ROOT / "appdata",
        "LOCALAPPDATA": ROOT / "localappdata",
    }
    for path in paths.values():
        path.mkdir(parents=True, exist_ok=True)
    result = dict(os.environ)
    for name, path in paths.items():
        result[name] = str(path)
    result["PATH"] = str(TOOLS_BIN) + os.pathsep + result.get("PATH", "")
    result["CI"] = "1"
    result["DSH_TELEMETRY_MODE"] = "DISABLED"
    return result


def redact(text: str) -> str:
    return re.sub(r"(\?token=)[^\s&\"']+", r"\1<redacted>", text)


def main() -> None:
    port = free_port()
    log_path = ROOT / "evidence" / "server.log"
    log = log_path.open("w", encoding="utf-8")
    process = subprocess.Popen(
        [
            str(NODE_EXE), str(DSH_BIN),
            "--profile", "t18",
            "--patch", str(ROOT / "overlays" / "t18.yml"),
            "--no-open",
            "--port", str(port),
        ],
        cwd=ROOT / "workspace",
        env=env(),
        stdout=log,
        stderr=subprocess.STDOUT,
    )
    deadline = time.time() + 120
    url = None
    text = ""
    while time.time() < deadline:
        time.sleep(0.5)
        text = log_path.read_text(encoding="utf-8", errors="replace")
        match = re.search(r"http://127\.0\.0\.1:" + str(port) + r"/\?token=[^\s]+", text)
        if match is not None:
            url = match.group(0)
            break
        if process.poll() is not None:
            break
    # Keep the live server.log untouched (the running process owns its handle);
    # write a redacted copy as the committable evidence artifact.
    safe_text = redact(log_path.read_text(encoding="utf-8", errors="replace"))
    (ROOT / "evidence" / "server-log.txt").write_text(safe_text, encoding="utf-8", newline="\n")
    state = {
        "pid": process.pid,
        "port": port,
        "url": url,
        "running": process.poll() is None,
        "log": str(log_path),
        "log_tail": safe_text[-4000:],
    }
    (ROOT / "evidence" / "server.json").write_text(json.dumps(state, indent=2) + "\n", encoding="utf-8")
    safe_state = {**state, "url": redact(url or "")}
    (ROOT / "evidence" / "server-redacted.json").write_text(
        json.dumps(safe_state, indent=2) + "\n", encoding="utf-8"
    )
    print(json.dumps(safe_state, indent=2))
    if url is None:
        process.terminate()


if __name__ == "__main__":
    main()
