"""Print compartment and pending-drop rows for the historian session."""

from __future__ import annotations

import json
import sqlite3
import sys
from pathlib import Path

from prepare_experiment import POINTER

ROOT = Path(json.loads(POINTER.read_text(encoding="utf-8"))["root"])
DB = ROOT / "plugin-data" / "dsh-magic-context.db"
SESSION = sys.argv[1]


def main() -> None:
    connection = sqlite3.connect(f"file:{DB.as_posix()}?mode=ro", uri=True)
    connection.row_factory = sqlite3.Row
    try:
        compartments = [dict(row) for row in connection.execute(
            "select * from compartments where session_id = ?", (SESSION,)
        )]
        drops = [dict(row) for row in connection.execute(
            "select * from pending_drops where session_id = ?", (SESSION,)
        )]
        print(json.dumps({"compartments": compartments, "pending_drops": drops}, ensure_ascii=False, indent=2))
    finally:
        connection.close()


if __name__ == "__main__":
    main()
