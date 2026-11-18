const { chromium } = require('C:/Users/elvis/node_modules/.deno/playwright@1.63.0/node_modules/playwright')
const crypto = require('crypto')
const fs = require('fs')
const path = require('path')

const REPORT = 'C:/Users/elvis/Documents/dev/plugin/dsh-plugin-magic-context/_bmad-output/initiative-dsh-magic-context/acceptance-windows-dsh-2026-11-18-t24-credential-key'
const root = JSON.parse(fs.readFileSync(path.join(REPORT, 'experiment-root.json'), 'utf8')).root
const server = JSON.parse(fs.readFileSync(path.join(root, 'evidence', 'server.json'), 'utf8'))
const secret = fs.readFileSync(server.fake_secret_file, 'utf8').trim()
const screenshots = path.join(root, 'screenshots')
const profilePatch = path.join(root, 'dsh-home', 'profiles', 't24', 'cordis.patch.yml')
const pluginDb = path.join(root, 'plugin-data', 'memories.db')
const out = {
  root,
  tarball: JSON.parse(fs.readFileSync(path.join(root, 'evidence', 'prepare.json'), 'utf8')).tarball,
  steps: [],
  failures: [],
  requests: [],
  errors: [],
  stats: {},
  secretPresentIn: {},
  profilePatchSha256: {},
}

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
const sha256 = (file) => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex')
const readText = (file) => (fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '')

async function stats() {
  try {
    const response = await fetch(`http://127.0.0.1:${server.fake_port}/stats`)
    return await response.json()
  } catch (error) {
    return { error: String(error) }
  }
}

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

