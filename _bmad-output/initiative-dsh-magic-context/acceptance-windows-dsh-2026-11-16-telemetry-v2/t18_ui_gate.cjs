const { chromium } = require('C:/Users/elvis/node_modules/.deno/playwright@1.63.0/node_modules/playwright');
const fs = require('fs');
const path = require('path');

const REPORT = 'C:/Users/elvis/Documents/dev/plugin/dsh-plugin-magic-context/_bmad-output/initiative-dsh-magic-context/acceptance-windows-dsh-2026-11-16-telemetry-v2';
const root = JSON.parse(fs.readFileSync(path.join(REPORT, 'experiment-root.json'), 'utf8')).root;
const server = JSON.parse(fs.readFileSync(path.join(root, 'evidence', 'server.json'), 'utf8'));
const out = { root, steps: [], errors: [] };
const record = (name, data = {}) => { out.steps.push({ name, at: new Date().toISOString(), ...data }); console.log('STEP', name, JSON.stringify(data)); };
const shot = (page, name) => page.screenshot({ path: path.join(root, 'screenshots', name), fullPage: true });

async function dismissOnboarding(page) {
  for (const name of ['继续', 'Continue']) {
    const button = page.getByRole('button', { name, exact: true });
    if (await button.count()) {
      await button.first().click();
      await page.waitForTimeout(700);
      return true;
    }
  }
  return false;
}

async function sendPrompt(page, text) {
  const input = page.locator('[aria-label^="描述你想要构建"], [aria-label^="Describe what you want to build"]').first();
  await input.click();
  await page.keyboard.type(text);
  await page.keyboard.press('Enter');
  await page.waitForTimeout(1000);
}

async function pill(page) {
  const surface = page.locator('button[data-mc-surface="1"]').first();
  if (await surface.count()) return surface;
  const byLabel = page.locator('button[aria-label*="Magic Context"]');
  if (await byLabel.count()) return byLabel.first();
  return page.locator('button', { hasText: 'MC ·' }).first();
}

async function openPill(page) {
  const button = await pill(page);
  await button.waitFor({ timeout: 30000 });
  await button.click();
  const panel = page.locator('[data-mc-panel]');
  await panel.waitFor({ timeout: 15000 });
  return { button, panel };
}

async function panelText(page) {
  return (await page.locator('[data-mc-panel]').innerText()).replace(/\s+/g, ' ').trim();
}

async function switchLanguage(page, want) {
  await page.keyboard.press('Control+Alt+Comma');
  await page.waitForTimeout(1000);
  const dialog = page.getByRole('dialog');
  await dialog.waitFor({ timeout: 15000 });
  const language = dialog.getByRole('button', { name: /^(English|中文)$/ }).first();
  if (await language.count() === 0) return 'missing';
  const label = (await language.innerText()).trim();
  if ((want === 'en' && label === 'English') || (want === 'zh' && label === '中文')) {
    await page.keyboard.press('Escape');
    return 'already';
  }
  await language.click();
  await page.waitForTimeout(400);
  await page.getByRole('menuitem', { name: want === 'en' ? 'English' : '中文' }).click();
  await page.waitForTimeout(900);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(500);
  return 'switched';
}

