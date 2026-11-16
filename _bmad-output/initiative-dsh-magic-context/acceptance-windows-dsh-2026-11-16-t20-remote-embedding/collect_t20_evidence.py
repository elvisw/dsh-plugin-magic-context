"""Copy the final T20 isolated-host artifacts into the acceptance folder."""

from __future__ import annotations

import json
from pathlib import Path
import shutil

REPORT_DIR = Path(__file__).resolve().parent
ROOT = Path(json.loads((REPORT_DIR / "experiment-root.json").read_text(encoding="utf-8"))["root"])
EVIDENCE = REPORT_DIR / "evidence"
EVIDENCE.mkdir(parents=True, exist_ok=True)
(EVIDENCE / "screenshots").mkdir(parents=True, exist_ok=True)


def copy(source: Path, target: Path) -> None:
    if not source.exists():
        raise SystemExit(f"missing artifact: {source}")
    target.parent.mkdir(parents=True, exist_ok=True)
    shutil.copyfile(source, target)


for name in [
    "prepare.json",
    "prepare-run.txt",
    "bootstrap-web-template.txt",
    "add-local-tarball.txt",
    "dump-overlay.txt",
    "seed-corpus.json",
    "fake-server-state.json",
    "server-redacted.json",
    "server-log.txt",
    "ui-gate.json",
]:
    copy(ROOT / "evidence" / name, EVIDENCE / name)

fake_root = Path(json.loads((ROOT / "evidence" / "fake-server-state.json").read_text(encoding="utf-8"))["root"])
copy(fake_root / "embedding-requests.jsonl", EVIDENCE / "embedding-requests.jsonl")
copy(fake_root / "fake-server.json", EVIDENCE / "fake-server.json")
for shot in sorted((ROOT / "screenshots").glob("*.png")):
    copy(shot, EVIDENCE / "screenshots" / shot.name)

state = json.loads((ROOT / "evidence" / "prepare.json").read_text(encoding="utf-8"))
host = {
    "dsh": "0.2.2-rc.1",
    "node": "24.21.0",
    "plugin": "0.15.0",
    "profile": "t20",
    "isolated_root": str(ROOT),
    "playwright": "1.63.0",
    "fake_embedding_provider": "local simulation (not a real model)",
    "real_siliconflow": "provider-level probe recorded separately; this gate uses the fake server",
}
(EVIDENCE / "host-version.json").write_text(json.dumps(host, indent=2) + "\n", encoding="utf-8")
(EVIDENCE / "host-version.txt").write_text(
    "dsh 0.2.2-rc.1\nnode 24.21.0\nplugin 0.15.0\nprofile t20\n"
    f"isolated_root {ROOT}\nplaywright 1.63.0\n"
    "fake_embedding_provider local simulation (not a real model)\n"
    "real_siliconflow provider-level probe recorded separately; this gate uses the fake server\n",
    encoding="utf-8",
    newline="\n",
)
print(json.dumps({"root": str(ROOT), "tarball_sha256": state["tarball_sha256"], "files": len(list(EVIDENCE.rglob("*")))} , indent=2))
