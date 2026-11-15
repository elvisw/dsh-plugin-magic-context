"""Read-only DB probe for the combined 0.12.2 evidence bundle."""

from __future__ import annotations

import json
from pathlib import Path
import sqlite3

REPORT_DIR = Path(__file__).resolve().parent
ROOT = Path(json.loads((REPORT_DIR / "experiment-root.json").read_text(encoding="utf-8"))["root"])
STATE = json.loads((ROOT / "evidence" / "combined-state.json").read_text(encoding="utf-8"))
DB = ROOT / "plugin-data" / "dsh-magic-context.db"
MEMORY_DB = ROOT / "plugin-data" / "memories.db"


def rows(connection: sqlite3.Connection, sql: str, params: tuple = ()) -> list[dict]:
    connection.row_factory = sqlite3.Row
    return [dict(row) for row in connection.execute(sql, params)]


def session_probe(connection: sqlite3.Connection, session_id: str) -> dict:
    return {
        "session_id": session_id,
        "tags": rows(connection, "SELECT tag_number, target_kind, target_id FROM tags WHERE session_id = ? ORDER BY tag_number", (session_id,)),
        "pendingDrops": rows(connection, "SELECT tag_number, queued_at, landed_event_seq, flush_requested FROM pending_drops WHERE session_id = ? ORDER BY tag_number", (session_id,)),
        "compartments": rows(connection, "SELECT compartment_id, covered_start_seq, covered_end_seq, landed_event_seq, superseded FROM compartments WHERE session_id = ? ORDER BY compartment_id", (session_id,)),
        "journalCounts": {row["kind"]: row["n"] for row in rows(connection, "SELECT kind, COUNT(*) AS n FROM journal WHERE session_id = ? GROUP BY kind ORDER BY kind", (session_id,))},
        "historianRows": rows(connection, "SELECT id, summary, data FROM journal WHERE session_id = ? AND kind = 'historian' ORDER BY id", (session_id,)),
        "publishedRows": rows(connection, "SELECT id, summary, data FROM journal WHERE session_id = ? AND kind = 'compartment-published' ORDER BY id", (session_id,)),
        "passRows": rows(connection, "SELECT id, summary, data FROM journal WHERE session_id = ? AND kind = 'pass' ORDER BY id", (session_id,)),
        "emergencyRows": rows(connection, "SELECT id, summary, data FROM journal WHERE session_id = ? AND kind = 'emergency-reclaim' ORDER BY id", (session_id,)),
        "usageRecords": rows(connection, "SELECT COUNT(*) AS n FROM usage_records WHERE session_id = ?", (session_id,))[0]["n"],
    }


connection = sqlite3.connect(DB)
try:
    sessions = {}
    for chain in ("recovery", "historian", "flush", "vector"):
        sid = STATE[chain].get("sessionId") or (STATE[chain].get("record") or {}).get("session_id")
        sessions[chain] = session_probe(connection, sid)
    discarded = {}
    for sid in STATE.get("discardedSessions", {}):
        discarded[sid] = session_probe(connection, sid)
    vector = {
        "journal": rows(connection, "SELECT id, at, summary, data FROM journal WHERE kind = 'vector-lane' ORDER BY id"),
        "kinds": {row["kind"]: row["n"] for row in rows(connection, "SELECT kind, COUNT(*) AS n FROM journal GROUP BY kind ORDER BY kind")},
    }
finally:
    connection.close()

memory_connection = sqlite3.connect(MEMORY_DB)
try:
    memory_connection.row_factory = sqlite3.Row
    memories = [dict(row) for row in memory_connection.execute("SELECT id, created_at, category FROM memories ORDER BY id")]
    embeddings = [dict(row) for row in memory_connection.execute("SELECT memory_id, model_id FROM memory_embeddings ORDER BY memory_id")]
    spaces = [dict(row) for row in memory_connection.execute("SELECT model_id, COUNT(*) AS n FROM memory_embeddings GROUP BY model_id ORDER BY model_id")]
finally:
    memory_connection.close()

payload = {
    "db": str(DB),
    "sessions": sessions,
    "discardedSessions": discarded,
    "vector": vector,
    "memory": {"memories": memories, "embeddings": embeddings, "spaces": spaces},
}
out = ROOT / "evidence" / "db-probes.json"
out.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
print(json.dumps({
    "sessions": {key: {"tags": len(value["tags"]), "pending": len(value["pendingDrops"]), "compartments": len(value["compartments"]), "journal": value["journalCounts"]} for key, value in sessions.items()},
    "vector": len(vector["journal"]),
    "embeddings": len(embeddings),
    "bytes": out.stat().st_size,
}, ensure_ascii=False, indent=2))
