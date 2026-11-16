---
name: Magic Context Settings
description: Host-native DSH Settings surface for Magic Context; a visual layer over the existing volatile config form. No new brand system.
status: draft
sources:
  - ../../../docs/dsh-plugin-settings-ui-contract.md
  - ../../../README.zh-CN.md
updated: 2026-11-17
colors:
  canvas: 'var(--dsw-alias-bg-layer-1)'
  surface: 'var(--dsw-alias-bg-layer-3)'
  surface-hover: 'var(--dsw-alias-interactive-bg-hover)'
  text-primary: 'var(--dsw-alias-label-primary)'
  text-secondary: 'var(--dsw-alias-label-secondary)'
  text-muted: 'var(--dsw-alias-label-tertiary)'
  border-subtle: 'var(--dsw-alias-border-l2)'
  border-strong: 'var(--dsw-alias-border-secondary)'
  focus: 'var(--dsw-focus-ring-color, var(--dsw-alias-state-business-primary))'
  accent: 'var(--dsw-alias-brand-primary)'
  danger: 'var(--dsw-alias-state-error-primary)'
  warning: 'var(--dsw-alias-state-warn-primary)'
typography:
  section-title:
    fontFamily: 'inherit'
    fontSize: 14px
    fontWeight: '600'
    lineHeight: '22px'
  label:
    fontFamily: 'inherit'
    fontSize: 12.5px
    fontWeight: '500'
    lineHeight: '18px'
  body:
    fontFamily: 'inherit'
    fontSize: 12.5px
    fontWeight: '400'
    lineHeight: '18px'
  hint:
    fontFamily: 'inherit'
    fontSize: 11.5px
    fontWeight: '400'
    lineHeight: '17px'
  metric:
    fontFamily: 'inherit'
    fontSize: 16px
    fontWeight: '600'
    lineHeight: '22px'
    fontVariantNumeric: 'tabular-nums'
rounded:
  sm: 'var(--dsw-radius-sm, 6px)'
  md: 'var(--dsw-radius-md, 8px)'
  lg: 'var(--dsw-radius-lg, 12px)'
spacing:
  xxs: 4px
  xs: 6px
  sm: 8px
  md: 12px
  lg: 16px
  xl: 24px
components:
  summary-strip:
    background: '{colors.surface}'
    foreground: '{colors.text-primary}'
    border: '0.5px solid {colors.border-subtle}'
    radius: '{rounded.lg}'
    padding: '{spacing.md} {spacing.lg}'
  section-card:
    background: 'transparent'
    border-top: '0.5px solid {colors.border-subtle}'
    padding: '{spacing.lg} 0'
  field-row:
    label: '{typography.label}'
    hint: '{typography.hint}'
    control-height: 32px
    control-radius: '{rounded.sm}'
    gap: '{spacing.xxs}'
  status-strip:
    background: '{colors.canvas}'
    border-top: '0.5px solid {colors.border-subtle}'
    padding: '{spacing.sm} 0'
  primary-button:
    background: '{colors.accent}'
    foreground: '#FFFFFF'
    radius: '{rounded.sm}'
    height: 32px
  secondary-button:
    background: 'transparent'
    foreground: '{colors.text-primary}'
    border: '0.5px solid {colors.border-strong}'
    radius: '{rounded.sm}'
    height: 32px
  danger-outline-button:
    background: 'transparent'
    foreground: '{colors.danger}'
    border: '0.5px solid {colors.danger}'
    radius: '{rounded.sm}'
    height: 32px
  status-chip:
    background: 'transparent'
    foreground: '{colors.text-secondary}'
    border: '0.5px solid {colors.border-subtle}'
    radius: '999px'
    height: 22px
    padding: '0 8px'
---

## Brand & Style

Magic Context is a settings surface inside DeepSeek Harness, not a standalone product. Its visual identity is therefore **the host's identity**: same type ramp, same surface layers, same borders, same focus ring, same blue accent. The redesign adds structure, not decoration.

The posture is **calm operator console**. The user is here to answer four questions quickly:

1. What policy is running?
2. Is the Historian enabled, and at which effort?
3. Which vector space is active?
4. Is a rebuild running, paused, complete or absent?

The design answers those before it shows the 34 controls. It should feel like a well-organized DSH settings page, not a dashboard or a marketing page.

No custom fonts. No gradient. No ornamental icons. No second accent color. If a component needs emphasis, use hierarchy, spacing and the host's existing primary button.

## Colors

All colors are DSH alias tokens. The plugin defines no palette of its own.

- **Canvas / surface** use `--dsw-alias-bg-layer-1` and `--dsw-alias-bg-layer-3`, matching the surrounding Settings dialog.
- **Text** uses the three host label tiers: primary for values and section titles, secondary for supporting copy, tertiary for hints and metadata.
- **Borders** use the thin host border (`border-l2` or `border-secondary`); section separation is a hairline, not a card shadow.
- **Accent** is the host brand blue, reserved for the primary action and the active jump target.
- **Danger** is only for rollback and destructive confirmation; never for ordinary remote errors.
- **Warning** is for degraded states such as a missing key, incomplete coverage or a paused rebuild.

