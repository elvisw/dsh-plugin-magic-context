// T25 Phase 3 (fallback): seed three ASCII memories under the fixture identity
// through the plugin's own MemoryWriter — the same writer the tool uses.
// Primary path is the real ctx_memory tool in the App; use this only if the
// model refuses to pass `project`.
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const { createRequire } = require('node:module');

const home = process.env.DSH_HOME || path.join(os.homedir(), '.dsh');
const profile = path.join(home, 'profiles', 'web');
const FIXTURE_PROJECT = 'git:t25-fixture';
const phase = process.argv[2] || 'seed';

const SEEDS = [
  { category: 'ARCHITECTURE', content: 't25 fixture alpha: the deploy pipeline retries a failed upload three times before giving up' },
  { category: 'CONSTRAINTS', content: 't25 fixture beta: the upload retry budget must never exceed three attempts in the pipeline' },
  { category: 'CONFIG_VALUES', content: 't25 fixture gamma: the deploy pipeline timeout is set to thirty seconds' },
];

(async () => {
  const result = { phase, at: new Date().toISOString(), project: FIXTURE_PROJECT };
  try {
    const requireFromProfile = createRequire(path.join(profile, 'package.json'));
    const entry = requireFromProfile.resolve('@elvisw/dsh-magic-context');
    const root = path.resolve(entry, '..', '..');
    result.pluginRoot = root;
    result.pluginVersion = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')).version;

    const dbPath = path.join(home, 'dsh-go', 'mc-t25-local-vector', 'data', 'memories.db');
    result.dbPath = dbPath;
    if (!fs.existsSync(dbPath)) {
      throw Object.assign(new Error('corpus not created yet; mount the plugin first'), { code: 'NO_CORPUS' });
    }

    const writerMod = await import(
      new URL('file://' + path.join(root, 'lib', 'core', 'memory-write.js')).href
    );
    const writer = writerMod.openMemoryWriter({
      dbPath, logger: { info() {}, warn() {} },
    });
    result.writerStatus = writer.status ?? null;

    if (phase === 'seed') {
      result.writes = [];
      for (const seed of SEEDS) {
        const outcome = writer.writeMemory({
          identity: FIXTURE_PROJECT,
          category: seed.category,
          content: seed.content,
          sourceType: 'agent',
        });
        result.writes.push({ ok: outcome.ok, id: outcome.id, reason: outcome.reason });
        if (!outcome.ok) throw Object.assign(new Error(outcome.reason || 'write failed'), { code: 'WRITE_FAILED' });
      }
      result.ids = result.writes.map((w) => w.id);
    } else {
      const list = writer.listMemories(FIXTURE_PROJECT);
      result.memories = list.map((row) => ({
        id: row.id, category: row.category, status: row.status,
        preview: String(row.content).slice(0, 70),
      }));
      result.ids = list.map((row) => row.id);
    }
    writer.close();
    result.status = 'ok';
  } catch (error) {
    result.status = 'blocked';
    result.code = String(error.code || 'SEED_FAILED');
    result.message = String(error.message || error).slice(0, 300);
  }
  fs.writeFileSync(path.join(__dirname, `phone-${phase}.json`), JSON.stringify(result, null, 2) + '\n');
  console.log(JSON.stringify(result));
  if (result.status !== 'ok') process.exitCode = 1;
})();
