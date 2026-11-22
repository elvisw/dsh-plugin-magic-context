/**
 * T40 gate.
 *
 * Load models sits next to the 模型 ID field and never writes configuration; a
 * pending draft disables Load/Test with a visible reason; 撤销未保存更改 clears the
 * drafts (including text typed into the key input) without touching the profile;
 * the host Save stays the only writer of field drafts.
 */
const { chromium } = require('C:/Users/elvis/node_modules/.deno/playwright@1.63.0/node_modules/playwright')
const fs = require('fs')
const path = require('path')

const REPORT = 'C:/Users/elvis/Documents/dev/plugin/dsh-plugin-magic-context/_bmad-output/initiative-dsh-magic-context/acceptance-windows-dsh-t40-decoupled-embedding-actions'
const root = JSON.parse(fs.readFileSync(path.join(REPORT, 'experiment-root.json'), 'utf8')).root
const server = JSON.parse(fs.readFileSync(path.join(root, 'evidence', 'server.json'), 'utf8'))
const patchPath = path.join(root, 'dsh-home', 'profiles', 't40', 'cordis.patch.yml')
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
const loadButton = (page) => dialog(page).locator('[data-mc-model-load="true"]')
const discardButton = (page) => dialog(page).locator('[data-mc-discard-drafts="true"]')
const saveButton = (page) => dialog(page).getByRole('button', { name: /^(保存|Save)$/ }).last()
const resultLine = (page) => dialog(page).locator('[data-mc-embedding-result]')
const patchText = () => fs.readFileSync(patchPath, 'utf8')
const shot = (page, name) => page.screenshot({ path: path.join(root, 'screenshots', name), fullPage: true })

