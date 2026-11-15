const { chromium } = require('C:/Users/elvis/node_modules/.deno/playwright@1.63.0/node_modules/playwright');
const fs = require('fs');
const path = require('path');

const REPORT = 'C:/Users/elvis/Documents/dev/plugin/dsh-plugin-magic-context/_bmad-output/initiative-dsh-magic-context/acceptance-windows-dsh-2026-11-15-t13-settings';
const root = JSON.parse(fs.readFileSync(path.join(REPORT, 'experiment-root.json'), 'utf8')).root;
const server = JSON.parse(fs.readFileSync(path.join(root, 'evidence', 'server.json'), 'utf8'));
const patchPath = path.join(root, 'dsh-home', 'profiles', 't13', 'cordis.patch.yml');
const screenshots = path.join(root, 'screenshots');
const out = { root, steps: [], mutations: [], mutationRequests: [], errors: [] };

function patchText() { return fs.readFileSync(patchPath, 'utf8'); }
function patchEffort(text = patchText()) {
  const match = text.match(/^\s*reasoningEffort:\s*(.*)$/m);
  return match === null ? null : match[1].trim();
}
function record(name, data = {}) { out.steps.push({ name, at: new Date().toISOString(), ...data }); console.log('STEP', name, JSON.stringify(data)); }
async function shot(page, name) { await page.screenshot({ path: path.join(screenshots, name), fullPage: true }); }

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
async function openCard(page) {
  await dialog(page).getByRole('button', { name: 'Magic Context', exact: true }).first().click();
  await page.getByRole('dialog').waitFor({ timeout: 15000 });
  await page.waitForTimeout(800);
}
function dialog(page) { return page.getByRole('dialog'); }
async function ensureChinese(page) {
  const language = dialog(page).getByRole('button', { name: /^(English|中文)$/ }).first();
  if (await language.count() === 0) return 'unknown';
  const label = (await language.innerText()).trim();
  if (label === '中文') return 'zh';
  await language.click();
  await page.waitForTimeout(400);
  await page.getByRole('menuitem', { name: '中文' }).click();
  await page.waitForTimeout(900);
  return 'switched';
}
async function navLabels(page) {
  const names = ['通用设置', '模型', '内置插件', 'Agent 预设', 'Magic Context',
    'General', 'Models', 'Built-in plugins', 'Agent presets'];
  const buttons = await dialog(page).getByRole('button').allTextContents();
  return buttons.map((text) => text.trim()).filter((text) => names.includes(text));
}
async function save(page) {
  const button = dialog(page).getByRole('button', { name: /^(保存|Save)$/ }).last();
  if (await button.count() === 0) throw new Error('save button missing');
  await page.waitForTimeout(500);
  if (await button.isDisabled()) throw new Error('save button disabled');
  await button.click();
  await page.waitForTimeout(1800);
}
async function reloadCard(page) {
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2500);
  await dismissOnboarding(page);
  await openSettings(page);
  await openCard(page);
}
async function effortState(page) {
  const active = dialog(page);
  const select = active.locator('#mc-field-historian\\.reasoningEffort');
  if (await select.count() === 0) return { present: false };
  const options = await select.locator('option').evaluateAll((nodes) => nodes.map((n) => ({ value: n.value, text: n.textContent })));
  const custom = active.locator('#mc-field-historian\\.reasoningEffort-custom');
  const body = await active.innerText();
  return {
    present: true,
    value: await select.inputValue(),
    label: await active.locator('label[for="mc-field-historian.reasoningEffort"]').innerText(),
    options,
    customVisible: await custom.count() > 0,
    customValue: await custom.count() > 0 ? await custom.inputValue() : null,
    bodyHasUnknownHint: body.includes('该 id 不在当前模型目录中') || body.includes('not in the current model catalog'),
  };
}
async function gotoPlugins(page) {
  const plugins = page.getByRole('button', { name: /^(插件|Plugins)$/ });
  if (await plugins.count() === 0) return false;
  await plugins.first().click();
  await page.waitForTimeout(2500);
  return true;
}

