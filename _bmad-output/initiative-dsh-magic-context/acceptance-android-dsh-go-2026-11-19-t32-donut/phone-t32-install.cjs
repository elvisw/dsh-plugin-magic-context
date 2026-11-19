// T32 candidate: install into the phone's web profile, verify the installed
// renderer bytes, or go back to the published 0.18.6.
// usage: node phone-t32-install.cjs [--restore]
'use strict'
const fs = require('node:fs')
const path = require('node:path')
const crypto = require('node:crypto')
const { spawnSync } = require('node:child_process')

const restore = process.argv.includes('--restore')
const expectedTarball = 'c2e0b06d685db8e9e5523246d03c07b1a6af10ecff4793c9fb3878f2d712a6b1'
// lib/dsh/go-view.js of the candidate: the renderer the panel will load.
const expectedGoView = 'f6d77c4686106460f1ffb1721e1e12afa744225f6dba32996781aaec67c1ce26'
const artifact = path.join(__dirname, 'candidate', 'elvisw-dsh-magic-context-0.18.8.tgz')
const home = process.env.DSH_HOME || '/root/.dsh'
const installedView = path.join(home, 'profiles', 'web', 'node_modules', '@elvisw',
  'dsh-magic-context', 'lib', 'dsh', 'go-view.js')

function sha(file) {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex')
}

function installedViewSha() {
  try {
    return sha(installedView)
  } catch {
    return null
  }
}

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
      installedGoViewSha256: installedViewSha(), needsEngineRestart: result.status === 0 })
  } else {
    const sha256 = sha(artifact)
    if (sha256 !== expectedTarball) {
      throw Object.assign(new Error('candidate sha mismatch'), { code: 'CANDIDATE_MISMATCH' })
    }
    const result = spawnSync('dsh', ['plugin', '--profile', 'web', 'add', artifact, '--ignore-scripts'],
      { encoding: 'utf8', timeout: 600000, maxBuffer: 4 * 1024 * 1024 })
    const viewSha = installedViewSha()
    // A same-version reinstall can be skipped by the package manager; the only
    // honest check is the renderer that actually landed on disk.
    receipt({
      status: result.status === 0 && viewSha === expectedGoView ? 'ok' : 'stale',
      mode: 'install',
      candidateSha256: expectedTarball,
      exitCode: result.status,
      installedGoViewSha256: viewSha,
      rendererMatches: viewSha === expectedGoView,
      needsEngineRestart: true,
    })
  }
} catch (error) {
  receipt({ status: 'failed', code: String(error.code || 'INSTALL_FAILED'), message: String(error.message || error) })
}
