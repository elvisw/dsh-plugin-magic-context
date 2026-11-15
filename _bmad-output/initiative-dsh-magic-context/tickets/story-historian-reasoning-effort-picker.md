---
id: 13
type: story
title: "Magic Context settings page, Chinese copy, and reasoning effort picker"
parent: initiative-dsh-magic-context
after: [15]
refined: true
hitl: false
risk: medium
---

# Magic Context settings page, Chinese copy, and reasoning effort picker

Status: revision 5 — implemented; the isolated Web gate, repo gates and independent review fixes are recorded in `acceptance-windows-dsh-2026-11-15-t13-settings/`. Ready for the built/done transition.

## Goal

1. Put the Magic Context configuration on a **top-level Settings page** through
   the host's `settings.section` slot, not only on the Plugins page.
2. Make the whole settings card **follow the DSH locale**: every label, hint,
   route placeholder, summary, form frame string and picker caption exists in
   both the `zh` and `en` dictionaries.
3. Replace the free-text `Historian reasoning effort` field with a
   **catalog-backed picker** whose options come from the routed model's
   advertised reasoning efforts, with explicit `Default` and `Custom` handling.

The host configuration contract does not change: the stored value remains the
optional string `historian.reasoningEffort`.

## Why

- The card is currently registered only through `plugins.item` and
  `plugins.row.config` (`src/client/index.js:2210-2231`), so it lives on the
  Plugins page. The user wants a Settings page.
- The card's field labels, hints, route "Auto" captions, summary line and form
  frame strings are hardcoded English (`src/client/index.js:191-277`,
  `:531-539`, `:279-286`, `:650-658`, `:719`). DSH's language switch therefore
  has no effect on this card.
- The free-text effort field does not know which ids the routed model accepts.
  `commandcode / deepseek/deepseek-v4.1-flash` is only an example (that route
  accepts `off`, `low`, `high`, `max` and not `medium`); the host gate uses
  `deepseek-official/deepseek-flash`. Another model may accept different ids
  or none.
  Typing an unsupported id makes the next Historian call fail with
  `UNSUPPORTED_REASONING_EFFORT` instead of preventing the mistake in the UI.
- The host catalog already carries the needed metadata:
  `remote.session.modelCatalog()` model rows include
  `reasoning: { efforts: [{ id, name, description? }], defaultEffort? }`
  (schema in `@deepseek-ai/dsh-api-remotes`). The current
  `createModelCatalog()` (`src/client/index.js:359-479`) keeps only
  `{id,name}` and discards it.

## Decisions

### D1 — Entry point: top-level Settings section

Register one `settings.section` contribution:

- `id: 'magic-context'`
- `order: 30` (last in the current Settings navigation: account -10, general
  0, models 10, plugins 15, agent-presets 20)
- `label: () => t('title')`
- `locale: LOCALE_NS`

Registration lives inside the existing `configForms.whileServed([CFG_NS])`
effect and is disposed with the other card registrations. No icon
contribution is required; the shell renders its default glyph.

This places **Settings → Magic Context** as a sibling of the host's
Settings → Plugins ("内置插件 / Built-in plugins") navigation item, not as a
tab inside it.

### D2 — Plugins page entries stay as a legacy location

The existing `plugins.item` and `plugins.row.config` registrations stay
unchanged. They render the card on the **Plugins page/panel** (the
`dsh-client-ui-plugin-manager` surface), not inside Settings → "内置插件 /
Built-in plugins" (that is a separate `settings.plugins.tab` section). The
Settings page is the primary surface; the old Plugins-page card remains at the
same time and is also the fallback when `settings.section` is unavailable.
There is no shared second settings store: each `Card` mount has its own
drafts, so a hidden Plugins-page card can keep a stale draft until it is
remounted; the ticket documents this and the host gate uses one surface at a
time. Removing the old entries is a separate product decision, not part of
this ticket. Acceptance must not assert that the old card is absent, and must
not place it inside Built-in plugins.

### D3 — Localization is dictionary-backed, not a language switch

