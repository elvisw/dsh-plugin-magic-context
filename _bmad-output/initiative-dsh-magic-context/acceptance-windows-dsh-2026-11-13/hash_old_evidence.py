"""Create or verify a SHA-256 manifest of the old acceptance evidence tree."""

from __future__ import annotations

import argparse
import hashlib
from pathlib import Path

OLD = Path(
    r"C:\Users\elvis\Documents\dev\plugin\dsh-plugin-magic-context"
    r"\_bmad-output\initiative-dsh-magic-context\acceptance-windows-dsh-2026-11-09"
)
MANIFEST = Path(__file__).resolve().parent / "old-evidence-sha256.txt"


def digest(path: Path) -> str:
    hasher = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            hasher.update(chunk)
    return hasher.hexdigest()


def rows(root: Path) -> list[str]:
    return [
        f"{digest(path)}  {path.relative_to(root).as_posix()}"
        for path in sorted(root.rglob("*"))
        if path.is_file()
    ]


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--verify", action="store_true")
    options = parser.parse_args()
    current = rows(OLD)
    if options.verify:
        expected = MANIFEST.read_text(encoding="utf-8").splitlines()
        if current != expected:
            missing = set(expected) - set(current)
            added = set(current) - set(expected)
            raise SystemExit(f"old evidence changed; missing={len(missing)} added={len(added)}")
        print(f"old evidence unchanged: {len(current)} files")
        return
    MANIFEST.write_text("\n".join(current) + "\n", encoding="utf-8")
    print(f"wrote {MANIFEST} ({len(current)} files)")


if __name__ == "__main__":
    main()