(async () => {
  const browser = await chromium.launch({
    headless: true,
    executablePath: 'C:/Users/elvis/AppData/Local/ms-playwright/chromium-1254/chrome-win64/chrome.exe',
  });
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  let summary = null;
  page.on('response', async response => {
    if (!response.url().includes('/mc-telemetry/summary')) return;
    try { summary = await response.json(); } catch { /* non-JSON error body */ }
  });
  const routeErrors = [];
  page.on('console', message => { if (message.type() === 'error') out.errors.push('console: ' + message.text()); });
  page.on('pageerror', error => out.errors.push('pageerror: ' + String(error)));
  page.on('response', response => {
    if (response.url().includes('/mc-telemetry') && response.status() >= 400) {
      routeErrors.push(response.status() + ' ' + response.url());
    }
  });
  try {
    await page.goto(server.url, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForTimeout(2500);
    record('onboarding', { dismissed: await dismissOnboarding(page) });
    record('language-initial', { result: await switchLanguage(page, 'zh') });
    await sendPrompt(page, 'Reply with exactly OK and nothing else.');
    record('prompt-sent');
    await page.waitForTimeout(12000);
    await shot(page, '01-session.png');

    const { button, panel } = await openPill(page);
    await page.waitForTimeout(1200);
    const zhText = await panelText(page);
    const zhAria = await page.locator('[data-mc-panel] [role="img"]').getAttribute('aria-label').catch(() => null);
    const expanded = await button.getAttribute('aria-expanded');
    record('panel-zh', { text: zhText, barAria: zhAria, expanded });
    await shot(page, '02-panel-zh.png');

    // Focus trap: first focusable is focused; Shift+Tab wraps to the last,
    // then Tab wraps back to the first, while the panel stays open.
    const focusState = await page.evaluate(() => {
      const panel = document.querySelector('[data-mc-panel]');
      const focusables = panel === null ? [] : Array.from(panel.querySelectorAll(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
      ));
      return {
        panelOpen: panel !== null,
        count: focusables.length,
        activeIndex: focusables.indexOf(document.activeElement),
      };
    });
    await page.keyboard.press('Shift+Tab');
    await page.waitForTimeout(100);
    const shiftTabIndex = await page.evaluate(() => {
      const panel = document.querySelector('[data-mc-panel]');
      const focusables = panel === null ? [] : Array.from(panel.querySelectorAll(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
      ));
      return focusables.indexOf(document.activeElement);
    });
    await page.keyboard.press('Tab');
    await page.waitForTimeout(100);
    const tabBackIndex = await page.evaluate(() => {
      const panel = document.querySelector('[data-mc-panel]');
      const focusables = panel === null ? [] : Array.from(panel.querySelectorAll(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
      ));
      return focusables.indexOf(document.activeElement);
    });
    const panelStillOpen = await page.locator('[data-mc-panel]').count() === 1;
    record('focus-trap', { ...focusState, shiftTabIndex, tabBackIndex, panelStillOpen });
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);
    const escapeState = await page.evaluate(() => {
      const active = document.activeElement;
      return {
        activeIsPill: active !== null && active.tagName === 'BUTTON'
          && active.getAttribute('data-mc-surface') === '1',
        panelClosed: document.querySelector('[data-mc-panel]') === null,
      };
    });
    record('escape-focus-return', escapeState);
    await openPill(page);
    await page.mouse.click(20, 20);
    await page.waitForTimeout(350);
    const outsideState = await page.evaluate(() => {
      const active = document.activeElement;
      return {
        activeIsPill: active !== null && active.tagName === 'BUTTON'
          && active.getAttribute('data-mc-surface') === '1',
        panelClosed: document.querySelector('[data-mc-panel]') === null,
        active: active === null ? null : {
          tag: active.tagName,
          data: active.getAttribute('data-mc-surface'),
          aria: active.getAttribute('aria-label'),
          text: (active.textContent || '').slice(0, 60),
        },
      };
    });
    record('outside-focus-return', outsideState);
    await openPill(page);

    const lang = await switchLanguage(page, 'en');
    record('language-switch', { result: lang });
    await openPill(page);
    const enText = await panelText(page);
    record('panel-en', { text: enText });
    await shot(page, '03-panel-en.png');

    out.assertions = {
      zhHasSections: ['Magic Context', '系统', '工具定义', '消息', '消息构成（估算）', '对话', '其他',
        '历史摘要', '记忆', '回收队列', '维护', '可回收', '警告', '/ctx-status']
        .every(token => zhText.includes(token)),
      zhHasValues: ['2.8k', '8.8k', '618', '对话 574', '其他 44', '0 个压缩段',
        '0 总计', '— 已注入', '— 上次注入', '— 画像上次注入', '尚未运行', '0 已打标']
        .every(token => zhText.includes(token)),
      zhCompositionOmitsRecallRows: !/记忆|画像/.test(
        zhText.split('消息构成（估算）')[1]?.split('历史摘要')[0] ?? '',
      ),
      zhHasBarAria: typeof zhAria === 'string' && zhAria.includes('上下文构成')
        && zhAria.includes('2.8k') && zhAria.includes('8.8k') && zhAria.includes('618'),
      expanded: expanded === 'true',
      focusTrap: focusState.panelOpen && focusState.count > 1 && focusState.activeIndex === 0
        && shiftTabIndex === focusState.count - 1 && tabBackIndex === 0 && panelStillOpen,
      escapeFocusReturn: escapeState.activeIsPill && escapeState.panelClosed,
      outsideFocusReturn: outsideState.activeIsPill && outsideState.panelClosed,
      enHasSections: ['Historian', 'Memory', 'Queue', 'Maintenance', 'Hygiene', 'Warnings',
        'MESSAGE COMPOSITION (ESTIMATED)', 'Conversation 574', 'Other 44', '/ctx-status']
        .every(token => enText.includes(token)),
      languageSwitch: lang === 'switched',
      noConsoleErrors: out.errors.length === 0,
      noRouteErrors: routeErrors.length === 0,
      summaryCaptured: summary !== null && summary.health !== undefined
        && summary.health.contextBreakdown !== null && summary.health.messageComposition !== null,
    };
    out.pass = Object.values(out.assertions).every(Boolean);
  } catch (error) {
    out.errors.push('gate: ' + String(error && error.stack ? error.stack : error));
    out.pass = false;
    try { await shot(page, '99-failure.png'); } catch {}
  } finally {
    if (summary !== null) fs.writeFileSync(path.join(root, 'evidence', 'summary.json'), JSON.stringify(summary, null, 2) + '\n');
    fs.writeFileSync(path.join(root, 'evidence', 'ui-gate.json'), JSON.stringify(out, null, 2) + '\n');
    await browser.close();
  }
  console.log(JSON.stringify({ pass: out.pass, assertions: out.assertions, errors: out.errors }, null, 2));
  process.exit(out.pass ? 0 : 1);
})();
