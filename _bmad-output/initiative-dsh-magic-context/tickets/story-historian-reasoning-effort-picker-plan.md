---
ticket: 13
title: "Magic Context settings page, Chinese copy, and reasoning effort picker — plan"
status: done
---

# Plan — Magic Context settings page, Chinese copy, and effort picker

Ticket: 13
Story: `tickets/story-historian-reasoning-effort-picker.md`
Status: implementation plan (independent ticket validation must pass before coding)

## 1. Scope lock

Three coupled changes, all in the client half plus dictionaries and tests:

1. **Settings entry**: a top-level `settings.section` contribution named
   `Magic Context`, registered only while the `magic-context-dsh` ConfigForm is
   served.
2. **Chinese/English copy**: every visible card string moves to the existing
   `ctx.locale` dictionaries and is resolved through `props.t`.
3. **Effort picker**: the existing `historian.reasoningEffort` text field
   becomes a catalog-backed select with `Default`, advertised ids, `Custom`
   for legacy/unknown values, and a plain-text fallback for Auto/unavailable
   catalog.

No host runtime, schema, database, tool, command or release change.

## 2. Current state and evidence

- The card is built by `makeCard()` in `src/client/index.js:512` and rendered
  through `plugins.item` / `plugins.row.config` at `:2210-2231`.
- `FIELDS` (`:191-277`) hardcodes labels and hints in English.
- The summary line (`:531-539`), `FORM_LABELS` (`:279-286`), route Auto
  captions (`:650-658`) and placeholders (`:719`) and the Reset/Invalid labels
  in the controls (`:860-910`) are also hardcoded English. The summary has a
  separate not-ready fallback at `:531`.
- `createModelCatalog()` (`:359-479`) keeps only `{id,name}` from
  `remote.session.modelCatalog()`; the host schema also carries
  `reasoning.efforts` / `defaultEffort`
  (`@deepseek-ai/dsh-api-remotes/lib/client.js:20944-20951`).
- `settings.section` is declared at
  `@deepseek-ai/dsh-client-ui-settings-general/lib/client.js:1547-1550`
  (`:1551` is the icon declaration); the General registration is
  `:1587-1597` and the active section renders at `:341`;
  `ui-settings-agent-loop` shows the official `props.t` card pattern.
- `check:i18n` currently checks zh/en key parity, source `t('...')` references,
  no hardcoded Chinese outside the zh dictionary, and slot `locale` wiring.
  It does not know about dynamically-keyed field specs, so the ticket adds an
  explicit `settingsCopyKeys()` check.
- Runtime effort plumbing is already implemented by T9; T13 must not touch it.

## 3. Design

### 3.1 Settings section

Inside the existing `configForms.whileServed([CFG_NS])` callback:

```js
const offSection = ctx.slots.inject('settings.section', () => ctx.slots.register({
  name: 'settings.section',
  id: 'magic-context',
  order: 30,
  label: () => t('title'),
  locale: LOCALE_NS,
}, Card))
```

Register alongside the existing `plugins.item` and `plugins.row.config`
entries, and dispose all three in the effect cleanup. The section uses the
same `Card` and `scope`; each mount has its own drafts, so the hidden
Plugins-page card can retain a stale draft until remounted (documented, not a
second settings store). The new nav item is a **sibling** of the host's
"内置插件 / Built-in plugins" section, not a tab inside it; the old card
remains on the **Plugins page/panel**, which is a different surface.

`settings.section` is a root list slot. It receives `t` and `close` from the
shell; `Card` only needs `t`. The page is not registered when the Host does
not serve the namespace. The old `plugins.item` card is then the fallback on
the Plugins page; it does not live inside Built-in plugins.

### 3.2 Localization

- Replace `label`/`hint` strings in `FIELDS` with `labelKey`/`hintKey`.
  `FIELDS` already lives in the factory scope (same as `__diagnostics`), not
  inside `apply()`; add `settingsCopyKeys()` there. Do not move `FIELDS`
  outside the factory (it needs `ROUTES`).
