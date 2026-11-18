"""Normalize T24 text evidence to UTF-8/LF; leave PNGs untouched."""

from __future__ import annotations

from pathlib import Path

REPORT_DIR = Path(__file__).resolve().parent
TEXT_SUFFIXES = {".txt", ".md", ".json", ".jsonl", ".py", ".cjs", ".yml", ".yaml"}
changed: list[str] = []
for path in sorted(REPORT_DIR.rglob("*")):
    if not path.is_file() or path.suffix.lower() not in TEXT_SUFFIXES:
        continue
    if "__pycache__" in path.parts:
        continue
    text = path.read_bytes().decode("utf-8", errors="strict")
    normalized = text.replace("\r\n", "\n").replace("\r", "\n")
    if normalized != text:
        path.write_text(normalized, encoding="utf-8", newline="\n")
        changed.append(path.relative_to(REPORT_DIR).as_posix())
print(f"normalized {len(changed)} file(s)")
for name in changed:
    print(name)
