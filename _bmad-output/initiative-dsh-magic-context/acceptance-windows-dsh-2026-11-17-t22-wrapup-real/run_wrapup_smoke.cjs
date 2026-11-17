const { chromium } = require('C:/Users/elvis/node_modules/.deno/playwright@1.63.0/node_modules/playwright')
const fs = require('fs')
const path = require('path')
const root = 'C:/Users/elvis/AppData/Local/Temp/opencode/dsh-mc-wrapup-20261117-1700'
const server = JSON.parse(fs.readFileSync(path.join(root, 'evidence', 'server.json'), 'utf8'))
const out = { steps: [], errors: [] }

async function send(page, text, waitMs) {
  const composer = page.locator('[contenteditable="true"]').first()
  await composer.click()
  await page.keyboard.type(text)
  await page.keyboard.press('Enter')
  await page.waitForTimeout(waitMs)
  out.steps.push({ text, at: new Date().toISOString(), url: page.url() })
}

;(async () => {
  const browser = await chromium.launch({ headless: true, channel: 'msedge' })
  const page = await browser.newPage({ viewport: { width: 1440, height: 1200 } })
  page.on('console', (m) => { if (m.type() === 'error') out.errors.push(m.text()) })
  await page.goto(server.url)
  await page.waitForTimeout(4000)

  await send(page, '只回复 OK-2，不要使用任何工具。', 5000)
  await send(page, '只回复 OK-3，不要使用任何工具。', 5000)
  await send(page, '只回复 OK-4，不要使用任何工具。', 5000)
  await page.screenshot({ path: path.join(root, 'screenshots', 'before-wrapup.png'), fullPage: true })

  await send(page, '/ctx-wrapup 2', 3000)
  out.afterCommand = await page.evaluate(() => document.body.innerText.slice(-4000))
  await page.screenshot({ path: path.join(root, 'screenshots', 'after-wrapup-command.png'), fullPage: true })

  await send(page, '只回复 WRAPUP-TRIGGER，不要使用任何工具。', 25000)
  out.afterTrigger = await page.evaluate(() => document.body.innerText.slice(-5000))
  await page.screenshot({ path: path.join(root, 'screenshots', 'after-wrapup-trigger.png'), fullPage: true })
  out.url = page.url()
  fs.writeFileSync(path.join(root, 'evidence', 'ui-smoke.json'), JSON.stringify(out, null, 2) + '\n')
  console.log(JSON.stringify(out, null, 2))
  await browser.close()
})()