async function save(page, label) {
  const target = saveButton(page)
  if (await target.count() === 0) throw new Error('save button missing: ' + label)
  await page.waitForTimeout(400)
  check('save-enabled-' + label, !(await target.isDisabled()), {})
  await target.click()
  await page.waitForTimeout(1400)
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

  check('seeded-remote', (await field(page, 'embedding.provider').inputValue()) === 'openai-compatible', {})

  // Load is gated on a present key, so store one first. The key row writes the
  // credential store directly (it is not a field draft); this is the same setup
  // T39 used, and it keeps "Load does not write the profile" meaningful.
  await field(page, 'embedding.apiKey').fill('t40-gate-not-a-real-key')
  await dialog(page).getByRole('button', { name: '保存密钥', exact: true }).click()
  await page.waitForTimeout(2500)
  check('key-saved', (await dialog(page).innerText()).includes('密钥已保存到宿主凭据库'), {})

  // ---- 1. Load models lives with the model field -------------------------
  const load = loadButton(page)
  check('load-rendered-once', (await load.count()) === 1, { count: await load.count() })
  check('load-inside-model-field',
    (await dialog(page).locator('[data-mc-model-field="true"] [data-mc-model-load="true"]').count()) === 1, {})
  check('model-control-is-the-field',
    (await field(page, 'embedding.model').evaluate((node) => node.tagName)) === 'INPUT', {
      tag: await field(page, 'embedding.model').evaluate((node) => node.tagName),
    })
  // The load control is a sibling of the control, never a child (an <input> and a
  // <select> cannot contain a button; the id has to stay on the control itself).
  // Both halves are asserted together: the control must exist, and it must not
  // contain the load button.
  const modelControlCount = await field(page, 'embedding.model').count()
  check('load-is-not-inside-the-control',
    modelControlCount === 1
      && (await field(page, 'embedding.model').locator('[data-mc-model-load="true"]').count()) === 0,
    { modelControlCount })
  check('no-second-model-select',
    (await dialog(page).locator('select').filter({ has: page.locator('option', { hasText: 'fixture-embed-a' }) }).count()) === 0, {})

  // ---- 2. Load models alone never writes --------------------------------
  // The form is clean here, so a byte-identical patch alone cannot prove much:
  // the real guarantee is that the button is disabled while anything is pending
  // (asserted in §3). Together they mean Load can never carry an edit to the
  // profile. Both are asserted because either alone is weak.
  const before = patchText()
  await load.first().click()
  await page.waitForTimeout(3200)
  check('models-loaded-message', (await resultLine(page).innerText()).includes('已加载 3 个模型'), {
    text: await resultLine(page).innerText(),
  })
  check('load-does-not-write-profile', patchText() === before, {
    changed: patchText() === before ? '' : patchText().slice(0, 400),
  })
  // Every control that could save says 加载模型 / 测试连接 — never a save-coupled
  // label. Asserting the exact visible text (not just "no old words") also fails
  // if a removed key falls back to its raw name.
  const loadText = (await loadButton(page).innerText()).trim()
  const testText = (await dialog(page).getByRole('button', { name: /测试连接/ }).innerText()).trim()
  check('load-label-is-exact', loadText === '加载模型', { text: loadText })
  check('test-label-is-exact', testText === '测试连接', { text: testText })

  // ---- 3. A pending draft disables both remote actions -------------------
  const endpointField = field(page, 'embedding.endpoint')
  const savedEndpoint = await endpointField.inputValue()
  await endpointField.fill('http://127.0.0.1:1/v1')
  await page.waitForTimeout(700)
  check('dirty-disables-load', await loadButton(page).isDisabled(), {})
  check('dirty-keeps-load-visible', (await loadButton(page).count()) === 1, {})
  check('dirty-disables-test', await button(page, '测试连接').isDisabled(), {})
  check('dirty-keeps-test-visible', (await button(page, '测试连接').count()) === 1, {})
  check('dirty-explains-why', (await dialog(page).innerText()).includes('先保存当前修改'), {})
  check('dirty-shows-discard', (await discardButton(page).count()) === 1, {})
  check('no-save-coupled-label',
    !(await dialog(page).innerText()).match(/保存并(加载模型|测试)/), {})
  await shot(page, 't40-dirty-disabled.png')

  // ---- 4. 撤销未保存更改 clears the drafts, not the profile -------------
  const beforeDiscard = patchText()
  await discardButton(page).first().click()
  await page.waitForTimeout(900)
  check('discard-restores-saved-value', (await field(page, 'embedding.endpoint').inputValue()) === savedEndpoint, {
    value: await field(page, 'embedding.endpoint').inputValue(),
  })
  check('discard-hides-itself', (await discardButton(page).count()) === 0, {})
  check('discard-enables-load', !(await loadButton(page).isDisabled()), {})
  check('discard-does-not-write-profile', patchText() === beforeDiscard, {})
  check('discard-disabled-host-save', await saveButton(page).isDisabled(), {})

  // ---- 5. A key-only draft is also discardable --------------------------
  await field(page, 'embedding.apiKey').fill('t40-gate-not-a-real-key')
  await page.waitForTimeout(700)
  check('key-draft-shows-discard', (await discardButton(page).count()) === 1, {})
  check('key-draft-does-not-dirty-form', await saveButton(page).isDisabled(), {})
  await discardButton(page).first().click()
  await page.waitForTimeout(600)
  check('discard-clears-key-input', (await field(page, 'embedding.apiKey').inputValue()) === '', {
    value: await field(page, 'embedding.apiKey').inputValue(),
  })
  check('discard-key-hides-itself', (await discardButton(page).count()) === 0, {})

  // ---- 6. Reload, pick a model, Save, test ------------------------------
  await loadButton(page).first().click()
  await page.waitForTimeout(3200)
  const modelField = field(page, 'embedding.model')
  check('model-field-is-select-after-load', (await modelField.evaluate((node) => node.tagName)) === 'SELECT', {
    tag: await modelField.evaluate((node) => node.tagName),
  })
  check('empty-value-selects-nothing', (await modelField.inputValue()) === '', {
    value: await modelField.inputValue(),
  })
  const emptyOption = await modelField.locator('option').first().evaluate((node) => ({ value: node.value, text: node.textContent }))
  check('picker-has-empty-option', emptyOption.text === '请选择模型…' && emptyOption.value === '', emptyOption)
  await shot(page, 't40-model-picker.png')

  await modelField.selectOption('fixture-embed-b')
  await page.waitForTimeout(500)
  check('model-pick-disables-load', await loadButton(page).isDisabled(), {})
  await save(page, 'model-pick')
  check('model-saved-from-picker', patchText().includes('model: fixture-embed-b'), {})

  await button(page, '测试连接').click()
  await page.waitForTimeout(3500)
  const okLine = resultLine(page)
  check('probe-result-is-success', (await okLine.getAttribute('data-mc-embedding-result')) === 'ok', {})
  const okText = await okLine.innerText()
  check('probe-result-names-model-and-dims',
    okText.includes('连接成功') && okText.includes('fixture-embed-b')
      && okText.includes('16 维') && /\d+ ms/.test(okText), { text: okText })
  await shot(page, 't40-probe-ok.png')

  // A model edit invalidates the verdict line.
  await modelField.selectOption('fixture-bad-auth')
  await page.waitForTimeout(600)
  check('model-edit-clears-verdict', (await resultLine(page).count()) === 0, {})

  // A rejected model reads as a localised failure.
  await save(page, 'bad-model')
  await button(page, '测试连接').click()
  await page.waitForTimeout(3500)
  const failLine = resultLine(page)
  check('probe-result-is-error', (await failLine.getAttribute('data-mc-embedding-result')) === 'error', {})
  const failText = await failLine.innerText()
  check('probe-failure-localised',
    failText.includes('认证失败') && failText.includes('检查密钥是否有效') && !/auth-failed/.test(failText),
    { text: failText })
  await shot(page, 't40-probe-error.png')

  // Manual entry keeps the field a text input and never saves the sentinel.
  await modelField.selectOption('__mc_manual_model__')
  await page.waitForTimeout(600)
  const manual = field(page, 'embedding.model')
  check('manual-entry-turns-field-into-text', (await manual.evaluate((node) => node.tagName)) === 'INPUT', {})
  check('manual-entry-keeps-value', (await manual.inputValue()) === 'fixture-bad-auth', {
    value: await manual.inputValue(),
  })
  await manual.fill('my-own-embed-model')
  await save(page, 'manual-model')
  const patched = patchText()
  check('manual-id-saved', patched.includes('model: my-own-embed-model'), {})
  check('manual-sentinel-never-saved', !patched.includes('__mc_manual_model__'), {})

  // An id outside the list survives a reload and can go back to the picker.
  await loadButton(page).first().click()
  await page.waitForTimeout(3200)
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
  await shot(page, 't40-manual-and-from-list.png')

  // Discarding must also drop the forced-picker view flag: the saved value
  // (`my-own-embed-model`) is not in the list, so a still-forced picker would show
  // an empty select where the saved configuration holds a valid id.
  await field(page, 'embedding.model').selectOption('fixture-embed-a')
  await page.waitForTimeout(600)
  check('forced-picker-draft-is-dirty', await discardButton(page).count() === 1, {})
  await discardButton(page).first().click()
  await page.waitForTimeout(900)
  const afterForcedDiscard = field(page, 'embedding.model')
  check('discard-drops-forced-picker', (await afterForcedDiscard.evaluate((node) => node.tagName)) === 'INPUT', {
    tag: await afterForcedDiscard.evaluate((node) => node.tagName),
  })
  check('discard-shows-saved-outside-value', (await afterForcedDiscard.inputValue()) === 'my-own-embed-model', {
    value: await afterForcedDiscard.inputValue(),
  })

  // Console errors are part of the verdict, not a filtered footnote.
  out.errors = out.errors.filter((text) => !text.includes('favicon'))
  for (const text of out.errors) out.failures.push({ name: 'console-error', message: text })
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