- Add dictionary keys under a stable `settings.` namespace:
  - `settings.field.<path>.label` / `.hint` for all 22 fields;
  - `settings.summary.*` for execute/force/historian, pinned-route `verify`/
    `gen`, on/off, and the not-ready fallback (`src/client/index.js:531`);
  - `settings.form.*` for unavailable/readOnly/save/saving/saveFailed/
    modified/reset/invalid/invalidNumber;
  - `settings.route.*` for Auto captions, placeholders, not-in-catalog;
  - `settings.effort.*` for Default, Custom, custom placeholder, Auto hint,
    no-metadata hint, unknown-value hint.
- `const t = props.t ?? REFERENCE_T` at the top of the card. Build
  `formLabels(t)` inside the card render; do not translate `FORM_LABELS` once
  at apply time, or a language switch leaves the form frame stale.
- Hints say "advertised ids, e.g. off/low/high/max", not
  "low/medium/high" (deepseek-flash has no `medium`).
- All rendering uses `t(...)`; no card-owned English literals remain in the
  JSX. Host catalog values (provider/model/effort name and description) are
  data and stay as sent.
- Export `settingsCopyKeys()` from `__diagnostics`:
  - derive field keys from `FIELDS` (`labelKey`/`hintKey`) and concatenate
    the explicit summary/form/route/effort keys; do not hand-maintain a
    second field list;
  - `scripts/mc-i18n-check.mjs` checks each key exists in zh and en and that
    the arrays have no duplicates.
- `tests/client-pure.spec.ts` asserts `settingsCopyKeys()` is covered by
  `dictionaryKeys()` and that every `FIELDS` `labelKey`/`hintKey` is present
  in `dictionaryKeys()`; this catches a field added without copy (the
  translator falls back to the key name, so non-empty is not enough).
- Structural assertion: `FIELDS` has no `label`/`hint` literals, and the
  summary/form/route/effort render paths use `t(...)`. Key existence alone
  does not prove the card uses the key.
- Export pure `effortPlanOps()`/`effortDraftOf()` from `__diagnostics` and
  use them in the card; the full `plan()` is inside the card, so pure tests
  need this seam. `effortDraftOf({ baseValue, stored, draft, customOpen })`
  returns `{ mode, value, displayValue, customOpen, cleared }`; `displayValue`
  is the visible control text (selected label or Custom input text); priority is
  `draft.clear` > non-empty `draft.text` > `stored` > `baseValue` > empty.
  `customOpen` with empty text stays `custom`/`''` and does not snap to
  Default; only an explicit Default/listed selection closes it. `stored` is
  the effective stored string, not the `view()` boolean. `effortPlanOps(path,
  draft)` returns `{ops, blocked}`: clear -> unset, non-empty trimmed text ->
  set, empty -> unset, never blocked; `plan()` calls it for `kind:'effort'`
  and tests assert the exact ops. The card renders the select/input from this
  result, so the pure matrix exercises the real view path. Unknown-save-
  without-edit and provider/model change are covered by the Web gate, not a
  mirrored pure implementation.
- Native controls get `aria-label`/`htmlFor`; the visible label is not the
  only accessible name.

### 3.3 Catalog

`createModelCatalog()` normalizes each model:

```js
{
  id,
  name,
  reasoning: {
    efforts: [{ id, name, description? }],
    defaultEffort?: string,
  } | undefined,
}
```

Rules:

- discard non-object models/efforts, empty ids and duplicate effort ids;
- keep host order;
- keep `name` or fall back to `id`;
- keep `defaultEffort` only when it is a non-empty string;
- no reasoning object when `efforts` is empty.

Add two pure helpers:

```js
reasoningEffortsOf(groups, provider, model)
```

Return one of:

- `{ kind: 'auto', efforts: [] }` when provider or model is empty;
- `{ kind: 'missing', efforts: [] }` when the provider/model is not in the catalog;
- `{ kind: 'none', efforts: [], defaultEffort? }` when present but no efforts;
- `{ kind: 'ready', efforts, defaultEffort? }`.

```js
effortSelectionOf(options, current)
```

Return `{ mode: 'default' | 'value' | 'custom', value }`:

- empty `current` => `default` (`''`);
- `current` in `options` => `value` with that id;
- non-empty unknown `current` => `custom` with the stored value.

