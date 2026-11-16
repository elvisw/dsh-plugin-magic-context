const { chromium } = require('C:/Users/elvis/node_modules/.deno/playwright@1.63.0/node_modules/playwright')
const fs = require('fs')
const path = require('path')

const REPORT = 'C:/Users/elvis/Documents/dev/plugin/dsh-plugin-magic-context/_bmad-output/initiative-dsh-magic-context/acceptance-windows-dsh-2026-11-16-t20-remote-embedding'
const root = JSON.parse(fs.readFileSync(path.join(REPORT, 'experiment-root.json'), 'utf8')).root
const server = JSON.parse(fs.readFileSync(path.join(root, 'evidence', 'server.json'), 'utf8'))
const fakeRoot = server.fake_root
const patchPath = path.join(root, 'dsh-home', 'profiles', 't20', 'cordis.patch.yml')
const screenshots = path.join(root, 'screenshots')
const out = { root, fakeRoot, steps: [], requestsBeforeStart: [], requestsAfterStart: [], errors: [] }

const record = (name, data = {}) => {
  out.steps.push({ name, at: new Date().toISOString(), ...data })
  console.log('STEP', name, JSON.stringify(data))
}
const shot = async (page, name) => page.screenshot({ path: path.join(screenshots, name), fullPage: true })
const dialog = (page) => page.getByRole('dialog')
const requests = () => {
  const file = path.join(fakeRoot, 'embedding-requests.jsonl')
  if (!fs.existsSync(file)) return []
  return fs.readFileSync(file, 'utf8').split('\n').filter(Boolean).map((line) => JSON.parse(line))
}
const patchText = () => fs.readFileSync(patchPath, 'utf8')

async function dismissOnboarding(page) {
  for (const name of ['继续', 'Continue']) {
    const cont = page.getByRole('button', { name })
    if (await cont.count()) { await cont.first().click(); await page.waitForTimeout(700); return }
  }
}
async function openSettings(page) {
  await page.keyboard.press('Control+Alt+Comma')
  await page.waitForTimeout(1200)
  await page.getByRole('dialog').waitFor({ timeout: 15000 })
  await page.getByRole('button', { name: 'Magic Context', exact: true }).waitFor({ timeout: 15000 })
}
async function openCard(page) {
  await dialog(page).getByRole('button', { name: 'Magic Context', exact: true }).first().click()
  await page.getByRole('dialog').waitFor({ timeout: 15000 })
  await page.waitForTimeout(900)
}
async function ensureChinese(page) {
  const language = dialog(page).getByRole('button', { name: /^(English|中文)$/ }).first()
  if (await language.count() === 0) return 'unknown'
  if ((await language.innerText()).trim() === '中文') return 'zh'
  await language.click()
  await page.waitForTimeout(400)
  await page.getByRole('menuitem', { name: '中文' }).click()
  await page.waitForTimeout(900)
  return 'switched'
}
async function save(page) {
  const button = dialog(page).getByRole('button', { name: /^(保存|Save)$/ }).last()
  if (await button.count() === 0) throw new Error('save button missing')
  await page.waitForTimeout(400)
  if (await button.isDisabled()) throw new Error('save button disabled')
  await button.click()
  await page.waitForTimeout(1800)
}
async function reloadCard(page) {
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(2500)
  await dismissOnboarding(page)
  await openSettings(page)
  await openCard(page)
}
const button = (page, name) => dialog(page).getByRole('button', { name, exact: true })
const value = (page, selector) => dialog(page).locator(selector).inputValue()

