# Magic Context Settings UI contract

> Status: current — host baseline DSH 0.2.2-rc.1; the compaction-scope section is source-checked 2026-11-16, without a new browser gate.

This document is the **current** contract for the Magic Context browser settings
surface. It replaces the settings-card portion of the historical
[`dsh-plugin-config-ui-contract.md`](dsh-plugin-config-ui-contract.md); that older
document remains as a 2026-10 record of the pre-client-half contract and is not a
description of the shipped UI.

## 1. Entry points

The client half (`src/client/index.js`, copied verbatim to `lib/client.js`) registers
one React component through three slots while the `magic-context-dsh` ConfigForm is
served (`ctx.configForms.whileServed([CFG_NS])`):

| Slot | Purpose | Identity |
|---|---|---|
| `settings.section` | Primary page: **Settings → Magic Context**, a sibling of the host's "内置插件 / Built-in plugins" navigation item | `id: 'magic-context'`, `order: 30` |
| `plugins.item` | Legacy card on the GUI **Plugins page/panel** | `id: 'magic-context-dsh'`, `order: 20` |
| `plugins.row.config` | Per-row configuration card on the Plugins page | `key: '<package name>#magic-context-dsh'`, `order: 20` |

All three render the same `Card` and the same `ConfigForm` scope. The Plugins-page
entries are kept as the legacy location and as the fallback for a host that does not
declare `settings.section`; they are **not** inside the Settings → Built-in plugins
section (that is a separate `settings.plugins.tab` surface).

Each registration declares `locale: 'magic-context'` and the section uses
`label: () => t('title')`, so the navigation label follows the active DSH language.
Every registration is disposed with the `whileServed` effect.

Each mount owns its own drafts. A hidden Plugins-page card can therefore keep a stale
draft until it is remounted; there is no hidden second settings store.

## 2. Localization contract

The browser half registers one locale namespace (`magic-context`) with `zh` and `en`
dictionaries. The slot renderer passes the namespace-bound `t` to the card as
`props.t`; the card falls back to the shipped translator only outside a slot.

- Every **card-owned** string resolves through `t(...)`: all 22 field labels and hints,
  the `Auto` route captions, the summary line and its not-ready fallback, the form frame
  (`unavailable` / `readOnly` / `saveFailed` / `save` / `saving` / `Modified` / `Reset` /
  `Invalid` / `Not a number`), and the effort picker captions.
- Host/provider data stays literal: provider ids, model ids, model names, effort ids,
  effort `name`/`description`, `TTL`, and `token` are not translated.
- `FORM_LABELS` is built by `formLabels(t)` inside the card render. It is not translated
  once at `apply` time, so a language switch updates the form frame without a reload.
- Field copy keys are derived from the field path
  (`settings.field.<path>.label` / `.hint`) by a single helper; `settingsCopyKeys()`
  derives the field list from `FIELDS` and adds the summary/form/route/effort keys. It is
  consumed by `scripts/mc-i18n-check.mjs` and `tests/client-pure.spec.ts`.
- `check:i18n` also keeps its no-hardcoded-Chinese scan, `t('...')` reference scan,
  zh/en key-set parity, and slot `locale` wiring checks.

## 3. Historian reasoning-effort picker

The stored value remains the optional string `historian.reasoningEffort`
(`src/dsh/config.ts`). The UI never changes its type or adds a second store.

The picker is derived from the same single host catalog read used by the route pins
(`remote.session.modelCatalog()`), normalized to:

```js
{ id, name, reasoning: { efforts: [{ id, name?, description? }], defaultEffort? } }
```

Malformed rows, empty ids, duplicate ids, and the `__custom__` sentinel are dropped;
host order is preserved.

| Route/catalog state | Control |
|---|---|
| Pinned provider + model, model advertises efforts | Native select: `Default`, each advertised id in host order, and an always-present `Custom…` sentinel |
| Pinned route, model present but no `reasoning` / empty efforts | Text input plus `Default`; a stored value stays editable |
| Unpinned / `Auto` route | Text input plus `Default`; the hint says pinning provider + model enables the list |
| Provider/model missing from the catalog, or catalog unavailable | Text input plus `Default` (no guessed list) |

Semantics:

- `Default` stages a clear (`{ clear: true }`), which the save path turns into
  `{ op: 'unset', path: ['historian', 'reasoningEffort'] }`. It never writes a made-up
  effort id.
- A listed id writes exactly that string. `Custom…` reveals a text input and stages its
  text; the sentinel is never stored.
- A stored id that is not in the current catalog renders as `Custom (<value>)` and is
  preserved on save unless the user edits or clears it. It is never silently cleared,
  remapped, aliased, or clamped.
- Selecting `Custom…` drops any staged clear/listed draft and keeps the custom input
  open (showing the stored value when one exists, empty otherwise) instead of snapping
  back to `Default`. An explicit `Default` or listed selection closes it.