- Move every **card-owned** string into the `DICTIONARIES.zh` /
  `DICTIONARIES.en` objects, including:
  - field labels and hints for all 22 fields;
  - route "Auto" captions, "(not in catalog)", provider/model placeholders;
  - the summary line (`execute`, `force`, historian on/off, pinned route
    labels `verify`/`gen`) and its not-ready fallback
    (`'Magic Context adapter settings'` at `src/client/index.js:531`);
  - form frame copy (`unavailable`, `readOnly`, `saveFailed`, `save`,
    `saving`, `Invalid`, `Modified`, `Reset`, `Not a number`);
  - picker captions (`Default`, `Custom`, Custom placeholder, Auto-route
    hint, no-metadata hint, unknown-value hint).
- Host/provider data is **not** translated and stays literal: provider ids,
  model ids, model names, effort ids, effort `name`/`description`, `TTL`,
  `token`. The acceptance's "every visible string" claim means every
  card-owned string, not the host's catalog values.
- The card resolves copy through the slot's `props.t` (the same pattern as
  the official `ui-settings-agent-loop` card). `FORM_LABELS` must be built by
  a `formLabels(t)` function inside the card render, not translated once at
  apply time; otherwise a language switch leaves the form frame stale.
  `REFERENCE_T` remains the non-slot fallback only.
- Add `settingsCopyKeys()` on the existing factory-scope `FIELDS` (the same
  scope as `__diagnostics`); `FIELDS` is not inside `apply()`, so no hoist is
  needed. Do not move it outside the factory or it loses `ROUTES`.
- Add a pure `settingsCopyKeys()` export to `__diagnostics` that **derives**
  from `FIELDS` (`labelKey` / `hintKey`) plus the explicit summary/form/route/
  effort key list; do not maintain a second hand-written field list.
  `scripts/mc-i18n-check.mjs` checks those keys in both dictionaries, in
  addition to its existing zh/en parity and no-hardcoded-Chinese checks.
  `tests/client-pure.spec.ts` also asserts every `FIELDS` spec's
  `labelKey`/`hintKey` is present in `dictionaryKeys()` (not merely a
  non-empty string, because the translator falls back to the key name).
- Do not put `low/medium/high` in the hint; use "advertised ids, e.g.
  off/low/high/max" because deepseek-flash has no `medium`.
- Native controls get an `aria-label`/`htmlFor` association; the visible
  label is not the only accessible name.

### D4 — Catalog-backed effort options

Extend the existing single `modelCatalog()` read; do not add a second RPC or a
second catalog fetch.

- Preserve each model's normalized `reasoning` object:
  `{ efforts: [{ id, name?, description? }], defaultEffort? }`, dropping
  malformed entries defensively.
- Add pure helpers:
  - `reasoningEffortsOf(groups, provider, model)` returns
    `{ kind: 'auto' | 'missing' | 'none' | 'ready', efforts, defaultEffort? }`
    from the catalog only;
  - `effortSelectionOf(options, current)` returns
    `{ mode: 'default' | 'value' | 'custom', value }` so the Custom/unknown
    display is testable without a React render. `current` is the stored
    string; an id not present in `options` yields `custom` with that value.
  - `effortDraftOf({ baseValue, stored, draft, customOpen })` returns the
    picker view state `{ mode, value, displayValue, customOpen, cleared }`
    (`displayValue` is the visible control text: the selected option's display
    label, or the Custom input text; tests assert it only where it is stable).
    Priority: `draft.clear` > non-empty `draft.text` > `stored` > `baseValue`
    > empty. `draft.clear` forces `mode: 'default'`/`cleared: true` even when
    `baseValue` is non-empty. `customOpen: true` with empty text keeps
    `mode: 'custom'`, `value: ''`, `customOpen: true` (it must not snap back
    to Default). An unknown `stored` value yields `mode: 'custom'` with
    `customOpen: true`; an advertised stored value yields `mode: 'value'`;
    only an explicit Default/listed selection closes `customOpen`. The card
    must render from this helper, not re-derive the branch locally, so the
    pure matrix tests exercise the real view path.
  - `effortPlanOps(path, draft)` returns `{ ops, blocked }` for the effort
    leaf using the same text semantics as `plan()`: `{clear:true}` ->
    `[{op:'unset',path}]`; non-empty trimmed text -> `[{op:'set',path,
    value}]`; empty text -> `unset`; never `blocked`. `plan()` must call this
    helper for `kind: 'effort'`, and tests assert the exact ops.
