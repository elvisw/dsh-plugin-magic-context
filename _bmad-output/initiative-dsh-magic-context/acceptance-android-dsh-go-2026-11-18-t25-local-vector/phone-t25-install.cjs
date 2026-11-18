// T25 Android local-vector E2E: install the PUBLISHED 0.18.0 tarball into an
// isolated test config, then restore the profile byte-for-byte.
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');

const PKG = '@elvisw/dsh-magic-context';
// The registry artifact: npm view dist.integrity (sha512/base64) is
// AHUrlgbHdj1Bqf8xxaO/9W5cEaoOopiHy7hBmQfVFQ8hx0Qf46E3HD5SIH55Co4qsEOZgTX9/4gEOCv4JhayTw==
// and dist.shasum (SHA-1) is 73f39de5185622f74046be396cba1aedcc000a86.
const EXPECTED_SHA256 = '0ab7f5168bda13cf38db83c9af68067a14f5f78c764757ad80d73d0ce852aa30';
const EXPECTED_SHA512_BASE64 = 'AHUrlgbHdj1Bqf8xxaO/9W5cEaoOopiHy7hBmQfVFQ8hx0Qf46E3HD5SIH55Co4qsEOZgTX9/4gEOCv4JhayTw==';
const STATE = 'mc-t25-local-vector';
const hash = (value) => crypto.createHash('sha256').update(value).digest('hex');

function removeOwnedAppend(current, checkpoint) {
  const prefix = current.subarray(0, checkpoint.originalBytes);
  if (hash(prefix) !== checkpoint.originalSha256
    || current.subarray(checkpoint.originalBytes).toString('utf8') !== checkpoint.block) {
    throw Object.assign(new Error(), { code: 'PATCH_CHANGED_RESTORE_MANUALLY' });
  }
  return prefix;
}

if (process.argv.includes('--selftest')) {
  const before = Buffer.from('# keep\n- id: existing\n  config: { unchanged: true }\n');
  const checkpoint = { originalBytes: before.length, originalSha256: hash(before), block: '\n# owned\n- id: test\n' };
  assert.deepEqual(removeOwnedAppend(Buffer.concat([before, Buffer.from(checkpoint.block)]), checkpoint), before);
  assert.throws(() => removeOwnedAppend(Buffer.from('other'), checkpoint));
  console.log('owned append/restore assertion passed');
  process.exit(0);
}

const home = process.env.DSH_HOME || path.join(os.homedir(), '.dsh');
const profile = path.join(home, 'profiles', 'web');
const patch = path.join(profile, 'cordis.patch.yml');
const manifestPath = path.join(profile, 'package.json');
const stateDir = path.join(home, 'dsh-go', STATE);
const dataDir = path.join(stateDir, 'data');
const modelsDir = path.join(dataDir, 'models');
const checkpointPath = path.join(stateDir, 'checkpoint.json');
const artifact = path.join(__dirname, 'elvisw-dsh-magic-context-0.18.0.tgz');
const receiptPath = path.join(__dirname, 'phone-install.json');
const assetsSrc = path.join(__dirname, 'models');
let checkpoint;

function cli(args) {
  return spawnSync('dsh', ['plugin', '--profile', 'web', ...args], {
    encoding: 'utf8', timeout: 900000, maxBuffer: 8 * 1024 * 1024,
  }).status;
}

function save(receipt) {
  fs.writeFileSync(receiptPath, JSON.stringify(receipt, null, 2) + '\n');
  console.log(JSON.stringify(receipt));
}

