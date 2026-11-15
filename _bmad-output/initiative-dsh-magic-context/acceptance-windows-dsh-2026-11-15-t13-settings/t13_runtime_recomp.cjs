const { chromium } = require('C:/Users/elvis/node_modules/.deno/playwright@1.63.0/node_modules/playwright');
const fs = require('fs');
const path = require('path');
const REPORT = 'C:/Users/elvis/Documents/dev/plugin/dsh-plugin-magic-context/_bmad-output/initiative-dsh-magic-context/acceptance-windows-dsh-2026-11-15-t13-settings';
const root = JSON.parse(fs.readFileSync(path.join(REPORT, 'experiment-root.json'), 'utf8')).root;
const server = JSON.parse(fs.readFileSync(path.join(root, 'evidence', 'server-profile-only.json'), 'utf8'));
const out = { root, at: new Date().toISOString(), steps: [], errors: [] };
function rec(name, data = {}) { out.steps.push({ name, at: new Date().toISOString(), ...data }); console.log('STEP', name, JSON.stringify(data).slice(0, 900)); }
(async () => {
  const browser = await chromium.launch({ headless: true, channel: 'msedge' });
  const page = await (await browser.newContext({ viewport: { width: 1440, height: 1000 } })).newPage();
  page.on('pageerror', (e) => out.errors.push(String(e)));
  await page.goto(server.url, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(2500);
  for (const name of ['Continue', '继续']) { const c = page.getByRole('button', { name }); if (await c.count()) { await c.first().click(); await page.waitForTimeout(1000); break; } }
  await page.getByText('This is a runtime smoke', { exact: false }).first().click();
  await page.waitForTimeout(2500);
  const composer = page.locator('[contenteditable=true]').last();
  await composer.click();
  await composer.fill('/ctx-recomp last:1');
  await page.waitForTimeout(500);
  await page.keyboard.press('Enter');
  rec('recomp-sent');
  for (const seconds of [30000, 30000, 30000, 30000]) {
    await page.waitForTimeout(seconds);
    const body = await page.locator('body').innerText();
    rec('wait', { tail: body.slice(-500) });
  }
  await page.screenshot({ path: path.join(root, 'screenshots', 'runtime-recomp.png'), fullPage: true });
  fs.writeFileSync(path.join(root, 'evidence', 'runtime-recomp.json'), JSON.stringify(out, null, 2) + '\n', 'utf8');
  await browser.close();
})().catch((error) => { out.errors.push(String(error)); console.error(error); fs.writeFileSync(path.join(root, 'evidence', 'runtime-recomp.json'), JSON.stringify(out, null, 2) + '\n', 'utf8'); process.exit(1); });
