"""Read-only inspection of the vector first-writer host gate database."""

from __future__ import annotations

import json
import sqlite3
from pathlib import Path

ROOT = Path(json.loads((Path(__file__).parent / "experiment-root.json").read_text(encoding="utf-8"))["root"])
DB = ROOT / "plugin-data" / "dsh-magic-context.db"

db = sqlite3.connect(DB)
try:
    rows = db.execute("SELECT id, kind, level, summary, data FROM journal ORDER BY id").fetchall()
    for row in rows:
        if row[1] in {"vector-lane", "memory-write", "maintenance", "memory-lane", "error"}:
            print(json.dumps({"id": row[0], "kind": row[1], "level": row[2], "summary": row[3], "data": json.loads(row[4]) if row[4] else None}, ensure_ascii=False))
finally:
    db.close()
