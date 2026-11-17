"""Rebuild sha256-manifest.json for the 0.16.0 release packet."""

from __future__ import annotations

import hashlib
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent
SKIP = {"sha256-manifest.json"}


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1 << 20), b""):
            digest.update(chunk)
    return digest.hexdigest()


def main() -> None:
    files = []
    for path in sorted(ROOT.rglob("*")):
        if not path.is_file() or path.name in SKIP or "__pycache__" in path.parts:
            continue
        relative = path.relative_to(ROOT).as_posix()
        files.append(
            {
                "path": relative,
                "bytes": path.stat().st_size,
                "sha256": sha256(path),
            }
        )
    manifest = {"fileCount": len(files), "files": files}
    (ROOT / "sha256-manifest.json").write_text(
        json.dumps(manifest, indent=2) + "\n", encoding="utf-8", newline="\n"
    )
    print(f"wrote {len(files)} entries")


if __name__ == "__main__":
    main()
