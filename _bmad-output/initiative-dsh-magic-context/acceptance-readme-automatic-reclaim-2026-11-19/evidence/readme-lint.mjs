/**
 * Mechanical checks for the READMEs. T27 copy: adds fact-force-band-documented and
 * writes nothing, exactly like the T26 original it was copied from.
 *
 * Documentation check, not a product gate. It lives in the ticket's evidence
 * directory rather than scripts/ so it never becomes a CI obligation for files
 * that have no runtime effect.
 *
 * Usage: node readme-lint.mjs [repoRoot]
 * Writes nothing; prints JSON to stdout and exits 1 if any assertion fails.
 */
import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'

const root = process.argv[2] ?? process.cwd()
const read = (rel) => readFileSync(join(root, rel), 'utf8')
const results = []
const check = (name, ok, detail = '') => results.push({ name, ok: !!ok, detail: String(detail) })

/* ------------------------------------------------ expected heading structure */
const ZH_HEADINGS = ['安装', '装完会看到什么', '常用操作', '命令与工具', '设置', 'Android',
  '它访问什么', '已知限制', '排障', '文档', '参与', '出处与许可']
const EN_HEADINGS = ['Install', 'What you get', 'Common tasks', 'Commands and tools', 'Settings',
  'Android', 'What it accesses', 'Known limits', 'Troubleshooting', 'Documentation', 'Contributing',
  'Provenance and license']

