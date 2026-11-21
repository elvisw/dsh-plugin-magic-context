/**
 * T37 gate.
 *
 * Run A (profile t37): local + no stored key has no key row; the SiliconFlow
 * preset hides the endpoint and auth header and shows the fixed address; Custom
 * brings both inputs back; a stored credential and a local provider leave only
 * the clear row, which removes itself.
 *
 * Run B (profile t37b): SiliconFlow with a saved non-default endpoint keeps both
 * inputs visible and says the saved value wins.
 */
const { chromium } = require('C:/Users/elvis/node_modules/.deno/playwright@1.63.0/node_modules/playwright')
const fs = require('fs')
const path = require('path')

const REPORT = 'C:/Users/elvis/Documents/dev/plugin/dsh-plugin-magic-context/_bmad-output/initiative-dsh-magic-context/acceptance-windows-dsh-t37-preset-and-key-row'
const root = JSON.parse(fs.readFileSync(path.join(REPORT, 'experiment-root.json'), 'utf8')).root
const server = JSON.parse(fs.readFileSync(path.join(root, 'evidence', 'server.json'), 'utf8'))
const hosts = Object.fromEntries(server.hosts.map((host) => [host.profile, host]))
const screenshots = path.join(root, 'screenshots')
const out = { root, steps: [], failures: [], errors: [] }

const record = (name, data = {}) => {
  out.steps.push({ name, at: new Date().toISOString(), ...data })
  console.log('STEP', name, JSON.stringify(data))
}
const check = (name, ok, detail = {}) => {
  if (!ok) out.failures.push({ name, ...detail })
  record(name, { ok, ...detail })
}
const shot = (page, name) => page.screenshot({ path: path.join(screenshots, name), fullPage: true })
const dialog = (page) => page.getByRole('dialog')
const field = (page, key) => dialog(page).locator('#mc-field-' + key.replaceAll('.', '\\.'))
const button = (page, name) => dialog(page).getByRole('button', { name, exact: true })
const saveButton = (page) => dialog(page).getByRole('button', { name: /^(保存|Save)$/ }).last()

async function dismissOnboarding(page) {
  for (const name of ['继续', 'Continue']) {
    const target = page.getByRole('button', { name })
    if (await target.count()) { await target.first().click(); await page.waitForTimeout(700); return }
  }
}
async function openSettings(page) {
  await page.keyboard.press('Control+Alt+Comma')
  await page.waitForTimeout(1200)
  await page.getByRole('dialog').waitFor({ timeout: 15000 })
  await page.getByRole('button', { name: 'Magic Context', exact: true }).waitFor({ timeout: 15000 })
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
async function openCard(page) {
  await dialog(page).getByRole('button', { name: 'Magic Context', exact: true }).first().click()
  await page.getByRole('dialog').waitFor({ timeout: 15000 })
  await page.waitForTimeout(900)
}
/** The auth header lives in the collapsed advanced group. */
async function openAdvanced(page) {
  const toggle = dialog(page).locator('[data-mc-section="embedding"] [aria-label="展开高级设置"]')
  if (await toggle.count()) {
    await toggle.first().click()
    await page.waitForTimeout(400)
  }
}
async function save(page, label) {
  const target = saveButton(page)
  if (await target.count() === 0) throw new Error('save button missing: ' + label)
  await page.waitForTimeout(400)
  const disabled = await target.isDisabled()
  record('save-state', { label, disabled })
  if (disabled) throw new Error('save button disabled: ' + label)
  await target.click()
  await page.waitForTimeout(900)
}
async function boot(page, url) {
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 })
  await page.waitForTimeout(2500)
  await dismissOnboarding(page)
  await openSettings(page)
  const chinese = await switchLanguage(page, '中文')
  await openCard(page)
  return chinese
}