No second RPC. The existing `ensureFresh()` behavior stays.

### 3.4 Effort field

`FIELDS` entry:

```js
{
  path: ['historian', 'reasoningEffort'],
  kind: 'effort',
  labelKey: 'settings.field.historian.reasoningEffort.label',
  hintKey: 'settings.field.historian.reasoningEffort.hint',
  routeId: 'historian',
}
```

Staging:

- `{ clear: true }` = Default/unset;
- `{ clear: false, text }` = an advertised id or a Custom id;
- `plan()` delegates `kind === 'effort'` to `effortPlanOps()`:
  trim, empty => `unset`, non-empty => `set string`; never blocks.

Rendering:

- `ready`: native `select` with `Default`, each advertised effort
  (`name (id)` when different), and an **always-present** `Custom…` option
  using sentinel `__custom__`. Selecting it reveals a text input; typing
  stages text. Keep a local `customOpen` state so the controlled select does
  not snap back to Default before text is entered. A stored unknown id
  preselects Custom and shows the stored value, so the path is reachable from
  a fresh profile without a hidden seed.
- Do not route `kind: 'effort'` through the generic `SettingsValueField` text
  fallback (`src/client/index.js:814-857`; usage `:894-909`); use the
  effort-specific control so Default/Custom are preserved. Text is only for
  `auto`/`missing`/`none`.
- Guard the sentinel: a real effort id equal to `__custom__` must not be
  confused with the option; reject/normalize that id in the option builder.
- `none`: `Default` only; if a stored value exists, show `Custom (current
  value)` plus its input so it can be preserved or cleared; hint explains the
  model advertises no efforts.
- `auto`/`missing`: keep the current plain text input plus a `Default` reset
  action; hint explains that pinning provider+model enables the catalog list.
- The select and text input are disabled when `!shell.writable`.
- The existing `Modified`/`Reset` indicator applies to the effort field.
- Add `aria-label`/`htmlFor` to the select and input.
- `Default` must render as selected when the draft is a clear, even if the
  base layer holds a value. `view()`'s `draft.clear ? baseValue` path must not
  make the picker show the base effort as if it were the new selection; track
  a `cleared` marker or equivalent in the effort view.
- On provider/model change, recompute options; do not stage/clear the effort.
  The existing route staging clears a half-filled model when the provider
  changes; the gate must not Save between provider and model selection.

No client-side validation of advertised ids: Host/provider is authoritative.

### 3.5 Plugins-page legacy location

Keep the existing `plugins.item` and `plugins.row.config` registrations as-is.
They render the same `Card` on the **Plugins page/panel**
(`dsh-client-ui-plugin-manager`), not inside Settings → Built-in plugins. The
Settings page is the primary surface; the Plugins-page card is also the
fallback when `settings.section` is unavailable. Each mount has its own
drafts; the hidden card can retain a stale draft until remounted (documented,
not a second settings store). If the duplicate entry is later considered
undesirable, remove it in a separate ticket.

## 4. Implementation order

1. Add dictionary keys and convert `FIELDS` / summary / route copy to
   `t(...)`; build `formLabels(t)` inside the card, not once at apply time.
   Run i18n and client tests to prove no behavior change.
2. Add `settings.section` registration and cleanup; run i18n and client
   tests; verify `registrations` still carry `locale`.
3. Extend `createModelCatalog()` with normalized reasoning and add
   `reasoningEffortsOf`.
4. Add `kind: 'effort'` staging/plan handling and the picker UI; add pure
   tests for the option matrix.
5. Write `docs/dsh-plugin-settings-ui-contract.md` as the current contract
   T14 will link to (including its `> Status: current` header and evidence
   baseline), and update README, README.zh-CN, PARITY and CHANGELOG
   (Unreleased) with the new Settings page and picker semantics.
6. Build, pack, run the isolated Web host gate, then independent diff review
   and report audit.

## 5. Test matrix

### Pure client tests (`tests/client-pure.spec.ts`)