- The field is `kind: 'effort'` at `['historian', 'reasoningEffort']`. Staging
  keeps the existing text/clear shape; `plan()` calls `effortPlanOps()` for
  `effort` (`trim`; empty means `unset`).
- Options are derived from the **Historian route**, which is also used by
  `/compact` and `/ctx-recomp`:
  - pinned provider + model and efforts advertised:
    `Default` plus exactly the advertised ids in host order;
  - pinned route but no reasoning metadata, or no efforts:
    `Default` only; if a non-empty stored value exists, show it as `Custom` and
    let the user clear it;
  - unpinned/Auto route: keep the plain text input and `Default`, with a hint
    that pinning the Historian provider and model enables the list;
  - catalog not ready or model missing: keep plain text (current behavior).
- `Default` maps to the existing key removal (`{clear:true}`), never to a
  made-up effort id. The picker must render Default as selected when the
  effective draft is a clear, even if the base layer holds a value; do not let
  `view()`'s `draft.clear ? baseValue` path silently show the base effort.
- `Custom…` is **always available** in the `ready` state, using the sentinel
  value `__custom__`; selecting it reveals a text input and typing stages the
  text. A stored unknown id preselects Custom and shows the stored value.
  Keep a local `customOpen` state so the controlled select does not snap back
  to Default before text is entered. This makes the Custom path reachable
  from a fresh profile without a hidden seed.
- The generic `SettingsValueField` text fallback (`src/client/index.js:814-857`;
  actual usage `:894-909`) is not enough for the picker: it would render the
  effort as plain text and lose Default/Custom. Use the effort-specific
  control for `kind: 'effort'`; keep text only for `auto`/`missing`/`none` as
  specified.
- `none`/`auto`/`missing` keep the text input; `none` also offers Default.
- Add a defensive guard so a real effort id equal to `__custom__` is not
  confused with the sentinel.
- An unknown stored id is shown as `Custom (current value)` and is preserved
  on save unless the user edits it. Never silently clear, remap, alias or
  clamp it.
- Switching provider/model refreshes the options and does not rewrite the
  stored effort. (Existing route staging clears a half-filled model when the
  provider changes; the Web gate must not Save between choosing the provider
  and the model.)
- No client-side rejection of unadvertised ids: the Host/provider remains the
  authority, and an unsupported id must still fail explicitly with
  `UNSUPPORTED_REASONING_EFFORT`.

### D5 — Runtime unchanged

No change to `src/dsh/pre-step.ts`, `compaction-engine.ts`, `recomp.ts`,
`historian.ts`, `src/dsh/config.ts` or the settings schema. The value continues
through the existing route merge and provider pass-through.

## Requirements

- `src/client/index.js`:
  - add `settings.section` registration and cleanup;
  - convert all card-owned copy to dictionary keys + `props.t`, including the
    summary not-ready fallback and `Invalid`;
  - extend the catalog reader to keep `reasoning`;
  - add the `effort` field kind and picker rendering, including the always-
    available `Custom…` sentinel and the Default clear marker;
  - export `settingsCopyKeys()`, `reasoningEffortsOf()`,
    `effortSelectionOf()`, and pure `effortPlanOps()`/`effortDraftOf()`
    through `__diagnostics`; the card must use these helpers so tests exercise
    the real plan/save shape, not a mirror copy.
- `scripts/mc-i18n-check.mjs`:
  - check all `settingsCopyKeys()` exist in zh/en;
  - keep the existing no-hardcoded-Chinese and slot-locale checks.
- `tests/client-pure.spec.ts`:
  - test `reasoningEffortsOf`, `effortSelectionOf`, `effortPlanOps`,
    `effortDraftOf` and `settingsCopyKeys`;
  - assert every `FIELDS` `labelKey`/`hintKey` is in `dictionaryKeys()`;
  - structural check: `FIELDS` has no `label`/`hint` literals and summary/
    form/route/effort render paths go through `t(...)`, so an unused key plus
    hardcoded English cannot pass.
- Web gate (not pure tests) covers unknown-save-without-edit and
  provider/model change, because the full `plan()` lives inside the card.
- `README.md`, `README.zh-CN.md`, `PARITY.md` and `CHANGELOG.md`:
  - document the new Settings page and that the Plugins page remains a legacy
    location; it is also the fallback when `settings.section` is unavailable;
  - document the picker's Auto/Custom/no-metadata behavior;
  - no claim that unsupported ids are client-validated.
