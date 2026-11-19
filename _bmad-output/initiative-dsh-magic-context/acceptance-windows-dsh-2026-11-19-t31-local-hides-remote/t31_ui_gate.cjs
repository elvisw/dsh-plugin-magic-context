/**
 * T31 gate: the Web settings card hides the twelve remote-only embedding fields
 * when the provider is local, shows them for openai-compatible, and drops the
 * drafts it hides so a hidden edit is never written.
 */
const { chromium } = require('C:/Users/elvis/node_modules/.deno/playwright@1.63.0/node_modules/playwright')
const fs = require('fs')
const path = require('path')

const REPORT = 'C:/Users/elvis/Documents/dev/plugin/dsh-plugin-magic-context/_bmad-output/initiative-dsh-magic-context/acceptance-windows-dsh-2026-11-19-t31-local-hides-remote'
const root = JSON.parse(fs.readFileSync(path.join(REPORT, 'experiment-root.json'), 'utf8')).root
const server = JSON.parse(fs.readFileSync(path.join(root, 'evidence', 'server.json'), 'utf8'))
const patchPath = path.join(root, 'dsh-home', 'profiles', 't31', 'cordis.patch.yml')
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
const shot = async (page, name) => page.screenshot({ path: path.join(screenshots, name), fullPage: true })
const dialog = (page) => page.getByRole('dialog')
const field = (page, key) => dialog(page).locator('#mc-field-' + key.replaceAll('.', '\\.'))
const saveButton = (page) => dialog(page).getByRole('button', { name: /^(保存|Save)$/ }).last()
const patchText = () => fs.readFileSync(patchPath, 'utf8')

async function dismissOnboarding(page) {
  for (const name of ['继续', 'Continue']) {
    const button = page.getByRole('button', { name })
    if (await button.count()) { await button.first().click(); await page.waitForTimeout(700); return }
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
async function waitForPatch(predicate, label) {
  const deadline = Date.now() + 20000
  while (Date.now() < deadline) {
    try {
      if (predicate(patchText())) return true
    } catch { /* the host may be rewriting the file */ }
    await new Promise((resolve) => setTimeout(resolve, 300))
  }
  record('patch-timeout', { label })
  return false
}
async function save(page, label) {
  const target = saveButton(page)
  if (await target.count() === 0) throw new Error('save button missing: ' + label)
  await page.waitForTimeout(400)
  const disabled = await target.isDisabled()
  record('save-state', { label, disabled })
  if (disabled) throw new Error('save button disabled: ' + label)
  await target.click()
  await page.waitForTimeout(600)
}

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
  const chinese = await switchLanguage(page, '中文')
  await openCard(page)
  check('chinese-locale', chinese, {})

  check('default-provider-local', (await field(page, 'embedding.provider').inputValue()) === 'local', {
    value: await field(page, 'embedding.provider').inputValue(),
  })
  for (const key of [
    'embedding.preset', 'embedding.endpoint', 'embedding.model', 'embedding.apiKeyEnv',
    'embedding.apiKey', 'embedding.authHeader', 'embedding.queryInstruction', 'embedding.documentPrefix',
  ]) {
    check('hidden-' + key, (await field(page, key).count()) === 0, {})
  }
  const localText = await dialog(page).innerText()
  check('local-note', localText.includes('远程设置已隐藏'), {})
  check('advanced-hidden-with-local',
    (await dialog(page).locator('[data-mc-section="embedding"] [aria-label="展开高级设置"]').count()) === 0, {})
  await shot(page, 't31-local-hidden.png')

  await field(page, 'embedding.provider').selectOption('openai-compatible')
  await page.waitForTimeout(500)
  for (const key of ['embedding.preset', 'embedding.endpoint', 'embedding.model', 'embedding.apiKeyEnv']) {
    check('shown-' + key, (await field(page, key).count()) === 1, {})
  }
  const advanced = dialog(page).locator('[data-mc-section="embedding"] [aria-label="展开高级设置"]')
  check('advanced-shown-with-remote', (await advanced.count()) === 1, {})
  await advanced.click()
  await page.waitForTimeout(300)
  for (const key of [
    'embedding.dimensions', 'embedding.timeoutMs', 'embedding.queryTimeoutMs', 'embedding.batchSize',
    'embedding.authHeader', 'embedding.queryInstruction', 'embedding.documentPrefix', 'embedding.apiKey',
  ]) {
    check('shown-' + key, (await field(page, key).count()) === 1, {})
  }
  await shot(page, 't31-remote-shown.png')

  const endpoint = 'http://127.0.0.1:' + String(server.fake_port) + '/v1'
  await field(page, 'embedding.endpoint').fill(endpoint)
  await field(page, 'embedding.model').fill('fixture-embed-a')
  await save(page, 'remote-config')
  check('saved-endpoint', await waitForPatch((text) => text.includes(endpoint), 'endpoint'), { endpoint })
  check('saved-provider-remote', patchText().includes('provider: openai-compatible'), {})

  // A draft in a field the switch hides must be dropped, not written.
  const unsaved = 'http://127.0.0.1:1/never-saved'
  await field(page, 'embedding.endpoint').fill(unsaved)
  await page.waitForTimeout(300)
  await field(page, 'embedding.provider').selectOption('local')
  await page.waitForTimeout(600)
  check('hidden-after-switch', (await field(page, 'embedding.endpoint').count()) === 0, {})
  await shot(page, 't31-back-to-local.png')
  await save(page, 'switch-back-local')
  check('saved-provider-local', await waitForPatch((text) => text.includes('provider: local'), 'provider-local'), {})
  const afterLocal = patchText()
  check('hidden-draft-dropped', !afterLocal.includes('never-saved'), {})
  check('endpoint-preserved', afterLocal.includes(endpoint), { endpoint })

  await field(page, 'embedding.provider').selectOption('openai-compatible')
  await page.waitForTimeout(500)
  check('endpoint-restored', (await field(page, 'embedding.endpoint').inputValue()) === endpoint, {
    value: await field(page, 'embedding.endpoint').inputValue(),
  })
  await field(page, 'embedding.provider').selectOption('local')
  await page.waitForTimeout(400)
  await save(page, 'final-local')
  await waitForPatch((text) => text.includes('provider: local'), 'final-local')

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
