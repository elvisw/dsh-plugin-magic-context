// Drive only the real localhost Web UI; do not retain screenshots, URLs or browser logs.
const fs = require('node:fs')
const path = require('node:path')
const [modulePath, root, stage, edgePath] = process.argv.slice(2)
const { chromium } = require(modulePath)
const { url, prompts } = JSON.parse(fs.readFileSync(0, 'utf8'))
const auth = new URL(url)
if (auth.protocol !== 'http:' || auth.hostname !== '127.0.0.1' || !auth.searchParams.has('token')) {
  throw new Error('Expected ephemeral loopback authentication.')
}
const evidence = path.join(root, 'evidence', `web-${stage}.json`)
const out = { stage, steps: [], consoleErrorCount: 0 }
const record = (name, data = {}) => {
  out.steps.push({ name, ...data })
  fs.writeFileSync(evidence, JSON.stringify(out, null, 2) + '\n')
}

async function send(page, prompt, receipt) {
  const composer = page.locator('[contenteditable="true"]').first()
  await composer.click()
  await page.keyboard.insertText(prompt)
  await page.keyboard.press('Enter')
  await page.getByText(receipt, { exact: true }).last().waitFor({ timeout: 90000 })
}

async function run() {
  const browser = await chromium.launch({
    headless: true,
    // LOCALAPPDATA is isolated, so Playwright's channel lookup cannot find Edge; name the installed binary.
    ...(edgePath ? { executablePath: edgePath } : { channel: 'msedge' }),
  })
  try {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } })
    const page = await context.newPage()
    page.on('console', message => {
      if (message.type() === 'error' && !message.text().includes('favicon')) out.consoleErrorCount++
    })
    page.on('pageerror', () => out.consoleErrorCount++)
    out.lastAction = 'goto'
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 })
    await page.waitForTimeout(4000)
    out.lastAction = 'dismiss-onboarding'
    await page.getByRole('button', { name: /^(继续|Continue|关闭|Close)$/ }).first()
      .click({ timeout: 6500 }).catch(() => {})
    // Let the onboarding overlay finish closing before the shortcut reaches the shell.
    await page.waitForTimeout(800)
    if (await page.getByRole('dialog').count() > 0) {
      await page.keyboard.press('Escape')
      await page.waitForTimeout(700)
    }
    record('web-navigation')
    if (stage === 'settings') {
      out.lastAction = 'open-settings'
      await page.keyboard.press('Control+Alt+Comma')
      const dialog = page.getByRole('dialog')
      out.lastAction = 'open-magic-context'
      await dialog.getByRole('button', { name: 'Magic Context', exact: true }).first().click({ timeout: 18000 })
      const card = dialog.locator('[data-mc-section="embedding"]').first()
      out.lastAction = 'wait-embedding-section'
      await card.waitFor({ timeout: 10000 })
      record('plugin-settings-rendered', { entry: 'Magic Context', visibleSection: 'embedding' })
      return
    }
    const workspace = page.locator('[contenteditable="true"]').first()
    await workspace.waitFor({ timeout: 15000 })
    if (stage === 'lifecycle') {
      const { seed, reduce, trigger, restore } = prompts
      await send(page, seed, 'T34-SEED-DONE')
      record('seed')
      // The marker and tag are not in a user prompt: use the real host observer for the locator.
      const tag = await observedTag(prompts.fixtureMarker)
      record('observed-tag', { tag })
      await send(page, reduce.replace('{TAG}', tag), 'T34-QUEUE-DONE')
      record('reduce')
      await send(page, '/ctx-flush', /flush queued|flush requested|flush.*pending|queued.*tag|已排队/i)
      record('flush')
      await send(page, trigger, 'T34-LAND-DONE')
      record('trigger')
      await send(page, restore.replace('{TAG}', tag), 'T34-WRITE-DONE')
      record('restore-and-write')
    } else if (stage === 'restart-search') {
      await send(page, prompts.search, 'T34-SEARCH-DONE')
      record('search')
    } else {
      throw new Error('Unknown stage')
    }
  } finally {
    await browser.close()
  }
}

function eventText(event) {
  return (event.data?.message?.content ?? []).filter(part => part.type === 'text').map(part => part.text).join('')
}

async function observedTag(marker) {
  const dir = path.join(root, 'candidate', 'observer')
  for (let tries = 0; tries < 30; tries++) {
    for (const file of fs.readdirSync(dir).filter(name => name.endsWith('.jsonl') && name !== 'engine-owners.jsonl')) {
      const rows = fs.readFileSync(path.join(dir, file), 'utf8').trim().split(/\r?\n/)
      for (const line of rows.slice(-3).reverse()) {
        let row
        try { row = JSON.parse(line) } catch { continue }
        for (const event of row.events) {
          if (event.type !== 'tool/result') continue
          const text = eventText(event)
          const match = /^§(\d+)§ /.exec(text)
          if (match && text.includes(marker)) return match[1]
        }
      }
    }
    await new Promise(resolve => setTimeout(resolve, 200))
  }
  throw new Error('Tagged fixture result missing from host observer')
}

run().catch(error => {
  // Playwright failures can include navigation URLs; expose only the action name and error type.
  out.failedAt = out.steps.at(-1)?.name ?? 'before-navigation'
  out.failedAction = out.lastAction
  out.failureType = error.name
  record('failed')
  process.exitCode = 1
})