- `docs/dsh-plugin-settings-ui-contract.md`:
  - the **current** Settings UI contract that T14 will link to;
  - **T13 writes** its visible `> Status: current — last verified <date>
    against DSH 0.2.2-rc.1` header immediately after the title; T14 only
    verifies it and owns the **old** config UI document's header and README
    index;
  - covers the top-level `settings.section` entry and its lifecycle, the
    legacy Plugins-page location/fallback, the zh/en dictionary contract, the
    catalog-backed effort picker (Auto / Default / Custom / no metadata), the
    save/clear path, and the evidence baseline (DSH 0.2.2-rc.1);
  - explains in the new contract's prose that the old
    `docs/dsh-plugin-config-ui-contract.md` is historical; T13 does **not**
    edit the old document's body or header. T14 owns that status header and
    the README index.
- No schema, database, host tool, command or release change.

## Acceptance

### Client logic

- A model advertising `off/low/high/max` yields advertised-id options exactly
  `Default + off + low + high + max` plus the always-present `Custom…`
  sentinel; `medium` is absent.
- A model advertising `low/medium/high` yields `medium`.
- A model with no `reasoning` / empty `efforts` yields `Default` only (plus
  `Custom` when a non-empty stored value exists).
- An Auto/unpinned Historian route keeps the text input; the picker does not
  guess the session route.
- An unknown stored id is shown as `Custom`, remains selected/preserved, and
  saving without touching it performs no effort write.
- `effortSelectionOf(options, current)` returns `default` for an empty value,
  `value` for an advertised id, and `custom` for an unknown id; it does not
  mutate the stored value.
- `effortDraftOf({ baseValue, stored, draft, customOpen })` is the render
  seam: `draft.clear` wins over a non-empty `baseValue` (`default`/`cleared`),
  an unknown stored value is `custom` with `customOpen: true`, an advertised
  value is `value`, and `__custom__` collision does not change the stored
  value.
- Changing the pinned provider/model refreshes options and leaves the stored
  value untouched.
- `Default` clears the setting; a listed id writes exactly that string; no
  alias, clamp or fallback mapping exists.

### Localization

- `settings.section` appears as **Magic Context** as a top-level Settings
  navigation item in both languages; it is a sibling of "内置插件 / Built-in
  plugins", not a tab inside it. The old card remains on the **Plugins page**
  (D2), not inside Built-in plugins, and must not be asserted absent.
- Every **card-owned** string switches with the DSH locale: field labels,
  hints, route Auto captions, summary and its not-ready fallback, form frame,
  picker captions. Host catalog values (provider/model/effort names) stay as
  the host sends them.
- `check:i18n` passes, `settingsCopyKeys()` has no missing key, and every
  `FIELDS` label/hint is present in `dictionaryKeys()` (not just non-empty).
- No Chinese remains hardcoded outside the zh dictionary; the English card
  renders no Chinese.

### Real host gate

- Build and pack a local tarball, install it into a **fresh isolated DSH
  profile** (never the daily profile), start the real Web host with a token
  URL / `--no-open`, and use Playwright. The isolated host gets
  `DEEPSEEK_API_KEY` from the environment only (never copied from the daily
  profile, never printed or written to evidence); record presence, and mark
  the gate `blocked` if absent rather than simulating a pass.
  - open Settings and assert the top-level **Magic Context** navigation item
    exists as a sibling of Built-in plugins;
  - assert the old Plugins page still renders the card (the Settings →
    Built-in plugins section is a different surface and must not contain it);
  - switch zh/en (General → Language) and assert representative labels/hints
    change;
  - pin the Historian route to `deepseek-official/deepseek-flash`; first
    assert the catalog/thinking state. **The main path requires thinking
    enabled** (`off/low/high/max`, no `medium`); enable the DeepSeek adapter's
    thinking mode in the isolated overlay and record the exact key/value. If
    the host cannot enable thinking, record a reduced-set branch that
    saves/asserts `off` only and does not claim `low` coverage or provenance
    from a differing adapter value;
  - **main path**: save `low`, reload and assert it is still selected; inspect
    the isolated profile patch/settings document for
    `historian.reasoningEffort: low`;
  - select `Custom…` (always available), type a temporary unknown id, save,
    reload, and assert it survives as `Custom` until edited;
  - **unknown-save-without-edit**: with that unknown stored value, change an
    unrelated field, save without touching the effort control, and assert no
    effort write occurs (stored value and resolved config unchanged; if the
    settings writer records a revision, the effort leaf is not in it). On the
    main path re-select and save `low`, then repeat the same check;
  - **provider/model change**: after saving the effort, change the pinned
    provider/model, save, and assert the stored effort string is unchanged
    (options refresh, value is not rewritten); reload and reassert;
  - reset to `Default`, reload, and assert the **resolved** config
    (`dsh --dump-config` or the settings snapshot) has the leaf empty/absent;
    do not infer from a patch leaf alone;
  - take screenshots and DOM/text snapshots for each state.
