"""Seed three searchable memories into the isolated T20 corpus after the host opens it."""

from __future__ import annotations

import argparse
import json
from pathlib import Path
import sqlite3
import time

REPORT_DIR = Path(__file__).resolve().parent


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--root", default="")
    args = parser.parse_args()
    root = (
        Path(args.root)
        if args.root
        else Path(json.loads((REPORT_DIR / "experiment-root.json").read_text(encoding="utf-8"))["root"])
    )
    db_path = root / "plugin-data" / "memories.db"
    deadline = time.time() + 90
    while time.time() < deadline and not db_path.exists():
        time.sleep(0.5)
    if not db_path.exists():
        raise SystemExit(f"corpus did not appear: {db_path}")
    now = int(time.time() * 1000)
    rows = [
        (1, "T20 fixture memory alpha: local-first retrieval", "active"),
        (2, "T20 fixture memory beta: remote target migration", "active"),
        (3, "T20 fixture memory gamma: permanent searchable row", "permanent"),
    ]
    connection = sqlite3.connect(db_path, timeout=30)
    try:
        for memory_id, content, status in rows:
            connection.execute(
                "INSERT OR IGNORE INTO memories("
                "id, project_path, category, content, normalized_hash, scope, shareable, "
                "first_seen_at, created_at, updated_at, last_seen_at, status"
                ") VALUES(?, ?, ?, ?, ?, 'project', 0, ?, ?, ?, ?, ?)",
                (
                    memory_id,
                    "git:t20-fixture",
                    "ARCHITECTURE",
                    content,
                    f"t20-fixture-{memory_id}",
                    now, now, now, now,
                    status,
                ),
            )
        connection.commit()
        count = connection.execute("SELECT COUNT(*) FROM memories").fetchone()[0]
    finally:
        connection.close()
    state = {"db": str(db_path), "rows": count, "ids": [row[0] for row in rows]}
    (root / "evidence" / "seed-corpus.json").write_text(json.dumps(state, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(state, indent=2))


if __name__ == "__main__":
    main()
