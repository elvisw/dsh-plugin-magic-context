"""Upgrade the daily web profile to 0.18.14 and record its effective config (redacted)."""
import json
import os
import pathlib
import re
import subprocess

OUT = pathlib.Path(r"C:/Users/elvis/Documents/dev/plugin/dsh-plugin-magic-context/_bmad-output/initiative-dsh-magic-context/acceptance-windows-dsh-2026-11-22-v01814-release/evidence")


def run(args, timeout=900):
    result = subprocess.run(args, capture_output=True, text=True, encoding="utf-8", errors="replace", timeout=timeout)
    return result.returncode, result.stdout, result.stderr


code, out, err = run(["dsh", "plugin", "--profile", "web", "add", "@elvisw/dsh-magic-context@0.18.14"])
print("install exit", code)
print((out + err)[-800:])
code2, dump, dump_err = run(["dsh", "--profile", "web", "--dump-config"])
print("dump exit", code2)
text = dump + dump_err
home = os.path.expanduser("~")
redacted = text.replace(home, "<home>").replace(home.replace("\\", "/"), "<home>")
redacted = re.sub(r"([0-9]{1,3}\.){3}[0-9]{1,3}", "<ip>", redacted)
(OUT / "daily-profile-dump.txt").write_text(redacted, encoding="utf-8", newline="\n")

profile = pathlib.Path(home) / ".dsh" / "profiles" / "web"
manifest = json.loads((profile / "package.json").read_text(encoding="utf-8"))
package_dir = profile / "node_modules" / "@elvisw" / "dsh-magic-context"
installed_manifest = json.loads((package_dir / "package.json").read_text(encoding="utf-8"))


def sha(path):
    import hashlib
    return hashlib.sha256(path.read_bytes()).hexdigest()


record = {
    "installExit": code,
    "dumpExit": code2,
    "packageName": "@elvisw/dsh-magic-context" in redacted,
    "rowId": "magic-context-dsh" in redacted,
    "historianEffort": "reasoningEffort" in redacted,
    "registerCompactionEngine": "registerCompactionEngine" in redacted,
    "profileDependency": manifest["dependencies"]["@elvisw/dsh-magic-context"],
    "installedManifestVersion": installed_manifest["version"],
    "installedClientSha256": sha(package_dir / "lib" / "client.js"),
    "repoBuildClientSha256": sha(pathlib.Path(r"C:/Users/elvis/Documents/dev/plugin/dsh-plugin-magic-context/lib/client.js")),
    "clientMatchesRepoBuild": sha(package_dir / "lib" / "client.js")
        == sha(pathlib.Path(r"C:/Users/elvis/Documents/dev/plugin/dsh-plugin-magic-context/lib/client.js")),
    "bundleListed": "@elvisw/dsh-magic-context" in manifest["dsh"]["profile"]["bundles"],
}
(OUT / "daily-profile.json").write_text(json.dumps(record, indent=2) + "\n", encoding="utf-8", newline="\n")
print(json.dumps(record, indent=2))
