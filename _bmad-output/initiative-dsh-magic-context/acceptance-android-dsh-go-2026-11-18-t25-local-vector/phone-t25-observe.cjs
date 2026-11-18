// T25 read-only observation: corpus rows, embedding rows, journal vector-lane
// lines and the installed artifact identity. Writes JSON only; never mutates.
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const { createRequire } = require('node:module');
const { DatabaseSync } = require('node:sqlite');

const phase = process.argv[2] || 'after-install';
const home = process.env.DSH_HOME || path.join(os.homedir(), '.dsh');
const profile = path.join(home, 'profiles', 'web');
const stateDir = path.join(home, 'dsh-go', 'mc-t25-local-vector');
const dataDir = path.join(stateDir, 'data');
const corpusPath = path.join(dataDir, 'memories.db');
const adapterDb = path.join(dataDir, 'dsh-magic-context.db');
const hash = (value) => crypto.createHash('sha256').update(value).digest('hex');
const result = { phase, at: new Date().toISOString(), dataDir };
const readOnly = (file) => new DatabaseSync(file, { readOnly: true });

try {
  const requireFromProfile = createRequire(path.join(profile, 'package.json'));
  const entry = requireFromProfile.resolve('@elvisw/dsh-magic-context');
  result.installedEntry = entry;
  result.pluginVersion = JSON.parse(fs.readFileSync(path.join(entry, '..', '..', 'package.json'), 'utf8')).version;
  result.pluginDependency = JSON.parse(fs.readFileSync(path.join(profile, 'package.json'), 'utf8'))
    .dependencies?.['@elvisw/dsh-magic-context'] ?? null;

  const patch = path.join(profile, 'cordis.patch.yml');
  result.patchSha256 = fs.existsSync(patch) ? hash(fs.readFileSync(patch)) : null;

  result.models = fs.existsSync(path.join(dataDir, 'models'))
    ? fs.readdirSync(path.join(dataDir, 'models')).map((name) => ({
      name,
      bytes: fs.statSync(path.join(dataDir, 'models', name)).size,
    }))
    : [];

  if (fs.existsSync(corpusPath)) {
    const db = readOnly(corpusPath);
    try {
      const memories = db.prepare(
        "SELECT id, project_path, category, status, length(content) AS bytes, content FROM memories ORDER BY id",
      ).all();
      result.memories = memories.map((row) => ({
        id: row.id, project: row.project_path, category: row.category, status: row.status,
        preview: String(row.content).slice(0, 60),
      }));
      if (db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='memory_embeddings'").get() !== undefined) {
        const embeddings = db.prepare(
          'SELECT memory_id, model_id, length(embedding) AS bytes FROM memory_embeddings ORDER BY memory_id, model_id',
        ).all();
        result.embeddings = embeddings;
        result.embeddingSpaces = db.prepare(
          'SELECT model_id, COUNT(*) AS rows, length(MIN(embedding)) AS bytes FROM memory_embeddings GROUP BY model_id',
        ).all();
      } else {
        result.embeddings = [];
        result.embeddingSpaces = [];
      }
      result.ftsRows = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='memories_fts'").get() !== undefined
        ? db.prepare('SELECT COUNT(*) AS n FROM memories_fts').get().n
        : null;
    } finally {
      db.close();
    }
  } else {
    result.corpusExists = false;
  }

  if (fs.existsSync(adapterDb)) {
    const db = readOnly(adapterDb);
    try {
      const tables = new Set(
        db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map((row) => row.name),
      );
      if (tables.has('journal')) {
        result.vectorLane = db.prepare(
          "SELECT id, at, level, kind, summary, data FROM journal WHERE kind IN ('vector-lane','boot','maintenance','tool-call') ORDER BY id",
        ).all().map((row) => ({
          id: row.id, at: row.at, level: row.level, kind: row.kind, summary: row.summary,
          data: typeof row.data === 'string' ? row.data.slice(0, 400) : null,
        }));
      }
      if (tables.has('passes')) {
        result.passes = db.prepare('SELECT COUNT(*) AS n FROM passes').get().n;
      }
    } finally {
      db.close();
    }
  }
  result.status = 'observed';
} catch (error) {
  result.status = 'blocked';
  result.code = String(error.code || 'OBSERVE_FAILED');
  result.message = String(error.message || error).slice(0, 300);
}
fs.writeFileSync(path.join(__dirname, `phone-${phase}.json`), JSON.stringify(result, null, 2) + '\n');
console.log(JSON.stringify({
  phase,
  status: result.status,
  code: result.code,
  memories: result.memories?.length,
  embeddings: result.embeddings?.length,
  spaces: result.embeddingSpaces,
}));
if (result.status !== 'observed') process.exitCode = 1;
