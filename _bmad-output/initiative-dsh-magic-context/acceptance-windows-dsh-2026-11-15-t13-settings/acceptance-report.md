# T13 — Magic Context settings page, Chinese copy, reasoning-effort picker

Status: **PASS WITH CAVEATS** (isolated Web host gate, real Historian run, repo gates).

Package under test: `@elvisw/dsh-magic-context@0.13.0`
DSH host: `@deepseek-ai/dsh@0.2.2-rc.1`
Final tarball: `elvisw-dsh-magic-context-0.13.0.tgz`
SHA-256 `c801ac1ff378d40aaafe1b16aa57737de40cb966dc1c564b5f909d0e132586bb`
4,015,116 bytes / 66 files.

The final UI gate ran on `c801…`. The manual Historian rows 52–57 were produced on
the immediately preceding UI-only candidate `a4b6414c…35b8`; that pack was not
retained, so a4b6→c801 was not compared member-by-member. The recorded
`c2a72c6c…35b8 → c801…` comparison differs only in `package/lib/client.js`
(`evidence/tarball-final-compare.json`), and a4b6 is the intermediate UI-only pack;
the server-side modules that reach the Historian are therefore unchanged, but this
is an inference from the chain, not a direct a4b6→c801 artifact comparison. The
older `c2a72c6c…35b8` candidate is retained as provenance.

## What this proves

### 1. Top-level Settings entry

`settings.section` is registered as `id: 'magic-context'`, `order: 30`,
`label: () => t('title')`, `locale: LOCALE_NS` inside
`configForms.whileServed([CFG_NS])` (`src/client/index.js:2674-2701`). The legacy
`plugins.item` / `plugins.row.config` registrations remain unchanged.

The scoped Web gate opened Settings and found **Magic Context** in the Settings
navigation as a sibling of **内置插件 / Built-in plugins** (`navSiblings` is read
inside the Settings dialog, not from a global button list). The host's
**Settings → Built-in plugins** section was opened separately: it has no
`Historian 推理强度` label and no `#mc-field-historian.reasoningEffort` control
(`settings-builtin-plugins`, screenshot `04-settings-builtin-plugins.png`). The
legacy Plugins-page card still renders (`plugins-page-card`, `hasMagicContext: true`,
`summaryLine: true`).

### 2. Localization

`DICTIONARIES.zh` / `DICTIONARIES.en` carry every card-owned string: 22 field
labels/hints, route Auto captions, summary and not-ready fallback, form frame copy,
and picker captions. `FORM_LABELS` is built per render from the slot translator;
the English card renders English labels and the Chinese card renders Chinese labels.

Evidence:

- `zh-card.label = "Historian 推理强度"`;
- `en-card.label = "Historian reasoning effort"`;
- `npm run check:i18n` → **ALL PASS** (`evidence/i18n.txt`);
- `tests/client-pure.spec.ts` asserts every `FIELDS` label/hint is in both
  dictionaries and scans the card render region for literal `Save`/`Reset`/
  `Default`/`Custom…` copy, so an unused key plus hardcoded English fails.

### 3. Catalog-backed effort picker

The catalog reader preserves `reasoning.efforts` / `defaultEffort`.
For the pinned route `deepseek-official/deepseek-flash` the gate observed:

```text
Default, off, low, high, max, Custom…
```

`medium` is absent. `Custom…` is always available in the pinned/ready state;
`Default` removes the leaf; unknown values remain `Custom` and are not remapped or
clamped.

Web gate (`evidence/ui-gate.json`, 20 steps, 10 settings mutations, 0 errors):

| Check | Observed |
|---|---|
| `low-staged` | select value `low` |
| `low-save` | patch `historian.reasoningEffort: low` |
| `low-reload` | still `low` after reload |
| `custom-open` | select becomes `Custom…`, input visible with the current `low`; no false "unknown id" hint |
| `custom-save` | patch `historian.reasoningEffort: turbo-test`; hint appears for the unknown id |
| `custom-reload` | still `Custom (turbo-test)` |
| `unknown-save-without-edit` | threshold changed to `99`; effort stayed `turbo-test`; mutation body contains only `policy.executeThreshold`, `writesEffort: false` |
| `unknown-save-without-edit-low` | repeated with `low` stored; threshold changed to `98`; mutation body contains only `policy.executeThreshold`, `writesEffort: false` |
| `model-change` / reload | model changed to `deepseek-v4-pro`; effort stayed `turbo-test` |
| `model-restore` | model restored to `deepseek-flash`; effort stayed `turbo-test` |
| `default-save` / reload | effort leaf removed; picker shows `Default` |
| `dump-default` (synthetic probe) | temporary leaf removal + `--dump-config` resolves the plugin row without `reasoningEffort`; taken at 15:33Z, before the final gate |
| `default-staged-clear` | select `low` then `Default` without saving; the picker shows Default and the patch leaf is still absent |
| `custom-after-default` | selecting `Custom…` in that same unsaved session stays on Custom, reveals the empty input, and leaves Save disabled (staged-clear dead end closed) |
| `low-for-smoke` | restored `low` for the final profile snapshot |

The `Custom…` branch is reachable after `Default`/Reset: selecting the sentinel
drops the staged clear before opening the input, so `draft.clear` can no longer
bounce the controlled select back to `Default`.

### 4. Real Historian runtime smoke

