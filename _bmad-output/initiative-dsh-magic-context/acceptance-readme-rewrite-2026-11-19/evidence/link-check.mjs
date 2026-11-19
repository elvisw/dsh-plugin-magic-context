/**
 * Link check for the rewritten READMEs.
 *
 * Two kinds of target, checked two different ways:
 *
 *  - Targets inside this repository (`.../blob/main/<path>`) are verified against
 *    `git ls-files`, i.e. offline. There are ~90 of them and they all resolve to
 *    the same repository, so issuing 90 unauthenticated GitHub requests only buys
 *    rate limiting — which is exactly what the first version of this script hit.
 *
 *  - Genuinely external targets are requested once each, with a browser UA. Only a
 *    handful exist.
 *
 * Relative links inside docs/*.md are checked for existence on disk.
 *
 * Usage: node link-check.mjs [repoRoot]
 */
import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'

const root = process.argv[2] ?? process.cwd()
const evidenceDir = join(root,
  '_bmad-output/initiative-dsh-magic-context/acceptance-readme-rewrite-2026-11-19/evidence')

const REPO_SLUG = 'github.com/elvisw/dsh-plugin-magic-context/blob/main/'
const FILES = ['README.md', 'README.zh-CN.md', 'docs/glossary.md',
  'docs/configuration.md', 'docs/architecture.md']

// Everything git knows about, so a link to a tracked file can be answered offline.
const tracked = new Set(
  execFileSync('git', ['ls-files'], { cwd: root, encoding: 'utf8' })
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean),
)

const targets = new Map()
for (const file of FILES) {
  const text = readFileSync(join(root, file), 'utf8')
  for (const m of text.matchAll(/\]\(([^)\s]+)\)/g)) {
    const href = m[1]
    const key = `${file}::${href}`
    if (targets.has(key)) continue
    targets.set(key, { file, href })
  }
}

const REPO_PREFIXES = [
  'https://github.com/elvisw/dsh-plugin-magic-context/blob/main/',
  'https://raw.githubusercontent.com/elvisw/dsh-plugin-magic-context/main/',
]

const results = []
for (const { file, href } of targets.values()) {
  if (href.startsWith('#')) {
    results.push({ file, href, kind: 'anchor', ok: true, note: 'not requested' })
  } else if (REPO_PREFIXES.some((prefix) => href.startsWith(prefix))) {
    const prefix = REPO_PREFIXES.find((p) => href.startsWith(p))
    const path = decodeURI(href.slice(prefix.length).split('#')[0])
    // A file added by this ticket is untracked until the commit, so accept it if it
    // exists on disk; `git ls-files` alone would fail the check on new documents.
    const ok = tracked.has(path) || existsSync(join(root, path))
    results.push({ file, href, kind: 'repo-path', path, ok })
  } else if (/^https?:\/\//.test(href)) {
    results.push({ file, href, kind: 'external', pending: true })
  } else {
    const clean = decodeURI(href.split('#')[0])
    const target = resolve(join(root, dirname(file)), clean)
    results.push({ file, href, kind: 'relative', onDisk: existsSync(target), ok: existsSync(target) })
  }
}

// External targets: deduplicated by href (the same URL appears in several files),
// one request each, with a browser UA and a deadline.
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36'
const offline = results.filter((r) => r.kind !== 'external')
const pendingExternal = results.filter((r) => r.kind === 'external')
const uniqueExternal = [...new Set(pendingExternal.map((r) => r.href))]
console.error(`[link-check] ${offline.length} offline targets, ${uniqueExternal.length} unique external URLs`)

const resolved = new Map()
for (const href of uniqueExternal) {
  console.error(`[link-check] GET ${href}`)
  let status = 0
  let error = ''
  // GitHub through a proxy intermittently times out; one retry separates a dead link
  // from a flaky connection, and the error text is kept either way.
  for (let attempt = 0; attempt < 2; attempt += 1) {
    status = 0
    error = ''
    try {
      const res = await fetch(href, {
        redirect: 'follow',
        headers: { 'user-agent': UA, accept: 'text/html' },
        // Without a deadline a stalled connection hangs the whole check forever.
        signal: AbortSignal.timeout(20_000),
      })
      status = res.status
      await res.arrayBuffer().catch(() => {})
      break
    } catch (err) {
      error = String(err?.message ?? err)
      if (attempt === 0) await new Promise((resolve) => setTimeout(resolve, 2_000))
    }
  }
  // npmjs and shields answer 403 to non-browser clients; the pages exist.
  const botBlocked = status === 403 && /npmjs\.com|shields\.io/.test(href)
  resolved.set(href, {
    kind: 'external', href, status,
    ok: (status >= 200 && status < 400) || botBlocked,
    ...(botBlocked ? { note: 'anti-bot 403, page exists' } : {}),
    ...(error ? { error } : {}),
  })
}

// A transport failure (status 0) says nothing about the page: this host reaches GitHub
// through a proxy that drops some of these connections while single requests succeed.
// Ask `gh`, which uses its own authenticated transport, before calling a GitHub URL dead.
const ghEndpoint = (href) => {
  const m = /^https:\/\/github\.com\/([^/]+)\/([^/]+)(?:\/(.*))?$/.exec(href)
  if (m === null) return undefined
  const [, owner, repo, rest] = m
  if (rest === undefined) return `repos/${owner}/${repo}`
  const workflow = /^actions\/workflows\/([^/]+?)(?:\.badge\.svg)?$/.exec(rest)
  if (workflow !== null) return `repos/${owner}/${repo}/actions/workflows/${workflow[1]}`
  const issue = /^issues\/(\d+)$/.exec(rest)
  if (issue !== null) return `repos/${owner}/${repo}/issues/${issue[1]}`
  return undefined
}

for (const [href, result] of resolved) {
  if (result.ok || result.status !== 0) continue
  const endpoint = ghEndpoint(href)
  if (endpoint === undefined) continue
  try {
    const out = execFileSync('gh', ['api', '--jq', '.id // .name // "ok"', endpoint], {
      encoding: 'utf8', timeout: 30_000, stdio: ['ignore', 'pipe', 'pipe'],
    }).trim()
    resolved.set(href, {
      kind: 'external', href, status: 'gh-api',
      ok: true,
      note: `fetch failed (${result.error ?? 'transport'}), confirmed via gh api ${endpoint} -> ${out}`,
    })
  } catch (err) {
    resolved.set(href, {
      ...result,
      error: `${result.error ?? 'transport'}; gh api ${endpoint} also failed: ${String(err?.message ?? err).slice(0, 120)}`,
    })
  }
}

const externalFinal = pendingExternal.map((r) => ({ ...r, ...resolved.get(r.href), file: r.file }))
const all = [...offline, ...externalFinal]
const failed = all.filter((r) => !r.ok)

const summary = {
  when: new Date().toISOString(),
  files: FILES,
  unique: targets.size,
  repoPaths: offline.filter((r) => r.kind === 'repo-path').length,
  relativePaths: offline.filter((r) => r.kind === 'relative').length,
  anchors: offline.filter((r) => r.kind === 'anchor').length,
  externalLinks: externalFinal.length,
  uniqueExternalUrls: uniqueExternal.length,
  failed: failed.length,
}
writeFileSync(join(evidenceDir, 'link-check.json'),
  JSON.stringify({ summary, results: all }, null, 2) + '\n', 'utf8')
console.log(JSON.stringify(summary, null, 2))
if (failed.length > 0) {
  console.log('\nfailures:')
  for (const f of failed) {
    console.log(` ${f.kind} ${f.status ?? ''} ${f.href}`)
  }
  process.exitCode = 1
}
