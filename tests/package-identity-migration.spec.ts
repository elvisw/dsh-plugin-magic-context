import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'
import {
  migratePatchFile,
  migratePatchText,
  NEW_NAME,
  TARGET_ID,
} from '../tools/migrate-profile-package-name.mjs'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const HELPER = join(ROOT, 'tools', 'migrate-profile-package-name.mjs')
const PACKAGE = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')) as { name: string; files: string[] }
const tempDirs: string[] = []

const fixture = (name: string, quote = "'") =>
  [
    `- id: ${TARGET_ID}`,
    `  name: ${quote}@elvisw/dsh-plugin-magic-context${quote}`,
    '  config:',
    '    dataDir: C:\\ctx',
    '',
  ].join('\n')

const tempFile = (text: string, name = 'cordis.patch.yml') => {
  const dir = mkdtempSync(join(tmpdir(), 'mc-migrate-'))
  tempDirs.push(dir)
  const file = join(dir, name)
  writeFileSync(file, text, 'utf8')
  return { dir, file }
}

afterEach(() => {
  for (const dir of tempDirs.splice(0)) rmSync(dir, { recursive: true, force: true })
})

describe('package identity', () => {
  it('cordis.patch.yml points at the package.json name', () => {
    const patch = readFileSync(join(ROOT, 'cordis.patch.yml'), 'utf8')
    expect(patch).toContain(`name: '${PACKAGE.name}'`)
  })

  it('ships the migration helper in the npm tarball', () => {
    expect(PACKAGE.files).toContain('tools/migrate-profile-package-name.mjs')
  })

  it('installer specifier and tarball prefix match the package name', () => {
    const bat = readFileSync(join(ROOT, 'tools', 'install-magic-context.bat'), 'utf8')
    const prefix = PACKAGE.name.replace(/^@/, '').replace('/', '-')
    expect(bat).toContain(`set "PKG=${PACKAGE.name}"`)
    expect(bat).toContain(`set "TGZ_PREFIX=${prefix}"`)
  })
})

