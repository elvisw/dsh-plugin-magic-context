#!/usr/bin/env node
/**
 * One-time migration for the npm package rename.
 *
 * The DSH loader matches a profile/home/overlay patch row by BOTH `id` and
 * `name`. `dsh plugin add/remove` does not rewrite `cordis.patch.yml`, so a
 * 0.12.x row still saying the old package name is skipped after the package
 * is replaced: its `config` (including a custom `dataDir`) silently stops
 * applying. This helper changes only that row's `name` line.
 *
 * Conservative by design: no YAML dependency, no guess when the file is not
 * a plain block-style mapping. It refuses flow-style, anchors/aliases,
 * multi-document files, duplicate target rows and unknown names.
 */
import { copyFileSync, existsSync, readFileSync, renameSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

export const TARGET_ID = 'magic-context-dsh'
export const NEW_NAME = '@elvisw/dsh-magic-context'
export const OLD_NAMES = [
  '@elvisw/dsh-plugin-magic-context',
  'dsh-plugin-magic-context',
]

const isOld = (name) => OLD_NAMES.includes(name)
const isNew = (name) => name === NEW_NAME

const stripQuotes = (value) => {
  const text = value.trim()
  if (text.length >= 2 && ((text.startsWith("'") && text.endsWith("'")) || (text.startsWith('"') && text.endsWith('"')))) {
    return text.slice(1, -1)
  }
  return text
}

/** Split `value # comment` outside single/double quotes. */
const splitTrailingComment = (value) => {
  let quote = ''
  for (let i = 0; i < value.length; i += 1) {
    const char = value[i]
    if (quote !== '') {
      if (char === quote) quote = ''
      continue
    }
    if (char === "'" || char === '"') {
      quote = char
      continue
    }
    if (char === '#' && (i === 0 || /\s/.test(value[i - 1]))) {
      return { value: value.slice(0, i).trimEnd(), comment: value.slice(i) }
    }
  }
  return { value: value.trimEnd(), comment: '' }
}

const quoteLike = (name, original) => {
  const text = original.trim()
  if (text.startsWith('"')) return `"${name}"`
  if (text.startsWith("'")) return `'${name}'`
  // An unquoted @/scope is not a safe YAML plain scalar; write a quoted one.
  return `'${name}'`
}

const indentOf = (line) => line.length - line.trimStart().length
const isBlankOrComment = (line) => line.trim() === '' || line.trimStart().startsWith('#')

const refuse = (state, message) => ({ state, changed: false, error: message })

/**
 * Pure text migration. Returns `{ state, changed, text, error?, line? }`.
 * States: no-target, already-migrated, id-only, rewritten, refused.
 */
export function migratePatchText(text, options = {}) {
  const targetId = options.targetId ?? TARGET_ID
  const newName = options.newName ?? NEW_NAME
  const oldNames = options.oldNames ?? OLD_NAMES
  const lines = text.split('\n').map((raw) => {
    const cr = raw.endsWith('\r')
    return { text: cr ? raw.slice(0, -1) : raw, cr }
  })

  // A leading `---` is tolerated; a second one means a multi-document file.
  const documentMarkers = lines
    .map((line, index) => ({ line: line.text, index }))
    .filter(({ line }) => /^---(?:\s*#.*)?$/.test(line) || /^\.\.\.\s*$/.test(line))
  if (documentMarkers.length > 1 || (documentMarkers.length === 1 && documentMarkers[0].index !== 0)) {
    return refuse('refused', 'multi-document YAML is not supported')
  }

  const idLines = []
  let unresolvedId = false
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index].text
    if (!line.includes(targetId)) continue
    if (line.includes('{') || line.includes('[')) {
      return refuse('refused', `flow-style target row at line ${index + 1}`)
    }
    const match = /^(\s*)(?:-\s*)?id:\s*(?:"([^"]*)"|'([^']*)'|([^#\s]+))\s*(?:#.*)?$/.exec(line)
    if (match === null) {
      if (!isBlankOrComment(line) && /(?:^|\s)["']?id["']?\s*:/.test(line)) unresolvedId = true
      continue
    }
    const id = match[2] ?? match[3] ?? match[4]
    if (id === targetId) idLines.push({ index, indent: match[1].length, dashed: /^\s*-\s*/.test(line) })
  }

  if (idLines.length === 0) {
    if (unresolvedId) return refuse('refused', `could not safely locate the ${targetId} row`)
    const names = lines
      .map((line) => /^\s*name:\s*(.*)$/.exec(line.text))
      .filter(Boolean)
      .map((match) => stripQuotes(splitTrailingComment(match[1]).value))
    if (names.some((name) => isNew(name))) {
      return refuse('refused', `a ${newName} row exists but no ${targetId} row was found`)
    }
    return { state: 'no-target', changed: false, text }
  }
  if (idLines.length > 1) {
    return refuse('refused', `multiple ${targetId} rows`)
  }

  const target = idLines[0]

  // Nearest enclosing line with less indentation. For a dashed row this finds
  // a parent (for example a bundle `- insert:`); for a bare `-` item it finds
  // the item line that owns the following keys.
  let ancestor = -1
  for (let index = target.index - 1; index >= 0; index -= 1) {
    const line = lines[index].text
    if (isBlankOrComment(line)) continue
    if (indentOf(line) < target.indent) {
      ancestor = index
      break
    }
  }
  const ownerLine = ancestor === -1 ? '' : lines[ancestor].text
  if (/^\s*-\s*insert\s*:/.test(ownerLine)) {
    return refuse('refused', `insert row for ${targetId} is not a config override`)
  }
  if (!target.dashed) {
    if (ancestor === -1 || !/^\s*-\s*(?:$|#|.*:)/.test(ownerLine)) {
      return refuse('refused', `id is not a config override row`)
    }
  }

  let end = target.index + 1
  while (end < lines.length) {
    const line = lines[end].text
    if (isBlankOrComment(line)) {
      end += 1
      continue
    }
    const indent = indentOf(line)
    if (indent <= target.indent) break
    end += 1
  }

  // A `name:` before `id:` belongs to the same mapping but our row scan starts
  // at `id:`. Refuse instead of pretending this is an id-only row.
  if (!target.dashed) {
    if (/^\s*-\s*name\s*:/.test(ownerLine)) {
      return refuse('refused', `name appears before id in the ${targetId} row`)
    }
    for (let index = ancestor + 1; index < target.index; index += 1) {
      const line = lines[index].text
      if (isBlankOrComment(line)) continue
      const match = /^(\s*)name\s*:/.exec(line)
      if (match !== null && match[1].length === target.indent) {
        return refuse('refused', `name appears before id in the ${targetId} row`)
      }
    }
  }

  const nameLines = []
  let unresolvedName = false
  for (let index = target.index + 1; index < end; index += 1) {
    const line = lines[index].text
    const match = /^(\s*)name\s*:\s*(.*)$/.exec(line)
    if (match === null) {
      if (!isBlankOrComment(line) && /(?:^|\s)["']?name["']?\s*:/.test(line)) unresolvedName = true
      continue
    }
    nameLines.push({ index, indent: match[1].length, raw: match[2] })
  }
  if (unresolvedName) {
    return refuse('refused', `could not safely read the ${targetId} row name`)
  }
  const expectedNameIndent = target.dashed ? target.indent + 2 : target.indent
  const misindented = nameLines.find((line) => line.indent !== expectedNameIndent)
  if (misindented !== undefined) {
    return refuse('refused', `nested name at line ${misindented.index + 1} is not the ${targetId} row name`)
  }
  if (nameLines.length === 0) {
    return { state: 'id-only', changed: false, text }
  }
  if (nameLines.length > 1) {
    return refuse('refused', `multiple name lines in the ${targetId} row`)
  }

  const nameLine = nameLines[0]
  const { value, comment } = splitTrailingComment(nameLine.raw)
  const name = stripQuotes(value)
  if (name === '' || name === '~' || name === 'null') {
    return refuse('refused', `empty name in the ${targetId} row`)
  }
  if (value.includes('{') || value.includes('[') || value.startsWith('&') || value.startsWith('*')) {
    return refuse('refused', 'flow-style, anchor or alias name is not supported')
  }

  // A different row already using the new name is a conflict even when the
  // target row itself is old. Check before rewriting.
  for (let index = 0; index < lines.length; index += 1) {
    if (index > target.index && index < end) continue
    const match = /^\s*name:\s*(.*)$/.exec(lines[index].text)
    if (match === null) continue
    const other = stripQuotes(splitTrailingComment(match[1]).value)
    if (isNew(other)) {
      return refuse('refused', `another row already uses ${newName}`)
    }
  }

  if (isNew(name)) {
    return { state: 'already-migrated', changed: false, text }
  }
  if (!oldNames.includes(name)) {
    return refuse('refused', `unknown package name ${JSON.stringify(name)} in the ${targetId} row`)
  }

  const original = lines[nameLine.index]
  const replacement = quoteLike(newName, value)
  const suffix = comment === '' ? '' : ' ' + comment
  lines[nameLine.index] = {
    text: `${' '.repeat(nameLine.indent)}name: ${replacement}${suffix}`,
    cr: original.cr,
  }
  return {
    state: 'rewritten',
    changed: true,
    text: lines.map((line) => line.text + (line.cr ? '\r' : '')).join('\n'),
    line: nameLine.index + 1,
  }
}

const timestamp = () => {
  const now = new Date()
  const pad = (value) => String(value).padStart(2, '0')
  return `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`
}

/** Read, migrate and atomically write one patch file. */
export function migratePatchFile(patchPath, options = {}) {
  const path = resolve(patchPath)
  if (!existsSync(path) || !statSync(path).isFile()) {
    return { state: 'refused', changed: false, error: `patch file not found: ${path}` }
  }
  let text
  try {
    text = readFileSync(path, 'utf8')
  } catch (error) {
    return { state: 'refused', changed: false, error: `cannot read ${path}: ${error.message}` }
  }
  const result = migratePatchText(text, options)
  if (!result.changed) return result
  const backup = `${path}.bak-${timestamp()}`
  try {
    copyFileSync(path, backup)
    const temp = join(dirname(path), `.${timestamp()}-${process.pid}.tmp`)
    writeFileSync(temp, result.text, 'utf8')
    renameSync(temp, path)
  } catch (error) {
    return { state: 'refused', changed: false, error: `cannot write ${path}: ${error.message}` }
  }
  return { ...result, backup }
}

const usage = `Usage: node tools/migrate-profile-package-name.mjs --patch <cordis.patch.yml>

Migrates one profile/home/overlay patch row:
  id: ${TARGET_ID}
from ${OLD_NAMES.join(' or ')}
to ${NEW_NAME}.

The patch path is required; the helper never guesses a profile.`

const main = () => {
  const args = process.argv.slice(2)
  if (args.includes('--help') || args.includes('-h')) {
    console.log(usage)
    return 0
  }
  const index = args.indexOf('--patch')
  const patch = index === -1 ? '' : args[index + 1] ?? ''
  if (patch === '' || patch.startsWith('--')) {
    console.error(usage)
    return 2
  }
  const result = migratePatchFile(patch)
  if (result.error !== undefined) {
    console.error(`migrate-profile-package-name: ${result.error}`)
    return 4
  }
  if (result.state === 'rewritten') {
    console.log(`migrated ${TARGET_ID} to ${NEW_NAME} (backup: ${result.backup})`)
  } else if (result.state === 'already-migrated') {
    console.log(`already migrated: ${TARGET_ID} uses ${NEW_NAME}`)
  } else if (result.state === 'id-only') {
    console.log(`${TARGET_ID} has no name line; preserved as-is`)
  } else {
    console.log(`no ${TARGET_ID} row; nothing to migrate`)
  }
  return 0
}

if (process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = main()
}
