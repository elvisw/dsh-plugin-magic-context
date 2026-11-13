"""Archive redacted evidence, aggregate usage, and preserve the known regression."""
from __future__ import annotations

import hashlib
import json
from pathlib import Path
import shutil
import subprocess
import zipfile

from prepare_experiment import POINTER, REPORT_DIR, redact


def main() -> None:
    root = Path(json.loads(POINTER.read_text(encoding="utf-8"))["root"])
    evidence = root / "evidence"
    target = REPORT_DIR / "evidence"
    target.mkdir(exist_ok=True)
    regression = subprocess.run(
        [shutil.which("node"), str(REPORT_DIR / "repro_requeue.mjs")],
        capture_output=True, text=True, encoding="utf-8", timeout=20,
    )
    (evidence / "requeue-regression.txt").write_text(
        redact(regression.stdout + regression.stderr), encoding="utf-8",
    )
    assert regression.returncode == 1 and '"actual_pending":[]' in regression.stdout
    totals: dict[str, float] = {}
    step_count = 0
    invocations = []
    for path in sorted(evidence.glob("*.stdout.txt")):
        try:
            rows = [json.loads(line) for line in path.read_text(encoding="utf-8").splitlines()]
        except json.JSONDecodeError:
            continue
        finals = [row for row in rows if row.get("type") == "final"]
        if not finals:
            continue
        invocations.append({"label": path.name.removesuffix(".stdout.txt"),
                            "session_id": finals[-1].get("sessionId"),
                            "reason": finals[-1].get("reason")})
        for row in rows:
            if row.get("type") == "status" and row.get("phase") == "step_end":
                step_count += 1
                for key, value in row.get("usage", {}).items():
                    if isinstance(value, (int, float)):
                        totals[key] = totals.get(key, 0) + value
    historian_lines = [line for line in (root / "plugin-data/activity.log").read_text(encoding="utf-8").splitlines()
                       if " historian " in line and '"phase":"done"' in line]
    summary = {"host": "0.2.2-rc.1", "node": "24.21.0", "plugin": "0.11.1",
               "mode": "real DSH + real DeepSeek API; no simulated model",
               "invocations": invocations, "agent_model_steps": step_count,
               "agent_reported_usage": totals, "historian_done_runs": len(historian_lines),
               "historian_done_evidence": historian_lines,
               "requeue_regression_expected_exit": 1, "requeue_regression_actual_exit": regression.returncode,
               "usage_note": "Agent totals exclude auxiliary historian usage; neither is a monetary invoice."}
    (evidence / "run-summary.json").write_text(json.dumps(summary, ensure_ascii=False, indent=2), encoding="utf-8")
    for name in ["run-summary.json", "restoration-analysis.json", "historian-fresh-analysis.json", "engine-sweep.json", "requeue-regression.txt"]:
        shutil.copyfile(evidence / name, target / name)
    archive = target / "redacted-runtime.zip"
    with zipfile.ZipFile(archive, "w", zipfile.ZIP_DEFLATED) as bundle:
        for path in sorted(evidence.rglob("*")):
            if path.is_file():
                text = path.read_text(encoding="utf-8")
                assert text == redact(text), f"Unredacted secret detected in {path.name}"
                bundle.writestr(path.relative_to(root).as_posix(), text)
        for path in sorted((root / "overlays").glob("*.yml")):
            bundle.write(path, path.relative_to(root).as_posix())
        bundle.write(root / "dsh-home/profiles/headless/cordis.patch.yml", "profile/cordis.patch.yml")
        bundle.write(root / "dsh-home/profiles/headless/package.json", "profile/package.json")
        bundle.write(root / "workspace/fixture.txt", "fixtures/fixture-after.txt")
        bundle.writestr("plugin-data/activity.log", redact((root / "plugin-data/activity.log").read_text(encoding="utf-8")))
        for name in ["pnpm-lock.yaml", "pnpm-workspace.yaml"]:
            path = root / "dsh-home/profiles/headless" / name
            if path.exists():
                bundle.write(path, "profile/" + name)
    digest = hashlib.sha256(archive.read_bytes()).hexdigest()
    (target / "archive-sha256.txt").write_text(f"{digest}  {archive.name}\n", encoding="utf-8")
    print(json.dumps({"agent_model_steps": step_count, "historian_runs": len(historian_lines),
                      "agent_usage": totals, "archive_bytes": archive.stat().st_size,
                      "archive_sha256": digest, "secret_scan": "passed", "evidence": str(target)}, ensure_ascii=False))


if __name__ == "__main__":
    main()
