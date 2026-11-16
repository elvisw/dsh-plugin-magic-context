import re
from pathlib import Path

report = Path(r"_bmad-output/initiative-dsh-magic-context/acceptance-windows-dsh-2026-11-16-telemetry-v2")
patterns = {
    "api-key": re.compile(r"sk-[A-Za-z0-9]{20,}"),
    "token-query": re.compile(r"\?token=[A-Za-z0-9_-]{10,}"),
    "deepseek-env-value": re.compile(r"DEEPSEEK_API_KEY\s*=\s*[^\s\"']+"),
}
files = sorted(p for p in list((report / "evidence").rglob("*")) + [report / "acceptance-report.md", report / "REPRODUCE.md", report / "host-version.txt"] if p.is_file() and p.name != "secret-scan.txt")
hits = []
for path in files:
    text = path.read_text(encoding="utf-8", errors="replace")
    for name, pattern in patterns.items():
        for match in pattern.finditer(text):
            hits.append(f"{path.relative_to(report)}: {name}: offset {match.start()}")
lines = [
    "command: python scan_t18_secrets.py",
    f"files scanned: {len(files)}",
    "patterns: sk-<20+ chars>, ?token=<10+ chars>, DEEPSEEK_API_KEY=<value>",
    f"hits: {len(hits)}",
]
lines.extend(hits)
out = report / "evidence" / "secret-scan.txt"
out.write_text("\n".join(lines) + "\n", encoding="utf-8", newline="\n")
print("\n".join(lines))
raise SystemExit(0 if not hits else 1)
