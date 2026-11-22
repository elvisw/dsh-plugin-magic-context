"""Compare the 0.18.13 candidate tarball with the published 0.18.12 tarball."""
import hashlib
import json
import pathlib
import tarfile
import urllib.request

NEW = pathlib.Path(r"C:/Users/elvis/AppData/Local/Temp/opencode/v01813-pack/elvisw-dsh-magic-context-0.18.13.tgz")
OLD = pathlib.Path(r"C:/Users/elvis/AppData/Local/Temp/opencode/v01813-pack/registry-0.18.12.tgz")


def sha256(path):
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1 << 20), b""):
            digest.update(chunk)
    return digest.hexdigest()


def members(path):
    with tarfile.open(path, "r:gz") as archive:
        return {m.name: (archive.extractfile(m).read() if m.isfile() else None) for m in archive.getmembers()}


if not OLD.exists():
    meta = json.load(urllib.request.urlopen("https://registry.npmjs.org/@elvisw/dsh-magic-context/0.18.12"))
    with urllib.request.urlopen(meta["dist"]["tarball"]) as response:
        OLD.write_bytes(response.read())

old = members(OLD)
new = members(NEW)
changed = sorted(name for name in new if name in old and new[name] != old[name])
added = sorted(name for name in new if name not in old)
removed = sorted(name for name in old if name not in new)

# The only payload differences allowed: package.json version, the two READMEs and lib/client.js.
allowed_payload = {"package/package.json", "package/README.md", "package/README.zh-CN.md", "package/lib/client.js"}
report = {
    "candidate": {"path": NEW.name, "sha256": sha256(NEW), "bytes": NEW.stat().st_size, "members": len(new)},
    "registry": {"version": "0.18.12", "sha256": sha256(OLD), "bytes": OLD.stat().st_size, "members": len(old)},
    "changed": changed,
    "added": added,
    "removed": removed,
    "changedPayload": sorted(name for name in changed if name not in {"package/package.json"}),
    "unexpectedPayloadChanges": sorted(
        name for name in changed if name not in allowed_payload and name != "package/package.json"
    ),
    "libUnchanged": new.get("package/lib/index.js") == old.get("package/lib/index.js"),
    "vendorUnchanged": all(
        new[name] == old[name] for name in new if name.startswith("package/vendor/") and name in old
    ),
}
out = pathlib.Path(r"C:/Users/elvis/Documents/dev/plugin/dsh-plugin-magic-context/_bmad-output/initiative-dsh-magic-context/acceptance-windows-dsh-2026-11-22-v01813-release/evidence")
out.mkdir(parents=True, exist_ok=True)
(out / "pack-compare.json").write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8", newline="\n")
print(json.dumps(report, indent=2))
