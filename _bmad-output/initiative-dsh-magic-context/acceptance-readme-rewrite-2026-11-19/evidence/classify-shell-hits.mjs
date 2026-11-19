/**
 * Classify the market scanner's "shell" hits: is each one a real OS command, or a
 * regex/native-API `.exec(` that happens to match the scanner's regex?
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const root = process.argv[2]
const files = [
  'lib/core/corpus-store.js', 'lib/core/directive-detect.js', 'lib/core/embedding-remote.js',
  'lib/core/memory-bridge.js', 'lib/core/memory-search.js', 'lib/core/memory-write.js',
  'lib/core/profile-write.js', 'lib/core/stores.js', 'lib/dsh/global-review.js',
  'lib/dsh/project-drift.js', 'lib/dsh/recomp.js', 'lib/dsh/seams.js',
]

let realChild = 0
let patternExec = 0
let sqlExec = 0
const detail = []

for (const f of files) {
  const text = readFileSync(join(root, f), 'utf8')
  const childImports = (text.match(/from ['"]node:child_process['"]/g) ?? []).length
  // every `.exec(` / `exec (` occurrence
  const execs = [...text.matchAll(/(\w+\s*\.\s*)?\bexec\s*\(/g)]
  let dbExec = 0
  let regexExec = 0
  for (const m of execs) {
    const prefix = m[1] ?? ''
    if (/db\s*\.\s*$/.test(prefix) || /\.db\s*\.\s*$/.test(prefix)) dbExec += 1
    else if (/pattern\s*\.\s*$/.test(prefix) || /PATTERN\s*\.\s*$/.test(prefix) || /re\s*\.\s*$/.test(prefix)) regexExec += 1
    else if (/\/[^/]*\/[a-z]*\s*\.\s*$/.test(text.slice(Math.max(0, m.index - 40), m.index + 10))) regexExec += 1
    else regexExec += 1
  }
  if (childImports > 0) realChild += 1
  else patternExec += 1
  sqlExec += dbExec
  detail.push({ file: f, realChildProcess: childImports > 0, dbExec, otherExec: regexExec })
}

console.log(JSON.stringify({
  flaggedFiles: files.length,
  filesImportingChildProcess: realChild,
  filesWithoutChildProcess: patternExec,
  sqliteExecCalls: sqlExec,
  detail,
}, null, 2))
