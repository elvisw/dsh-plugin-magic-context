"""Read-only proof of the durable tag state written during the T2 host run."""

from __future__ import annotations

import json
from pathlib import Path
import sqlite3

REPORT_DIR = Path(__file__).resolve().parent
ROOT = Path(json.loads((REPORT_DIR / "experiment-root.json").read_text(encoding="utf-8"))["root"])
DB = ROOT / "plugin-data" / "dsh-magic-context.db"


def main() -> None:
    con = sqlite3.connect(f"file:{DB}?mode=ro", uri=True)
    try:
        tags = [
            {"session": row[0], "kind": row[1], "target": row[2], "tag": row[3]}
            for row in con.execute(
                "SELECT session_id, target_kind, target_id, tag_number FROM tags ORDER BY session_id, tag_number"
            )
        ]
        drops = [
            {"session": row[0], "tag": row[1], "landed_event_seq": row[2]}
            for row in con.execute(
                "SELECT session_id, tag_number, landed_event_seq FROM pending_drops ORDER BY session_id, tag_number"
            )
        ]
        meta = {row[0]: row[1] for row in con.execute("SELECT key, value FROM meta")}
    finally:
        con.close()
    proof = {"db": str(DB), "meta": meta, "tags": tags, "pending_drops": drops}
    (ROOT / "evidence" / "t2-db-proof.json").write_text(json.dumps(proof, indent=2), encoding="utf-8")
    print(json.dumps({"tags": len(tags), "drops": drops}, indent=2))


if __name__ == "__main__":
    main()
