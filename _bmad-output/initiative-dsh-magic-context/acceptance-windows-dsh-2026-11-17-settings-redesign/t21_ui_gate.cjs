const { chromium } = require('C:/Users/elvis/node_modules/.deno/playwright@1.63.0/node_modules/playwright')
const { execFileSync } = require('child_process')
const fs = require('fs')
const path = require('path')

const REPORT = 'C:/Users/elvis/Documents/dev/plugin/dsh-plugin-magic-context/_bmad-output/initiative-dsh-magic-context/acceptance-windows-dsh-2026-11-17-settings-redesign'
const root = JSON.parse(fs.readFileSync(path.join(REPORT, 'experiment-root.json'), 'utf8')).root
const server = JSON.parse(fs.readFileSync(path.join(root, 'evidence', 'server.json'), 'utf8'))
const screenshots = path.join(root, 'screenshots')
const out = { root, steps: [], failures: [], requests: [], errors: [] }

const record = (name, data = {}) => {
  out.steps.push({ name, at: new Date().toISOString(), ...data })
  console.log('STEP', name, JSON.stringify(data))
}
const check = (name, ok, detail = {}) => {
  if (!ok) out.failures.push({ name, ...detail })
  record(name, { ok, ...detail })
}
const shot = async (page, name) => page.screenshot({ path: path.join(screenshots, name), fullPage: true })
const dialog = (page) => page.getByRole('dialog')
const button = (page, name) => dialog(page).getByRole('button', { name, exact: true })
const hasButton = async (page, name) => (await button(page, name).count()) > 0

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
async function switchLanguage(page, label) {
  const language = dialog(page).getByRole('button', { name: /^(English|中文)$/ }).first()
  if (await language.count() === 0) return false
  if ((await language.innerText()).trim() === label) return true
  await language.click()
  await page.waitForTimeout(400)
  await page.getByRole('menuitem', { name: label }).click()
  await page.waitForTimeout(900)
  return true
}
async function closeSettings(page) {
  const close = dialog(page).getByRole('button', { name: /^(Close|关闭)$/ })
  if (await close.count() > 0) {
    await close.first().click()
    await page.waitForTimeout(700)
  }
}
async function reopenWithLanguage(page, label) {
  await closeSettings(page)
  await openSettings(page)
  const switched = await switchLanguage(page, label)
  await closeSettings(page)
  await openSettings(page)
  return switched
}
async function save(page) {
  const target = dialog(page).getByRole('button', { name: /^(保存|Save)$/ }).last()
  if (await target.count() === 0) throw new Error('save button missing')
  await page.waitForTimeout(400)
  if (await target.isDisabled()) throw new Error('save button disabled')
  await target.click()
  await page.waitForTimeout(1800)
}
const value = (page, selector) => dialog(page).locator(selector).inputValue()

