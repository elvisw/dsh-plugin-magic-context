"""Copy the small, redacted T24 host evidence into this tracked folder."""

from __future__ import annotations

import json
from pathlib import Path
import shutil

REPORT_DIR = Path(__file__).resolve().parent
EVIDENCE = REPORT_DIR / "evidence"
root = Path(json.loads((REPORT_DIR / "experiment-root.json").read_text(encoding="utf-8"))["root"])
server = json.loads((root / "evidence" / "server.json").read_text(encoding="utf-8"))
EVIDENCE.mkdir(parents=True, exist_ok=True)

for name in ("prepare.json", "prepare-run.txt", "server-redacted.json", "server-log.txt", "ui-gate.json",
             "fake-server-state.json"):
    source = root / "evidence" / name
    if source.exists():
        shutil.copyfile(source, EVIDENCE / name)

fake_root = Path(server["fake_root"])
requests = fake_root / "embedding-requests.jsonl"
if requests.exists():
    shutil.copyfile(requests, EVIDENCE / "embedding-requests.jsonl")

screenshots = root / "screenshots"
if screenshots.exists():
    for shot in screenshots.glob("*.png"):
        shutil.copyfile(shot, EVIDENCE / shot.name)

print(json.dumps({"root": str(root), "evidence_files": sorted(path.name for path in EVIDENCE.iterdir())}, indent=2))
