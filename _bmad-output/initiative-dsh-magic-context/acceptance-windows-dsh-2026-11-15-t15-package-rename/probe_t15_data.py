"""T15 storage compatibility probe: 0.12.3 -> 0.13.0.

Uses the exact published 0.12.3 npm tarball and the exact local 0.13.0 tarball.
Seeds one memory, one journal row and one pending drop through the old package's
storage modules, then verifies them through the new package in a separate
process. No model, host profile or daily data is involved.

Usage: python probe_t15_data.py
"""

from __future__ import annotations

import base64
import hashlib
import json
import os
from pathlib import Path
import shutil
import subprocess
import tarfile

HERE = Path(__file__).resolve().parent
REPO = Path(r"C:\Users\elvis\Documents\dev\plugin\dsh-plugin-magic-context")
OLD_TGZ = Path(os.environ.get(
    "T15_OLD_PACK",
    str(Path(os.environ["TEMP"]) / "opencode" / "t15-old-pack" / "elvisw-dsh-plugin-magic-context-0.12.3.tgz"),
))
NEW_TGZ = Path(os.environ.get(
    "T15_PACK",
    str(Path(os.environ["TEMP"]) / "opencode" / "t15-pack-gate" / "elvisw-dsh-magic-context-0.13.0.tgz"),
))
ROOT = Path(os.environ.get(
    "T15_PROBE_ROOT",
    str(Path(os.environ["TEMP"]) / "opencode" / "dsh-mc-t15-data-probe-20261115-205000"),
))
PROBE = HERE / "t15-data-probe.mjs"
OLD_SHA1 = "14175a767425cdd5a161e96a7918237aedfb2294"
NEW_SHA256 = "1c8ac596be020e72b6e0103c287bcd606721dccd5af5b118605d253e2049dfd6"


def file_hashes(path: Path) -> dict[str, str]:
    data = path.read_bytes()
    return {
        "sha1": hashlib.sha1(data).hexdigest(),
        "sha256": hashlib.sha256(data).hexdigest(),
        "integrity": "sha512-" + base64.b64encode(hashlib.sha512(data).digest()).decode(),
    }


def extract(tgz: Path, destination: Path) -> Path:
    if destination.exists():
        return destination
    destination.mkdir(parents=True)
    with tarfile.open(tgz, "r:gz") as archive:
        archive.extractall(destination)
    return destination


def run(mode: str, package: Path, data_dir: Path) -> dict:
    result = subprocess.run(
        ["node", str(PROBE), mode, "--pkg", str(package), "--data-dir", str(data_dir)],
        check=True,
        capture_output=True,
        text=True,
    )
    (HERE / "evidence" / f"data-probe-{mode}.json").write_text(result.stdout, encoding="utf-8")
    if result.stderr:
        (HERE / "evidence" / f"data-probe-{mode}.stderr.txt").write_text(result.stderr, encoding="utf-8")
    return json.loads(result.stdout)


def main() -> None:
    old_hashes = file_hashes(OLD_TGZ)
    new_hashes = file_hashes(NEW_TGZ)
    if old_hashes["sha1"] != OLD_SHA1:
        raise SystemExit(f"unexpected 0.12.3 tarball sha1: {old_hashes['sha1']}")
    if new_hashes["sha256"] != NEW_SHA256:
        raise SystemExit(f"unexpected 0.13.0 tarball sha256: {new_hashes['sha256']}")
    if ROOT.exists():
        shutil.rmtree(ROOT)
    ROOT.mkdir(parents=True)
    node_version = subprocess.check_output(["node", "--version"], text=True).strip()
    old_pkg = extract(OLD_TGZ, ROOT / "old")
    new_pkg = extract(NEW_TGZ, ROOT / "new")
    data_dir = ROOT / "plugin-data"
    data_dir.mkdir(parents=True, exist_ok=True)
    seed = run("seed", old_pkg / "package", data_dir)
    verify = run("verify", new_pkg / "package", data_dir)
    checks = {
        "old_package_version": seed["packageVersion"],
        "new_package_version": verify["packageVersion"],
        "adapter_schema_seed": seed["schemaVersion"],
        "adapter_schema_verify": int(verify["schemaVersion"]),
        "corpus_schema_seed": seed["corpus"]["detail"],
        "corpus_bootstrap_seed": seed["corpus"]["outcome"],
        "corpus_bootstrap_verify": verify["corpus"]["outcome"],
        "memory_seed_ok": seed["memory"]["ok"],
        "memory_verify_rows": verify["stats"]["rows"],
        "memory_id": verify["memories"][0]["id"] if verify["memories"] else None,
        "memory_content": verify["memories"][0]["content"] if verify["memories"] else None,
        "memory_category": verify["memories"][0]["category"] if verify["memories"] else None,
        "memory_importance": verify["memories"][0]["importance"] if verify["memories"] else None,
        "journal_seed_rows": seed["journalBounds"]["rows"],
        "journal_verify_rows": verify["journalBounds"]["rows"],
        "journal_marker": verify["journal"][0]["data"]["marker"] if verify["journal"] else None,
        "pending_drop_seed": seed["pendingDrop"],
        "pending_drop_verify": verify["pendingDrop"],
        "probe_marker": verify["probeMarker"],
    }
    checks["memory_preserved"] = (
        checks["memory_verify_rows"] == 1
        and checks["memory_id"] == 1
        and checks["memory_content"] == "T15_DATA_SURVIVAL_4097"
        and checks["memory_category"] == "CONFIG_VALUES"
        and checks["memory_importance"] == 7
    )
    checks["journal_preserved"] = checks["journal_verify_rows"] == 1 and checks["journal_marker"] == "T15_DATA_SURVIVAL_4097"
    checks["pending_drop_preserved"] = checks["pending_drop_verify"] == "pending"
    checks["schema_preserved"] = checks["adapter_schema_seed"] == checks["adapter_schema_verify"] == 11
    checks["corpus_preserved"] = checks["corpus_schema_seed"] == "v95" and checks["corpus_bootstrap_verify"] == "exists"
    checks["ok"] = all(value is True or (isinstance(value, bool) and value) for key, value in checks.items() if key.endswith("_preserved"))
    (HERE / "evidence" / "t15-data-probe.json").write_text(
        json.dumps(
            {
                "root": str(ROOT),
                "node": node_version,
                "old_tarball": str(OLD_TGZ),
                "old_tarball_hashes": old_hashes,
                "new_tarball": str(NEW_TGZ),
                "new_tarball_hashes": new_hashes,
                "scope": "read path through the new package; no write through the new package",
                **checks,
            },
            indent=2,
        ) + "\n",
        encoding="utf-8",
    )
    print(json.dumps(checks, indent=2))
    if not checks["ok"]:
        raise SystemExit(1)


if __name__ == "__main__":
    main()
