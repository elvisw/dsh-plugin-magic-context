"""Reduce the package-identity host evidence to a single checkable summary."""

from __future__ import annotations

import json
from pathlib import Path

REPORT_DIR = Path(__file__).resolve().parent
ROOT = Path(json.loads((REPORT_DIR / "experiment-root.json").read_text(encoding="utf-8"))["root"])
EVIDENCE = ROOT / "evidence"


def read(path: Path) -> str:
    return path.read_text(encoding="utf-8", errors="replace") if path.exists() else ""


def main() -> None:
    preflight = json.loads((EVIDENCE / "preflight.json").read_text(encoding="utf-8"))
    dump = read(EVIDENCE / "dump-config.txt")
    smoke = json.loads((EVIDENCE / "smoke.json").read_text(encoding="utf-8"))
    add = read(EVIDENCE / "add-new.txt")
    activity = read(ROOT / "plugin-data" / "activity.log")
    client = read(ROOT / "dsh-home" / "profiles" / "headless" / "node_modules" / "@elvisw" / "dsh-plugin-magic-context" / "lib" / "client.js")
    summary = {
        "root": str(ROOT),
        "tarball_sha256": preflight["tarball_sha256"],
        "add_exit_code": preflight["add_exit_code"],
        "add_stdout_has_new_name": "@elvisw/dsh-plugin-magic-context" in add,
        "profile_dependencies": preflight["profile_dependencies"],
        "profile_bundles": preflight["profile_bundles"],
        "old_installed": preflight["old_installed"],
        "new_installed": preflight["new_installed"],
        "new_installed_package_name": preflight["new_installed_package_name"],
        "dump_has_new_name": preflight["dump_has_new_name"],
        "dump_has_old_name": preflight["dump_has_old_name"],
        "dump_has_row_id": "id: magic-context-dsh" in dump,
        "dump_has_plugin_name": "name: '@elvisw/dsh-plugin-magic-context'" in dump,
        "dump_provider": "provider: deepseek-official" in dump,
        "dump_model": "model: deepseek-flash" in dump,
        "client_registers_new_id": "id: '@elvisw/dsh-plugin-magic-context'" in client,
        "boot_tools_dynamic_import": "tools: dynamic-import" in activity,
        "smoke_exit_code": smoke["exit_code"],
        "smoke_final_reason": smoke["final_reason"],
        "smoke_final_text": smoke["final_text"],
        "smoke_session_id": smoke["session_id"],
        "smoke_model": "deepseek-official/deepseek-flash" if "provider: deepseek-official" in dump else None,
    }
    (REPORT_DIR / "analysis.json").write_text(json.dumps(summary, indent=2), encoding="utf-8")
    print(json.dumps(summary, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
