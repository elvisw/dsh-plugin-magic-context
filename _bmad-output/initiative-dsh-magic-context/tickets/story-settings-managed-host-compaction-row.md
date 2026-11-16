---
id: 16
type: story
title: "Compaction takeover scope and Web/Desktop warning"
parent: initiative-dsh-magic-context
covers: [src/index.ts, src/dsh/config.ts, src/client/index.js, tests/client-pure.spec.ts, README.md, README.zh-CN.md, CHANGELOG.md, docs/dsh-plugin-settings-ui-contract.md, cordis.patch.yml]
after: [14]
refined: true
hitl: false
risk: medium
---

# Compaction takeover scope and Web/Desktop warning

Status: revision 3 — scope changed after validation. This is a copy/documentation
ticket, not a profile-patch writer. The filename is retained from the rejected
auto-write draft; this story supersedes that design.

## Goal

Stop presenting `registerCompactionEngine` as a general compaction takeover.
On DSH Web and Desktop the root `compaction-basic` row is already disabled by
the bundle, and every agent preset owns its own nested `compaction` group with
its own `compaction-basic`. A profile-patch top-level `compaction-basic` row
cannot replace those preset engines.

The setting remains a **flat/headless host seam**:
`registerCompactionEngine` mounts the adapter's root `ctx.compaction` engine
only when the host composition itself leaves that seam available. It does not
change Web or Desktop agent preset compaction.

This ticket:

- keeps runtime behavior and config schema unchanged;
- corrects the settings hint, README (both languages), the Settings UI contract
  and CHANGELOG;
- makes the limitation visible where the user turns the switch on;
- does **not** write, comment or re-enable `compaction-basic` rows, and does not
  add automatic profile-patch management.

## Why the previous design was dropped

Independent ticket validation found:

- `dsh-web-app/cordis.patch.yml:546-547` disables the root
  `compaction-basic` row;
- `dsh-web-app/presets/standard.patch.yml:69-81` (and the other presets) mount
  `compaction-basic` inside an `isolate.compaction: true` group;
- DSH `applyPatches` only recurses `group: true` rows, so a top-level profile
  patch row cannot reach the preset's nested engine;
- `--dump-config` shows one root row plus per-preset rows, not one effective
  row;
- settings saves go through `dsh-config-editor`, which normalizes YAML line
  endings and rewrites the profile patch;
- the profile patch is not a standalone `Include` with its own `refresh()`, so
  the proposed live-refresh path does not exist;
- a naive `ctx.loader.update` would dump the whole YAML and destroy comments.

Therefore the earlier "auto-write the host row" behavior would be a no-op on
the Web profile that this README supports by default. The correct short-term
delivery is an explicit scope statement, not cross-plugin file editing.

