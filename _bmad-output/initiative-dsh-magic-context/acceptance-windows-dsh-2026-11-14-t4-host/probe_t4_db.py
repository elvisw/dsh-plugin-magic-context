"""Read-only probe for the T4 host evidence (usage per session)."""

from __future__ import annotations

import json
from pathlib import Path
import sqlite3

HERE = Path(__file__).resolve().parent
ROOT = Path(json.loads((HERE / "experiment-root.json").read_text(encoding="utf-8"))["root"])
DB = ROOT / "plugin-data" / "dsh-magic-context.db"
SESSIONS = [
    "session-372c4a1b-3d5a-4188-bd22-1c117868f872",
    "session-9516b1fe-6f99-4c17-955a-f100963c86fe",
]


def main() -> None:
    connection = sqlite3.connect(DB)
    connection.row_factory = sqlite3.Row
    try:
        print(json.dumps({
            "usage_table": [dict(row) for row in connection.execute("PRAGMA table_info(usage_records)")],
            "usage": {
                session: [
                    dict(row) for row in connection.execute(
                        "SELECT * FROM usage_records WHERE session_id = ? ORDER BY rowid", (session,),
                    )
                ] for session in SESSIONS
            },
        }, ensure_ascii=False, indent=2))
    finally:
        connection.close()


if __name__ == "__main__":
    main()
