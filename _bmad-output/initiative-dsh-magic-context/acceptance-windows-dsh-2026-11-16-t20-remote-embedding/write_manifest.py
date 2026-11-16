"""Write a sha256 + byte manifest for the T20 acceptance folder."""

from __future__ import annotations

import hashlib
import json
from pathlib import Path

REPORT_DIR = Path(__file__).resolve().parent
OUT = REPORT_DIR / "sha256-manifest.json"
files = sorted(
    path for path in REPORT_DIR.rglob("*")
    if path.is_file()
    and path != OUT
    and path.name != "experiment-root.json"
    and "__pycache__" not in path.parts
)


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1 << 20), b""):
            digest.update(chunk)
    return digest.hexdigest()


entries = [
    {
        "path": path.relative_to(REPORT_DIR).as_posix(),
        "bytes": path.stat().st_size,
        "sha256": sha256(path),
    }
    for path in files
]
OUT.write_text(
    json.dumps({"algorithm": "sha256", "root": REPORT_DIR.name, "entries": entries}, indent=2) + "\n",
    encoding="utf-8",
    newline="\n",
)
print(json.dumps({"entries": len(entries), "path": str(OUT)}, indent=2))
