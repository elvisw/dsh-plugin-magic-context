"""Drive the vector first-writer host gate through an isolated real DSH host.

One host run: write a synthetic memory, wait for the maintenance tick, then
search. The database and journal are inspected after the process exits.
"""

from __future__ import annotations

import json
import os
from pathlib import Path
import re
import sqlite3
import subprocess
import time

from prepare_vector_host import DSH_CMD, REPORT_DIR, isolated_env

ROOT = Path(json.loads((REPORT_DIR / "experiment-root.json").read_text(encoding="utf-8"))["root"])
EVIDENCE = ROOT / "evidence"
WORKSPACE = ROOT / "workspace"
OVERLAY = ROOT / "overlays" / "vector.yml"
PLUGIN_DB = ROOT / "plugin-data" / "dsh-magic-context.db"
MEMORY_DB = ROOT / "plugin-data" / "memories.db"


def redact(text: str) -> str:
    for name, value in os.environ.items():
        if re.search(r"KEY|TOKEN|PASSWORD|SECRET", name, re.I) and len(value) >= 8:
            text = text.replace(value, "[REDACTED]")
    return text


def count_table(path: Path, table: str) -> int | None:
    if not path.exists():
        return None
    try:
        db = sqlite3.connect(path)
        try:
            return int(db.execute(f"SELECT COUNT(*) FROM {table}").fetchone()[0])
        finally:
            db.close()
    except Exception:
        return None


def main() -> None:
    if str(ROOT) not in (ROOT / "overlays" / "vector.yml").read_text(encoding="utf-8") \
            and ROOT.as_posix() not in (ROOT / "overlays" / "vector.yml").read_text(encoding="utf-8"):
        raise SystemExit("overlay does not reference this root")

    prompt = (
        "Isolated vector-bootstrap acceptance. Follow this exact sequence, one tool call per model step. "
        "(1) Call ctx_memory with action \"write\", category \"PROJECT_RULES\", content "
        "\"Always run npm test before committing changes.\". "
        "(2) Call vector_wait with seconds 100. "
        "(3) Call ctx_memory with action \"search\", query \"npm test before committing\", limit 5. "
        "(4) Respond exactly VECTOR_HOST_OK. Do not call any other tool."
    )
    args = [
        "--profile", "headless",
        "--patch", str(OVERLAY),
        "--json",
        "--permission-mode", "read-only",
        "--approval-policy", "never",
        prompt,
    ]
    env = isolated_env(ROOT)
    started = time.monotonic()
    try:
        result = subprocess.run(
            [*DSH_CMD, *args], cwd=WORKSPACE, env=env,
            capture_output=True, text=True, encoding="utf-8", errors="replace", timeout=300,
        )
        stdout, stderr = redact(result.stdout), redact(result.stderr)
        exit_code = result.returncode
    except subprocess.TimeoutExpired as exc:
        stdout = redact((exc.stdout or b"").decode("utf-8", errors="replace"))
        stderr = redact((exc.stderr or b"").decode("utf-8", errors="replace"))
        exit_code = "timeout"
    elapsed = round(time.monotonic() - started, 3)
    (EVIDENCE / "vector-host.stdout.txt").write_text(stdout, encoding="utf-8")
    (EVIDENCE / "vector-host.stderr.txt").write_text(stderr, encoding="utf-8")

    rows = []
    for line in stdout.splitlines():
        try:
            row = json.loads(line)
        except json.JSONDecodeError:
            continue
        if isinstance(row, dict):
            rows.append(row)
    session = next((row for row in rows if row.get("type") == "session"), None)
    final = next((row for row in reversed(rows) if row.get("type") == "final"), None)
    driver = {
        "args": args,
        "exit_code": exit_code,
        "seconds": elapsed,
        "session_id": session.get("sessionId") if session else None,
        "final_reason": final.get("reason") if final else None,
        "final_text": final.get("text") if final else None,
        "tool_calls": [
            {"tool": row.get("tool"), "input": row.get("input")}
            for row in rows if row.get("type") == "tool_call"
        ],
        "tool_results": [
            {"callId": row.get("callId"), "status": row.get("status"), "result": row.get("result")}
            for row in rows if row.get("type") == "tool_result"
        ],
    }
    (EVIDENCE / "vector-host.driver.json").write_text(json.dumps(driver, ensure_ascii=False, indent=2), encoding="utf-8")

    memory_rows = count_table(MEMORY_DB, "memories")
    embedding_rows = count_table(MEMORY_DB, "memory_embeddings")
    embeddings = []
    active = []
    if MEMORY_DB.exists():
        db = sqlite3.connect(MEMORY_DB)
        try:
            embeddings = [
                {"model_id": row[0], "rows": row[1]}
                for row in db.execute("SELECT model_id, COUNT(*) FROM memory_embeddings GROUP BY model_id ORDER BY model_id")
            ]
            active = [
                {"id": row[0], "status": row[1], "content": row[2][:120]}
                for row in db.execute("SELECT id, status, content FROM memories ORDER BY id")
            ]
        finally:
            db.close()
    vector_journal = []
    if PLUGIN_DB.exists():
        db = sqlite3.connect(PLUGIN_DB)
        try:
            vector_journal = [
                {"id": row[0], "level": row[1], "summary": row[2], "data": json.loads(row[3]) if row[3] else None}
                for row in db.execute(
                    "SELECT id, level, summary, data FROM journal WHERE kind = 'vector-lane' ORDER BY id"
                )
            ]
        finally:
            db.close()
    database = {
        "memory_db": str(MEMORY_DB),
        "memories": memory_rows,
        "memory_embeddings": embedding_rows,
        "spaces": embeddings,
        "active": active,
        "vector_journal": vector_journal,
        "model_cache": [
            {"name": path.name, "bytes": path.stat().st_size}
            for path in sorted((ROOT / "plugin-data" / "models").glob("*")) if path.is_file()
        ] if (ROOT / "plugin-data" / "models").exists() else [],
        "final_ok": driver["final_text"] == "VECTOR_HOST_OK",
    }
    (EVIDENCE / "vector-db.json").write_text(json.dumps(database, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps({
        "root": str(ROOT),
        "exit_code": exit_code,
        "session_id": driver["session_id"],
        "final_text": driver["final_text"],
        "tool_calls": [entry["tool"] for entry in driver["tool_calls"]],
        "memories": memory_rows,
        "embeddings": embedding_rows,
        "spaces": embeddings,
        "vector_journal": [
            {"id": row["id"], "level": row["level"], "summary": row["summary"], "outcome": (row["data"] or {}).get("outcome")}
            for row in vector_journal
        ],
    }, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