The same flat-only recipe is in the upstream
`dsh-plugin-magic-context` 0.11.2 README. It has been reported as
[wk544863858/dsh-plugin-magic-context#16](https://github.com/wk544863858/dsh-plugin-magic-context/issues/16);
this fork's docs link that issue instead of repeating the unconditional claim.

## Required changes

### 1. Settings hint

In `src/client/index.js`:

- Keep the existing `registerCompactionEngine` field and its key.
- Chinese hint must state that the switch has **no effect on DSH Web or
  Desktop**, only applies to a **flat/headless profile whose root
  `compaction-basic` row is disabled**, and that Web/Desktop per-agent presets
  own compaction and are not replaced by this switch.
- English hint must carry the same scope.
- The label may stay `注册压缩引擎` / `Register compaction engine`; the hint is
  the authoritative scope note.
- No other card field changes.

Suggested Chinese hint:

`把适配器注册为压缩引擎 seam；在 DSH Web 和桌面端都无效。只对 flat/headless profile 生效，且必须先停用该组合的根 compaction-basic 行；Web 与桌面端的每个 agent preset 自带 compaction 引擎，本开关不会替换它。下一次 agent step 挂载或卸载。`

Suggested English hint:

`Register the adapter as the compaction engine seam. This switch has no effect on DSH Web or Desktop. It is only effective on a flat/headless profile whose root compaction-basic row is disabled and whose host composition does not already provide compaction through an agent preset; Web and Desktop presets own their compaction engine and this switch does not replace it. Mounts or unmounts on the next agent step.`

### 2. README (EN and ZH)

Update the current claims that imply a universal takeover:

- The "Conservative by default" bullet.
- The "only opt-in surface" quick-start sentence.
- The capability table row `Compaction seam`.
- The configuration section: replace the unconditional two-row takeover
  snippet with a clear statement that top-level `compaction-basic` rows do not
  reach DSH Web/Desktop preset engines.
- The configuration reference row for `registerCompactionEngine`.
- The installation/requirements sentence: the quick start uses the Web profile,
  the Desktop profile is not separately verified, and the takeover switch is for
  flat/headless compositions only.
- Qualify host-behavior claims as DSH 0.2.2-rc.1 / the current Web and Desktop
  bundles, not an unversioned “DSH Web” guarantee.
- Link the upstream issue that reports the same flat-only recipe in
  `dsh-plugin-magic-context` 0.11.2, and state that this fork corrects it.
- `cordis.patch.yml` header comments: scope the takeover instructions to
  flat/headless and warn that Web/Desktop presets own compaction.

The manual two-row snippet may remain only under an explicit **flat/headless
profile** heading, with a note that it does not apply to DSH Web or Desktop
presets. Do not claim the GUI setting handles preset compositions.

### 3. Settings UI contract

Add a short section to `docs/dsh-plugin-settings-ui-contract.md`:

- `registerCompactionEngine` is a root-seam switch.
- DSH Web and Desktop preset compositions own their `compaction` service (cite
  the host bundle/preset behavior in prose, not as a plugin guarantee).
- A profile-patch top-level `compaction-basic` row is not a Web/Desktop preset
  override; only the preset row itself would reach it.
- The card hint must carry this limitation; no automatic profile-patch writing
  is implemented.
- Link `wk544863858/dsh-plugin-magic-context#16` as the upstream report for the
  same flat-only recipe.

### 4. CHANGELOG

Add an `[Unreleased]` "Changed" bullet stating the scope correction:
`registerCompactionEngine` is documented as flat/headless-only; DSH Web and
Desktop presets keep their own compaction engine. No runtime behavior change.
Link upstream issue #16 for the same flat-only recipe.

### 5. Source comments

Update the stale comments that still describe the pre-scope takeover model:

- `src/index.ts:244-254` says takeover needs “a profile that does not mount
  compaction-basic”; add the flat/headless and Web/Desktop preset qualifier.
- `src/dsh/config.ts:222-225` says the same; align it.

These are comment-only edits, no behavior change.

## Acceptance

- Independent ticket validation passes.
- `tests/client-pure.spec.ts` asserts both dictionaries contain the scope
  wording for `settings.field.registerCompactionEngine.hint` (flat/headless,
  root compaction-basic, agent preset, and Desktop/Web), and the existing
  dictionary completeness tests stay green.
- `npm run check:i18n` passes.
- `rg` confirms:
  - README.md and README.zh-CN.md no longer present the two-row takeover as the
    universal Web path;
  - the Settings UI contract has the scope section and upstream issue link;
  - no automatic writer, `profile-patch`, `compaction-basic` file edit, or
    `ctx.loader.update` code is introduced in `src/client/index.js` or the
    ticket diff; existing `compaction-basic` comments elsewhere are allowed.
- `git diff --stat` and `git status --short` show exactly the nine covered files
  (plus ticket/plan/tickets.toml bookkeeping), not runtime or profile files.
- `npm test`, `npm run typecheck`, `npm run check:i18n`, and `npm run build`
  pass.
- No host gate is required for this copy-only change; the existing T13 Web gate
  already proves the card renders, and this ticket does not change runtime
  behavior. If a reviewer wants a browser check, only assert the hint text is
  visible in Settings → Magic Context; do not re-run the full T13 matrix.
- No release, no profile mutation, no schema or data change.

## Out of scope

- Writing or commenting `compaction-basic` rows.
- Web/Desktop preset-aware compaction takeover (explicitly dropped; a future design
  ticket would be required). The relevant DSH feature request is
  [deepseek-ai/deepseek-harness#11127](https://github.com/deepseek-ai/deepseek-harness/discussions/11127).
- Changing `registerCompactionEngine` runtime behavior or engine ordering.
- A new settings field or status card.