(async () => {
  const browser = await chromium.launch({ headless: true, channel: 'msedge' });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1400 } });
  const page = await context.newPage();
  page.on('console', (msg) => { if (msg.type() === 'error') out.errors.push(msg.text()); });
  page.on('pageerror', (error) => out.errors.push(String(error)));
  page.on('request', (request) => {
    if (!request.url().includes('/api/settings/mutate')) return;
    out.mutationRequests.push({ method: request.method(), body: request.postData() ?? '' });
  });
  page.on('response', async (response) => {
    if (!response.url().includes('/api/settings/mutate')) return;
    let body = '';
    try { body = await response.text(); } catch {}
    out.mutations.push({ status: response.status(), body: body.slice(0, 1200) });
  });

  await page.goto(server.url, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(2500);
  await dismissOnboarding(page);
  await openSettings(page);
  await ensureChinese(page);
  await dialog(page).getByRole('button', { name: /^(Close|关闭)$/ }).click();
  await page.waitForTimeout(700);

  // The legacy Plugins-page entry still renders the same card (summary form there).
  const pluginPage = await gotoPlugins(page);
  await page.waitForTimeout(1000);
  const pluginBody = await page.locator('body').innerText();
  record('plugins-page-card', {
    opened: pluginPage,
    hasMagicContext: pluginBody.includes('Magic Context'),
    summaryLine: /(?:执行|Execute)\s+\d+%/.test(pluginBody),
    hasSettingsForm: pluginBody.includes('Historian reasoning effort') || pluginBody.includes('Historian 推理强度'),
  });
  await shot(page, '01-plugins-page.png');

  await openSettings(page);
  await openCard(page);
  const zh = await effortState(page);
  record('zh-card', {
    label: zh.label,
    value: zh.value,
    options: zh.options.map((option) => option.value),
    hasDefault: zh.options.some((option) => option.value === ''),
    hasCustom: zh.options.some((option) => option.value === '__custom__'),
    hasMedium: zh.options.some((option) => option.value === 'medium'),
    navHasMagicContext: (await dialog(page).getByRole('button', { name: 'Magic Context', exact: true }).count()) > 0,
    navSiblings: await navLabels(page),
  });
  await shot(page, '02-settings-zh.png');

  // The host's "Built-in plugins" section is a different surface: the legacy
  // Magic Context card lives on the Plugins page, not inside this tab.
  await dialog(page).getByRole('button', { name: '内置插件', exact: true }).click();
  await page.waitForTimeout(900);
  const builtin = await dialog(page).innerText();
  record('settings-builtin-plugins', {
    hasEffortLabel: builtin.includes('Historian 推理强度') || builtin.includes('Historian reasoning effort'),
    hasEffortControl: await dialog(page).locator('#mc-field-historian\\.reasoningEffort').count(),
  });
  await shot(page, '04-settings-builtin-plugins.png');

  // Language switch to English via General → Language.
  await dialog(page).getByRole('button', { name: '通用设置' }).click();
  await page.waitForTimeout(700);
  await dialog(page).getByRole('button', { name: '中文', exact: true }).click();
  await page.waitForTimeout(400);
  await page.getByRole('menuitem', { name: 'English' }).click();
  await page.waitForTimeout(900);
  const navEnglish = await navLabels(page);
  await openCard(page);
  const en = await effortState(page);
  record('en-card', {
    label: en.label,
    navHasMagicContext: navEnglish.includes('Magic Context'),
    navSiblings: navEnglish,
    options: en.options.map((option) => option.value),
  });
  await shot(page, '03-settings-en.png');

  // Save a listed id from the catalog.
  await dialog(page).locator('#mc-field-historian\\.reasoningEffort').selectOption('low');
  await page.waitForTimeout(500);
  record('low-staged', { effort: await effortState(page), patchEffort: patchEffort() });
  await save(page);
  record('low-save', { patchEffort: patchEffort(), effort: await effortState(page) });
  await reloadCard(page);
  record('low-reload', { patchEffort: patchEffort(), effort: await effortState(page) });

  // Always-available Custom path: type an unknown id, save, reload.
  await dialog(page).locator('#mc-field-historian\\.reasoningEffort').selectOption('__custom__');
  await page.waitForTimeout(500);
  const customInput = dialog(page).locator('#mc-field-historian\\.reasoningEffort-custom');
  record('custom-open', { effort: await effortState(page), customVisible: await customInput.count() > 0 });
  await customInput.fill('turbo-test');
  await page.waitForTimeout(500);
  await save(page);
  record('custom-save', { patchEffort: patchEffort(), effort: await effortState(page) });
  await reloadCard(page);
  record('custom-reload', { patchEffort: patchEffort(), effort: await effortState(page) });

  // Unknown-save-without-edit: change an unrelated field while Custom is stored.
  const requestsBeforeUnknown = out.mutationRequests.length;
  await dialog(page).locator('#mc-field-policy\\.executeThreshold').fill('99');
  await save(page);
  const afterUnknown = patchText();
  const unknownRequests = out.mutationRequests.slice(requestsBeforeUnknown);
  record('unknown-save-without-edit', {
    patchEffort: patchEffort(afterUnknown),
    executeThreshold: /executeThreshold:\s*(\d+)/.exec(afterUnknown)?.[1] ?? null,
    mutationRequests: unknownRequests,
    writesEffort: unknownRequests.some((request) => request.body.includes('reasoningEffort')),
  });

  // Provider/model change must not rewrite the stored effort.
  await dialog(page).locator('#mc-field-historian\\.model').selectOption('deepseek-v4-pro');
  await save(page);
  record('model-change', { patchEffort: patchEffort(), patch: patchText() });
  await reloadCard(page);
  record('model-change-reload', { patchEffort: patchEffort(), effort: await effortState(page) });
  await dialog(page).locator('#mc-field-historian\\.model').selectOption('deepseek-flash');
  await save(page);
  record('model-restore', {
    patchEffort: patchEffort(),
    model: /historian:[\s\S]*?model:\s*(\S+)/.exec(patchText())?.[1] ?? null,
  });

  // Default clears the leaf; reload proves the picker reads the resolved config.
  await dialog(page).locator('#mc-field-historian\\.reasoningEffort').selectOption('');
  await page.waitForTimeout(500);
  await save(page);
  record('default-save', { patchEffort: patchEffort(), patch: patchText() });
  await reloadCard(page);
  record('default-reload', { patchEffort: patchEffort(), effort: await effortState(page) });

  // Regression for the dead Custom branch after a STAGED Default/Reset:
  // select low, then Default (draft clear), then Custom without saving.
  await dialog(page).locator('#mc-field-historian\\.reasoningEffort').selectOption('low');
  await page.waitForTimeout(300);
  await dialog(page).locator('#mc-field-historian\\.reasoningEffort').selectOption('');
  await page.waitForTimeout(300);
  record('default-staged-clear', { effort: await effortState(page), patchEffort: patchEffort() });
  await dialog(page).locator('#mc-field-historian\\.reasoningEffort').selectOption('__custom__');
  await page.waitForTimeout(500);
  record('custom-after-default', {
    effort: await effortState(page),
    customVisible: await dialog(page).locator('#mc-field-historian\\.reasoningEffort-custom').count() > 0,
    saveDisabled: await dialog(page).getByRole('button', { name: /^(保存|Save)$/ }).last().isDisabled(),
  });

  // Leave the value at low for the runtime Historian smoke.
  await dialog(page).locator('#mc-field-historian\\.reasoningEffort').selectOption('low');
  await page.waitForTimeout(500);
  await save(page);
  record('low-for-smoke', { patchEffort: patchEffort(), patch: patchText() });

  // Repeat unknown-save-without-edit on the main path (`low` stored).
  const requestsBeforeLow = out.mutationRequests.length;
  await dialog(page).locator('#mc-field-policy\\.executeThreshold').fill('98');
  await save(page);
  const lowRequests = out.mutationRequests.slice(requestsBeforeLow);
  record('unknown-save-without-edit-low', {
    patchEffort: patchEffort(),
    executeThreshold: /executeThreshold:\s*(\d+)/.exec(patchText())?.[1] ?? null,
    mutationRequests: lowRequests,
    writesEffort: lowRequests.some((request) => request.body.includes('reasoningEffort')),
  });

  fs.writeFileSync(path.join(root, 'evidence', 'ui-gate.json'), JSON.stringify(out, null, 2) + '\n', 'utf8');
  await browser.close();
})().catch(async (error) => {
  out.errors.push(String(error));
  console.error(error);
  fs.writeFileSync(path.join(root, 'evidence', 'ui-gate.json'), JSON.stringify(out, null, 2) + '\n', 'utf8');
  process.exit(1);
});