- `settingsCopyKeys()`:
  - every key exists in both dictionaries;
  - no duplicates;
  - includes all 22 field labels and hints, including the summary not-ready
    fallback and `Invalid`;
  - every `FIELDS` `labelKey`/`hintKey` is present in `dictionaryKeys()`
    (not merely a non-empty string; the translator falls back to the key).
- `reasoningEffortsOf`:
  - `off/low/high/max` => exactly those four, no `medium`;
  - `low/medium/high` => includes `medium`;
  - no reasoning / empty efforts => `none`;
  - unknown provider/model => `missing`;
  - empty provider or model => `auto`;
  - duplicate/invalid efforts are dropped;
  - `defaultEffort` preserved but not injected as a selectable id.
- `effortSelectionOf`:
  - empty => `default`;
  - advertised id => `value`;
  - unknown non-empty => `custom` with the value preserved;
  - `__custom__`/`Default` are sentinels, not stored ids.
- The Custom option is always present in `ready`; unknown values preselect it.
- `effortPlanOps`/`effortDraftOf`:
  - Default stages `{clear:true}` => `unset`; a listed id stages
    `{op:'set', value}`; no alias/clamp;
  - unknown stored id is preserved by the draft helper.
- Ready/picker rendering matrix:
  - staged `{clear:true}` with a base value still displays Default (the
    `view()` `draft.clear ? baseValue` trap);
  - `customOpen` selects/opens Custom, does not bounce to Default, and closes
    only on Default/listed id;
  - `auto`/`missing`/`none` use text vs picker exactly as specified; `none`
    with a stored value shows Custom and allows clear;
  - first load of a stored unknown id shows Custom;
  - a real advertised id equal to `__custom__` is rejected/normalized.
- Web gate (not pure): unknown save-without-edit and provider/model change;
  the full `plan()` is inside the card.
- LLM seam test: a fake adapter/model that rejects an id with
  `UNSUPPORTED_REASONING_EFFORT` surfaces that failure; this is not covered in
  the current suite and must be added.

### i18n check

- `npm run check:i18n` must pass with the new `settingsCopyKeys()` check.
- Static source scan still finds no hardcoded Chinese outside zh.
- Every slot registration still declares `locale: 'magic-context'`.
- The new `settings.section` label is a thunk and resolves to English under
  the fake en locale.

### Real Web host gate (isolated profile)

Use a fresh root, for example
`_bmad-output/initiative-dsh-magic-context/acceptance-windows-dsh-2026-11-15-t13-settings/`,
and a separate `DSH_HOME`, profile, `HOME`/`USERPROFILE`, `XDG_*`,
`APPDATA` and `LOCALAPPDATA`. Never use the daily profile. Reuse the
isolation recipe from
`acceptance-windows-dsh-2026-11-15-combined-0.12.2/prepare_combined_host.py:50-70`.

Prerequisites:

- Playwright is not a repo dependency. Install it in the temp gate directory
  (or add it as a devDependency + lockfile change in a separate decision) and
  record its version in evidence.
- Start DSH Web with `--no-open`; read the authenticated token URL from the
  host output and have Playwright open that URL so it receives the cookie.
- Dismiss/complete the fresh-profile onboarding/welcome before Settings; the
  settings shell closes Settings while onboarding is present.
- Scope selectors to the Settings navigation/card: the text "Magic Context"
  also appears on the old Plugins-page card. Use roles/aria and the nav list,
  not a global text match.
- Use `deepseek-official/deepseek-flash` as the effort-advertising model.
  The main path requires **thinking enabled** (`off/low/high/max`, no
  `medium`). If the host cannot enable thinking and only advertises `off`,
  record a reduced-set branch that saves/asserts `off` and runs the smoke with
  `off`; do not claim `low` coverage. commandcode is optional and requires a
  provider/credential the isolated profile does not have.
- The isolated host gets `DEEPSEEK_API_KEY` from the environment (never
  copied from the daily profile, never printed or written to evidence);
  record only whether it was present. If absent, the real-model gate is
  `blocked`, not a simulated pass.

1. `npm run build`, `npm pack` a local tarball, install it into the isolated
   `web` profile.
