/**
 * T39 gate.
 *
 * The model value is picked in the `模型 ID` field itself (no second select under
 * the action row), manual entry never writes a sentinel, an id outside the list
 * survives a load, and 测试连接 reports a localised verdict.
 */
const { chromium } = require('C:/Users/elvis/node_modules/.deno/playwright@1.63.0/node_modules/playwright')
const fs = require('fs')
const path = require('path')

const REPORT = 'C:/Users/elvis/Documents/dev/plugin/dsh-plugin-magic-context/_bmad-output/initiative-dsh-magic-context/acceptance-windows-dsh-t39-model-picker-and-probe-feedback'
const root = JSON.parse(fs.readFileSync(path.join(REPORT, 'experiment-root.json'), 'utf8')).root
const server = JSON.parse(fs.readFileSync(path.join(root, 'evidence', 'server.json'), 'utf8'))
const patchPath = path.join(root, 'dsh-home', 'profiles', 't39', 'cordis.patch.yml')
const out = { root, steps: [], failures: [], errors: [] }

const record = (name, data = {}) => {
  out.steps.push({ name, at: new Date().toISOString(), ...data })
  console.log('STEP', name, JSON.stringify(data))
}
const check = (name, ok, detail = {}) => {
  if (!ok) out.failures.push({ name, ...detail })
  record(name, { ok, ...detail })
}
const dialog = (page) => page.getByRole('dialog')
const field = (page, key) => dialog(page).locator('#mc-field-' + key.replaceAll('.', '\\.'))
const button = (page, name) => dialog(page).getByRole('button', { name, exact: true })
const loadButton = (page) => dialog(page).getByRole('button', { name: /加载模型|保存并加载/ })
const saveButton = (page) => dialog(page).getByRole('button', { name: /^(保存|Save)$/ }).last()
const resultLine = (page) => dialog(page).locator('[data-mc-embedding-result]')
const shot = (page, name) => page.screenshot({ path: path.join(root, 'screenshots', name), fullPage: true })

async function save(page, label) {
  const target = saveButton(page)
  if (await target.count() === 0) throw new Error('save button missing: ' + label)
  await page.waitForTimeout(400)
  check('save-enabled-' + label, !(await target.isDisabled()), {})
  await target.click()
  await page.waitForTimeout(1200)
}

