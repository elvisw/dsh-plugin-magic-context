const { chromium } = require('C:/Users/elvis/node_modules/.deno/playwright@1.63.0/node_modules/playwright');
const fs = require('fs');
const path = require('path');

const REPORT = 'C:/Users/elvis/Documents/dev/plugin/dsh-plugin-magic-context/_bmad-output/initiative-dsh-magic-context/acceptance-windows-dsh-2026-11-16-v0140-release';
const state = JSON.parse(fs.readFileSync(path.join(REPORT, 'host-state.json'), 'utf8'));
const root = state.root;
const server = JSON.parse(fs.readFileSync(path.join(root, 'evidence', 'server.json'), 'utf8'));
const out = { root, steps: [], errors: [] };

async function dismissOnboarding(page) {
  for (const name of ['继续', 'Continue']) {
    const cont = page.getByRole('button', { name });
    if (await cont.count()) { await cont.first().click(); await page.waitForTimeout(700); return; }
  }
}
async function openSettings(page) {
  await page.keyboard.press('Control+Alt+Comma');
  await page.waitForTimeout(1200);
  await page.getByRole('dialog').waitFor({ timeout: 15000 });
  await page.getByRole('button', { name: 'Magic Context', exact: true }).waitFor({ timeout: 15000 });
}

(async () => {
  const browser = await chromium.launch({ headless: true, channel: 'msedge' });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1200 } });
  const page = await context.newPage();
  page.on('console', (msg) => { if (msg.type() === 'error') out.errors.push(msg.text()); });
  page.on('pageerror', (error) => out.errors.push(String(error)));

  await page.goto(server.url, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(2500);
  await dismissOnboarding(page);
  await openSettings(page);
  const nav = page.getByRole('dialog').getByRole('button', { name: 'Magic Context', exact: true });
  out.steps.push({ name: 'settings-nav-visible', count: await nav.count() });
  await nav.first().click();
  await page.waitForTimeout(1200);
  const dialog = page.getByRole('dialog');
  await dialog.waitFor({ timeout: 15000 });
  const effort = dialog.locator('#mc-field-historian\\.reasoningEffort');
  const options = await effort.locator('option').evaluateAll((nodes) => nodes.map((n) => n.value));
  out.steps.push({
    name: 'settings-card-visible',
    effortPresent: await effort.count() > 0,
    effortOptions: options,
    hasDefault: options.includes(''),
    hasSelectableEffort: options.some((value) => value !== '' && value !== '__custom__'),
    bodyHasHistorian: (await dialog.innerText()).includes('Historian'),
  });
  await page.screenshot({ path: path.join(REPORT, 'evidence', 'settings-page.png'), fullPage: true });
  await browser.close();
  fs.writeFileSync(path.join(REPORT, 'evidence', 'settings-smoke.json'), JSON.stringify(out, null, 2) + '\n');
  console.log(JSON.stringify(out, null, 2));
  if (out.errors.length || !out.steps.every((step) => step.name === 'settings-nav-visible' ? step.count > 0 : step.effortPresent && step.hasDefault && step.hasSelectableEffort && step.bodyHasHistorian)) process.exit(1);
})();
