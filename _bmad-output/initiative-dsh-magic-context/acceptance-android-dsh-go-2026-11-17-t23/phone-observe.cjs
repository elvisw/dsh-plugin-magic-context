// Read ONLY this gate's private data; export fixture rows and bounded metadata.
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const { createRequire } = require('node:module');
const { DatabaseSync } = require('node:sqlite');
const phase = process.argv[2] || 'before-restart';
if (!['before-restart', 'after-restart'].includes(phase)) throw Error('invalid phase');
const home = process.env.DSH_HOME || path.join(os.homedir(), '.dsh');
const dataDir = path.join(home, 'dsh-go', 'mc-t23-397f7ef8', 'data');
const result = { phase, at: new Date().toISOString(), dataDir, databases: [] };
try {
  const requireFromProfile = createRequire(path.join(home, 'profiles', 'web', 'package.json'));
  const entry = requireFromProfile.resolve('@elvisw/dsh-magic-context');
  const nativeFile = path.join(path.dirname(entry), 'dsh', 'go-native.js');
  result.installedNativeSha256 = crypto.createHash('sha256').update(fs.readFileSync(nativeFile)).digest('hex');
  const files = fs.readdirSync(dataDir);
  for (const name of files.filter(name => /\.(?:db|sqlite|sqlite3)$/.test(name))) {
    const db = new DatabaseSync(path.join(dataDir, name), { readOnly: true });
    try {
      const item = { file: name };
      const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map(row => row.name);
      if (tables.includes('memories')) {
        item.memoryCount = db.prepare('SELECT count(*) AS n FROM memories').get().n;
        item.fixtureMemories = db.prepare(
          "SELECT id, project_path, category, content, status FROM memories WHERE content GLOB 'T23_*' ORDER BY id",
        ).all();
        if (tables.includes('memory_embeddings')) {
          item.fixtureVectors = db.prepare(
            "SELECT e.memory_id, e.model_id, length(e.embedding) AS vector_bytes FROM memory_embeddings e "
            + "JOIN memories m ON m.id=e.memory_id WHERE m.content GLOB 'T23_*' ORDER BY e.memory_id",
          ).all();
        }
      }
      if (tables.includes('journal')) {
        const rows = db.prepare(
          "SELECT * FROM journal WHERE kind IN ('boot','tool-call','vector-lane','error') ORDER BY rowid DESC LIMIT 500",
        ).all();
        item.journal = rows.flatMap(row => {
          let detail = {};
          try { detail = JSON.parse(row.data_json || row.data || '{}') || {}; } catch {}
          if (row.kind === 'tool-call' && detail.tool !== 'ctx_memory') return [];
          // No prompts, full log text, host config or arbitrary payloads leave
          // the phone. These fields are local test counters and event anchors.
          return [{
            at: row.at, kind: row.kind, sessionId: row.session_id,
            ...(row.kind === 'tool-call' ? {
              action: detail.action, id: detail.id, hits: detail.hits, ok: detail.ok,
            } : {}),
            ...(row.kind === 'vector-lane' ? {
              outcome: detail.outcome, created: detail.created, updated: detail.updated,
            } : {}),
          }];
        });
      }
      result.databases.push(item);
    } finally {
      db.close();
    }
  }
  const stateFile = files.find(name => /rebuild.*\.json$/.test(name));
  if (stateFile) {
    const state = JSON.parse(fs.readFileSync(path.join(dataDir, stateFile), 'utf8'));
    result.rebuild = Object.fromEntries(
      ['state', 'status', 'targetIdentity', 'processed', 'total', 'failures', 'updatedAt']
        .filter(key => Object.hasOwn(state, key)).map(key => [key, state[key]]),
    );
  }
  result.status = 'observed';
} catch (error) {
  result.status = 'blocked';
  result.code = String(error.code || 'OBSERVE_FAILED');
}
fs.writeFileSync(path.join(__dirname, `phone-${phase}.json`), JSON.stringify(result, null, 2) + '\n');
console.log(JSON.stringify({ phase, status: result.status, code: result.code }));
if (result.status !== 'observed') process.exitCode = 1;