Dark mode follows automatically because every value is a host token. No hardcoded white, black or gray in card CSS.

## Typography

Inherit the host sans-serif. The only deliberate typographic moves are:

- **Section title** at 14px/600, with a short one-line description in 11.5px muted text.
- **Field label** at 12.5px/500; the value control keeps the host 12.5–14px size.
- **Hint** at 11.5px, muted, max two lines by default; longer reference explanations live behind the field's help disclosure. Security and limitation hints (for example compaction scope and remote-embedding privacy) are never truncated.
- **Metric** at 16px/600 with tabular numerals for thresholds, coverage and token counts.

Do not use all-caps labels, letter-spaced eyebrows, or serif display type. The host dialog is a utility surface.

## Localization

Chinese is a first-class, release-blocking locale, not a translation afterthought. Every visible string in the card — section titles, field labels, hints, buttons, status chips, empty states, alerts, confirmations and `aria-label`/tooltip text — must exist in both `zh` and `en`. Switching the host locale must update the card immediately without a reload.

Shared exception list: model IDs, endpoint URLs, header names, environment-variable names and protocol terms such as `OpenAI-compatible`. Everything else must be Chinese in the Chinese locale. Outside those exceptions, no English fallback may appear in a Chinese panel.

## Layout & Spacing

The Settings dialog supplies an 800px-wide content column in the observed DSH shell. The card uses the full column but caps form controls at **520px** so labels and values remain scannable; status and action rows may use the full width.

Vertical rhythm:

- Summary strip: 12px 16px, 8px internal gap.
- Jump row: 8px vertical, horizontal scroll on narrow widths.
- Section: 16px top and bottom; 12px between fields; 8px between a label and its control.
- Advanced group: 12px padding inside a hairline-bordered well, 8px between rows.
- Status strip: 8px vertical padding, sits above the host `SettingsForm` footer. The host footer remains the only Save/Reset surface; the card never renders a second Save.

Breakpoints are defined once here and reused verbatim in `EXPERIENCE.md`:

- **≥ 760px:** summary four-up; fields two columns; full jump row.
- **560–759px:** summary two-by-two; fields one column; jump row scrolls.
- **< 560px:** summary one column; labels above controls; action buttons wrap; jump row scrolls.

At 800px content width, two columns are roughly 380px each; 520px is a maximum, not a minimum. Do not introduce horizontal page scroll.

## Elevation & Depth

Use the host's panel elevation only for the status strip and any confirmation dialog. Section cards are flat; hierarchy comes from hairline separators, spacing and type weight. Avoid stacked shadows inside a dialog that already sits on an overlay.

## Shapes

Use host radii: `sm` for inputs and buttons, `md` for small wells, `lg` for the summary strip. Status chips are pill-shaped. No large rounded rectangles around every field.

## Components

- **Summary strip** — four compact metrics: reclaim policy (`execute / force`), Historian state, vector space, rebuild coverage. Each metric has a label, a value and an optional one-word state. These values come from the config snapshot and the embedding status route; the card does not invent a live pressure metric. Degraded states use warning/danger text, not a colored background.
- **Jump row** — text buttons for `常规`, `Historian`, `Journal`, `向量检索`, `维护与诊断`. They scroll to a section; they do not change draft state. The current target may show a 2px accent underline.
- **Section card** — title, one-line description, optional inline badge, fields, optional advanced disclosure.
- **Field row** — label, control, hint. Override/reset affordances sit on the label line, right-aligned, and appear only when the value is overridden.
- **Advanced disclosure** — a full-width text button with a chevron; expanded area uses a subtle surface well. It appears in 常规 (baseline/memory budgets), Historian (node/token/timeout limits), Journal (mirror) and 向量检索 (auth header, dimensions override, prefixes, timeouts, batch size).
- **Remote action bar** — `刷新` (status only), `加载模型` / `测试连接` as secondary, `开始重建向量` as primary, `暂停`/`继续` contextual, `回滚到本地` as danger outline. One primary action at a time; visibility and disabled reasons follow the state matrix in `EXPERIENCE.md`.
- **Inline alert** — icon plus text, one line of detail and an optional action. Used for missing key, probe failure, unsupported dimensions and incomplete coverage.
- **Confirmation dialog** — only for rollback and for starting a rebuild that will spend remote quota.

## Do's and Don'ts

Do:

- Match the host's control height, border and focus ring.
- Put the current state and the next safe action above the fields.
- Keep the common path (provider, endpoint, model, key) visible.
- Hide timeouts, prefixes and overrides behind `高级`.
- Use plain language for consequences: “这会重新计算 N 条记忆的向量”.
- Keep Chinese and English copy visually equivalent.
- Treat a missing or English-only Chinese string as release-blocking.

Don't:

- Add a second sidebar inside the Settings dialog.
- Use color alone to communicate state.
- Put every field in its own card.
- Use large hero text, illustrations or gradients.
- Hide Save behind a modal, or make destructive actions the most prominent button.
- Claim a remote model is “ready” before coverage confirms it.