- The unknown-id hint is shown only when the custom value is non-empty and is not in the
  advertised list; opening `Custom…` on a listed value does not claim it is unknown.
- Changing the pinned provider/model refreshes the options and does not rewrite the
  stored effort. The route staging may clear a model that does not belong to a newly
  chosen provider; the settings gate must save only after both halves are chosen.
- The client does not validate an id against the advertised list: the host/provider stays
  authoritative. An unsupported id fails explicitly with the provider's
  `UNSUPPORTED_REASONING_EFFORT` error; it is not hidden by the UI.

Pure seams (`__diagnostics`), exercised by `tests/client-pure.spec.ts`:

- `reasoningEffortsOf(groups, provider, model)` → `{ kind: 'auto' | 'missing' | 'none' | 'ready', efforts, defaultEffort? }`
- `effortSelectionOf(options, current)` → `{ mode: 'default' | 'value' | 'custom', value }`
- `effortDraftOf({ baseValue, stored, draft, customOpen, options })` →
  `{ mode, value, displayValue, customOpen, cleared }`
- `effortPlanOps(path, draft)` → `{ ops, blocked }`

The card renders from these helpers; the tests exercise the real plan/save shape rather
than a mirrored implementation.

## 4. Save path

- Nothing is written until **Save**. The card stages drafts and posts one
  revision-fenced mutation (`scope.mutate(ops, snapshot.revision)`).
- For `kind: 'effort'`, `plan()` delegates to `effortPlanOps()`: `clear` or blank text →
  `unset`; non-empty trimmed text → `set`. It never blocks a save.
- Untouched fields never materialize into override rows. A stored unknown effort is
  therefore preserved by an unrelated save.
- `Default` must render as selected when the effective draft is a clear, even if the base
  layer holds a value; `effortDraftOf()` marks that state `cleared: true`.
- The native select and text input carry `aria-label`/`htmlFor` associations and are
  disabled when the deployment is read-only.

## 5. Compaction takeover scope

`registerCompactionEngine` only mounts the adapter's root `ctx.compaction` seam. It is a
**flat/headless host** switch, not a general compaction takeover.

- In DSH 0.2.2-rc.1, the Web and Desktop bundles disable the root `compaction-basic` row,
  and every agent preset mounts its own nested `compaction` group with
  `isolate.compaction: true`.
- A profile-patch top-level `compaction-basic` row does not reach a preset's
  `config.plugins`; only overriding the preset row itself reaches that composition, which
  this plugin does not do. The top-level row therefore does not replace a preset engine.
- The switch only takes effect in a flat/headless composition after that composition's
  root `compaction-basic` row is disabled. Web and Desktop users should leave it off.
- The Settings hint carries this limitation, and there is no automatic profile-patch
  writer.

The upstream `dsh-plugin-magic-context` 0.11.2 README shows the same two-row recipe as a
general takeover. That recipe is flat-only and does not work on DSH Web/Desktop; it was
reported upstream as
[wk544863858/dsh-plugin-magic-context#16](https://github.com/wk544863858/dsh-plugin-magic-context/issues/16).

A preset-scoped compaction backend is not available today. The relevant DSH feature
request is the Ideas discussion
[deepseek-ai/deepseek-harness#11127](https://github.com/deepseek-ai/deepseek-harness/discussions/11127);
this fork added its concrete use case and evidence there on 2026-11-16.

## 6. Compatibility and fallback

- A host without the `settings.section` slot simply does not render the primary page; the
  Plugins-page card remains available.
- A shell without `@deepseek-ai/dsh-client-ui-primitives` uses the card's plain-control
  fallback: the same staging, writes, picker states, and labels, with only the chrome
  differing.
- A shell without `remote.session.modelCatalog()` keeps the route and effort fields on
  plain text; no catalog data is invented.

## 7. Evidence baseline

- Host: DSH 0.2.2-rc.1 with a real Web client.
- The Web gate installs a local tarball into a **fresh isolated profile**, starts the
  real Web host with a token URL / `--no-open`, and drives Settings through Playwright.
- The gate covers: the top-level nav item and its sibling relationship; the legacy
  Plugins-page card; zh/en switching; a pinned `deepseek-official/deepseek-flash` route;
  the advertised `off/low/high/max` list (no `medium`); save/reload of a listed id; the
  always-available Custom path; unknown-value preservation; provider/model change;
  Default/clear in the resolved config; screenshots and DOM/text snapshots.
- Headless DSH has no Settings UI; pure tests and the headless runtime smoke are
  supplementary, not a substitute for the browser gate.

## 8. Boundaries

- No runtime effort mapping, clamping, validation, or fallback aliasing.
- No new model-catalog RPC or second catalog read.
- No host schema, database, tool, command, or release change in this contract.
- Only an isolated profile may be used for the Web gate; the daily DSH profile and its
  data are not touched.
