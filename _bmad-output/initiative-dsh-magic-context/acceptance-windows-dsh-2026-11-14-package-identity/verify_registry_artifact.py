"""Compare the registry tarball with the local build tree."""

from __future__ import annotations

import hashlib
import json
from pathlib import Path

REPORT_DIR = Path(__file__).resolve().parent
REPO = Path(r"C:\Users\elvis\Documents\dev\plugin\dsh-plugin-magic-context")
TGZ = Path(r"C:\Users\elvis\AppData\Local\Temp\opencode\registry-012\elvisw-dsh-plugin-magic-context-0.12.0.tgz")
LOCAL_TGZ = Path(r"C:\Users\elvis\AppData\Local\Temp\opencode\local-release-012\elvisw-dsh-plugin-magic-context-0.12.0.tgz")
EXTRACT = Path(r"C:\Users\elvis\AppData\Local\Temp\opencode\registry-012\extract\package")
EXPECTED_SHASUM = "c919131f768099f2b6477a034bb1f73b76c6c61f"
EXPECTED_INTEGRITY = "sha512-ICGZVB1xVREDwjFokMzZT+7v2RCkBxkyk4uyjKMy7Ybg8bSMJ8WTU6NyvN44Pum9GPn1W+vsnGuUM6X1etO4qA=="


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1 << 20), b""):
            digest.update(chunk)
    return digest.hexdigest()


def sha1(path: Path) -> str:
    digest = hashlib.sha1()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1 << 20), b""):
            digest.update(chunk)
    return digest.hexdigest()


def main() -> None:
    files = sorted(path for path in (EXTRACT / "lib").rglob("*.js"))
    mismatches = [
        str(path.relative_to(EXTRACT))
        for path in files
        if not (REPO / "lib" / path.relative_to(EXTRACT / "lib")).exists()
        or sha256(path) != sha256(REPO / "lib" / path.relative_to(EXTRACT / "lib"))
    ]
    package = json.loads((EXTRACT / "package.json").read_text(encoding="utf-8"))
    result = {
        "registry_tarball": str(TGZ),
        "local_release_tarball": str(LOCAL_TGZ),
        "registry_tarball_sha256": sha256(TGZ),
        "local_release_tarball_sha256": sha256(LOCAL_TGZ),
        "tarballs_byte_identical": sha256(TGZ) == sha256(LOCAL_TGZ),
        "registry_tarball_shasum": sha1(TGZ),
        "local_release_tarball_shasum": sha1(LOCAL_TGZ),
        "expected_shasum": EXPECTED_SHASUM,
        "shasum_matches": sha1(TGZ) == EXPECTED_SHASUM,
        "expected_integrity": EXPECTED_INTEGRITY,
        "package_name": package.get("name"),
        "package_version": package.get("version"),
        "file_count": sum(1 for path in EXTRACT.rglob("*") if path.is_file()),
        "lib_file_count": len(files),
        "lib_mismatches": mismatches,
        "cordis_patch_identical": sha256(EXTRACT / "cordis.patch.yml") == sha256(REPO / "cordis.patch.yml"),
        "registry_lib_sha256_tool_bridge": sha256(EXTRACT / "lib" / "dsh" / "tool-bridge.js"),
        "repo_lib_sha256_tool_bridge": sha256(REPO / "lib" / "dsh" / "tool-bridge.js"),
    }
    (REPORT_DIR / "registry-artifact.json").write_text(json.dumps(result, indent=2), encoding="utf-8")
    print(json.dumps(result, indent=2))


if __name__ == "__main__":
    main()