;(async () => {
  const browser = await chromium.launch({ headless: true, channel: 'msedge' })
  const context = await browser.newContext({ viewport: { width: 1440, height: 1800 } })
  const page = await context.newPage()
  page.on('console', (msg) => { if (msg.type() === 'error') out.errors.push(msg.text()) })
  page.on('pageerror', (error) => out.errors.push(String(error)))

  await page.goto(server.url, { waitUntil: 'domcontentloaded', timeout: 60000 })
  await page.waitForTimeout(2500)
  await dismissOnboarding(page)
  await openSettings(page)
  await ensureChinese(page)
  await dialog(page).getByRole('button', { name: /^(Close|关闭)$/ }).click()
  await page.waitForTimeout(700)
  await openSettings(page)
  await openCard(page)

  const state = async () => {
    const text = await dialog(page).innerText()
    const provider = await value(page, '#mc-field-embedding\\.provider')
    const model = await value(page, '#mc-field-embedding\\.model')
    const statusLine = text.split('\n').find((line) => line.includes('状态:')) ?? ''
    return { text, provider, model, statusLine }
  }

  const initial = await state()
  record('initial', {
    provider: initial.provider,
    model: initial.model,
    hasEmbeddingSection: initial.text.includes('向量检索'),
    hasStart: (await button(page, '开始重建向量').count()) > 0,
    hasProbe: (await button(page, '测试连接').count()) > 0,
    statusLine: initial.statusLine,
  })
  await shot(page, '01-initial-remote-unprobed.png')

  await button(page, '加载模型').click()
  await page.waitForTimeout(1200)
  const modelSelect = dialog(page).locator('select[aria-label="选择或填写模型"]')
  const options = await modelSelect.locator('option').evaluateAll((nodes) => nodes.map((node) => node.value))
  record('models-loaded', { options })

  await button(page, '测试连接').click()
  await page.waitForTimeout(1500)
  const probed = await state()
  record('probed', { statusLine: probed.statusLine, patchHas16: patchText().includes('dimensions: 16') })
  out.requestsBeforeStart = requests()
  const beforeStartEmbeddings = out.requestsBeforeStart.filter((entry) => entry.path === 'embeddings').length
  record('before-start-requests', {
    requests: out.requestsBeforeStart,
    embeddings: beforeStartEmbeddings,
    // One explicit probe is expected. Any further embedding call before Start
    // would be an automatic query/backfill request.
    automatic: Math.max(0, beforeStartEmbeddings - 1),
  })
  await shot(page, '02-probed-not-started.png')

  await button(page, '开始重建向量').click()
  await page.waitForTimeout(3500)
  const started = await state()
  record('started', { statusLine: started.statusLine })
  out.requestsAfterStart = requests()
  record('after-start-requests', {
    embeddings: out.requestsAfterStart.filter((entry) => entry.path === 'embeddings').length,
    counts: out.requestsAfterStart.filter((entry) => entry.path === 'embeddings').map((entry) => entry.inputCount),
  })
  await shot(page, '03-migrating.png')

  await button(page, '暂停').click()
  await page.waitForTimeout(700)
  record('paused', { statusLine: (await state()).statusLine })
  await button(page, '继续').click()
  await page.waitForTimeout(2500)
  record('resumed', { statusLine: (await state()).statusLine })
  await shot(page, '04-ready.png')

  await button(page, '回滚到本地').click()
  await page.waitForTimeout(1200)
  record('rollback-staged', {
    provider: await value(page, '#mc-field-embedding\\.provider'),
    fakeRequests: requests().length,
  })
  await save(page)
  await reloadCard(page)
  const rollbackStatus = (await state()).statusLine
  record('rollback-after-save', {
    provider: await value(page, '#mc-field-embedding\\.provider'),
    statusLine: rollbackStatus,
    rollbackStateOk: rollbackStatus.includes('已回滚到本地'),
  })
  await shot(page, '05-rollback-local.png')

  out.final = {
    errors: out.errors,
    patchProvider: /provider:\s*(\S+)/.exec(patchText())?.[1] ?? null,
    patchModel: /model:\s*(\S+)/.exec(patchText())?.[1] ?? null,
    patchDimensions: /dimensions:\s*(\S+)/.exec(patchText())?.[1] ?? null,
  }
  fs.writeFileSync(path.join(root, 'evidence', 'ui-gate.json'), JSON.stringify(out, null, 2) + '\n', 'utf8')
  console.log(JSON.stringify({ steps: out.steps.length, errors: out.errors.length }, null, 2))
  await browser.close()
})().catch(async (error) => {
  try {
    const pages = typeof context === 'undefined' ? [] : context.pages()
    if (pages[0]) await pages[0].screenshot({ path: path.join(screenshots, '99-failure.png'), fullPage: true })
  } catch {}
  out.errors.push(String(error && error.stack ? error.stack : error))
  fs.writeFileSync(path.join(root, 'evidence', 'ui-gate.json'), JSON.stringify(out, null, 2) + '\n', 'utf8')
  console.error(error)
  process.exit(1)
})
