/**
 * T38 probe: is the "load models" affordance reachable when the provider is
 * switched to remote but not yet saved?
 */
const { chromium } = require('C:/Users/elvis/node_modules/.deno/playwright@1.63.0/node_modules/playwright')
const fs = require('fs')
const path = require('path')

const REPORT = 'C:/Users/elvis/Documents/dev/plugin/dsh-plugin-magic-context/_bmad-output/initiative-dsh-magic-context/acceptance-windows-dsh-t38-pending-remote-actions'
const root = JSON.parse(fs.readFileSync(path.join(REPORT, 'experiment-root.json'), 'utf8')).root
const server = JSON.parse(fs.readFileSync(path.join(root, 'evidence', 'server.json'), 'utf8'))
const host = server.hosts.find((entry) => entry.profile === 't37')
const out = { steps: [], failures: [] }

const record = (name, data = {}) => { out.steps.push({ name, ...data }); console.log('STEP', name, JSON.stringify(data)) }
const dialog = (page) => page.getByRole('dialog')
const field = (page, key) => dialog(page).locator('#mc-field-' + key.replaceAll('.', '\\.'))

;(async () => {
  const browser = await chromium.launch({ headless: true, channel: 'msedge' })
  const page = await (await browser.newContext({ viewport: { width: 1440, height: 1800 } })).newPage()
  await page.goto(host.url, { waitUntil: 'domcontentloaded', timeout: 60000 })
  await page.waitForTimeout(2500)
  for (const name of ['继续', 'Continue']) {
    const b = page.getByRole('button', { name })
    if (await b.count()) { await b.first().click(); await page.waitForTimeout(700); break }
  }
  await page.keyboard.press('Control+Alt+Comma')
  await page.waitForTimeout(1200)
  const language = dialog(page).getByRole('button', { name: /^(English|中文)$/ }).first()
  if (await language.count() && (await language.innerText()).trim() !== '中文') {
    await language.click(); await page.waitForTimeout(400)
    await page.getByRole('menuitem', { name: '中文' }).click(); await page.waitForTimeout(900)
  }
  await dialog(page).getByRole('button', { name: 'Magic Context', exact: true }).first().click()
  await page.waitForTimeout(900)

  const buttons = async () => (await dialog(page).locator('[data-mc-section="embedding"] button').allInnerTexts()).map((t) => t.trim())
  record('before-switch', { provider: await field(page, 'embedding.provider').inputValue(), buttons: await buttons() })

  await field(page, 'embedding.provider').selectOption('openai-compatible')
  await page.waitForTimeout(700)
  record('after-draft-switch', { buttons: await buttons(), text: (await dialog(page).innerText()).slice(0, 400) })

  const load = dialog(page).getByRole('button', { name: /加载模型|保存并加载/ })
  record('load-visible-before-save', { count: await load.count() })

  await dialog(page).getByRole('button', { name: /^(保存|Save)$/ }).last().click()
  await page.waitForTimeout(1500)
  record('after-save', { buttons: await buttons(), loadCount: await dialog(page).getByRole('button', { name: /加载模型|保存并加载/ }).count() })

  fs.writeFileSync(path.join(root, 'evidence', 'probe-t38.json'), JSON.stringify(out, null, 2) + '\n')
  await browser.close()
})().catch((error) => { console.error(error); process.exit(1) })
