// T25 Phase 5b: read the raw ctx_memory search receipt straight from the
// adapter journal, so the `match=` label is evidence rather than a re-rendered
// summary. Read-only.
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { DatabaseSync } = require('node:sqlite');

const home = process.env.DSH_HOME || path.join(os.homedir(), '.dsh');
const adapterDb = path.join(home, 'dsh-go', 'mc-t25-local-vector', 'data', 'dsh-magic-context.db');
const out = { at: new Date().toISOString(), adapterDb };

try {
  if (!fs.existsSync(adapterDb)) {
    throw Object.assign(new Error('adapter db missing'), { code: 'NO_ADAPTER_DB' });
  }
  const db = new DatabaseSync(adapterDb, { readOnly: true });
  try {
    out.toolCalls = db.prepare(
      "SELECT id, at, level, summary, data FROM journal WHERE kind = 'tool-call' ORDER BY id",
    ).all().map((row) => ({
      id: row.id, at: row.at, level: row.level, summary: row.summary,
      data: typeof row.data === 'string' ? row.data : null,
    }));
    out.vectorLane = db.prepare(
      "SELECT id, at, level, summary, data FROM journal WHERE kind = 'vector-lane' ORDER BY id",
    ).all().map((row) => ({
      id: row.id, at: row.at, level: row.level, summary: row.summary,
      data: typeof row.data === 'string' ? row.data : null,
    }));
    out.retrievalCounts = db.prepare(
      "SELECT COUNT(*) AS n FROM journal WHERE summary LIKE '%retrieval%'",
    ).get().n;
  } finally {
    db.close();
  }
  out.status = 'observed';
} catch (error) {
  out.status = 'blocked';
  out.code = String(error.code || 'READ_FAILED');
  out.message = String(error.message || error).slice(0, 200);
}

fs.writeFileSync(path.join(__dirname, 'phone-journal.json'), JSON.stringify(out, null, 2) + '\n');
console.log(JSON.stringify({
  status: out.status,
  code: out.code,
  toolCalls: out.toolCalls?.length,
  vectorLane: out.vectorLane?.map((r) => r.summary),
}));
if (out.status !== 'observed') process.exitCode = 1;