const parseHeadings = (text) => text.split('\n')
  .filter((l) => /^#{1,6} /.test(l))
  .map((l) => ({ level: l.match(/^#+/)[0].length, text: l.replace(/^#+\s*/, '').trim() }))

// The body of one h2 section, heading excluded, up to the next heading of the same or
// higher level. Used to keep an assertion inside one section instead of one whole file.
const sectionText = (text, heading) => {
  const lines = text.split('\n')
  const start = lines.findIndex((l) => l.replace(/^#+\s*/, '').trim() === heading)
  if (start < 0) return ''
  const level = lines[start].match(/^#+/)[0].length
  const rest = lines.slice(start + 1)
  const end = rest.findIndex((l) => {
    const m = l.match(/^(#+)\s/)
    return m !== null && m[1].length <= level
  })
  return (end < 0 ? rest : rest.slice(0, end)).join('\n')
}

const zh = read('README.zh-CN.md')
const en = read('README.md')
const zhH = parseHeadings(zh)
const enH = parseHeadings(en)
const h1 = (hs) => hs.filter((h) => h.level === 1)
const h2 = (hs) => hs.filter((h) => h.level === 2)
const h3plus = (hs) => hs.filter((h) => h.level >= 3)

for (const [lang, hs, want] of [['zh', zhH, ZH_HEADINGS], ['en', enH, EN_HEADINGS]]) {
  check(`${lang}-h1-count`, h1(hs).length === 1, h1(hs).length)
  check(`${lang}-h2-count`, h2(hs).length === 12, h2(hs).length)
  check(`${lang}-no-h3`, h3plus(hs).length === 0,
    h3plus(hs).map((h) => h.text).join(' | '))
  check(`${lang}-h2-order`, JSON.stringify(h2(hs).map((h) => h.text)) === JSON.stringify(want),
    h2(hs).map((h) => h.text).join(' | '))
}

/* -------------------------------------- hard banned words, parsed from the plan */
const plan = read('_bmad-output/initiative-dsh-magic-context/tickets/story-readme-rewrite-for-readers-plan.md')
function block(name) {
  const m = plan.match(new RegExp(`<!-- ${name} -->([\\s\\S]*?)<!-- /${name} -->`))
  return m ? m[1].split('\n').map((s) => s.trim()).filter(Boolean) : null
}
const hardZh = block('banned:zh')
const hardEn = block('banned:en')
check('plan-has-hard-zh', Array.isArray(hardZh) && hardZh.length > 0, hardZh?.length)
check('plan-has-hard-en', Array.isArray(hardEn) && hardEn.length > 0, hardEn?.length)

const zhHits = (hardZh ?? []).filter((w) => zh.includes(w))
const enHits = (hardEn ?? []).filter((w) =>
  new RegExp(`\\b${w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i').test(en))
check('banned-hard-zh', zhHits.length === 0, zhHits.join(','))
check('banned-hard-en', enHits.length === 0, enHits.join(','))

/* --------------------------------- Requirement 4: per-fact before/after targets */
// `exactly1` must end at one occurrence; `atMost2` may keep two.
const FACTS = [
  { key: 'legacy-card', target: 'exactly1',
    zh: /插件[^\n]{0,4}页[^\n]{0,4}卡片/g, en: /Plugins[- ]page card/gi },
  { key: 'flat-headless', target: 'exactly1',
    zh: /flat\/headless/g, en: /flat\/headless/gi },
  { key: 'memory-default-on', target: 'exactly1',
    zh: /记忆[^\n]{0,12}默认(?:开启|开)/g, en: /on by default/gi },
  { key: 'row-id-shared', target: 'exactly1',
    zh: /row id/gi, en: /row id/gi },
  { key: 'chinese-fts-limit', target: 'exactly1',
    zh: /porter unicode61/g, en: /porter unicode61/gi },
  { key: 'package-scope-prose', target: 'exactly1',
    zh: /另一位维护者的独立实现/g, en: /different implementation by another maintainer/gi },
  { key: 'never-zero', target: 'atMost2',
    zh: /不写成\s*0|不伪造\s*0/g, en: /never 0|fabricated 0/gi },
  { key: 'five-sections', target: 'atMost2',
    zh: /五个分区/g, en: /five sections/gi },
  { key: 'second-package', target: 'atMost2',
    zh: /第二个包/g, en: /second package/gi },
  { key: 'ctx-expand-semantics', target: 'exactly1',
    zh: /原地改写占位符|作为新(?:工具)?结果返回/g, en: /rewrites placeholders in place|as a new tool result/gi },
]
// Matching is done on whitespace-collapsed text so a phrase broken across a line
// wrap still counts as one occurrence. Blockquote markers are stripped first,
// otherwise "> maintainer" splits the sentence and the phrase never matches.
const squash = (text) => text
  .split('\n')
  .map((line) => line.replace(/^\s*>\s?/, ''))
  .join('\n')
  .replace(/\s+/g, ' ')
const zhFlat = squash(zh)
const enFlat = squash(en)
for (const f of FACTS) {
  const z = (zhFlat.match(f.zh) ?? []).length
  const e = (enFlat.match(f.en) ?? []).length
  const ok = f.target === 'exactly1' ? z === 1 && e === 1 : z <= 2 && e <= 2
  check(`fact-${f.target}-${f.key}`, ok, `zh=${z} en=${e}`)
}

/* ------------------------------------------------------ forbidden identifiers */
const FORBIDDEN = ['src/', 'pending_drops', 'flush_requested', 'memory_embeddings',
  'compartments', 'schema v11', 'schema 到 v11', 'v11', 'EMBEDDING_ASSETS', 'defaultDataDir']
for (const token of FORBIDDEN) {
  const z = zh.includes(token)
  const e = en.includes(token)
  check(`forbidden-${token.replace(/[^a-z0-9]/gi, '_')}`, !z && !e, `zh=${z} en=${e}`)
}
// singular must survive: Requirement 3 asks for it to be explained
check('singular-compartment-present', /compartment/i.test(en) && /compartment/i.test(zh) === false
  ? true : /compartment/i.test(en),
  'en has singular')

/* ---------------------------------------------------------- layout limits */
const over400 = []
const over5Links = []
for (const [name, text] of [['README.md', en], ['README.zh-CN.md', zh]]) {
  text.split('\n').forEach((line, i) => {
    if (line.length > 400) over400.push(`${name}:${i + 1}=${line.length}`)
    const links = (line.match(/\]\(/g) ?? []).length
    if (links > 5) over5Links.push(`${name}:${i + 1}=${links}`)
  })
}
check('no-line-over-400', over400.length === 0, over400.join(' '))
check('no-line-over-5-links', over5Links.length === 0, over5Links.join(' '))

/* --------------------------------------------------------------- glossary */
const GLOSSARY_TERMS = ['§N§', 'H', 'Q<n>', 'historian', 'FTS5', 'tick', 'parity',
  'overlay', 'composer', 'flat/headless', 'pre-step', 'execute band', 'force band', '强制带', '受保护窗口', '四层摘要',
  'four summary layers', 'HMR', 'surface', 'compartment', 'baseline', 'gate', 'embedding']
const glossaryPath = join(root, 'docs/glossary.md')
check('glossary-exists', existsSync(glossaryPath), glossaryPath)
if (existsSync(glossaryPath)) {
  const g = readFileSync(glossaryPath, 'utf8').toLowerCase()
  const missing = GLOSSARY_TERMS.filter((t) => !g.includes(t.toLowerCase()))
  check('glossary-covers-terms', missing.length === 0, missing.join(','))
}
check('glossary-linked-zh', zh.includes('docs/glossary.md'), '')
check('glossary-linked-en', en.includes('docs/glossary.md'), '')

// Term coverage follows Requirement 3's split: words shared by both READMEs must
// appear in both; language-specific words are checked against their own file.
const SHARED_IN_BOTH = ['§N§', 'historian', 'FTS5', 'overlay', 'composer', 'flat/headless',
  'pre-step', 'HMR', 'surface', 'tick', 'parity', 'compartment', 'embedding']
const ZH_ONLY = ['回收带', '基线', '门禁', '四层摘要', '嵌入', '强制带']
const EN_ONLY = ['reclaim band', 'baseline', 'gate', 'four summary layers', 'execute band',
  'force band', 'protected window']

const escape = (t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
const missingShared = SHARED_IN_BOTH.filter((t) =>
  !new RegExp(escape(t), 'i').test(zh) || !new RegExp(escape(t), 'i').test(en))
check('shared-terms-present', missingShared.length === 0, missingShared.join(','))
const missingZhOnly = ZH_ONLY.filter((t) => !zh.includes(t))
check('zh-terms-present', missingZhOnly.length === 0, missingZhOnly.join(','))
const missingEnOnly = EN_ONLY.filter((t) => !new RegExp(escape(t), 'i').test(en))
check('en-terms-present', missingEnOnly.length === 0, missingEnOnly.join(','))

/* ------------------------------------- T27: the automatic drop path is documented */
// Four conditions in ONE paragraph: the force band by name, what it protects, the default
// threshold, and the word that marks it as a default. A bare `85` elsewhere cannot satisfy
// this, and (?<![\d.]) keeps a 0.85 reading from matching.
const FORCE_BAND = [
  ['en', en, 'What you get', /force band/i, /protected window/i, /(?:by default|default)/i],
  ['zh', zh, '装完会看到什么', /强制带/, /受保护窗口/, /默认/],
]
const forceMissing = []
for (const [lang, text, heading, term, win, dflt] of FORCE_BAND) {
  const ok = sectionText(text, heading).split(/\n{2,}/).some((p) =>
    term.test(p) && win.test(p) && /(?<![\d.])85\s*[%％]/.test(p) && dflt.test(p))
  if (!ok) forceMissing.push(lang)
}
check('fact-force-band-documented', forceMissing.length === 0, forceMissing.join(','))

/* ------------------------------------------ Requirement 9: risk-flag numbers */
const scanPath = join(root,
  '_bmad-output/initiative-dsh-magic-context/acceptance-readme-rewrite-2026-11-19/evidence/market-risk-scan.json')
check('scan-evidence-exists', existsSync(scanPath), scanPath)

function section(text, heading) {
  const lines = text.split('\n')
  const start = lines.findIndex((l) => l.trim() === `## ${heading}`)
  if (start < 0) return ''
  const rest = lines.slice(start + 1)
  const end = rest.findIndex((l) => /^## /.test(l))
  return (end < 0 ? rest : rest.slice(0, end)).join('\n')
}

if (existsSync(scanPath)) {
  const scan = JSON.parse(readFileSync(scanPath, 'utf8'))
  const nums = scan.numbersForReadme
  const zhRisk = section(zh, '它访问什么')
  const enRisk = section(en, 'What it accesses')
  check('risk-section-zh', zhRisk.length > 0, 'missing section')
  check('risk-section-en', enRisk.length > 0, 'missing section')

  const numbers = [nums.flagCount, nums.shellFlaggedFiles, nums.realChildProcessFiles,
    nums.falsePositiveFiles, nums.sqliteExecCalls, nums.networkFlaggedFiles,
    nums.filesystemFlaggedFiles, nums.nativeCodeFlaggedFiles]
  for (const n of numbers) {
    check(`risk-number-${n}-zh`, zhRisk.includes(String(n)), 'absent in zh')
    check(`risk-number-${n}-en`, enRisk.includes(String(n)), 'absent in en')
  }

  // levels: every flag and its severity must appear in both sections
  for (const [flag, level] of Object.entries(scan.levels ?? {})) {
    const re = new RegExp(`${flag}[^\\n]{0,40}${level}|${level}[^\\n]{0,40}${flag}`, 'i')
    check(`risk-level-${flag}-zh`, re.test(zhRisk), `want ${flag}=${level}`)
    check(`risk-level-${flag}-en`, re.test(enRisk), `want ${flag}=${level}`)
  }

  // artifact attribution: the triggering file names must be there, and no src/ paths
  const ARTIFACTS = ['ort-wasm-simd-threaded.wasm', 'memory-bridge', 'project-drift',
    'telemetry.invalid', 'embedding.invalid']
  for (const a of ARTIFACTS) {
    check(`risk-artifact-${a}-zh`, zhRisk.toLowerCase().includes(a.toLowerCase()), '')
    check(`risk-artifact-${a}-en`, enRisk.toLowerCase().includes(a.toLowerCase()), '')
  }
  check('risk-no-src-zh', !/src\//.test(zhRisk), '')
  check('risk-no-src-en', !/src\//.test(enRisk), '')
}

/* ------------------------------------------------------------------- output */
const failed = results.filter((r) => !r.ok)
console.log(JSON.stringify({ total: results.length, failed: failed.length, results }, null, 2))
if (failed.length > 0) process.exitCode = 1
