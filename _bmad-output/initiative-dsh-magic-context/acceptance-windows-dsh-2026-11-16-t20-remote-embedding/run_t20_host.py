"""Start the T20 fake embedding server and isolated DSH Web host."""

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
    fake_port = free_port()
    fake_root = Path(r"C:\Users\elvis\AppData\Local\Temp\opencode\t20-fake") / time.strftime("%Y%m%d-%H%M%S")
    fake_root.mkdir(parents=True, exist_ok=True)
    fake_log = (fake_root / "fake-server.log").open("w", encoding="utf-8")
    fake = subprocess.Popen(
        [sys.executable, str(REPORT_DIR / "fake_embedding_server.py"),
         "--port", str(fake_port), "--root", str(fake_root)],
        cwd=fake_root,
        stdout=fake_log,
        stderr=subprocess.STDOUT,
    )
    time.sleep(1.0)
    if fake.poll() is not None:
        raise SystemExit("fake embedding server failed to start")

    prepare = subprocess.run(
        [sys.executable, str(REPORT_DIR / "prepare_t20_host.py"), "--fake-port", str(fake_port)],
        cwd=REPORT_DIR,
        capture_output=True,
        text=True,
        encoding="utf-8",
    )
    if prepare.returncode != 0:
        fake.terminate()
        raise SystemExit(f"prepare failed: {prepare.stderr}")
    root = Path(json.loads((REPORT_DIR / "experiment-root.json").read_text(encoding="utf-8"))["root"])
    (root / "evidence" / "prepare-run.txt").write_text(
        prepare.stdout + "\n--- stderr ---\n" + prepare.stderr,
        encoding="utf-8",
    )
    (root / "evidence" / "fake-server-state.json").write_text(
        json.dumps({"pid": fake.pid, "port": fake_port, "root": str(fake_root)}, indent=2) + "\n",
        encoding="utf-8",
    )
    port = free_port()
    log_path = root / "evidence" / "server.log"
    log = log_path.open("w", encoding="utf-8")
    process = subprocess.Popen(
        [
            str(NODE_EXE), str(DSH_BIN),
            "--profile", "t20",
            "--patch", str(root / "overlays" / "t20.yml"),
            "--no-open",
            "--port", str(port),
        ],
        cwd=root / "workspace",
        env={**os.environ, **{
            "DSH_HOME": str(root / "dsh-home"),
            "HOME": str(root / "user-home"),
            "USERPROFILE": str(root / "user-home"),
            "XDG_DATA_HOME": str(root / "xdg-data"),
            "XDG_CACHE_HOME": str(root / "xdg-cache"),
            "APPDATA": str(root / "appdata"),
            "LOCALAPPDATA": str(root / "localappdata"),
            "PATH": str(TOOLS_BIN) + os.pathsep + os.environ.get("PATH", ""),
            "CI": "1",
            "DSH_TELEMETRY_MODE": "DISABLED",
        }},
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
    db_path = root / "plugin-data" / "memories.db"
    deadline = time.time() + 90
    while time.time() < deadline and not db_path.exists():
        time.sleep(0.5)
    if db_path.exists():
        seed = subprocess.run(
            [sys.executable, str(REPORT_DIR / "seed_t20_corpus.py"), "--root", str(root)],
            cwd=REPORT_DIR,
            capture_output=True,
            text=True,
            encoding="utf-8",
        )
        (root / "evidence" / "seed-run.txt").write_text(
            seed.stdout + "\n--- stderr ---\n" + seed.stderr,
            encoding="utf-8",
            newline="\n",
        )
        if seed.returncode != 0:
            process.terminate()
            fake.terminate()
            raise SystemExit(f"seed failed: {seed.stderr}")
    else:
        process.terminate()
        fake.terminate()
        raise SystemExit(f"corpus did not appear: {db_path}")
    safe_text = redact(log_path.read_text(encoding="utf-8", errors="replace"))
    (root / "evidence" / "server-log.txt").write_text(safe_text, encoding="utf-8", newline="\n")
    state = {
        "pid": process.pid,
        "port": port,
        "url": url,
        "running": process.poll() is None,
        "fake_pid": fake.pid,
        "fake_port": fake_port,
        "fake_root": str(fake_root),
        "log": str(log_path),
        "log_tail": safe_text[-4000:],
    }
    (root / "evidence" / "server.json").write_text(json.dumps(state, indent=2) + "\n", encoding="utf-8")
    safe_state = {**state, "url": redact(url or "")}
    (root / "evidence" / "server-redacted.json").write_text(
        json.dumps(safe_state, indent=2) + "\n", encoding="utf-8"
    )
    print(json.dumps(safe_state, indent=2))
    if url is None:
        process.terminate()
        fake.terminate()


if __name__ == "__main__":
    main()
