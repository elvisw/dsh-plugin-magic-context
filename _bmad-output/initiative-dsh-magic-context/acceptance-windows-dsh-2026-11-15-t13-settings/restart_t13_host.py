"""Restart the isolated T13 Web host against the profile patch only (no --patch overlay)."""
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
DSH_BIN = Path(r"C:\Users\elvis\AppData\Local\Temp\opencode\mc-t0-2026-11-13\tools\dsh\node_modules\@deepseek-ai\dsh\lib\bin.js")
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


def force_runtime_trigger() -> str:
    """Set the gate-only trigger knobs, keeping the settings-page effort leaf.

    The Settings page cannot lower `executeThreshold` to 0 or set the historian
    minimums, so the runtime smoke writes them explicitly. `reasoningEffort`
    must already be `low` from the UI gate; this function refuses otherwise.
    """
    patch = ROOT / "dsh-home" / "profiles" / "t13" / "cordis.patch.yml"
    lines = patch.read_text(encoding="utf-8").splitlines()
    if not any(line.strip() == "reasoningEffort: low" for line in lines):
        raise SystemExit("runtime trigger: expected reasoningEffort: low from the UI gate")
    policy = lines.index("    policy:")
    end = policy + 1
    while end < len(lines) and (lines[end].startswith("      ") or lines[end].strip() == ""):
        end += 1
    body = [line for line in lines[policy + 1:end]
            if not re.match(r"      (executeThreshold|historianMinNodes|historianProtectedNodes|historianMinBudgetTokens):", line)]
    trigger = [
        "      executeThreshold: 0",
        "      historianMinNodes: 0",
        "      historianProtectedNodes: 0",
        "      historianMinBudgetTokens: 0",
    ]
    updated = lines[:policy + 1] + trigger + body + lines[end:]
    patch.write_text("\n".join(updated) + "\n", encoding="utf-8")
    return "\n".join(trigger)


def main() -> None:
    trigger = force_runtime_trigger()
    (ROOT / "evidence" / "runtime-trigger-config.txt").write_text(
        "gate-only trigger config written before the profile-only restart:\n" + trigger + "\n", encoding="utf-8")
    old = json.loads((ROOT / "evidence" / "server.json").read_text(encoding="utf-8"))
    pid = old.get("pid")
    if isinstance(pid, int):
        subprocess.run(["taskkill", "/PID", str(pid), "/F"], capture_output=True)
        time.sleep(2)
    port = free_port()
    log = (ROOT / "evidence" / "server-profile-only.log").open("w", encoding="utf-8")
    process = subprocess.Popen(
        [str(NODE_EXE), str(DSH_BIN), "--profile", "t13", "--no-open", "--port", str(port)],
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
        text = (ROOT / "evidence" / "server-profile-only.log").read_text(encoding="utf-8", errors="replace")
        match = re.search(r"http://127\.0\.0\.1:" + str(port) + r"/\?token=[^\s]+", text)
        if match is not None:
            url = match.group(0)
            break
        if process.poll() is not None:
            break
    state = {"pid": process.pid, "port": port, "url": url, "running": process.poll() is None, "log": str(ROOT / "evidence" / "server-profile-only.log"), "log_tail": text[-2000:]}
    (ROOT / "evidence" / "server-profile-only.json").write_text(json.dumps(state, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(state, indent=2))
    if url is None:
        process.terminate()


if __name__ == "__main__":
    main()
