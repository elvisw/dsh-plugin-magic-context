"""Secret scan for the T24 evidence folder (UTF-8, LF-safe output)."""

from __future__ import annotations

from pathlib import Path
import re

REPORT_DIR = Path(__file__).resolve().parent
EVIDENCE = REPORT_DIR / "evidence"
OUT = EVIDENCE / "secret-scan.txt"
KEY_PATTERN = re.compile(r"sk-[A-Za-z0-9_-]{16,}")
TOKEN_PATTERN = re.compile(r"\?token=(?![<\s])[^\s&\"']+")
BEARER_PATTERN = re.compile(r"Bearer\s+(?!<redacted>)[A-Za-z0-9._-]{24,}")

hits: list[str] = []
files = sorted(path for path in EVIDENCE.rglob("*") if path.is_file() and path != OUT)
for path in files:
    try:
        lines = path.read_text(encoding="utf-8", errors="replace").splitlines()
    except Exception:
        continue
    for number, line in enumerate(lines, start=1):
        if KEY_PATTERN.search(line):
            hits.append(f"{path.relative_to(EVIDENCE)}:{number}: sk-*")
        if TOKEN_PATTERN.search(line):
            hits.append(f"{path.relative_to(EVIDENCE)}:{number}: live token")
        if BEARER_PATTERN.search(line):
            hits.append(f"{path.relative_to(EVIDENCE)}:{number}: bearer material")

OUT.write_text(
    "command: scan_t24_secrets.py (repository-tracked evidence only)\n"
    f"files scanned: {len(files)}\n"
    "patterns: sk-* key shapes, live ?token= values, long Bearer values\n"
    f"hits: {len(hits)}\n"
    + ("\n".join(hits) + "\n" if hits else "no secret material found\n"),
    encoding="utf-8",
    newline="\n",
)
print(OUT.read_text(encoding="utf-8"))
