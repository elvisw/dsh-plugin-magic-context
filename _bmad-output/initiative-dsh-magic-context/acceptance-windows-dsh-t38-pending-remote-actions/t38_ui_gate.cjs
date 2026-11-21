/** T38 gate: Load models must be reachable before the provider switch is saved. */
const { chromium } = require('C:/Users/elvis/node_modules/.deno/playwright@1.63.0/node_modules/playwright')
const fs = require('fs')
const path = require('path')

const REPORT = 'C:/Users/elvis/Documents/dev/plugin/dsh-plugin-magic-context/_bmad-output/initiative-dsh-magic-context/acceptance-windows-dsh-t38-pending-remote-actions'
const root = JSON.parse(fs.readFileSync(path.join(REPORT, 'experiment-root.json'), 'utf8')).root
const server = JSON.parse(fs.readFileSync(path.join(root, 'evidence', 'server.json'), 'utf8'))
const patchPath = path.join(root, 'dsh-home', 'profiles', 't38', 'cordis.patch.yml')
const out = { root, steps: [], failures: [], errors: [] }

const record = (name, data = {}) => { out.steps.push({ name, at: new Date().toISOString(), ...data }); console.log('STEP', name, JSON.stringify(data)) }
const check = (name, ok, detail = {}) => { if (!ok) out.failures.push({ name, ...detail }); record(name, { ok, ...detail }) }
const dialog = (page) => page.getByRole('dialog')
const field = (page, key) => dialog(page).locator('#mc-field-' + key.replaceAll('.', '\\.'))
const loadButton = (page) => dialog(page).getByRole('button', { name: /加载模型|保存并加载/ })

;(async () => {
  const browser = await chromium.launch({ headless: true, channel: 'msedge' })
  const page = await (await browser.newContext({ viewport: { width: 1440, height: 1800 } })).newPage()
  page.on('console', (msg) => { if (msg.type() === 'error') out.errors.push(msg.text()) })
  page.on('pageerror', (error) => out.errors.push(String(error)))

  await page.goto(server.url, { waitUntil: 'domcontentloaded', timeout: 60000 })
  await page.waitForTimeout(2500)
  for (const name of ['继续', 'Continue']) {
    const b = page.getByRole('button', { name })
    if (await b.count()) { await b.first().click(); await page.waitForTimeout(700); break }
  }
  await page.keyboard.press('Control+Alt+Comma')
  await page.waitForTimeout(1200)
  await page.getByRole('dialog').waitFor({ timeout: 15000 })
  const language = dialog(page).getByRole('button', { name: /^(English|中文)$/ }).first()
  if (await language.count() && (await language.innerText()).trim() !== '中文') {
    await language.click(); await page.waitForTimeout(400)
    await page.getByRole('menuitem', { name: '中文' }).click(); await page.waitForTimeout(900)
  }
  await dialog(page).getByRole('button', { name: 'Magic Context', exact: true }).first().click()
  await page.waitForTimeout(900)

  check('seeded-local', (await field(page, 'embedding.provider').inputValue()) === 'local', {})
  check('load-hidden-while-local', (await loadButton(page).count()) === 0, {})

  await field(page, 'embedding.provider').selectOption('openai-compatible')
  await page.waitForTimeout(700)
  const beforeSave = await loadButton(page)
  check('load-visible-before-save', (await beforeSave.count()) === 1, {})
  check('load-label-says-save', (await beforeSave.first().innerText()).includes('保存并加载'), {
    label: await beforeSave.first().innerText(),
  })
  check('start-still-hidden-before-save', (await dialog(page).getByRole('button', { name: /开始重建向量/ }).count()) === 0, {})
  await page.screenshot({ path: path.join(root, 'screenshots', 't38-load-before-save.png'), fullPage: true })

  // The reported path: the provider is still a draft, the key is saved first.
  check('key-row-visible-with-draft', (await field(page, 'embedding.apiKey').count()) === 1, {})
  await fetch('http://127.0.0.1:' + String(server.fake_port) + '/stats')
  await field(page, 'embedding.apiKey').fill('t38-gate-not-a-real-key')
  await dialog(page).getByRole('button', { name: '保存密钥', exact: true }).click()
  await page.waitForTimeout(2500)
  check('key-saved', (await dialog(page).innerText()).includes('密钥已保存到宿主凭据库'), {})
  check('provider-still-draft', !fs.readFileSync(patchPath, 'utf8').includes('provider: openai-compatible'), {})

  const load = await loadButton(page)
  check('load-enabled-before-save', !(await load.first().isDisabled()), {})
  await load.first().click()
  await page.waitForTimeout(3000)
  check('provider-saved-by-action', fs.readFileSync(patchPath, 'utf8').includes('provider: openai-compatible'), {})

  const select = dialog(page).locator('[data-mc-model-select="true"]')
  check('model-select-rendered', (await select.count()) === 1, {})
  const options = await select.locator('option').allInnerTexts()
  check('models-loaded', options.includes('fixture-embed-a') && options.includes('fixture-embed-b'), { options })
  const stats = await (await fetch('http://127.0.0.1:' + String(server.fake_port) + '/stats')).json()
  const modelCalls = stats.requests.filter((entry) => entry.path === 'models')
  check('model-request-authorized', modelCalls.length >= 1 && modelCalls.every((entry) => entry.authPresent === true), {
    calls: modelCalls.length,
  })
  await page.screenshot({ path: path.join(root, 'screenshots', 't38-models-loaded.png'), fullPage: true })

  await select.selectOption('fixture-embed-b')
  await page.waitForTimeout(400)
  await dialog(page).getByRole('button', { name: /^(保存|Save)$/ }).last().click()
  await page.waitForTimeout(1500)
  check('model-saved', fs.readFileSync(patchPath, 'utf8').includes('model: fixture-embed-b'), {})

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