;(async () => {
  const browser = await chromium.launch({ headless: true, channel: 'msedge' })
  const page = await (await browser.newContext({ viewport: { width: 1440, height: 2000 } })).newPage()
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

  // The profile starts remote with no model: the field must stay a text input,
  // because a controlled select would draw an id nobody chose.
  check('seeded-remote', (await field(page, 'embedding.provider').inputValue()) === 'openai-compatible', {})
  check('empty-model-is-text', (await field(page, 'embedding.model').evaluate((node) => node.tagName)) === 'INPUT', {
    tag: await field(page, 'embedding.model').evaluate((node) => node.tagName),
  })
  check('no-second-select-before-load', (await dialog(page).locator('[data-mc-model-select="true"]').count()) === 0, {})

  // Save the key, then load the list.
  await field(page, 'embedding.apiKey').fill('t39-gate-not-a-real-key')
  await dialog(page).getByRole('button', { name: '保存密钥', exact: true }).click()
  await page.waitForTimeout(2500)
  check('key-saved', (await dialog(page).innerText()).includes('密钥已保存到宿主凭据库'), {})

  const load = loadButton(page)
  check('load-visible', (await load.count()) === 1, {})
  await load.first().click()
  await page.waitForTimeout(3000)
  check('provider-saved', fs.readFileSync(patchPath, 'utf8').includes('provider: openai-compatible'), {})
  check('models-loaded-message', (await resultLine(page).innerText()).includes('已加载 3 个模型'), {
    text: await resultLine(page).innerText(),
  })

  // The picker is the 模型 ID field itself now, and there is still no second one.
  const picker = field(page, 'embedding.model')
  check('model-field-is-select', (await picker.evaluate((node) => node.tagName)) === 'SELECT', {})
  check('no-second-select-after-load', (await dialog(page).locator('[data-mc-model-select="true"]').count()) === 0, {})
  const options = await picker.locator('option').allInnerTexts()
  check('picker-lists-models',
    options.includes('fixture-embed-a') && options.includes('fixture-embed-b') && options.includes('fixture-bad-auth'),
    { options })
  check('picker-has-manual-entry', options.includes('手动输入模型 ID…'), { options })
  await shot(page, 't39-model-picker.png')

  await picker.selectOption('fixture-embed-b')
  await save(page, 'model-pick')
  check('model-saved-from-picker', fs.readFileSync(patchPath, 'utf8').includes('model: fixture-embed-b'), {})

  // The connection test reports a verdict on screen.
  await button(page, '测试连接').click()
  await page.waitForTimeout(3500)
  const okLine = resultLine(page)
  check('probe-result-is-success', (await okLine.getAttribute('data-mc-embedding-result')) === 'ok', {})
  const okText = await okLine.innerText()
  check('probe-result-names-model-and-dims',
    okText.includes('fixture-embed-b') && okText.includes('16') && okText.includes('连接成功'), { text: okText })
  await shot(page, 't39-probe-ok.png')

  // A model edit invalidates the verdict: the success line named the previous
  // model, so it must not stay on screen as if it described this one.
  await picker.selectOption('fixture-bad-auth')
  await page.waitForTimeout(600)
  check('model-edit-clears-verdict', (await resultLine(page).count()) === 0, {
    text: (await resultLine(page).count()) === 1 ? await resultLine(page).innerText() : '',
  })

  // A model the server rejects with 401 must read as a localised failure.
  await save(page, 'bad-model')
  await button(page, '测试连接').click()
  await page.waitForTimeout(3500)
  const failLine = resultLine(page)
  check('probe-result-is-error', (await failLine.getAttribute('data-mc-embedding-result')) === 'error', {})
  const failText = await failLine.innerText()
  check('probe-failure-localised', failText.includes('认证失败') && !/auth-failed/.test(failText), { text: failText })
  await shot(page, 't39-probe-error.png')

  // Manual entry: the sentinel only flips the mode and must never be saved.
  await picker.selectOption('__mc_manual_model__')
  await page.waitForTimeout(600)
  const manual = field(page, 'embedding.model')
  check('manual-entry-turns-field-into-text', (await manual.evaluate((node) => node.tagName)) === 'INPUT', {})
  check('manual-entry-keeps-value', (await manual.inputValue()) === 'fixture-bad-auth', {
    value: await manual.inputValue(),
  })
  check('manual-sentinel-not-saved',
    !fs.readFileSync(patchPath, 'utf8').includes('__mc_manual_model__'), {})
  await manual.fill('my-own-embed-model')
  await save(page, 'manual-model')
  const patched = fs.readFileSync(patchPath, 'utf8')
  check('manual-id-saved', patched.includes('model: my-own-embed-model'), {})
  check('manual-sentinel-never-saved', !patched.includes('__mc_manual_model__'), {})

  // A value outside the list survives a reload of the list and can go back to
  // the picker on demand.
  await loadButton(page).first().click()
  await page.waitForTimeout(3000)
  const afterReload = field(page, 'embedding.model')
  check('outside-value-keeps-text', (await afterReload.evaluate((node) => node.tagName)) === 'INPUT', {})
  check('outside-value-not-replaced', (await afterReload.inputValue()) === 'my-own-embed-model', {
    value: await afterReload.inputValue(),
  })
  const fromList = dialog(page).locator('[data-mc-model-from-list="true"]')
  check('from-list-affordance', (await fromList.count()) === 1, {})
  await fromList.first().click()
  await page.waitForTimeout(600)
  check('from-list-reopens-picker', (await field(page, 'embedding.model').evaluate((node) => node.tagName)) === 'SELECT', {})
  await shot(page, 't39-manual-and-from-list.png')

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
