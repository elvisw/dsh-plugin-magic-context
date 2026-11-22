/**
 * T41 gate: switching local MiniLM -> OpenAI-compatible must lead somewhere.
 *
 * Asserts the blocked reason sits next to Load models (not only under the fields),
 * that it names the actual blocker at each stage (unsaved draft, then missing API
 * key), that the inline 保存 clears the first one, and that Load works once both
 * are gone.
 */
const { chromium } = require('C:/Users/elvis/node_modules/.deno/playwright@1.63.0/node_modules/playwright')
const fs = require('fs')
const path = require('path')

const REPORT = 'C:/Users/elvis/Documents/dev/plugin/dsh-plugin-magic-context/_bmad-output/initiative-dsh-magic-context/acceptance-windows-dsh-t41-switch-and-load-probe'
const root = JSON.parse(fs.readFileSync(path.join(REPORT, 'experiment-root.json'), 'utf8')).root
const server = JSON.parse(fs.readFileSync(path.join(root, 'evidence', 'server.json'), 'utf8'))
const prepared = JSON.parse(fs.readFileSync(path.join(root, 'evidence', 'prepare.json'), 'utf8'))
const fakeEndpoint = prepared.endpoint
const patchPath = path.join(root, 'dsh-home', 'profiles', 't41', 'cordis.patch.yml')
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
const loadButton = (page) => dialog(page).locator('[data-mc-model-load="true"]')
const blockLine = (page) => dialog(page).locator('[data-mc-model-block]')
const patchText = () => fs.readFileSync(patchPath, 'utf8')
const shot = (page, name) => page.screenshot({ path: path.join(root, 'screenshots', name), fullPage: true })

;(async () => {
  const browser = await chromium.launch({ headless: true, channel: 'msedge' })
  const page = await (await browser.newContext({ viewport: { width: 1440, height: 2200 } })).newPage()
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

  // ---- 1. Local seed has no remote actions at all ----------------------
  check('local-hides-load', (await loadButton(page).count()) === 0, {})

  // ---- 2. Switching provider is a draft: say so next to the button -----
  await field(page, 'embedding.provider').selectOption('openai-compatible')
  await page.waitForTimeout(900)
  check('switch-shows-load', (await loadButton(page).count()) === 1, {})
  check('switch-disables-load', await loadButton(page).first().isDisabled(), {})
  const draftBlock = blockLine(page)
  check('block-line-next-to-load', (await draftBlock.count()) === 1, {})
  check('block-line-is-in-model-field',
    (await dialog(page).locator('[data-mc-model-field="true"] [data-mc-model-block]').count()) === 1, {})
  check('block-line-names-draft', (await draftBlock.getAttribute('data-mc-model-block')) === 'saved', {
    code: await draftBlock.getAttribute('data-mc-model-block'),
    text: await draftBlock.innerText(),
  })
  check('block-line-offers-save',
    (await dialog(page).locator('[data-mc-model-block-save="true"]').count()) === 1, {})
  // The reason is also the button's tooltip and description.
  check('load-button-carries-reason',
    (await loadButton(page).first().getAttribute('title')) === '先保存当前修改，再执行远程操作。', {
      title: await loadButton(page).first().getAttribute('title'),
    })
  check('load-button-described-by-block',
    (await loadButton(page).first().getAttribute('aria-describedby')) === (await draftBlock.getAttribute('id')), {
      describedBy: await loadButton(page).first().getAttribute('aria-describedby'),
    })
  await shot(page, 't41-switch-draft.png')

  // Point the target at the local fake server, still as drafts: the SiliconFlow
  // preset owns the endpoint, and this gate must not call the real provider.
  await field(page, 'embedding.preset').selectOption('custom')
  await page.waitForTimeout(600)
  await field(page, 'embedding.endpoint').fill(fakeEndpoint)

  // ---- 3. The inline save clears the draft blocker ---------------------
  const beforeSave = patchText()
  // Click the reason row's own button, not the host footer Save (same visible
  // text, so a role/name selector would silently test the wrong control).
  await dialog(page).locator('[data-mc-model-block-save="true"]').first().click()
  await page.waitForTimeout(1800)
  check('inline-save-writes-provider', patchText().includes('provider: openai-compatible'), {})
  check('inline-save-changed-profile', patchText() !== beforeSave, {})
  check('inline-save-clears-draft-reason',
    (await blockLine(page).getAttribute('data-mc-model-block')) !== 'saved', {
      code: await blockLine(page).count() ? await blockLine(page).getAttribute('data-mc-model-block') : 'absent',
    })
  const keyBlock = blockLine(page)
  check('block-line-names-missing-key',
    (await keyBlock.count()) === 1 && (await keyBlock.getAttribute('data-mc-model-block')) === 'key', {
      code: await keyBlock.count() ? await keyBlock.getAttribute('data-mc-model-block') : 'absent',
      text: await keyBlock.count() ? await keyBlock.innerText() : '',
    })
  check('block-line-mentions-key',
    (await keyBlock.innerText()).includes('API Key'), { text: await keyBlock.innerText() })
  check('no-save-link-for-key-blocker',
    (await keyBlock.locator('[data-mc-model-block-save="true"]').count()) === 0, {
      blockCount: await keyBlock.count(),
    })
  check('load-still-disabled-without-key', await loadButton(page).first().isDisabled(), {})
  await shot(page, 't41-missing-key.png')

  // ---- 4. A saved key clears the last blocker --------------------------
  await field(page, 'embedding.apiKey').fill('t41-gate-not-a-real-key')
  await dialog(page).getByRole('button', { name: '保存密钥', exact: true }).click()
  await page.waitForTimeout(2500)
  check('block-line-gone', (await blockLine(page).count()) === 0, {})
  check('load-enabled-with-key', !(await loadButton(page).first().isDisabled()), {})

  // ---- 5. Load really loads, and the hint tells the reader the order ----
  const beforeLoad = patchText()
  await loadButton(page).first().click()
  await page.waitForTimeout(3200)
  const message = await dialog(page).locator('[data-mc-embedding-result]').innerText()
  check('load-succeeds', message.includes('已加载 3 个模型'), { text: message })
  check('load-does-not-write-profile', patchText() === beforeLoad, {})
  check('model-field-is-select',
    (await field(page, 'embedding.model').evaluate((node) => node.tagName)) === 'SELECT', {
      tag: await field(page, 'embedding.model').evaluate((node) => node.tagName),
    })
  const hintText = await dialog(page).locator('[data-mc-model-field="true"]').innerText()
  check('hint-tells-load-first', hintText.includes('先点「加载模型」'), { text: hintText })
  check('hint-mentions-manual-entry', hintText.includes('直接填写'), { text: hintText })
  await shot(page, 't41-loaded.png')

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