;(async () => {
  const browser = await chromium.launch({ headless: true, channel: 'msedge' })
  const context = await browser.newContext({ viewport: { width: 1440, height: 1800 } })

  /* ------------------------------- Run A -------------------------------- */
  const page = await context.newPage()
  page.on('console', (msg) => { if (msg.type() === 'error') out.errors.push(msg.text()) })
  page.on('pageerror', (error) => out.errors.push(String(error)))
  check('run-a-chinese-locale', await boot(page, hosts.t37.url), {})

  check('local-provider-seeded', (await field(page, 'embedding.provider').inputValue()) === 'local', {
    value: await field(page, 'embedding.provider').inputValue(),
  })
  check('local-no-key-row', (await field(page, 'embedding.apiKey').count()) === 0, {})

  await field(page, 'embedding.provider').selectOption('openai-compatible')
  await page.waitForTimeout(600)
  await openAdvanced(page)
  check('preset-default-siliconflow', (await field(page, 'embedding.preset').inputValue()) === 'siliconflow', {
    value: await field(page, 'embedding.preset').inputValue(),
  })
  check('preset-hides-endpoint', (await field(page, 'embedding.endpoint').count()) === 0, {})
  check('preset-hides-auth-header', (await field(page, 'embedding.authHeader').count()) === 0, {})
  const fixedLine = dialog(page).locator('[data-mc-preset-endpoint="true"]')
  check('preset-fixed-endpoint-line',
    (await fixedLine.count()) === 1
      && (await fixedLine.first().innerText()).includes('https://api.siliconflow.cn/v1'), {})
  check('preset-override-absent', (await dialog(page).locator('[data-mc-preset-override="true"]').count()) === 0, {})
  check('preset-key-input-shown', (await field(page, 'embedding.apiKey').count()) === 1, {})
  await shot(page, 't37-preset-fixed.png')

  await field(page, 'embedding.preset').selectOption('custom')
  await page.waitForTimeout(600)
  check('custom-shows-endpoint', (await field(page, 'embedding.endpoint').count()) === 1, {})
  check('custom-shows-auth-header', (await field(page, 'embedding.authHeader').count()) === 1, {})
  check('custom-fixed-line-gone', (await dialog(page).locator('[data-mc-preset-endpoint="true"]').count()) === 0, {})
  await shot(page, 't37-custom-shown.png')

  // A draft for a field the switch hides must be dropped, not written.
  await field(page, 'embedding.endpoint').fill('http://127.0.0.1:9/never-saved')
  await page.waitForTimeout(300)
  await field(page, 'embedding.preset').selectOption('siliconflow')
  await page.waitForTimeout(600)
  check('preset-hides-endpoint-after-draft', (await field(page, 'embedding.endpoint').count()) === 0, {})
  const patchPath = path.join(root, 'dsh-home', 'profiles', 't37', 'cordis.patch.yml')
  await save(page, 'prune-hidden-draft')
  check('hidden-draft-not-saved', !fs.readFileSync(patchPath, 'utf8').includes('never-saved'), {})

  await field(page, 'embedding.preset').selectOption('custom')
  await page.waitForTimeout(600)
  const endpoint = 'http://127.0.0.1:9/v1'
  await field(page, 'embedding.endpoint').fill(endpoint)
  await field(page, 'embedding.model').fill('fixture-embed-a')
  await save(page, 'remote-custom-config')
  check('saved-custom-endpoint', fs.readFileSync(patchPath, 'utf8').includes(endpoint), { endpoint })

  const secret = 't37-gate-not-a-real-key'
  await dialog(page).locator('#mc-field-embedding\\.apiKey').fill(secret)
  await button(page, '保存密钥').click()
  await page.waitForTimeout(2500)
  const afterSave = await dialog(page).innerText()
  check('key-saved-to-credential-store', afterSave.includes('密钥已保存到宿主凭据库'), {})
  check('key-not-in-patch', !fs.readFileSync(patchPath, 'utf8').includes(secret), {})

  await field(page, 'embedding.provider').selectOption('local')
  await page.waitForTimeout(1200)
  check('local-hides-key-input', (await field(page, 'embedding.apiKey').count()) === 0, {})
  check('local-hides-endpoint-again', (await field(page, 'embedding.endpoint').count()) === 0, {})
  const localText = await dialog(page).innerText()
  check('local-clear-row-visible', localText.includes('清除已保存的密钥'), {})
  await shot(page, 't37-local-clear-row.png')

  await button(page, '清除已保存的密钥').click()
  await page.waitForTimeout(3000)
  const clearedText = await dialog(page).innerText()
  check('clear-removes-row', (await field(page, 'embedding.apiKey').count()) === 0, {})
  check('clear-confirmed', clearedText.includes('凭据已清除') || !clearedText.includes('清除已保存的密钥'), {})

  /* ------------------------------- Run B -------------------------------- */
  const pageB = await context.newPage()
  pageB.on('console', (msg) => { if (msg.type() === 'error') out.errors.push(msg.text()) })
  pageB.on('pageerror', (error) => out.errors.push(String(error)))
  check('run-b-chinese-locale', await boot(pageB, hosts.t37b.url), {})

  check('run-b-provider-remote', (await field(pageB, 'embedding.provider').inputValue()) === 'openai-compatible', {})
  check('run-b-preset-siliconflow', (await field(pageB, 'embedding.preset').inputValue()) === 'siliconflow', {})
  await openAdvanced(pageB)
  check('run-b-endpoint-visible', (await field(pageB, 'embedding.endpoint').count()) === 1, {})
  check('run-b-auth-header-visible', (await field(pageB, 'embedding.authHeader').count()) === 1, {})
  const overrideLine = dialog(pageB).locator('[data-mc-preset-override="true"]')
  check('run-b-precedence-notice',
    (await overrideLine.count()) === 1
      && (await overrideLine.first().innerText()).includes('已保存的接口地址或认证头优先于预设'), {})
  check('run-b-fixed-line-absent', (await dialog(pageB).locator('[data-mc-preset-endpoint="true"]').count()) === 0, {})
  await shot(pageB, 't37-preset-override.png')

  out.errors = out.errors.filter((text) => !text.includes('favicon'))
  fs.writeFileSync(path.join(root, 'evidence', 'ui-gate.json'), JSON.stringify(out, null, 2) + '\n')
  console.log('FAILURES', out.failures.length, 'ERRORS', out.errors.length)
  await browser.close()
  process.exit(out.failures.length > 0 ? 1 : 0)
})().catch((error) => {
  out.failures.push({ name: 'crash', message: String(error) })
  fs.writeFileSync(path.join(root, 'evidence', 'ui-gate.json'), JSON.stringify(out, null, 2) + '\n')
  console.error(error)
  process.exit(1)
})
