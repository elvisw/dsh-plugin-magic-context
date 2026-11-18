// T24 Android minimal gate: install into an isolated test config and restore it.
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const PKG = '@elvisw/dsh-magic-context';
const EXPECTED = 'e3c7b7b4dced12feb41f2d99620154e38f166e4198a7ca2727f37a1f1790b2c3';
const KEY_REF = 'MC_T24_PHONE_KEY';
const hash = value => crypto.createHash('sha256').update(value).digest('hex');

function removeOwnedAppend(current, checkpoint) {
  const prefix = current.subarray(0, checkpoint.originalBytes);
  if (hash(prefix) !== checkpoint.originalSha256
    || current.subarray(checkpoint.originalBytes).toString('utf8') !== checkpoint.block) {
    throw Object.assign(new Error(), { code: 'PATCH_CHANGED_RESTORE_MANUALLY' });
  }
  return prefix;
}

if (process.argv.includes('--selftest')) {
  const before = Buffer.from('# preserve comments\n- id: existing\n  config: { unchanged: true }\n');
  const checkpoint = { originalBytes: before.length, originalSha256: hash(before), block: '\n# test-owned\n- id: test\n' };
  assert.deepEqual(removeOwnedAppend(Buffer.concat([before, Buffer.from(checkpoint.block)]), checkpoint), before);
  assert.throws(() => removeOwnedAppend(Buffer.from('other edit'), checkpoint));
  console.log('owned append/restore assertion passed');
  process.exit(0);
}

const home = process.env.DSH_HOME || path.join(os.homedir(), '.dsh');
const profile = path.join(home, 'profiles', 'web');
const patch = path.join(profile, 'cordis.patch.yml');
const stateDir = path.join(home, 'dsh-go', 'mc-t24-e3c7b7b4');
const checkpointPath = path.join(stateDir, 'checkpoint.json');
const artifact = path.join(__dirname, 'elvisw-dsh-magic-context-0.17.0.tgz');
const receiptPath = path.join(__dirname, 'phone-install.json');
const manifestPath = path.join(profile, 'package.json');
let checkpoint;

function cli(args) {
  return spawnSync('dsh', ['plugin', '--profile', 'web', ...args], {
    encoding: 'utf8', timeout: 600000, maxBuffer: 4 * 1024 * 1024,
  }).status;
}

function save(receipt) {
  fs.writeFileSync(receiptPath, JSON.stringify(receipt, null, 2) + '\n');
  console.log(JSON.stringify(receipt));
}