;(async () => {
  const browser = await chromium.launch({ headless: true, channel: 'msedge' })
  const context = await browser.newContext({ viewport: { width: 1440, height: 1800 } })
  const page = await context.newPage()
  page.on('console', (msg) => { if (msg.type() === 'error') out.errors.push(msg.text()) })
  page.on('pageerror', (error) => out.errors.push(String(error)))
  page.on('request', (request) => {
    const url = request.url()
    if (url.includes('/api/settings/mutate') || url.includes('/mc-embedding/')) {
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
  const blobs = () => {
    const files = [profilePatch, pluginDb, path.join(root, 'evidence', 'server-log.txt')]
    return files.map((file) => [file, readText(file)])
  }
  const secretIn = (file, text) => text.includes(secret)
  const initialText = await cardText()
  const initialStats = await stats()
  const secretInput = dialog(page).locator('#mc-field-embedding\\.apiKey')
  const refInput = dialog(page).locator('#mc-field-embedding\\.apiKeyEnv')
  const testButton = button(page, '测试连接')
  out.stats.initial = initialStats
  out.profilePatchSha256.before = sha256(profilePatch)
  check('chinese-locale', chinese, {})
  check('key-row-visible', (await secretInput.count()) === 1, {})
  check('key-absent', initialText.includes('API Key：未配置'), {})
  check('save-key-visible', await hasButton(page, '保存密钥'), {})
  check('clear-hidden', !(await hasButton(page, '清除凭据')), {})
  check('no-automatic-requests', initialStats.requests.length === 0, { requests: initialStats.requests })
  await shot(page, '01-key-absent-zh.png')

  const mutateBefore = out.requests.filter((entry) => entry.url.includes('/api/settings/mutate')).length
  await secretInput.fill(secret)
  await button(page, '保存密钥').click()
  await page.waitForTimeout(2500)
  const savedText = await cardText()
  const savedStats = await stats()
  out.stats.afterSave = savedStats
  out.profilePatchSha256.after = sha256(profilePatch)
  check('key-saved-source', savedText.includes('API Key：已配置（凭据库）'), {})
  check('key-input-cleared', (await secretInput.inputValue()) === '', {})
  check('clear-visible', await hasButton(page, '清除凭据'), {})
  check('save-did-not-mutate-config',
    out.requests.filter((entry) => entry.url.includes('/api/settings/mutate')).length === mutateBefore, { mutateBefore })
  check('save-did-not-call-provider', savedStats.requests.length === 0, { requests: savedStats.requests })
  check('profile-patch-unchanged', out.profilePatchSha256.before === out.profilePatchSha256.after, {})
  const savedCard = await cardText()
  check('secret-not-in-card', !savedCard.includes(secret), {})
  for (const [file, text] of blobs()) {
    out.secretPresentIn[path.basename(file)] = secretIn(file, text)
  }
  check('secret-not-in-profile-or-db', Object.values(out.secretPresentIn).every((present) => present === false), out.secretPresentIn)
  await shot(page, '02-key-saved-zh.png')

  check('test-enabled', !(await testButton.isDisabled()), {})
  await testButton.click()
  await page.waitForTimeout(2500)
  const probedText = await cardText()
  const probedStats = await stats()
  out.stats.afterProbe = probedStats
  check('probe-dimensions', probedText.includes('16 维'), { text: probedText.slice(-900) })
  check('probe-used-credential', probedStats.requests.some((entry) => entry.path === 'embeddings' && entry.auth === true), {
    requests: probedStats.requests,
  })
  await shot(page, '03-probe-zh.png')

  await button(page, '清除凭据').click()
  await page.waitForTimeout(2500)
  const clearedText = await cardText()
  const clearedStats = await stats()
  out.stats.afterClear = clearedStats
  check('key-cleared', clearedText.includes('API Key：未配置'), {})
  check('clear-hidden-after-clear', !(await hasButton(page, '清除凭据')), {})
  check('test-disabled-after-clear', await testButton.isDisabled(), {})
  check('clear-did-not-call-provider', clearedStats.requests.length === probedStats.requests.length, {
    before: probedStats.requests.length, after: clearedStats.requests.length,
  })
  await shot(page, '04-cleared-zh.png')

  await refInput.fill('T24_OTHER_KEY')
  await page.waitForTimeout(500)
  check('dirty-ref-disables-secret', await secretInput.isDisabled(), {})
  check('dirty-ref-copy', (await cardText()).includes('先保存变量名'), {})
  await refInput.fill('SILICONFLOW_API_KEY')
  await page.waitForTimeout(500)
  check('restored-ref-enables-secret', !(await secretInput.isDisabled()), {})

  const switched = await reopenWithLanguage(page, 'English')
  await openCard(page)
  const english = await cardText()
  check('english-switched', switched, {})
  check('english-key-label', english.includes('API key'), {})
  check('english-save-key', await hasButton(page, 'Save key'), {})
  await shot(page, '05-key-en.png')

  // A custom no-auth endpoint needs an explicit empty reference. `unset`
  // would fall back to the schema default, so Save must persist '' and the
  // card must show the no-auth state.
  await refInput.fill('')
  await page.waitForTimeout(400)
  await dialog(page).getByRole('button', { name: 'Save', exact: true }).last().click()
  await page.waitForTimeout(2500)
  check('empty-ref-saved', (await refInput.inputValue()) === '', {})
  check('empty-ref-no-auth', (await cardText()).includes('API key: not required'), {})
  check('empty-ref-secret-disabled', await secretInput.isDisabled(), {})

  await closeSettings(page)
  await browser.close()
  out.secretPresentIn.serverLog = secretIn(path.join(root, 'evidence', 'server-log.txt'), readText(path.join(root, 'evidence', 'server-log.txt')))
  if (out.errors.length > 0) out.failures.push({ name: 'console-errors', errors: out.errors })
  fs.writeFileSync(path.join(root, 'evidence', 'ui-gate.json'), JSON.stringify(out, null, 2) + '\n', { encoding: 'utf8' })
  console.log('RESULT', JSON.stringify({ failures: out.failures.length, errors: out.errors.length, steps: out.steps.length }))
  if (out.failures.length > 0) process.exitCode = 1
})().catch((error) => {
  out.errors.push(String(error && error.stack ? error.stack : error))
  fs.writeFileSync(path.join(root, 'evidence', 'ui-gate.json'), JSON.stringify(out, null, 2) + '\n', { encoding: 'utf8' })
  console.error(error)
  process.exitCode = 1
})
