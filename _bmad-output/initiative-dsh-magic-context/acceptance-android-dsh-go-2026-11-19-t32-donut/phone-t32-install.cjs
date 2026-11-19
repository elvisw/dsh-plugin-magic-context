// T32 candidate: install into the phone's web profile, or go back to the
// published 0.18.6. Run from the phone's own Linux shell (dsh-go terminal).
// usage: node phone-t32-install.cjs [--restore]
'use strict'
const fs = require('node:fs')
const path = require('node:path')
const crypto = require('node:crypto')
const { spawnSync } = require('node:child_process')

const restore = process.argv.includes('--restore')
const expected = '27636d2c69f7cd04928657ca8669a2b144c743b169f7f154f62ee269bb66e689'
const artifact = path.join(__dirname, 'candidate', 'elvisw-dsh-magic-context-0.18.7.tgz')

function receipt(value) {
  fs.writeFileSync(path.join(__dirname, 'phone-t32.json'), JSON.stringify(value, null, 2) + '\n')
  console.log(JSON.stringify(value))
  if (value.status !== 'ok') process.exitCode = 1
}

try {
  if (restore) {
    const result = spawnSync('dsh', ['plugin', '--profile', 'web', 'add',
      '@elvisw/dsh-magic-context@0.18.6', '--ignore-scripts'],
    { encoding: 'utf8', timeout: 600000, maxBuffer: 4 * 1024 * 1024 })
    receipt({ status: result.status === 0 ? 'ok' : 'failed', mode: 'restore',
      target: '@elvisw/dsh-magic-context@0.18.6', exitCode: result.status,
      needsEngineRestart: result.status === 0 })
  } else {
    const sha = crypto.createHash('sha256').update(fs.readFileSync(artifact)).digest('hex')
    if (sha !== expected) throw Object.assign(new Error('candidate sha mismatch'), { code: 'CANDIDATE_MISMATCH' })
    const result = spawnSync('dsh', ['plugin', '--profile', 'web', 'add', artifact, '--ignore-scripts'],
      { encoding: 'utf8', timeout: 600000, maxBuffer: 4 * 1024 * 1024 })
    receipt({ status: result.status === 0 ? 'ok' : 'failed', mode: 'install',
      candidateSha256: expected, exitCode: result.status,
      needsEngineRestart: result.status === 0 })
  }
} catch (error) {
  receipt({ status: 'failed', code: String(error.code || 'INSTALL_FAILED') })
}
