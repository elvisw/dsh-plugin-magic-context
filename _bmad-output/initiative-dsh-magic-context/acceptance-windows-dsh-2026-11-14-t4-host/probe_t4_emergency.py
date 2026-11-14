"""Extract the skipped force-band evaluation that proves the D3.5 guard."""

from __future__ import annotations

import json
from pathlib import Path
import sqlite3

HERE = Path(__file__).resolve().parent
ROOT = Path(json.loads((HERE / "experiment-root.json").read_text(encoding="utf-8"))["root"])
DB = ROOT / "plugin-data" / "dsh-magic-context.db"
FORCE = "session-9516b1fe-6f99-4c17-955a-f100963c86fe"


def main() -> None:
    connection = sqlite3.connect(DB)
    connection.row_factory = sqlite3.Row
    try:
        rows = [dict(row) for row in connection.execute(
            "SELECT id, at, kind, summary, data FROM journal WHERE session_id = ? AND kind = 'emergency-reclaim' ORDER BY id",
            (FORCE,),
        )]
    finally:
        connection.close()
    parsed = [{**row, "data": json.loads(row["data"])} for row in rows]
    assert len(parsed) == 1, f"expected one emergency-reclaim row, got {len(parsed)}"
    assert parsed[0]["data"]["reason"] == "stale-reading"
    assert parsed[0]["data"]["tier"] == "skipped-stale-reading"
    assert parsed[0]["data"]["dropped"] == 0
    (HERE / "evidence" / "t4-emergency-reclaim.json").write_text(
        json.dumps({"sessionId": FORCE, "rows": parsed}, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    print(json.dumps(parsed, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
