import hashlib
import json
from pathlib import Path

report = Path(r"_bmad-output/initiative-dsh-magic-context/acceptance-windows-dsh-2026-11-16-telemetry-v2")
files = sorted(
    [p for p in (report / "evidence").rglob("*") if p.is_file()]
    + [p for p in [report / "acceptance-report.md", report / "REPRODUCE.md", report / "host-version.txt"] if p.is_file()]
)
manifest = []
for path in files:
    data = path.read_bytes()
    manifest.append({
        "path": path.relative_to(report).as_posix(),
        "bytes": len(data),
        "sha256": hashlib.sha256(data).hexdigest(),
    })
(report / "sha256-manifest.json").write_text(json.dumps({"files": manifest}, indent=2) + "\n", encoding="utf-8", newline="\n")
print(len(manifest), "files")