;(async () => {
  const browser = await chromium.launch({ headless: true, channel: 'msedge' })
  const context = await browser.newContext({ viewport: { width: 1440, height: 1800 } })
  const page = await context.newPage()
  page.on('console', (msg) => { if (msg.type() === 'error') out.errors.push(msg.text()) })
  page.on('pageerror', (error) => out.errors.push(String(error)))
  page.on('request', (request) => {
    const url = request.url()
    if (url.includes('/api/settings/mutate') || url.includes('/mc-embedding/rebuild')) {
      out.requests.push({ at: new Date().toISOString(), method: request.method(), url })
    }
  })

  await page.goto(server.url, { waitUntil: 'domcontentloaded', timeout: 60000 })
  await page.waitForTimeout(2500)
  await dismissOnboarding(page)
  await openSettings(page)
  const chinese = await switchLanguage(page, '中文')
  await openCard(page)

  const cardText = async () => dialog(page).innerText()
  const initial = await cardText()
  check('chinese-locale', chinese, {})
  for (const label of ['回收策略', '历史摘要', '向量空间', '重建', '常规', '日志', '向量检索', '维护与诊断']) {
    check('visible-' + label, initial.includes(label), {})
  }
  check('five-sections', (await dialog(page).locator('[data-mc-section]').count()) === 5, {
    count: await dialog(page).locator('[data-mc-section]').count(),
  })
  check('summary-strip', (await dialog(page).locator('[data-mc-summary]').count()) === 1, {})
  const jumpButtons = dialog(page).locator('[data-mc-jump-row] button')
  const jumpCount = await jumpButtons.count()
  const beforeJump = await dialog(page).locator('#mc-section-embedding').evaluate((node) => node.getBoundingClientRect().top)
  if (jumpCount > 0) await jumpButtons.filter({ hasText: '向量检索' }).first().click()
  await page.waitForTimeout(600)
  const afterJump = await dialog(page).locator('#mc-section-embedding').evaluate((node) => node.getBoundingClientRect().top)
  check('jump-row-click', jumpCount === 5 && afterJump < beforeJump, { jumpCount, beforeJump, afterJump })
  const advanced = dialog(page).locator('[data-mc-section="embedding"] [aria-label="展开高级设置"]')
  const advancedClosed = await dialog(page).locator('#mc-field-embedding\\.dimensions').count()
  await advanced.click()
  await page.waitForTimeout(300)
  const advancedOpen = await dialog(page).locator('#mc-field-embedding\\.dimensions').count()
  check('advanced-disclosure', advancedClosed === 0 && advancedOpen === 1, { advancedClosed, advancedOpen })
  const ariaLabels = await dialog(page).locator('[data-mc-section] [aria-label]').evaluateAll((nodes) =>
    nodes.map((node) => node.getAttribute('aria-label')).filter((value) => typeof value === 'string' && value !== ''))
  check('zh-aria-label-all-chinese', ariaLabels.length > 0
    && ariaLabels.includes('展开高级设置')
    && ariaLabels.every((value) => /[\u4e00-\u9fff]/.test(value)), { ariaLabels })
  check('single-visible-save', (await dialog(page).getByRole('button', { name: '保存', exact: true }).count()) === 1, {
    count: await dialog(page).getByRole('button', { name: '保存', exact: true }).count(),
  })
  check('start-disabled-at-zero', await hasButton(page, '开始重建向量')
    ? await button(page, '开始重建向量').isDisabled() : false, {})
  await shot(page, '01-summary-zh.png')

  // Add searchable memories after the zero-memory assertion; this is the T21
  // isolated corpus only.
  let seedError = ''
  try {
    execFileSync('python', [path.join(REPORT, 'seed_t21_corpus.py'), '--root', root], { encoding: 'utf8' })
  } catch (error) {
    seedError = String(error && error.message ? error.message : error)
  }
  record('seed-corpus', { ok: seedError === '', error: seedError })
  if (seedError !== '') out.failures.push({ name: 'seed-corpus', error: seedError })
  await page.waitForTimeout(1200)
  if (await hasButton(page, '刷新')) {
    await button(page, '刷新').click()
    await page.waitForTimeout(1200)
  }

  // Populate the empty saved config through the draft path.
  await dialog(page).locator('#mc-field-embedding\\.endpoint').fill(`http://127.0.0.1:${server.fake_port}/v1`)
  await dialog(page).locator('#mc-field-embedding\\.model').fill('fixture-embed-a')
  await page.waitForTimeout(500)
  check('dirty-load-label', await hasButton(page, '保存并加载模型'), {})
  check('dirty-test-label', await hasButton(page, '保存并测试'), {})
  check('save-before-action-label', (await dialog(page).getByRole('button', { name: '保存', exact: true }).count()) === 1, {})
  await button(page, '保存并加载模型').click()
  await page.waitForTimeout(2500)
  const modelSelect = dialog(page).locator('select[aria-label="选择或填写模型"]')
  const options = await modelSelect.locator('option').evaluateAll((nodes) => nodes.map((node) => node.value))
  check('models-loaded', options.includes('fixture-embed-a'), { options })

  await button(page, '测试连接').click()
  await page.waitForTimeout(2000)
  const probed = await cardText()
  check('probe-dimensions', probed.includes('16 维'), {})
  check('probe-not-started', probed.includes('未开始重建'), {})
  check('start-enabled-after-probe', await hasButton(page, '开始重建向量')
    ? !(await button(page, '开始重建向量').isDisabled()) : false, {})
  await shot(page, '02-probed-zh.png')

  await button(page, '开始重建向量').click()
  await page.waitForTimeout(400)
  const confirm = page.locator('[data-mc-confirm-dialog="start"]')
  check('start-confirm-visible', (await confirm.count()) === 1, {})
  const confirmText = await confirm.innerText()
  check('start-confirm-count', confirmText.includes('3'), { text: confirmText })
  await page.locator('[data-mc-confirm-ok]').click()
  await page.waitForTimeout(3000)
  const started = await cardText()
  check('started-or-ready', started.includes('迁移中') || started.includes('已就绪'), { text: started.slice(-800) })
  await shot(page, '03-migrating-zh.png')

  if (await hasButton(page, '暂停')) {
    await button(page, '暂停').click()
    await page.waitForTimeout(700)
    const pausedText = await cardText()
    check('paused-status', pausedText.includes('已暂停'), { text: pausedText.slice(-500) })
    check('paused-load-disabled', await hasButton(page, '加载模型')
      && await button(page, '加载模型').isDisabled(), {})
    check('paused-test-disabled', await hasButton(page, '测试连接')
      && await button(page, '测试连接').isDisabled(), {})
    if (await hasButton(page, '继续')) {
      await button(page, '继续').click()
      await page.waitForTimeout(2500)
      const resumed = await cardText()
      check('resume-active', resumed.includes('迁移中') || resumed.includes('已就绪'), { text: resumed.slice(-600) })
    }
  }

  await page.waitForTimeout(1500)
  const rollbackStart = out.requests.length
  await button(page, '回滚到本地').click()
  await page.waitForTimeout(300)
  check('rollback-confirm-visible', (await page.locator('[data-mc-confirm-dialog="rollback"]').count()) === 1, {})
  check('no-disarm-before-save', out.requests.slice(0, rollbackStart)
    .every((entry) => !entry.url.includes('action=disarm')), { rollbackStart })
  await page.locator('[data-mc-confirm-ok]').click()
  await page.waitForTimeout(3000)
  const rolledBack = await cardText()
  const afterRollback = out.requests.slice(rollbackStart)
  const mutateOffset = afterRollback.findIndex((entry) => entry.url.includes('/api/settings/mutate'))
  const disarmOffset = afterRollback.findIndex((entry) => entry.url.includes('action=disarm'))
  check('rollback-status', rolledBack.includes('已回滚到本地'), { text: rolledBack.slice(-800) })
  check('disarm-after-save', mutateOffset >= 0 && disarmOffset > mutateOffset,
    { rollbackStart, mutateOffset, disarmOffset, requests: afterRollback })
  await shot(page, '04-rollback-zh.png')

  const switched = await reopenWithLanguage(page, 'English')
  await openCard(page)
  const english = await cardText()
  check('english-switched', switched, {})
  for (const label of ['General', 'Historian', 'Journal', 'Embedding search', 'Maintenance and diagnostics']) {
    check('english-' + label, english.includes(label), {})
  }
  const englishAria = await dialog(page).locator('[data-mc-section] [aria-label]').evaluateAll((nodes) =>
    nodes.map((node) => node.getAttribute('aria-label')).filter((value) => typeof value === 'string' && value !== ''))
  check('english-aria-no-chinese', englishAria.length > 0
    && englishAria.every((value) => !/[\u4e00-\u9fff]/.test(value)), { ariaLabels: englishAria })
  await shot(page, '05-summary-en.png')

  await page.setViewportSize({ width: 540, height: 1200 })
  await page.waitForTimeout(700)
  const narrow = await cardText()
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1)
  check('narrow-sections', ['常规', '历史摘要', '向量检索'].every((label) => narrow.includes(label))
    || ['General', 'Historian', 'Embedding search'].every((label) => narrow.includes(label)), {})
  check('narrow-no-horizontal-scroll', overflow === false, { overflow })
  await shot(page, '06-narrow-en.png')

  check('console-errors-zero', out.errors.length === 0, { errors: out.errors })
  out.final = {
    requests: out.requests,
    failures: out.failures,
    errors: out.errors,
  }
  fs.writeFileSync(path.join(root, 'evidence', 'ui-gate.json'), JSON.stringify(out, null, 2) + '\n', 'utf8')
  console.log(JSON.stringify({ steps: out.steps.length, failures: out.failures.length, errors: out.errors.length }, null, 2))
  await browser.close()
  process.exit(out.failures.length === 0 && out.errors.length === 0 ? 0 : 1)
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
