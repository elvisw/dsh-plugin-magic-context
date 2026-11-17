import json
import re
import sqlite3
from pathlib import Path

root = Path(r"C:\Users\elvis\AppData\Local\Temp\opencode\dsh-mc-wrapup-20261117-1700")
out = Path(r"C:\Users\elvis\Documents\dev\plugin\dsh-plugin-magic-context\_bmad-output\initiative-dsh-magic-context\acceptance-windows-dsh-2026-11-17-t22-wrapup-real")
out.mkdir(parents=True, exist_ok=True)
(out / "evidence").mkdir(exist_ok=True)
(out / "screenshots").mkdir(exist_ok=True)

server = json.loads((root / "evidence" / "server.json").read_text(encoding="utf-8"))
server["url"] = re.sub(r"(\?token=)[^\s&]+", r"\1<redacted>", server["url"])
(out / "evidence" / "server-redacted.json").write_text(json.dumps(server, indent=2) + "\n", encoding="utf-8", newline="\n")

db = root / "plugin-data" / "dsh-magic-context.db"
conn = sqlite3.connect(f"file:{db}?mode=ro", uri=True)
conn.row_factory = sqlite3.Row
rows = [dict(row) for row in conn.execute(
    "SELECT id, at, kind, session_id, summary, data FROM journal WHERE id >= 21 ORDER BY id"
)]
for row in rows:
    row["data"] = json.loads(row["data"]) if row.get("data") else None
marker = dict(conn.execute(
    "SELECT key, value FROM meta WHERE key LIKE 'wrapup_request:%' ORDER BY key"
).fetchone() or {})
comp = dict(conn.execute(
    "SELECT session_id, compartment_id, covered_start_seq, covered_end_seq, covered_seqs, covered_tokens, importance, landed_event_seq, landed_reason, superseded FROM compartments ORDER BY rowid DESC LIMIT 1"
).fetchone() or {})
conn.close()
result = {
    "sessionId": marker.get("key", "").split(":", 1)[1] if marker else None,
    "marker": marker,
    "compartment": comp,
    "journal": rows,
}
(out / "evidence" / "wrapup-journal.json").write_text(json.dumps(result, indent=2, ensure_ascii=False) + "\n", encoding="utf-8", newline="\n")
(out / "evidence" / "session-id.txt").write_text((result["sessionId"] or "") + "\n", encoding="utf-8", newline="\n")
print(json.dumps({"sessionId": result["sessionId"], "marker": marker, "compartment": comp}, ensure_ascii=False, indent=2))
