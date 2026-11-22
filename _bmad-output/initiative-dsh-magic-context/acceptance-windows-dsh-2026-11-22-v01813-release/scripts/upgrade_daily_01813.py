"""Upgrade the daily web profile to 0.18.13 and capture its effective config (redacted)."""
import json
import os
import pathlib
import re
import subprocess


def run(args, timeout=900):
    result = subprocess.run(args, capture_output=True, text=True, encoding="utf-8", errors="replace",
                            timeout=timeout, shell=False)
    return result.returncode, result.stdout, result.stderr


code, out, err = run(["dsh", "plugin", "--profile", "web", "add", "@elvisw/dsh-magic-context@0.18.13"])
print("install exit", code)
print((out + err)[-1200:])
code2, dump, dump_err = run(["dsh", "--profile", "web", "--dump-config"])
print("dump exit", code2)
text = dump + dump_err
home = os.path.expanduser("~")
redacted = text.replace(home, "<home>").replace(home.replace("\\", "/"), "<home>")
redacted = re.sub(r"([0-9]{1,3}\.){3}[0-9]{1,3}", "<ip>", redacted)
OUT = pathlib.Path(r"C:/Users/elvis/Documents/dev/plugin/dsh-plugin-magic-context/_bmad-output/initiative-dsh-magic-context/acceptance-windows-dsh-2026-11-22-v01813-release/evidence")
(OUT / "daily-profile-dump.txt").write_text(redacted, encoding="utf-8", newline="\n")
checks = {
    "installExit": code,
    "dumpExit": code2,
    "packageName": "@elvisw/dsh-magic-context" in redacted,
    "version": "0.18.13" in redacted,
    "rowId": "magic-context-dsh" in redacted,
    "historianEffort": "reasoningEffort" in redacted,
    "registerCompactionEngine": "registerCompactionEngine" in redacted,
}
(OUT / "daily-profile.json").write_text(json.dumps(checks, indent=2) + "\n", encoding="utf-8", newline="\n")
print(json.dumps(checks, indent=2))
