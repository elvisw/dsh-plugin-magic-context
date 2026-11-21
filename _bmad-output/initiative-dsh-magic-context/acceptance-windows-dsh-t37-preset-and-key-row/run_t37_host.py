"""Start two isolated DSH Web hosts (t37, t37b) and run the T37 gate."""

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
        path = root / sub
        path.mkdir(parents=True, exist_ok=True)
        env[name] = str(path)
    env["CI"] = "1"
    env["DSH_TELEMETRY_MODE"] = "DISABLED"
    return env


def start(root: Path, profile: str, attempts: int = 3) -> dict:
    last = ""
    for attempt in range(attempts):
        port = free_port()
        log_path = root / "evidence" / f"server-{profile}-{attempt}.log"
        log = log_path.open("w", encoding="utf-8")
        process = subprocess.Popen(
            [str(NODE_EXE), str(DSH_BIN), "--profile", profile, "--no-open",
             "--host", "127.0.0.1", "--port", str(port)],
            cwd=root / "workspace", env=host_env(root), stdout=log, stderr=subprocess.STDOUT,
        )
        deadline = time.time() + 150
        url = None
        while time.time() < deadline:
            time.sleep(0.5)
            text = log_path.read_text(encoding="utf-8", errors="replace")
            match = re.search(r"http://127\.0\.0\.1:" + str(port) + r"/\?token=[^\s]+", text)
            if match is not None:
                url = match.group(0)
                break
            if process.poll() is not None:
                last = text[-1500:]
                break
        if url is not None:
            return {"profile": profile, "pid": process.pid, "port": port, "url": url,
                    "log": str(log_path), "attempt": attempt, "process": process}
        process.terminate()
        try:
            process.wait(timeout=10)
        except subprocess.TimeoutExpired:
            process.kill()
    raise SystemExit(f"host {profile} failed to start: {last}")


def main() -> None:
    prepare = subprocess.run(
        [sys.executable, str(REPORT_DIR / "prepare_t37.py")],
        cwd=REPORT_DIR, capture_output=True, text=True, encoding="utf-8",
    )
    if prepare.returncode != 0:
        raise SystemExit(f"prepare failed: {prepare.stderr}")
    state = json.loads(prepare.stdout)
    root = Path(state["root"])
    (root / "evidence" / "prepare-run.txt").write_text(
        prepare.stdout + "\n--- stderr ---\n" + prepare.stderr, encoding="utf-8", newline="\n")

    hosts = []
    try:
        for profile in ("t37", "t37b"):
            hosts.append(start(root, profile))
        for host in hosts:
            text = Path(host["log"]).read_text(encoding="utf-8", errors="replace")
            Path(host["log"]).write_text(redact(text), encoding="utf-8", newline="\n")
        record = {
            "root": str(root),
            "hosts": [{key: host[key] for key in ("profile", "pid", "port", "url", "log", "attempt")} for host in hosts],
        }
        (root / "evidence" / "server.json").write_text(json.dumps(record, indent=2) + "\n", encoding="utf-8")
        (root / "evidence" / "server-redacted.json").write_text(
            json.dumps({"root": str(root), "hosts": [
                {**{key: host[key] for key in ("profile", "pid", "port", "attempt")},
                 "url": redact(host["url"])} for host in hosts]}, indent=2) + "\n",
            encoding="utf-8", newline="\n")
        gate = subprocess.run(
            ["node", str(REPORT_DIR / "t37_ui_gate.cjs")],
            cwd=REPORT_DIR, capture_output=True, text=True, encoding="utf-8",
        )
        (root / "evidence" / "gate-run.txt").write_text(
            gate.stdout + "\n--- stderr ---\n" + gate.stderr, encoding="utf-8", newline="\n")
        print(gate.stdout[-6000:])
        print(gate.stderr[-3000:])
        if gate.returncode != 0:
            raise SystemExit(f"gate failed with exit {gate.returncode}")
    finally:
        for host in hosts:
            process = host["process"]
            process.terminate()
            try:
                process.wait(timeout=10)
            except subprocess.TimeoutExpired:
                process.kill()


if __name__ == "__main__":
    main()
