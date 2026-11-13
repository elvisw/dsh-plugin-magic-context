"""Collect the key 0.11.2 evidence into the report directory and archive it."""

from __future__ import annotations

import hashlib
import json
import shutil
import zipfile
from pathlib import Path

from prepare_experiment import POINTER, redact

ROOT = Path(json.loads(POINTER.read_text(encoding="utf-8"))["root"])
REPORT_DIR = Path(__file__).resolve().parent
TARGET = REPORT_DIR / "evidence"
SOURCE = ROOT / "evidence"

FILES = [
    "run-summary.json",
    "version-lock.json",
    "restoration-analysis.json",
    "historian-fresh-analysis-0112.json",
    "package-verification.json",
    "requeue-regression-0112.txt",
    "isolation-before.json",
    "isolation-after.json",
    "driver-summary.json",
    "engine-sweep.json",
    "session-observer/engine-owners.jsonl",
    "install-2.json",
    "install-2.stdout.txt",
    "smoke.json",
    "smoke.stdout.txt",
    "smoke.stderr.txt",
]
LABELS = [
    "real-model-roundtrip-0112",
    "real-model-drop-before-restart-0112",
    "real-model-expand-after-restart-0112",
    "real-model-repeat-drop-0112",
    "memory-write-session-a-0112",
    "memory-and-raw-history-session-b-0112",
    "historian-fresh-seed-0112",
    "historian-fresh-publish-and-expand-0112",
    "engine-conflict",
    "engine-takeover",
    "engine-fallback",
]
SESSIONS = [
    "session-5aac249a-ae41-4b3a-9f77-c8fa11fdd049",
    "session-c6250978-c716-418b-b69b-df662e1d1d66",
    "session-f1c2fddd-122d-4781-b41a-8cef0820ac9f",
    "session-47130071-e625-4c8e-bd50-a61da6b7d70a",
    "session-0c0cfbf2-43a0-46ce-9f36-0101d00d7082",
]


def copy_text(source: Path, target: Path) -> None:
    text = source.read_text(encoding="utf-8")
    if text != redact(text):
        raise SystemExit(f"possible secret in {source}")
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(text, encoding="utf-8")


def main() -> None:
    TARGET.mkdir(exist_ok=True)
    for name in FILES:
        copy_text(SOURCE / name, TARGET / name)
    for label in LABELS:
        for suffix in (".stdout.txt", ".stderr.txt", ".json"):
            source = SOURCE / f"{label}{suffix}"
            if source.exists():
                copy_text(source, TARGET / f"{label}{suffix}")
    observer_target = TARGET / "session-observer"
    observer_target.mkdir(exist_ok=True)
    for session in SESSIONS:
        source = SOURCE / "session-observer" / f"{session}.jsonl"
        if source.exists():
            copy_text(source, observer_target / f"{session}.jsonl")
    archive = TARGET / "redacted-runtime.zip"
    with zipfile.ZipFile(archive, "w", zipfile.ZIP_DEFLATED) as bundle:
        for path in sorted(TARGET.rglob("*")):
            if path.is_file() and path != archive:
                bundle.write(path, path.relative_to(REPORT_DIR).as_posix())
    digest = hashlib.sha256(archive.read_bytes()).hexdigest()
    (TARGET / "archive-sha256.txt").write_text(f"{digest}  {archive.name}\n", encoding="utf-8")
    print(json.dumps({
        "files": len(list(TARGET.rglob("*"))),
        "archive_bytes": archive.stat().st_size,
        "archive_sha256": digest,
        "evidence": str(TARGET),
    }, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
