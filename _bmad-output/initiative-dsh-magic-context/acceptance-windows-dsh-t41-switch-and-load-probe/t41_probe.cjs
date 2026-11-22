/**
 * T41 probe: reproduce "switch local -> openai-compatible, then Load models does
 * nothing". Records the button state, the reason text and the network traffic at
 * each stage, WITHOUT changing anything.
 */
const { chromium } = require('C:/Users/elvis/node_modules/.deno/playwright@1.63.0/node_modules/playwright')
const fs = require('fs')
const path = require('path')

const REPORT = 'C:/Users/elvis/Documents/dev/plugin/dsh-plugin-magic-context/_bmad-output/initiative-dsh-magic-context/acceptance-windows-dsh-t41-switch-and-load-probe'
const root = JSON.parse(fs.readFileSync(path.join(REPORT, 'experiment-root.json'), 'utf8')).root
const server = JSON.parse(fs.readFileSync(path.join(root, 'evidence', 'server.json'), 'utf8'))
const patchPath = path.join(root, 'dsh-home', 'profiles', 't41', 'cordis.patch.yml')
const out = { root, steps: [], requests: [] }

const record = (name, data = {}) => {
  out.steps.push({ name, at: new Date().toISOString(), ...data })
  console.log('STEP', name, JSON.stringify(data))
}
const dialog = (page) => page.getByRole('dialog')
const field = (page, key) => dialog(page).locator('#mc-field-' + key.replaceAll('.', '\\.'))
const loadButton = (page) => dialog(page).locator('[data-mc-model-load="true"]')
const patchText = () => fs.readFileSync(patchPath, 'utf8')

async function snapshot(page, label) {
  const load = loadButton(page)
  const count = await load.count()
  record('snapshot-' + label, {
    loadCount: count,
    loadVisible: count > 0 ? await load.first().isVisible() : null,
    loadDisabled: count > 0 ? await load.first().isDisabled() : null,
    loadLabel: count > 0 ? (await load.first().innerText()).trim() : null,
    loadTitle: count > 0 ? await load.first().getAttribute('title') : null,
    modelFieldTag: await field(page, 'embedding.model').evaluate((node) => node.tagName).catch(() => 'absent'),
    modelFieldVisible: await field(page, 'embedding.model').isVisible().catch(() => null),
    saveDisabled: await dialog(page).getByRole('button', { name: /^(保存|Save)$/ }).last().isDisabled(),
    cardHasSaveFirstLine: (await dialog(page).innerText()).includes('先保存当前修改'),
    cardHasKeyLine: (await dialog(page).innerText()).match(/API Key[^\n]*/)?.[0] || '',
    provider: await field(page, 'embedding.provider').inputValue(),
    preset: await field(page, 'embedding.preset').inputValue().catch(() => 'absent'),
  })
}

;(async () => {
  const browser = await chromium.launch({ headless: true, channel: 'msedge' })
  const page = await (await browser.newContext({ viewport: { width: 1440, height: 2200 } })).newPage()
  page.on('request', (request) => {
    if (request.url().includes('/mc-embedding')) out.requests.push({ method: request.method(), url: request.url() })
  })
  page.on('response', (response) => {
    if (response.url().includes('/mc-embedding')) out.requests.push({ status: response.status(), url: response.url() })
  })

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

  record('seed', { provider: await field(page, 'embedding.provider').inputValue(), patch: patchText().slice(0, 600) })
  await snapshot(page, 'local-before-switch')

  // Switch provider to OpenAI-compatible in the UI (draft, not saved).
  await field(page, 'embedding.provider').selectOption('openai-compatible')
  await page.waitForTimeout(900)
  await snapshot(page, 'after-switch-draft')

  // Click Load anyway and see what happens.
  if (await loadButton(page).count()) {
    await loadButton(page).first().click({ force: true }).catch((error) => record('load-click-error', { error: String(error) }))
    await page.waitForTimeout(2500)
  }
  await snapshot(page, 'after-load-click-while-dirty')

  // Save the provider change, then look again.
  const save = dialog(page).getByRole('button', { name: /^(保存|Save)$/ }).last()
  if (!(await save.isDisabled())) { await save.click(); await page.waitForTimeout(1800) }
  await snapshot(page, 'after-save-without-key')

  if (await loadButton(page).count() && !(await loadButton(page).first().isDisabled())) {
    await loadButton(page).first().click()
    await page.waitForTimeout(3000)
  }
  await snapshot(page, 'after-load-without-key')

  // Now save a key and try again.
  await field(page, 'embedding.apiKey').fill('t41-probe-not-a-real-key')
  await dialog(page).getByRole('button', { name: '保存密钥', exact: true }).click()
  await page.waitForTimeout(2500)
  await snapshot(page, 'after-key-saved')

  if (await loadButton(page).count() && !(await loadButton(page).first().isDisabled())) {
    await loadButton(page).first().click()
    await page.waitForTimeout(3000)
  }
  await snapshot(page, 'after-load-with-key')

  page.screenshot({ path: path.join(root, 'screenshots', 'probe-final.png'), fullPage: true })
  fs.writeFileSync(path.join(root, 'evidence', 'probe.json'), JSON.stringify(out, null, 2) + '\n')
  console.log('requests', JSON.stringify(out.requests))
  await browser.close()
})().catch((error) => {
  out.steps.push({ name: 'crash', message: String(error) })
  console.log('CRASH', String(error))
  process.exit(1)
})