describe('profile package-name migration', () => {
  it('rewrites only the target name and preserves config/comments', () => {
    const text = [
      '# profile patch',
      `- id: ${TARGET_ID}`,
      '  # keep this comment',
      "  name: '@elvisw/dsh-plugin-magic-context' # trailing",
      '  config:',
      '    dataDir: C:\\ctx',
      '',
    ].join('\n')
    const result = migratePatchText(text)
    expect(result.state).toBe('rewritten')
    expect(result.changed).toBe(true)
    expect(result.text).toContain(`name: '${NEW_NAME}' # trailing`)
    expect(result.text).toContain('# keep this comment')
    expect(result.text).toContain('dataDir: C:\\ctx')
    expect(result.text).not.toContain('@elvisw/dsh-plugin-magic-context')
  })

  it('accepts the upstream old name and double quotes', () => {
    const text = fixture('x', '"').replace('@elvisw/dsh-plugin-magic-context', 'dsh-plugin-magic-context')
    const result = migratePatchText(text)
    expect(result.state).toBe('rewritten')
    expect(result.text).toContain(`name: "${NEW_NAME}"`)
  })

  it('preserves CRLF line endings', () => {
    const text = fixture('x').replace(/\n/g, '\r\n')
    const result = migratePatchText(text)
    expect(result.changed).toBe(true)
    expect(result.text).toContain(`name: '${NEW_NAME}'\r\n`)
    expect(result.text.split('\r\n').length).toBe(text.split('\r\n').length)
  })

  it('is already migrated on the second run', () => {
    const first = migratePatchText(fixture('x'))
    const second = migratePatchText(first.text)
    expect(second.state).toBe('already-migrated')
    expect(second.changed).toBe(false)
  })

  it('leaves a no-target file alone', () => {
    const result = migratePatchText('- id: other\n  name: other\n')
    expect(result.state).toBe('no-target')
    expect(result.changed).toBe(false)
  })

  it('preserves an id-only row', () => {
    const result = migratePatchText(`- id: ${TARGET_ID}\n  config: {}\n`)
    expect(result.state).toBe('id-only')
    expect(result.changed).toBe(false)
  })

  it('refuses duplicate target rows', () => {
    const result = migratePatchText(`${fixture('x')}- id: ${TARGET_ID}\n  name: '${NEW_NAME}'\n`)
    expect(result.state).toBe('refused')
    expect(result.error).toMatch(/multiple/)
  })

  it('refuses unknown names', () => {
    const text = fixture('x').replace('@elvisw/dsh-plugin-magic-context', '@someone/unknown')
    const result = migratePatchText(text)
    expect(result.state).toBe('refused')
    expect(result.error).toMatch(/unknown package name/)
  })

  it('refuses an empty/null name', () => {
    const result = migratePatchText(`- id: ${TARGET_ID}\n  name: ~\n`)
    expect(result.state).toBe('refused')
    expect(result.error).toMatch(/empty name/)
  })

  it('refuses a new name under a different id', () => {
    const result = migratePatchText(`- id: other\n  name: '${NEW_NAME}'\n`)
    expect(result.state).toBe('refused')
    expect(result.error).toContain(`no ${TARGET_ID}`)
  })

  it('rewrites a target that follows a named sibling row', () => {
    const result = migratePatchText([
      '- id: compaction-basic',
      "  name: '@deepseek-ai/dsh-compaction-basic'",
      `- id: ${TARGET_ID}`,
      "  name: '@elvisw/dsh-plugin-magic-context'",
      '',
    ].join('\n'))
    expect(result.state).toBe('rewritten')
    expect(result.text).toContain(`name: '${NEW_NAME}'`)
    expect(result.text).toContain('@deepseek-ai/dsh-compaction-basic')
  })

  it('refuses an insert row in both mapping and list shape', () => {
    const mapping = migratePatchText(`- insert:\n    id: ${TARGET_ID}\n    name: '@elvisw/dsh-plugin-magic-context'\n`)
    expect(mapping.state).toBe('refused')
    expect(mapping.error).toMatch(/insert row/)
    const mappingAfterKey = migratePatchText(`- insert:\n    type: plugin\n    id: ${TARGET_ID}\n    name: '@elvisw/dsh-plugin-magic-context'\n`)
    expect(mappingAfterKey.state).toBe('refused')
    expect(mappingAfterKey.error).toMatch(/insert row/)
    const list = migratePatchText(`- insert:\n    - id: ${TARGET_ID}\n      name: '@elvisw/dsh-plugin-magic-context'\n`)
    expect(list.state).toBe('refused')
    expect(list.error).toMatch(/insert row/)
  })

  it('refuses an insert row with a comment or with the target second in the list', () => {
    const commented = migratePatchText(`- insert: # bundle layer\n    - id: ${TARGET_ID}\n      name: '@elvisw/dsh-plugin-magic-context'\n`)
    expect(commented.state).toBe('refused')
    const second = migratePatchText([
      '- insert:',
      '    - id: other',
      "      name: '@deepseek-ai/other'",
      `    - id: ${TARGET_ID}`,
      "      name: '@elvisw/dsh-plugin-magic-context'",
      '',
    ].join('\n'))
    expect(second.state).toBe('refused')
    expect(second.error).toMatch(/insert row/)
  })

  it('refuses the real bundle cordis.patch.yml instead of rewriting it', () => {
    const patch = readFileSync(join(ROOT, 'cordis.patch.yml'), 'utf8')
    const result = migratePatchText(patch)
    expect(result.state).toBe('refused')
    expect(result.error).toMatch(/insert row/)
  })

  it('refuses malformed id lines instead of exiting 0', () => {
    for (const line of [
      `- id : ${TARGET_ID}`,
      `- "id": ${TARGET_ID}`,
      `- id: ${TARGET_ID} &row`,
    ]) {
      const result = migratePatchText(`${line}\n  name: '@elvisw/dsh-plugin-magic-context'\n`)
      expect(result.state).toBe('refused')
    }
  })

  it('refuses a target whose name appears before id, including a bare dash item', () => {
    const inline = migratePatchText(`- name: '@elvisw/dsh-plugin-magic-context'\n  id: ${TARGET_ID}\n`)
    expect(inline.state).toBe('refused')
    expect(inline.error).toMatch(/name appears before id/)

    const bare = migratePatchText([
      '-',
      "  name: '@elvisw/dsh-plugin-magic-context'",
      `  id: ${TARGET_ID}`,
      '',
    ].join('\n'))
    expect(bare.state).toBe('refused')
    expect(bare.error).toMatch(/name appears before id/)
  })

  it('accepts spacing before the name colon and refuses a quoted key', () => {
    const spaced = migratePatchText(`- id: ${TARGET_ID}\n  name : '@elvisw/dsh-plugin-magic-context'\n`)
    expect(spaced.state).toBe('rewritten')
    expect(spaced.text).toContain(NEW_NAME)

    const quoted = migratePatchText(`- id: ${TARGET_ID}\n  'name': '@elvisw/dsh-plugin-magic-context'\n`)
    expect(quoted.state).toBe('refused')
    expect(quoted.error).toMatch(/could not safely read/)
  })

  it('refuses a nested name instead of rewriting config.name', () => {
    const result = migratePatchText(`- id: ${TARGET_ID}\n  config:\n    name: '@elvisw/dsh-plugin-magic-context'\n`)
    expect(result.state).toBe('refused')
    expect(result.error).toMatch(/nested name/)
  })

  it('refuses another row that already uses the new name', () => {
    const result = migratePatchText([
      `- id: ${TARGET_ID}`,
      "  name: '@elvisw/dsh-plugin-magic-context'",
      '- id: magic-context-dsh-2',
      `  name: '${NEW_NAME}'`,
      '',
    ].join('\n'))
    expect(result.state).toBe('refused')
    expect(result.error).toMatch(/another row already uses/)
  })

  it('refuses flow-style, anchors and multi-document files', () => {
    expect(migratePatchText(`- { id: ${TARGET_ID}, name: '@elvisw/dsh-plugin-magic-context' }\n`).state)
      .toBe('refused')
    expect(migratePatchText(`- id: ${TARGET_ID}\n  name: &old '@elvisw/dsh-plugin-magic-context'\n`).state)
      .toBe('refused')
    expect(migratePatchText(`---\n${fixture('x')}---\n- id: other\n`).state)
      .toBe('refused')
  })

  it('leaves the file byte-identical and creates no backup on refusal', () => {
    const text = `- insert:\n    - id: ${TARGET_ID}\n      name: '@elvisw/dsh-plugin-magic-context'\n`
    const { file, dir } = tempFile(text)
    const result = migratePatchFile(file)
    expect(result.state).toBe('refused')
    expect(readFileSync(file, 'utf8')).toBe(text)
    expect(readdirSync(dir).filter((name) => name.includes('.bak-'))).toHaveLength(0)
  })

  it('writes a backup only when it changes something', () => {
    const { file, dir } = tempFile(fixture('x'))
    const first = migratePatchFile(file)
    expect(first.state).toBe('rewritten')
    expect(first.changed).toBe(true)
    const backups = readdirSync(dir).filter((name) => name.includes('.bak-'))
    expect(backups).toHaveLength(1)
    expect(readFileSync(file, 'utf8')).toContain(NEW_NAME)

    const second = migratePatchFile(file)
    expect(second.state).toBe('already-migrated')
    expect(readdirSync(dir).filter((name) => name.includes('.bak-'))).toHaveLength(1)
  })

  it('refuses a missing patch file', () => {
    const result = migratePatchFile(join(tmpdir(), 'does-not-exist-mc-patch.yml'))
    expect(result.state).toBe('refused')
    expect(result.error).toMatch(/not found/)
  })

  it('does not touch the file when it refuses', () => {
    const original = `- id: ${TARGET_ID}\n  name: '@someone/unknown'\n`
    const { file } = tempFile(original)
    const result = migratePatchFile(file)
    expect(result.state).toBe('refused')
    expect(readFileSync(file, 'utf8')).toBe(original)
  })

  it('requires --patch on the CLI', () => {
    let status = 0
    try {
      execFileSync(process.execPath, [HELPER], { stdio: 'pipe' })
    } catch (error) {
      status = (error as { status?: number }).status ?? 0
    }
    expect(status).toBe(2)
  })

  it('exits 4 for a malformed target row', () => {
    const { file } = tempFile(`- id : ${TARGET_ID}\n  name: '@elvisw/dsh-plugin-magic-context'\n`)
    let status = 0
    try {
      execFileSync(process.execPath, [HELPER, '--patch', file], { stdio: 'pipe' })
    } catch (error) {
      status = (error as { status?: number }).status ?? 0
    }
    expect(status).toBe(4)
  })
})
