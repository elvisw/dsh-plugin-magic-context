"""Record the daily profile's installed version and its bytes."""
import base64
import hashlib
import json
import os
import pathlib

OUT = pathlib.Path(r"C:/Users/elvis/Documents/dev/plugin/dsh-plugin-magic-context/_bmad-output/initiative-dsh-magic-context/acceptance-windows-dsh-2026-11-22-v01813-release/evidence")
profile = pathlib.Path(os.path.expanduser("~")) / ".dsh" / "profiles" / "web"
manifest = json.loads((profile / "package.json").read_text(encoding="utf-8"))
installed = manifest["dependencies"]["@elvisw/dsh-magic-context"]
package_dir = profile / "node_modules" / "@elvisw" / "dsh-magic-context"
installed_manifest = json.loads((package_dir / "package.json").read_text(encoding="utf-8"))
client = package_dir / "lib" / "client.js"
repo_client = pathlib.Path(r"C:/Users/elvis/Documents/dev/plugin/dsh-plugin-magic-context/lib/client.js")


def sha256(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


record = {
    "profileDependency": installed,
    "installedManifestVersion": installed_manifest["version"],
    "installedClientSha256": sha256(client),
    "repoBuildClientSha256": sha256(repo_client),
    "clientMatchesRepoBuild": sha256(client) == sha256(repo_client),
    "bundleListed": "@elvisw/dsh-magic-context" in manifest["dsh"]["profile"]["bundles"],
}
existing = json.loads((OUT / "daily-profile.json").read_text(encoding="utf-8"))
existing.pop("version", None)
existing.update(record)
(OUT / "daily-profile.json").write_text(json.dumps(existing, indent=2) + "\n", encoding="utf-8", newline="\n")
print(json.dumps(existing, indent=2))