- Runtime smoke, **main path only**: in the same isolated run overlay write
  plugin config `historian.reasoningEffort: low` and set the LLM-adapter
  effort to a different valid advertised value (for example `high`), record
  that adapter value, run one real Historian/`/ctx-recomp` call, and assert
  the `historian` start journal row has `data.reasoningEffort === 'low'`
  (`historian.ts:649-671`). Because the adapter value differs from `low`, the
  journal value can only come from the plugin config; also assert the run has
  a `done` row or no `failed` row, since the start row is written before the
  call. "The call succeeded" is not proof.
- Reduced branch (`thinking: disabled`): only `off` is valid at the adapter,
  so plugin `off` and adapter `off` are indistinguishable. Record the config
  and journal `off`, but do not claim adapter-vs-plugin provenance; use the
  fake adapter unit test for the unsupported/differing-value path.
- An unsupported id still fails explicitly with `UNSUPPORTED_REASONING_EFFORT`
  at the LLM seam; add a fake-LLM/unit test for that code path (the current
  suite has no such assertion), and the journal does not need to carry the
  error code.
- Capture screenshots, the dump-config/profile patch, journal rows and a
  secret-scanned evidence bundle under
  `_bmad-output/initiative-dsh-magic-context/acceptance-windows-dsh-2026-11-15-t13-settings/`.

### Repo gates

- `npm test`
- `npm run typecheck`
- `npm run check:i18n`
- `npm run build`
- Independent diff review and independent report audit.

## Boundaries

- No removal of the Plugins-page entries; no top-level navigation changes
  outside the one Settings section.
- No runtime effort mapping, clamping, validation or fallback aliasing.
- No new model catalog RPC, no second catalog read, no host schema change.
- No release, tag or npm publish.
- Only an isolated profile may be used for the Web host gate; do not touch the
  daily DSH profile or its data.
- Headless DSH has no Settings UI; the browser gate is the only proof for the
  page and locale behavior. Unit tests may not substitute for it.

## References

- `src/client/index.js:191-277` — current field specs and hardcoded labels.
- `src/client/index.js:279-286` — `FORM_LABELS`; `:531` — summary not-ready
  fallback; `:548-552` — `discard()` (not the form labels).
- `src/client/index.js:359-479` — catalog reader; currently drops reasoning.
- `src/client/index.js:512-920` — card, staging, save and route controls.
- `src/client/index.js:2210-2231` — current Plugins-page registrations.
- `scripts/mc-i18n-check.mjs` — dictionary parity and slot-locale checks.
- `@deepseek-ai/dsh-client-ui-settings-general/lib/client.js:1547-1550` —
  `settings.section` slot declaration; `:1551` is the icon declaration;
  `:1587-1597` — General registration;
  `:341` renders the active section.
- `@deepseek-ai/dsh-api-remotes/lib/client.js:20944-20951` — model catalog
  `reasoning.efforts` / `defaultEffort` schema.
- `@deepseek-ai/dsh-client-ui-settings-agent-loop/lib/client.js` — official
  `props.t` card pattern.
- `src/dsh/config.ts:25-35` — `historian.reasoningEffort` leaf.
- `src/dsh/pre-step.ts:528-541`, `compaction-engine.ts:143-149`,
  `recomp.ts:164-168`, `historian.ts:649-671` — existing effort pass-through
  and the historian start row that records the effort.
- T9 (`story-historian-provider-token-limit-retry-and-reasoning-effort.md`) —
  runtime effort plumbing and real `LlmRuntime` tests.
