"""Verify the published 0.18.6 artifact against the local pack."""
import base64
import hashlib
import json
import pathlib
import tarfile
import time
import urllib.request

PACKAGE = "@elvisw/dsh-magic-context"
VERSION = "0.18.6"
LOCAL = pathlib.Path(r"C:\Users\elvis\AppData\Local\Temp\opencode\t31-pack-final\elvisw-dsh-magic-context-0.18.6.tgz")
OUT = pathlib.Path(
    "_bmad-output/initiative-dsh-magic-context/acceptance-v0186-release"
)
EVIDENCE = OUT / "evidence"
EVIDENCE.mkdir(parents=True, exist_ok=True)

META_URL = "https://registry.npmjs.org/@elvisw%2Fdsh-magic-context"


def fetch(url: str, binary: bool = False):
    request = urllib.request.Request(url, headers={"user-agent": "dsh-mc-t31-verify"})
    with urllib.request.urlopen(request, timeout=60) as response:
        data = response.read()
    return data if binary else json.loads(data.decode("utf-8"))


def wait_for_version(timeout: int = 900) -> dict:
    deadline = time.time() + timeout
    last = ""
    while time.time() < deadline:
        try:
            doc = fetch(META_URL)
            meta = doc.get("versions", {}).get(VERSION)
            if meta is not None:
                (EVIDENCE / "registry-metadata.json").write_text(
                    json.dumps({
                        "distTags": doc.get("dist-tags"),
                        "version": meta.get("version"),
                        "gitHead": meta.get("gitHead"),
                        "dist": meta.get("dist"),
                        "time": doc.get("time", {}).get(VERSION),
                    }, indent=2) + "\n",
                    encoding="utf-8",
                )
                return meta
            last = f"latest={doc.get('dist-tags', {}).get('latest')}"
        except Exception as error:  # noqa: BLE001 - retry any transport error
            last = repr(error)
        time.sleep(15)
    raise SystemExit(f"version never appeared: {last}")


def digest(path: pathlib.Path, name: str) -> str:
    h = hashlib.new(name)
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest() if name != "sha512" else base64.b64encode(h.digest()).decode()


def members(path: pathlib.Path) -> dict:
    with tarfile.open(path, "r:gz") as archive:
        return {
            member.name: hashlib.sha256(archive.extractfile(member).read()).hexdigest()
            for member in archive.getmembers() if member.isfile()
        }


meta = wait_for_version()
dist = meta["dist"]

remote_path = pathlib.Path(r"C:\Users\elvis\AppData\Local\Temp\opencode\t31-registry")
remote_path.mkdir(parents=True, exist_ok=True)
remote_tgz = remote_path / "registry-0.18.6.tgz"
remote_tgz.write_bytes(fetch(dist["tarball"], binary=True))

local_sha512 = digest(LOCAL, "sha512")
local_sha1 = digest(LOCAL, "sha1")
remote_sha256 = digest(remote_tgz, "sha256")

raw_identical = LOCAL.read_bytes() == remote_tgz.read_bytes()
before = members(LOCAL)
after = members(remote_tgz)
diff = sorted(name for name in before if before.get(name) != after.get(name))
added = sorted(name for name in after if name not in before)

state = {
    "version": VERSION,
    "latest": meta.get("version"),
    "gitHead": meta.get("gitHead"),
    "distIntegrity": dist.get("integrity"),
    "localIntegrity": "sha512-" + local_sha512,
    "integrityMatch": dist.get("integrity") == "sha512-" + local_sha512,
    "distShasum": dist.get("shasum"),
    "localShasum": local_sha1,
    "shasumMatch": dist.get("shasum") == local_sha1,
    "registryTarball": str(remote_tgz),
    "registrySha256": remote_sha256,
    "registryBytes": remote_tgz.stat().st_size,
    "localTarball": str(LOCAL),
    "localSha256": digest(LOCAL, "sha256"),
    "localBytes": LOCAL.stat().st_size,
    "byteIdentical": raw_identical,
    "changedMembers": diff,
    "addedMembers": added,
    "fileCount": dist.get("fileCount"),
}
(EVIDENCE / "registry-verify.json").write_text(json.dumps(state, indent=2) + "\n", encoding="utf-8")
(EVIDENCE / "pack-compare.json").write_text(
    json.dumps({"local": state["localTarball"], "registry": state["registryTarball"],
                "byteIdentical": raw_identical, "changedMembers": diff}, indent=2) + "\n",
    encoding="utf-8",
)
print(json.dumps(state, indent=2))
