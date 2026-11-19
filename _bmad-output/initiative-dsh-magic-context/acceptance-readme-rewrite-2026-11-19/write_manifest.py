"""Hash every file in the T26 acceptance directory into evidence/sha256-manifest.json.

Run last, after the report is final: the manifest is a statement about bytes on disk,
so anything edited afterwards invalidates it. The manifest excludes itself, since a file
cannot contain its own digest.

Usage:
    python write_manifest.py [acceptance_dir]
"""
import hashlib
import json
import pathlib
import sys

SELF = "sha256-manifest.json"


def digest(path: pathlib.Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def main() -> int:
    if len(sys.argv) > 1:
        root = pathlib.Path(sys.argv[1]).resolve()
    else:
        root = pathlib.Path(__file__).resolve().parent
    if not root.is_dir():
        print(f"not a directory: {root}")
        return 2

    entries = []
    for path in sorted(root.rglob("*")):
        if not path.is_file():
            continue
        rel = path.relative_to(root).as_posix()
        if rel == f"evidence/{SELF}":
            continue
        entries.append({
            "path": rel,
            "bytes": path.stat().st_size,
            "sha256": digest(path),
        })

    out = root / "evidence" / SELF
    out.parent.mkdir(parents=True, exist_ok=True)
    payload = {
        "root": root.name,
        "count": len(entries),
        "excluded": [f"evidence/{SELF}"],
        "entries": entries,
    }
    out.write_text(json.dumps(payload, indent=2, ensure_ascii=False) + "\n",
                   encoding="utf-8", newline="\n")
    print(f"{len(entries)} files hashed -> {out}")
    for entry in entries:
        print(f"  {entry['bytes']:>8}  {entry['sha256'][:12]}  {entry['path']}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
