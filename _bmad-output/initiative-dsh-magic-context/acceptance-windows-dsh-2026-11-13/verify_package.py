"""Verify the 0.11.2 tarball, extracted package, and installed files."""

from __future__ import annotations

import base64
import hashlib
import json
from pathlib import Path

from prepare_experiment import POINTER

ROOT = Path(json.loads(POINTER.read_text(encoding="utf-8"))["root"])
EXTRACTED = ROOT / "plugin" / "package"
INSTALLED = ROOT / "dsh-home" / "profiles" / "headless" / "node_modules" / "dsh-plugin-magic-context"
REGISTRY = ROOT / "evidence" / "plugin-registry.json"
ARCHIVE = ROOT / "downloads" / "dsh-plugin-magic-context-0.11.2.tgz"
OUT = ROOT / "evidence" / "package-verification.json"


def sha256(path: Path) -> str:
    hasher = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            hasher.update(chunk)
    return hasher.hexdigest()


def main() -> None:
    metadata = json.loads(REGISTRY.read_text(encoding="utf-8"))
    digest = base64.b64encode(hashlib.sha512(ARCHIVE.read_bytes()).digest()).decode()
    integrity = f"sha512-{digest}" == metadata["dist"]["integrity"]
    package = json.loads((EXTRACTED / "package.json").read_text(encoding="utf-8"))
    scripts = package.get("scripts", {})
    lifecycle = {key: value for key, value in scripts.items() if key in {"preinstall", "install", "postinstall"}}
    rows = []
    missing = []
    mismatched = []
    for path in sorted(EXTRACTED.rglob("*")):
        if not path.is_file():
            continue
        relative = path.relative_to(EXTRACTED)
        target = INSTALLED / relative
        if not target.exists():
            missing.append(relative.as_posix())
            continue
        left, right = sha256(path), sha256(target)
        rows.append({"path": relative.as_posix(), "sha256": left, "installed_sha256": right, "equal": left == right})
        if left != right:
            mismatched.append(relative.as_posix())
    result = {
        "tarball_integrity": integrity,
        "package_version": package.get("version"),
        "package_files": len(rows),
        "missing_in_install": missing,
        "mismatched": mismatched,
        "lifecycle_scripts": lifecycle,
        "installed_package_version": json.loads(
            (INSTALLED / "package.json").read_text(encoding="utf-8")
        ).get("version"),
    }
    OUT.write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps(result, ensure_ascii=False, indent=2))
    if not integrity or package.get("version") != "0.11.2" or missing or mismatched or lifecycle:
        raise SystemExit(1)


if __name__ == "__main__":
    main()
