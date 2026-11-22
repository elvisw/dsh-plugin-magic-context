"""Poll the registry until 0.18.13 is the latest, then verify bytes."""
import hashlib
import json
import pathlib
import time
import urllib.request

REPO = pathlib.Path(r"C:/Users/elvis/Documents/dev/plugin/dsh-plugin-magic-context")
OUT = REPO / "_bmad-output/initiative-dsh-magic-context/acceptance-windows-dsh-2026-11-22-v01813-release/evidence"
LOCAL = pathlib.Path(r"C:/Users/elvis/AppData/Local/Temp/opencode/v01813-pack/elvisw-dsh-magic-context-0.18.13.tgz")
DOWN = pathlib.Path(r"C:/Users/elvis/AppData/Local/Temp/opencode/v01813-pack/registry-0.18.13.tgz")


def sha256(path):
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1 << 20), b""):
            digest.update(chunk)
    return digest.hexdigest()


def get(url, timeout=30):
    request = urllib.request.Request(url, headers={"cache-control": "no-cache", "accept": "application/json"})
    with urllib.request.urlopen(request, timeout=timeout) as response:
        return response.read()


logs = []
deadline = time.time() + 900
meta = None
while time.time() < deadline:
    try:
        meta = json.loads(get("https://registry.npmjs.org/@elvisw/dsh-magic-context"))
        latest = meta["dist-tags"]["latest"]
        logs.append({"at": time.strftime("%H:%M:%SZ", time.gmtime()), "latest": latest})
        print("latest", latest, flush=True)
        if latest == "0.18.13":
            break
    except Exception as error:  # noqa: BLE001 - evidence only
        logs.append({"at": time.strftime("%H:%M:%SZ", time.gmtime()), "error": str(error)})
    time.sleep(20)
else:
    raise SystemExit("0.18.13 never became latest")

version = meta["versions"]["0.18.13"]
data = None
for attempt in range(40):
    try:
        data = get(version["dist"]["tarball"], timeout=60)
        break
    except Exception as error:  # noqa: BLE001 - evidence only
        logs.append({"at": time.strftime("%H:%M:%SZ", time.gmtime()), "tarballError": str(error)})
        time.sleep(15)
if data is None:
    raise SystemExit("tarball never downloadabled")

if DOWN.exists():
    DOWN.unlink()
DOWN.write_bytes(data)
report = {
    "checkedAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
    "distTags": meta["dist-tags"],
    "version": "0.18.13",
    "gitHead": version.get("gitHead"),
    "integrity": version["dist"]["integrity"],
    "shasum": version["dist"]["shasum"],
    "registry": {"path": DOWN.name, "sha256": sha256(DOWN), "bytes": DOWN.stat().st_size},
    "localCandidate": {"path": LOCAL.name, "sha256": sha256(LOCAL), "bytes": LOCAL.stat().st_size},
    "byteIdentical": sha256(DOWN) == sha256(LOCAL),
    "poll": logs,
}
OUT.mkdir(parents=True, exist_ok=True)
(OUT / "registry.json").write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8", newline="\n")
print(json.dumps({k: v for k, v in report.items() if k != "poll"}, indent=2))
