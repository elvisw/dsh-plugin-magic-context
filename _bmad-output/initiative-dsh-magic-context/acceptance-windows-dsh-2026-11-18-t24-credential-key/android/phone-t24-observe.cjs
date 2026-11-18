// Read-only T24 Android observation: artifact identity, patch, DB and sentinel scan.
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const { createRequire } = require('node:module');
const phase = process.argv[2] || 'after-gate';
const sentinel = process.argv[3] || '';
if (!['before-gate', 'after-save', 'after-gate'].includes(phase)) throw Error('invalid phase');
const home = process.env.DSH_HOME || path.join(os.homedir(), '.dsh');
const profile = path.join(home, 'profiles', 'web');
const dataDir = path.join(home, 'dsh-go', 'mc-t24-e3c7b7b4', 'data');
const result = { phase, at: new Date().toISOString(), dataDir };
const hash = value => crypto.createHash('sha256').update(value).digest('hex');
try {
  const requireFromProfile = createRequire(path.join(profile, 'package.json'));
  const entry = requireFromProfile.resolve('@elvisw/dsh-magic-context');
  const nativeFile = path.join(path.dirname(entry), 'dsh', 'go-native.js');
  result.installedNativeSha256 = hash(fs.readFileSync(nativeFile));
  result.pluginDependency = JSON.parse(fs.readFileSync(path.join(profile, 'package.json'), 'utf8'))
    .dependencies?.['@elvisw/dsh-magic-context'] ?? null;
  const patch = path.join(profile, 'cordis.patch.yml');
  const patchBytes = fs.existsSync(patch) ? fs.readFileSync(patch) : Buffer.alloc(0);
  result.patchSha256 = hash(patchBytes);
  result.patchContainsSentinel = sentinel !== '' && patchBytes.includes(Buffer.from(sentinel));
  result.dataFiles = fs.existsSync(dataDir) ? fs.readdirSync(dataDir)
    .filter(name => !name.startsWith('.') && /\.(?:db|sqlite|sqlite3|json|log|txt)$/.test(name))
    .map(name => {
      const bytes = fs.readFileSync(path.join(dataDir, name));
      return {
        name, bytes: bytes.length,
        sentinelFound: sentinel !== '' && bytes.includes(Buffer.from(sentinel)),
      };
    }) : [];
  result.sentinelFound = result.patchContainsSentinel
    || result.dataFiles.some(item => item.sentinelFound);
  result.status = 'observed';
} catch (error) {
  result.status = 'blocked';
  result.code = String(error.code || 'OBSERVE_FAILED');
}
fs.writeFileSync(path.join(__dirname, `phone-${phase}.json`), JSON.stringify(result, null, 2) + '\n');
console.log(JSON.stringify({ phase, status: result.status, code: result.code, sentinelFound: result.sentinelFound }));
if (result.status !== 'observed') process.exitCode = 1;
