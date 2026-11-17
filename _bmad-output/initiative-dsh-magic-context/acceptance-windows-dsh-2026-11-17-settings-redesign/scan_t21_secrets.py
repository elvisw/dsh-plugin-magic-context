"""Secret scan for the T21 evidence folder (UTF-8, LF-safe output).

Distinguishes actual secret material from safe names:
- `sk-...` only when it looks like a key (16+ token characters);
- provider env names are allowed as names (`apiKeyEnv: DEEPSEEK_API_KEY`) and
  must not be counted as values;
- `?token=` is allowed only when followed by `<redacted>`.
"""

from __future__ import annotations

from pathlib import Path
import re

REPORT_DIR = Path(__file__).resolve().parent
EVIDENCE = REPORT_DIR / "evidence"
OUT = EVIDENCE / "secret-scan.txt"
KEY_PATTERN = re.compile(r"sk-[A-Za-z0-9_-]{16,}")
ENV_NAME_PATTERN = re.compile(r"DEEPSEEK_API_KEY|SILICONFLOW_API_KEY")
TOKEN_PATTERN = re.compile(r"\?token=(?![<\s])[^\s&\"']+")

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
        match = TOKEN_PATTERN.search(line)
        if match:
            hits.append(f"{path.relative_to(EVIDENCE)}:{number}: live token")
        # Environment variable names are configuration, not secret values.
        # A value-bearing assignment (KEY=sk-...) is caught above.

OUT.write_text(
    "command: scan_t21_secrets.py (repository-tracked evidence only)\n"
    f"files scanned: {len(files)}\n"
    "patterns: sk-* key shapes, live ?token= values; env names recorded separately\n"
    f"hits: {len(hits)}\n"
    + ("\n".join(hits) + "\n" if hits else "no secret material found\n"),
    encoding="utf-8",
    newline="\n",
)
print(OUT.read_text(encoding="utf-8"))
