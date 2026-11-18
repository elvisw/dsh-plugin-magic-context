// Replace only the candidate package; keep the test config and data unchanged.
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');
const expected = '6fa8178c71ad55f5d6e4b553940206d486d9ec012d6e9031b445814a67bb93f4';
const artifact = path.join(__dirname, 'first-open-fix', 'elvisw-dsh-magic-context-0.17.0.tgz');
let receipt;
try {
  const sha = crypto.createHash('sha256').update(fs.readFileSync(artifact)).digest('hex');
  if (sha !== expected) throw Object.assign(new Error(), { code: 'CANDIDATE_MISMATCH' });
  const result = spawnSync('dsh', ['plugin', '--profile', 'web', 'add', artifact, '--ignore-scripts'], {
    encoding: 'utf8', timeout: 600000, maxBuffer: 4 * 1024 * 1024,
  });
  receipt = result.status === 0
    ? { status: 'updated', candidateSha256: expected, needsEngineRestart: true, runtimeVerified: false }
    : { status: 'blocked', code: 'ADD_FAILED', exitCode: result.status };
} catch (error) {
  receipt = { status: 'blocked', code: String(error.code || 'UPDATE_FAILED') };
}
fs.writeFileSync(path.join(__dirname, 'phone-update.json'), JSON.stringify(receipt, null, 2) + '\n');
console.log(JSON.stringify(receipt));
if (receipt.status !== 'updated') process.exitCode = 1;