2. Start the real DSH Web host on a free loopback port with a token URL.
3. Playwright:
   - open Settings; assert a top-level **Magic Context** nav item, a sibling
     of "内置插件 / Built-in plugins";
   - assert the old card is on the Plugins page/panel, and is not inside
     Settings → Built-in plugins;
   - switch the UI language through General → Language and assert
     representative labels/hints change in both directions;
   - pin the Historian route to `deepseek-official/deepseek-flash` (save after
     both provider and model are chosen), assert `Default` + the advertised
     ids + `Custom…`, no `medium`; on the main path select `low`, save,
     reload, assert `low` persists, inspect the isolated profile/settings
     document;
   - select the always-present `Custom…`, type a temporary unknown id, save,
     reload, assert it survives as `Custom` until edited;
   - **unknown-save-without-edit**: with that unknown value stored, change an
     unrelated field and save without touching the effort control; assert no
     effort write occurs (stored value and resolved config unchanged). On the
     main path repeat once with stored `low`;
   - after saving the effort, change the pinned provider/model, save, and
     assert the stored effort string is unchanged; reload and reassert;
   - select `Default`, save, reload, assert the **resolved** config
     (`dsh --dump-config` or settings snapshot) has the leaf empty/absent;
     do not rely on a patch leaf;
   - take screenshots and DOM/text snapshots for each state.
4. Runtime smoke, **main path only**: in the same isolated run overlay write
   plugin config `historian.reasoningEffort: low` and set the LLM-adapter
   effort to a different valid advertised value (for example `high`), record
   that adapter value, run one real Historian/`/ctx-recomp` call, and assert
   the `historian` start journal row has `data.reasoningEffort === 'low'`
   (`historian.ts:649-671`). Because the adapter value differs from `low`, the
   journal value can only come from the plugin config; "the call succeeded" is
   not proof.
   Reduced branch (`thinking: disabled`): only `off` is valid at the adapter,
   so record config/journal `off` but do not claim adapter-vs-plugin
   provenance; the fake-LLM unit test covers the differing-value case. An
   unsupported id's `UNSUPPORTED_REASONING_EFFORT` is covered by the fake-LLM
   unit test;
   the journal need not carry the code.

### Repo gates

- `npm test`
- `npm run typecheck`
- `npm run check:i18n`
- `npm run build`
- independent diff review, then independent report audit.

## 6. Evidence bundle

Under `_bmad-output/initiative-dsh-magic-context/acceptance-windows-dsh-2026-11-15-t13-settings/`:

- `prepare_t13_host.py` / `run_t13_scenarios.py` (fresh profile, tarball
  identity, overlay assertions; no daily profile);
- Playwright script and screenshots for zh/en and picker states;
- profile patch/settings document excerpts showing `low` and the cleared key;
- `dump-config.txt` and host version;
- plugin journal/DB extracts for the runtime smoke;
- `acceptance-report.md`, `REPRODUCE.md`, `sha256-manifest.json`;
- secret scan output (no `sk-…` / API keys / Bearer tokens).

## 7. Risks and mitigations

| Risk | Mitigation |
| --- | --- |
| `settings.section` slot absent on older hosts | Keep Plugins-page fallback; page simply does not register; document the host requirement. |
| Duplicate config surfaces | Same `Card` and `ConfigForm`; document Plugins page as the fallback; each mount has its own drafts, and the host gate uses one surface at a time. |
| Dynamic dictionary keys not caught by i18n script | `settingsCopyKeys()` + explicit client-pure test. |
| Catalog model without reasoning | Default-only; preserve unknown Custom; no guessing. |
| Auto route cannot know session model | Keep text input + Default, explain in hint; do not fake a list. |
| Unknown value silently rewritten | Custom display, preserve unless edited; no alias/clamp. |
| Web gate touches daily profile | Fresh `DSH_HOME` / profile, scripts assert paths, evidence records the root. |
| Headless-only verification | Browser gate is required; headless can only cover runtime pass-through. |

## 8. Done criteria

- Story acceptance all pass, with the isolated Web gate evidence.
- `npm test`, typecheck, i18n and build green.
- Independent diff review and independent report audit complete; all
  Critical/Fix items closed.
- Ticket marked built, then done.
- No release/tag/npm publish.