Runtime host was restarted with the **profile patch only** (no `--patch` overlay).
The `reasoningEffort: low` leaf came from an earlier Settings-page save in the same
isolated profile. The gate-only trigger knobs (`policy.executeThreshold: 0`,
`historianMinNodes: 0`, `historianProtectedNodes: 0`,
`historianMinBudgetTokens: 0`) were written by `restart_t13_host.py` before that
restart; `evidence/runtime-trigger-config.txt` records the same values written by
the later final restart (15:48). They are not Settings-page writes.

Sequence: the manual run (`evidence/journal-runtime.json` row 52 `at`,
15:30:26.745Z) happened **before** the final 20-step UI gate (15:46Z). The gate's
`low-for-smoke` step is therefore not the source of the runtime `low`; it restored
`low` for the final profile snapshot. The gate later wrote
`executeThreshold: 98`, and the 15:48 restart rewrote the trigger config to `0`.

The LLM adapter row carries no `thinking`/`reasoningEffort` config, so its default
effort is `high`
(`node_modules/@deepseek-ai/dsh-llm-deepseek/lib/index.js:1720`:
`options.reasoningEffort ?? connection.defaults.reasoningEffort ?? (... ? "off" : "high")`).

The session `session-72810cd9-3b8d-4de4-b118-99a55af03e57` produced a real manual
`/ctx-recomp last:1` run on candidate `a4b6…`; the server modules are unchanged in
the final `c801…` by inference from the c2a7→c801 comparison plus the a4b6 UI-only
chain, not by a direct a4b6→c801 member comparison. Journal rows
(`evidence/journal-runtime.json`):

```text
52  historian start  trigger "manual", 13 nodes, 76362 tok,
                    route deepseek-official/deepseek-flash, reasoningEffort "low", 2 chunks
53  historian chunk 1/2 digested (importance 5)
54  historian chunk 2/2 digested (importance 2)
55  historian merge  2 partials, trigger "manual", reasoningEffort "low"
56  historian done   attempts 3 (2 chunks + merge, no retry), duration 15826 ms,
                    usage 76,054 total tokens, finishReason "stop", reasoningEffort "low"
57  compartment-recomp  §C1§ re-digested 13 nodes, importance 2 → 3
```

The journal value `low` cannot come from the adapter default (`high`); it is the
plugin's `historian.reasoningEffort` leaf. The run has a `done` row, not only a
`start` row. Rows 30–36 are the earlier automatic run on the previous candidate
(identical server code, different `lib/client.js`); they are retained as
provenance, not as the final manual-run evidence.

## What this does not prove

- The Web gate asserts representative localized strings, not every visible field
  pair; full dictionary coverage is enforced by `check:i18n` and the pure tests.
  Provider/model/effort names stay as the host sends them.
- The `Default` resolved-config check used a temporary copy of the isolated profile
  patch with the effort leaf removed, then restored the `low` leaf; it proves the
  host resolves the row without the leaf, not that the UI save and dump were one
  atomic operation.
- The runtime smoke uses the **manual** `/ctx-recomp` lane, not the automatic band.
  It ran on candidate `a4b6…`; the final tarball `c801…` differs only in
  `package/lib/client.js`; the server-side modules are inferred to be unchanged
  through the a4b6 UI-only intermediate, but the runtime was not re-run after the
  final UI-only change. The automatic lane is
  covered only by the earlier rows 30–36 on `c2a72…`; it is not re-run on either
  later candidate.
- The UI phase used the LLM-adapter `--patch` overlay; the plugin row stayed in the
  profile patch and the runtime phase restarted without the overlay. No daily
  profile or daily data directory was touched.
- The final gate wrote `policy.executeThreshold: 98` at 15:46Z. The 15:48Z
  `restart_t13_host.py` rewrote the trigger config to `0`; the current
  `evidence/dump-profile-only.txt` reflects that post-gate restart, not the
  profile at the 15:30Z manual run.
- No release, tag, npm publish, or deprecation was performed.

## Repo gates

- `npm test` → 77 files / **921 tests** (`evidence/unit-test.txt`)
- `npm run typecheck` → no errors (`evidence/typecheck.txt`)
- `npm run check:i18n` → **ALL PASS** (`evidence/i18n.txt`)
- `npm run build` → passed (`evidence/build.txt`)
- `npm pack` → 66 files, SHA-256 `c801ac1f…86bb`
  (`evidence/tarball-final-compare.json`)

## Evidence index

- `evidence/ui-gate.json` — 20 scoped browser steps, 10 settings mutations and
  request bodies, 0 errors
- `evidence/journal-runtime.json` — journal rows 20–69 from the isolated DB (rows 58–69 are later boots/engine rows; the recorded manual run is 52–57)
- `evidence/runtime-summary.json` — final manual start/done/recomp rows, prior
  automatic run, compartment state
- `evidence/runtime-trigger-config.txt` — gate-only trigger knobs written before
  the profile-only restart
- `evidence/dump-default.txt` — resolved plugin row with the effort leaf removed
- `evidence/dump-profile-only.txt` — resolved final runtime config
- `evidence/tarball-final-compare.json` — previous vs final pack; only
  `lib/client.js` differs
- `evidence/screenshots/` — Plugins page, zh Settings, en Settings, Built-in plugins
- `prepare-used.json`, `host.json`, `provenance.json` — isolation and build facts
- `evidence/unit-test.txt`, `typecheck.txt`, `i18n.txt`, `build.txt` — repo gates
- `evidence/secret-scan.txt` — output of `scan_t13_secrets.py` (0 hits)
- `sha256-manifest.json` — hashes for the committed evidence and reports
