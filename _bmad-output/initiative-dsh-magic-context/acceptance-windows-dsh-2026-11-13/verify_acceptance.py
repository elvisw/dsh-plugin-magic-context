"""Validate the recorded conclusions, including expected product failures."""
import hashlib
import json
from pathlib import Path
import zipfile

from prepare_experiment import POINTER, REPORT_DIR

root = Path(json.loads(POINTER.read_text(encoding="utf-8"))["root"])
evidence = REPORT_DIR / "evidence"
checks = []


def read_json(path):
    return json.loads(path.read_text(encoding="utf-8"))


rows = read_json(evidence / "restoration-analysis.json")
for sid, cross_process in [
    ("session-7f20e2db-2f37-4c11-93b2-77398bdd4085", False),
    ("session-a31842e2-cdac-40d2-ba84-c2ad5b8da71c", True),
]:
    row = next(row for row in rows if row["session_id"] == sid)
    restored = row["restores"][0]
    assert restored["content_equal"] and restored["identity_equal"]
    assert restored["original_content_sha256"] == restored["restored_content_sha256"]
    assert restored["drop_seen_on_live_surface"] and restored["restore_seen_on_live_surface"]
    assert restored["original_text_utf8_bytes"] == 501
    if cross_process:
        assert len(row["process_ids"]) >= 2
    checks.append("cross-process exact restore" if cross_process else "same-process exact restore")
assert "9a601b5765b64bc19ec3c13e5235dd4a" not in (root / "workspace/fixture.txt").read_text(encoding="utf-8")
checks.append("disk fixture no longer contains original nonce")
repeat = next(row for row in rows if row["session_id"] == "session-39d42cc1-efb0-42b7-8061-4bf5e6048d54")
assert len(repeat["drops"]) == len(repeat["restores"]) == 1
transcript = [json.loads(line) for line in (root / "evidence/real-model-repeat-drop.stdout.txt").read_text(encoding="utf-8").splitlines()]
assert [row["tool"] for row in transcript if row["type"] == "tool_call"] == ["read", "ctx_reduce", "ctx_expand", "ctx_reduce", "ctx_expand"]
assert "no dropped item" in [row["result"] for row in transcript if row["type"] == "tool_result"][-1]
checks.append("requeue bug reproduced in real host")
memory_rows = [json.loads(line) for line in (root / "evidence/memory-and-raw-history-session-b.stdout.txt").read_text(encoding="utf-8").splitlines()]
memory_results = [row["result"] for row in memory_rows if row["type"] == "tool_result"]
assert "match=fts" in memory_results[0] and "MEM_c886d7cfa3784c69b9a983f9c3056b45" in memory_results[0]
assert "no dropped item" in memory_results[-1]
checks.append("cross-session project FTS succeeds; old-tag expansion does not")
owners = {row["processId"]: row["constructor"] for line in (root / "evidence/session-observer/engine-owners.jsonl").read_text(encoding="utf-8").splitlines() if (row := json.loads(line))}
assert owners[11036] == owners[5708] == "MagicContextCompactionEngine"
assert owners[22084] == "BasicCompactionEngine"
checks.append("actual engine owners for conflict, takeover, and fallback")
historian = read_json(evidence / "historian-fresh-analysis.json")
assert historian["drops"][0]["was_live"] and not historian["drops"][0]["live_now"]
assert historian["compartments"][0]["covers_drop"] and historian["originals_still_in_raw_log"]
assert "no dropped item" in historian["expand_result"][-1]
checks.append("historian hides first-time drop; restore unavailable; raw original retained")
summary = read_json(evidence / "run-summary.json")
assert summary["requeue_regression_actual_exit"] == 1
for relative in ["lib/core/stores.js", "lib/dsh/tool-bridge.js"]:
    installed = root / "dsh-home/profiles/headless/node_modules/dsh-plugin-magic-context" / relative
    extracted = root / "plugin/package" / relative
    assert installed.read_bytes() == extracted.read_bytes()
checks.append("storage reproduction uses same code as installed plugin")
archive = evidence / "redacted-runtime.zip"
assert hashlib.sha256(archive.read_bytes()).hexdigest() == (evidence / "archive-sha256.txt").read_text().split()[0]
with zipfile.ZipFile(archive) as bundle:
    assert bundle.testzip() is None
checks.append("evidence archive SHA-256 and CRC")
print(json.dumps({"status": "evidence validated, NOT full product acceptance", "checks": checks}, ensure_ascii=False, indent=2))