try {
  if (process.platform !== 'linux' || !fs.existsSync(manifestPath)) {
    throw Object.assign(new Error(), { code: 'NOT_EXPECTED_APP_PROFILE' });
  }
  if (process.argv.includes('--restore')) {
    checkpoint = JSON.parse(fs.readFileSync(checkpointPath, 'utf8'));
    const current = fs.readFileSync(patch);
    const original = removeOwnedAppend(current, checkpoint);
    const ref = JSON.parse(fs.readFileSync(manifestPath, 'utf8')).dependencies?.[PKG];
    if (ref !== undefined) {
      const installedPath = ref.startsWith('file:') ? path.resolve(profile, ref.slice(5)) : '';
      if (installedPath !== artifact || hash(fs.readFileSync(installedPath)) !== EXPECTED) {
        throw Object.assign(new Error(), { code: 'INSTALL_REF_CHANGED_RESTORE_MANUALLY' });
      }
      if (cli(['remove', PKG]) !== 0) throw Object.assign(new Error(), { code: 'REMOVE_FAILED' });
    }
    if (checkpoint.patchExisted) fs.writeFileSync(patch, original);
    else fs.unlinkSync(patch);
    const pluginRemoved = !Object.hasOwn(
      JSON.parse(fs.readFileSync(manifestPath, 'utf8')).dependencies || {}, PKG,
    );
    const patchExists = fs.existsSync(patch);
    const restoredSha256 = patchExists ? hash(fs.readFileSync(patch)) : null;
    const originalPatchRestored = checkpoint.patchExisted
      ? restoredSha256 === checkpoint.originalSha256 : !patchExists;
    const testDataRetained = ['memories.db', 'dsh-magic-context.db']
      .every(name => fs.existsSync(path.join(stateDir, 'data', name)));
    save({
      status: pluginRemoved && originalPatchRestored ? 'restored' : 'blocked',
      pluginRemoved, originalPatchRestored, testDataRetained, restoredSha256,
      originalSha256: checkpoint.originalSha256, needsEngineRestart: true,
    });
    if (!pluginRemoved || !originalPatchRestored) process.exitCode = 1;
  } else {
    if (hash(fs.readFileSync(artifact)) !== EXPECTED) {
      throw Object.assign(new Error(), { code: 'CANDIDATE_MISMATCH' });
    }
    const pkg = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    if (Object.hasOwn(pkg.dependencies || {}, PKG) || fs.existsSync(checkpointPath)) {
      throw Object.assign(new Error(), { code: 'ALREADY_PRESENT_STOP' });
    }
    const patchExisted = fs.existsSync(patch);
    const original = patchExisted ? fs.readFileSync(patch) : Buffer.alloc(0);
    const text = original.toString('utf8');
    const first = text.split(/\r?\n/).find(line => line.trim() && !line.trim().startsWith('#') && line.trim() !== '---');
    if ((first && !/^-\s/.test(first)) || /^\s*(?:-\s*)?(?:id|select):\s*['"]?magic-context-dsh['"]?\s*(?:#.*)?$/m.test(text)) {
      throw Object.assign(new Error(), { code: 'EXISTING_ROW_OR_UNSUPPORTED_PATCH_STOP' });
    }
    const dataDir = path.join(stateDir, 'data');
    const config = {
      dataDir, registerCompactionEngine: false, historianEnabled: false,
      maintenance: { enabled: false },
      policy: { executeThreshold: 100, ttlMs: 999999999 },
      memory: {
        enabled: true, dbPath: path.join(dataDir, 'memories.db'),
        embedBackfill: false, vectorBackfill: false, vectorBackfillLimit: 1,
        global: { machine: { enabled: false, autoStage: false }, user: { render: false, collect: false, review: false } },
      },
      embedding: {
        provider: 'openai-compatible', preset: 'custom',
        endpoint: 'http://127.0.0.1:49724/v1', model: 'fixture-embed-a',
        apiKeyEnv: KEY_REF, dimensions: 0, timeoutMs: 8000, queryTimeoutMs: 2500, batchSize: 1,
      },
    };
    const block = '\n# BEGIN T24 test-owned plugin\n- id: magic-context-dsh\n'
      + "  name: '@elvisw/dsh-magic-context'\n  config: " + JSON.stringify(config)
      + '\n# END T24 test-owned plugin\n';
    checkpoint = { patchExisted, originalBytes: original.length, originalSha256: hash(original), block };
    fs.mkdirSync(stateDir, { recursive: true });
    fs.writeFileSync(checkpointPath, JSON.stringify(checkpoint), { flag: 'wx', mode: 0o600 });
    fs.writeFileSync(patch, Buffer.concat([original, Buffer.from(block)]));
    const exitCode = cli(['add', artifact, '--ignore-scripts']);
    if (exitCode !== 0) {
      save({ status: 'blocked', code: 'ADD_FAILED', exitCode, testConfigIsolated: true, restoreCommandRequired: true });
      process.exitCode = 1;
    } else {
      save({
        status: 'installed', candidateSha256: EXPECTED, dataDir,
        corpusDb: config.memory.dbPath, apiKeyEnv: KEY_REF,
        endpoint: config.embedding.endpoint, runtimeVerified: false,
      });
    }
  }
} catch (error) {
  save({ status: 'blocked', code: String(error.code || 'INSTALL_FAILED') });
  process.exitCode = 1;
}