const ASSETS = {
  'model.onnx': '759c3cd2b7fe7e93933ad23c4c9181b7396442a2ed746ec7c1d46192c469c46e',
  'tokenizer.json': 'da0e79933b9ed51798a3ae27893d3c5fa4a201126cef75586296df9b4d2c62a0',
  'tokenizer_config.json': '9261e7d79b44c8195c1cada2b453e55b00aeb81e907a6664974b4d7776172ab3',
};

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
      if (installedPath !== artifact || hash(fs.readFileSync(installedPath)) !== EXPECTED_SHA256) {
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
    // Clear the checkpoint only after the profile is proven restored, so a
    // failed restore stays re-runnable. Without this, a fresh install after
    // --restore would stop on ALREADY_PRESENT_STOP forever.
    if (pluginRemoved && originalPatchRestored) fs.unlinkSync(checkpointPath);
    save({
      status: pluginRemoved && originalPatchRestored ? 'restored' : 'blocked',
      pluginRemoved, originalPatchRestored, restoredSha256,
      originalSha256: checkpoint.originalSha256, dataDir, checkpointCleared: true,
      needsEngineRestart: true,
    });
    if (!pluginRemoved || !originalPatchRestored) process.exitCode = 1;
  } else {
    if (hash(fs.readFileSync(artifact)) !== EXPECTED_SHA256) {
      throw Object.assign(new Error(), { code: 'CANDIDATE_MISMATCH' });
    }
    const artifactBytes = fs.readFileSync(artifact);
    const sha512 = crypto.createHash('sha512').update(artifactBytes).digest('base64');
    if (sha512 !== EXPECTED_SHA512_BASE64) {
      throw Object.assign(new Error(), { code: 'CANDIDATE_SHA512_MISMATCH' });
    }
    const pkg = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    if (Object.hasOwn(pkg.dependencies || {}, PKG)) {
      throw Object.assign(new Error(), { code: 'ALREADY_PRESENT_STOP' });
    }
    // A checkpoint left behind by an older build of this script (before it
    // cleared the file on a successful --restore) is stale: the plugin is gone
    // and the patch must already be back to its original bytes. Verify both
    // before dropping it, so a genuinely half-applied run still stops.
    if (fs.existsSync(checkpointPath)) {
      const stale = JSON.parse(fs.readFileSync(checkpointPath, 'utf8'));
      const patchNow = fs.existsSync(patch) ? fs.readFileSync(patch) : Buffer.alloc(0);
      const clean = patchNow.length === stale.originalBytes
        && hash(patchNow) === stale.originalSha256;
      if (!clean) {
        throw Object.assign(new Error(), { code: 'STALE_CHECKPOINT_PATCH_DIRTY_STOP' });
      }
      fs.unlinkSync(checkpointPath);
    }
    const patchExisted = fs.existsSync(patch);
    const original = patchExisted ? fs.readFileSync(patch) : Buffer.alloc(0);
    const text = original.toString('utf8');
    const first = text.split(/\r?\n/).find((line) => line.trim() && !line.trim().startsWith('#') && line.trim() !== '---');
    if ((first && !/^-\s/.test(first)) || /^\s*(?:-\s*)?(?:id|select):\s*['"]?magic-context-dsh['"]?\s*(?:#.*)?$/m.test(text)) {
      throw Object.assign(new Error(), { code: 'EXISTING_ROW_OR_UNSUPPORTED_PATCH_STOP' });
    }
    // Pre-place the three hash-pinned assets so the phone never has to reach
    // HuggingFace. ensureAsset() accepts any file at the right name whose size
    // clears minBytes, so this is the documented warm path.
    // A previous run's test corpus would make the backfill counts ambiguous, so
    // reset the test-owned directory first. Nothing outside it is touched.
    fs.rmSync(stateDir, { recursive: true, force: true });
    fs.mkdirSync(modelsDir, { recursive: true });
    const assets = [];
    for (const [name, digest] of Object.entries(ASSETS)) {
      const from = path.join(assetsSrc, name);
      const to = path.join(modelsDir, name);
      fs.copyFileSync(from, to);
      const actual = hash(fs.readFileSync(to));
      assets.push({ name, bytes: fs.statSync(to).size, sha256Match: actual === digest });
      if (actual !== digest) throw Object.assign(new Error(), { code: `ASSET_MISMATCH_${name}` });
    }

    const config = {
      dataDir,
      registerCompactionEngine: false,
      historianEnabled: false,
      sessionNotices: false,
      searchHint: false,
      // High thresholds: this ticket must not reclaim or compact the surface.
      policy: { executeThreshold: 100, forceThreshold: 100, ttlMs: 99_999_999 },
      maintenance: { enabled: true, intervalMs: 60_000 },
      memory: {
        enabled: true,
        dbPath: path.join(dataDir, 'memories.db'),
        // embedBackfill MUST stay off: with it on, the search lane embeds FTS
        // candidates that have no stored vector and still labels them
        // `hybrid` (memory-search.ts:369-395), so the acceptance criterion
        // could pass with zero backfilled rows.
        embedBackfill: false,
        vectorBackfill: true,
        vectorBackfillLimit: 8,
        global: { machine: { enabled: false, autoStage: false }, user: { render: false, collect: false, review: false } },
      },
      embedding: { provider: 'local' },
    };
    const block = '\n# BEGIN T25 test-owned plugin\n- id: magic-context-dsh\n'
      + "  name: '@elvisw/dsh-magic-context'\n  config: " + JSON.stringify(config)
      + '\n# END T25 test-owned plugin\n';
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
        status: 'installed',
        candidateSha256: EXPECTED_SHA256,
        candidateSha512Base64: EXPECTED_SHA512_BASE64,
        candidateBytes: fs.statSync(artifact).size,
        profilePatchSha256: hash(fs.readFileSync(patch)),
        dataDir,
        corpusDb: config.memory.dbPath,
        modelsDir,
        assets,
        embeddingProvider: 'local',
        embedBackfill: false,
        vectorBackfill: true,
        vectorBackfillLimit: 8,
        maintenanceIntervalMs: 60_000,
        runtimeVerified: false,
        needsEngineRestart: true,
      });
    }
  }
} catch (error) {
  save({ status: 'blocked', code: String(error.code || 'INSTALL_FAILED') });
  process.exitCode = 1;
}
