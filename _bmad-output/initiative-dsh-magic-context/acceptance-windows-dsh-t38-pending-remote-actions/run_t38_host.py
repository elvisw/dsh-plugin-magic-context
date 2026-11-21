"""Start the fake embedding server and one isolated DSH host, then run the T38 gate."""

from __future__ import annotations

import json
import os
from pathlib import Path
import re
import socket
import subprocess
import sys
import time

REPORT_DIR = Path(__file__).resolve().parent
NODE_EXE = Path(r"C:\Users\elvis\AppData\Local\Author Software\nvm\installs\v24.21.0\node.exe")
DSH_BIN = Path(
    r"C:\Users\elvis\AppData\Local\Temp\opencode\t35-rc5-root2"
    r"\host\node_modules\@deepseek-ai\dsh\lib\bin.js"
)


def free_port() -> int:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        sock.bind(("127.0.0.1", 0))
        port = int(sock.getsockname()[1])
    return port if port <= 16000 else 18000 + (port % 500)


def redact(text: str) -> str:
    return re.sub(r"(\?token=)[^\s&\"']+", r"\1<redacted>", text)


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
    fake_port = free_port()
    fake_root = Path(r"C:\Users\elvis\AppData\Local\Temp\opencode\t38-fake") / time.strftime("%Y%m%d-%H%M%S")
    fake_root.mkdir(parents=True, exist_ok=True)
    fake_log = (fake_root / "fake-server.log").open("w", encoding="utf-8")
    fake = subprocess.Popen(
        [sys.executable, str(REPORT_DIR / "fake_embedding_server.py"), "--port", str(fake_port), "--root", str(fake_root)],
        cwd=fake_root, stdout=fake_log, stderr=subprocess.STDOUT)
    time.sleep(1.0)
    if fake.poll() is not None:
        raise SystemExit("fake server failed")

    prepare = subprocess.run([sys.executable, str(REPORT_DIR / "prepare_t38.py"), "--fake-port", str(fake_port)],
                             cwd=REPORT_DIR, capture_output=True, text=True, encoding="utf-8")
    if prepare.returncode != 0:
        fake.terminate()
        raise SystemExit(f"prepare failed: {prepare.stderr}")
    state = json.loads(prepare.stdout)
    root = Path(state["root"])
    (root / "evidence" / "prepare-run.txt").write_text(
        prepare.stdout + "\n--- stderr ---\n" + prepare.stderr, encoding="utf-8", newline="\n")
    (root / "evidence" / "fake-server-state.json").write_text(
        json.dumps({"pid": fake.pid, "port": fake_port, "root": str(fake_root)}, indent=2) + "\n", encoding="utf-8")

    port = free_port()
    log_path = root / "evidence" / "server.log"
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
            break
    if url is None:
        process.terminate(); fake.terminate()
        raise SystemExit("host did not start")
    (root / "evidence" / "server.json").write_text(
        json.dumps({"url": url, "port": port, "pid": process.pid, "fake_port": fake_port}, indent=2) + "\n", encoding="utf-8")
    (root / "evidence" / "server-redacted.json").write_text(
        json.dumps({"url": redact(url), "port": port, "pid": process.pid, "fake_port": fake_port}, indent=2) + "\n",
        encoding="utf-8", newline="\n")
    try:
        gate = subprocess.run(["node", str(REPORT_DIR / "t38_ui_gate.cjs")], capture_output=True, text=True, timeout=600)
        (root / "evidence" / "gate-run.txt").write_text(
            gate.stdout + "\n--- stderr ---\n" + gate.stderr, encoding="utf-8", newline="\n")
        print(gate.stdout[-6000:]); print(gate.stderr[-2000:])
        if gate.returncode != 0:
            raise SystemExit(f"gate failed: {gate.returncode}")
    finally:
        process.terminate(); fake.terminate()
        for proc in (process, fake):
            try:
                proc.wait(timeout=10)
            except subprocess.TimeoutExpired:
                proc.kill()
    safe = redact(log_path.read_text(encoding="utf-8", errors="replace"))
    (root / "evidence" / "server-log.txt").write_text(safe, encoding="utf-8", newline="\n")


if __name__ == "__main__":
    main()
