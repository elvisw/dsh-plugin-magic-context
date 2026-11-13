"""Read-only schema probe for the isolated plugin database."""

from __future__ import annotations

import json
import sqlite3
from pathlib import Path

from prepare_experiment import POINTER

ROOT = Path(json.loads(POINTER.read_text(encoding="utf-8"))["root"])
DB = ROOT / "plugin-data" / "dsh-magic-context.db"


def main() -> None:
    connection = sqlite3.connect(f"file:{DB.as_posix()}?mode=ro", uri=True)
    try:
        tables = [row[0] for row in connection.execute(
            "select name from sqlite_master where type='table' order by name"
        )]
        print(json.dumps({"tables": tables}, ensure_ascii=False))
        for table in tables:
            if "compartment" in table.lower() or "drop" in table.lower() or "tag" in table.lower():
                columns = [row[1] for row in connection.execute(f"pragma table_info({table})")]
                count = connection.execute(f"select count(*) from {table}").fetchone()[0]
                print(json.dumps({"table": table, "columns": columns, "rows": count}, ensure_ascii=False))
    finally:
        connection.close()


if __name__ == "__main__":
    main()
