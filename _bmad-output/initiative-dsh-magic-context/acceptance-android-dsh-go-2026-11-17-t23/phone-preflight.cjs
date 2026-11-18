// Read-only gate bootstrap. Never read config, .env, credentials or conversations.
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');

const output = path.join(__dirname, 'phone-preflight.json');
try {
  const artifact = path.join(__dirname, 'elvisw-dsh-magic-context-0.17.0.tgz');
  const sha256 = crypto.createHash('sha256').update(fs.readFileSync(artifact)).digest('hex');
  const expected = '397f7ef89b254ecd20c7728411f3ee99f0adc9e5ac563d1279f8153d25eda5d2';
  if (sha256 !== expected) throw Object.assign(new Error(), { code: 'CANDIDATE_MISMATCH' });
  const home = os.homedir();
  const configuredHome = process.env.DSH_HOME;
  const dshHome = configuredHome && path.isAbsolute(configuredHome)
    ? configuredHome : path.join(home, '.dsh');
  const profile = path.join(dshHome, 'profiles', 'web');
  const packagePath = path.join(profile, 'package.json');
  let pluginDeclared = null;
  if (fs.existsSync(packagePath)) {
    const pkg = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
    pluginDeclared = Object.hasOwn(pkg.dependencies || {}, '@elvisw/dsh-magic-context');
  }
  const cli = spawnSync('dsh', ['--version'], { encoding: 'utf8', timeout: 20000 });
  const version = cli.status === 0
    ? (cli.stdout.match(/\b\d+\.\d+\.\d+(?:-[\w.-]+)?\b/) || [null])[0] : null;
  const receipt = {
    status: 'preflight-only',
    node: process.version,
    platform: process.platform,
    arch: process.arch,
    home,
    dshHome,
    profile,
    profilePackageExists: fs.existsSync(packagePath),
    pluginDeclared,
    dshVersion: version,
    dshVersionExitCode: cli.status,
    candidateSha256: sha256,
    candidateBytes: fs.statSync(artifact).size,
    installed: false,
    configurationChanged: false,
    credentialsRead: false,
  };
  fs.writeFileSync(output, JSON.stringify(receipt, null, 2) + '\n');
  console.log(JSON.stringify(receipt, null, 2));
} catch (error) {
  const receipt = { status: 'blocked', code: String(error.code || 'PREFLIGHT_FAILED') };
  fs.writeFileSync(output, JSON.stringify(receipt, null, 2) + '\n');
  console.log(JSON.stringify(receipt));
  process.exitCode = 1;
}
