---
ticket: 16
title: "Compaction takeover scope and Web/Desktop warning — plan"
status: done
---

# Plan — Compaction takeover scope and Web/Desktop warning

Ticket: 16
Story: `tickets/story-settings-managed-host-compaction-row.md`
Status: implemented copy/documentation change; no runtime behavior change.

## 1. Scope lock

This ticket is intentionally **copy and documentation only**:

- `src/client/index.js`: one hint in each dictionary;
- `tests/client-pure.spec.ts`: assertions for that hint;
- `README.md`, `README.zh-CN.md`: remove the universal takeover claim, qualify
  the manual snippet to flat/headless profiles, and link the upstream issue;
- `docs/dsh-plugin-settings-ui-contract.md`: scope section and upstream issue;
- `cordis.patch.yml`: package header comment scoped to flat/headless;
- `src/index.ts`, `src/dsh/config.ts`: comment-only scope qualifiers;
- `CHANGELOG.md`: `[Unreleased]` note with the upstream issue link.

No runtime, schema, profile patch, data or release change.

## 2. Evidence

The earlier T16 design was rejected because:

- `@deepseek-ai/dsh-web-app/cordis.patch.yml:546-547` disables the root
  `compaction-basic` row.
- `@deepseek-ai/dsh-web-app/presets/standard.patch.yml:69-81` mounts a nested
  `compaction` group with `isolate.compaction: true`; the other preset files do
  the same.
- `cordis-plugin-include/lib/index.js:218-228` only recurses `group: true`
  rows, so a top-level profile patch cannot reach a preset's `config.plugins`.
- The T13 `dump-default.txt` shows one root row plus per-preset rows:
  root `:274-277`; presets `:752-763`, `:917-928`, `:1002-1011`, `:1179-1188`.
- `dsh-config-editor/lib/index.js:90-122` parses and rewrites YAML, so
  byte-identical/CRLF claims across a settings save are not possible.
- The profile patch is not a standalone `Include` with its own `refresh()`;
  `dsh-app-boot` loads it as `patches` on the root include. The live-refresh
  design was therefore invalid.
- The earlier "auto write" behavior would be a no-op for Web agents, so it is
  removed from scope.

The upstream `dsh-plugin-magic-context` 0.11.2 README contains the same flat-only
two-row recipe. It is reported as
[wk544863858/dsh-plugin-magic-context#16](https://github.com/wk544863858/dsh-plugin-magic-context/issues/16);
this fork links that issue in README and the Settings UI contract.

## 3. Copy changes

### 3.1 Settings hint (`src/client/index.js`)

Locate:

- zh: `settings.field.registerCompactionEngine.hint` (around `:1521-1522`);
- en: the same key around `:1680-1681`.

Replace with:

zh:

`把适配器注册为压缩引擎 seam；在 DSH Web 和桌面端都无效。只对 flat/headless profile 生效，且必须先停用该组合的根 compaction-basic 行；Web 与桌面端的每个 agent preset 自带 compaction 引擎，本开关不会替换它。下一次 agent step 挂载或卸载。`

en:

`Register the adapter as the compaction engine seam. This switch has no effect on DSH Web or Desktop. It is only effective on a flat/headless profile whose root compaction-basic row is disabled and whose host composition does not already provide compaction through an agent preset; Web and Desktop presets own their compaction engine and this switch does not replace it. Mounts or unmounts on the next agent step.`

No field/label change, no new key, no client logic.

### 3.2 README.md

Update:

1. "Conservative by default" bullet (`:34-35`): add that Web and Desktop
   presets own compaction, so this switch is not a universal takeover.
2. Quick-start "only opt-in surface" sentence (`:88-89`): qualify as
   flat/headless with the root row disabled.
3. Capability table "Compaction seam" (`:107`): add "flat/headless only; in
   DSH 0.2.2-rc.1, Web and Desktop presets own their own compaction engine".
4. Configuration section (`:179-191`): replace unconditional snippet with:
   - a scope warning that top-level `compaction-basic` rows do not reach
     Web/Desktop preset compositions;
   - a **flat/headless profile** subheading around the manual two-row snippet;
   - no claim that the GUI setting handles preset compositions;
   - a link to upstream issue #16 for the same flat-only recipe.
5. Configuration reference row (`:199`): add the same scope qualifier.
6. Requirements sentence (`:37-40`): say the quick start uses the Web profile,
   the Desktop profile is not separately verified, and the switch is ineffective
   on both Web and Desktop.

Suggested warning text:

`The GUI switch only controls the root ctx.compaction seam. In DSH 0.2.2-rc.1, Web and Desktop agents run inside per-agent presets; each preset mounts its own compaction group, so a profile-patch top-level compaction-basic row does not replace the preset engine. This switch is therefore flat/headless-host only, and it only takes effect after that composition's root compaction-basic row is disabled. The upstream 0.11.2 README has the same flat-only limitation (issue #16).`

### 3.3 README.zh-CN.md

Update the ZH equivalents in the quick-start sentence, capability table, configuration block and configuration-reference row. The "Conservative by default" bullet exists only in the English README; do not add a new ZH bullet, fold the scope note into the configuration block. Use the same scope wording; do not leave the old "接管时必须同时禁用宿主引擎" claim as an unconditional Web instruction.

Suggested Chinese warning:

`GUI 开关只控制根 ctx.compaction seam。在 DSH 0.2.2-rc.1 中，Web 与桌面端的 agent 运行在各自的 agent preset 里，每个 preset 自己挂载 compaction group；profile patch 顶层的 compaction-basic 行不会替换 preset 内的引擎。因此本开关只适用于 flat/headless 宿主，且必须先停用该组合的根 compaction-basic 行。上游 0.11.2 也有同样的 flat-only 限制（issue #16）。`

### 3.4 Settings UI contract

`docs/dsh-plugin-settings-ui-contract.md`: add `## 5. Compaction takeover
scope` after `## 4. Save path`, and renumber the existing sections 5→6, 6→7,
7→8:

- The field only mounts the adapter's root `ctx.compaction` seam.
- In DSH 0.2.2-rc.1, Web and Desktop presets own their compaction backend; the
  root row is disabled by the bundle and is not the preset engine.
- A profile-patch top-level `compaction-basic` row is not a Web/Desktop preset
  override; only overriding the preset row itself reaches it.
- The switch only takes effect in a flat/headless composition after its root
  `compaction-basic` row is disabled.
- The card hint must carry this limitation; no automatic profile-patch writer
  exists.
- Link `wk544863858/dsh-plugin-magic-context#16` as the upstream report for the
  same flat-only recipe.

Do not claim runtime verification beyond the T13 card gate; this is a copy
contract.

### 3.5 CHANGELOG

Add `[Unreleased]` → `### Changed` (the existing section at
`CHANGELOG.md:13`), placing the bullet at the end:

`registerCompactionEngine` is now documented as a flat/headless-only root seam;
DSH Web and Desktop presets keep their own compaction engine. No runtime
behavior change. Link upstream issue #16.

### 3.6 Source comments

Update the stale comments that still imply the switch takes over any host:

- `src/index.ts:244-254`: add that this is a flat/headless root-seam
  qualification and that Web/Desktop agent presets own compaction.
- `src/dsh/config.ts:222-225`: align the same comment.
- `cordis.patch.yml:8-15`: scope the package header takeover instructions to
  flat/headless and warn that Web/Desktop presets own compaction.

Comment-only; no behavior change.

## 4. Tests

### 4.1 `tests/client-pure.spec.ts`

Add a test that both dictionaries resolve
`settings.field.registerCompactionEngine.hint` and contain:

- `flat/headless` in both dictionaries;
- `agent preset` and `compaction-basic` in both;
- `桌面端` / `Desktop` plus `Web`;
- not the old strings zh `先禁用宿主压缩行` / en `disable the host compaction row
  first` (`src/client/index.js:1521-1522,1680-1681`). Read the values through
  `__diagnostics.dictionaries`, not only `settingsCopyKeys`.

Keep the existing `settingsCopyKeys`/dictionary completeness tests. Add no
new field.

### 4.2 Documentation checks

- `rg -n "compaction-basic|registerCompactionEngine|agent preset|flat/headless"`
  across README.md, README.zh-CN.md, docs/dsh-plugin-settings-ui-contract.md,
  cordis.patch.yml, and confirm the old unconditional snippet is gone or scoped.
- `rg -n "issues/16|上游 issue #16|upstream issue #16"` in README.md,
  README.zh-CN.md, docs/dsh-plugin-settings-ui-contract.md, CHANGELOG.md.
- `rg -n "profile-patch|host compaction row|automatic.*disabled"` in
  `src/client/index.js` and the ticket diff to prove no writer was introduced;
  existing `compaction-basic` comments elsewhere in `src/` are allowed.
- `git diff --check` clean.

### 4.3 Gates

`npm test`, `npm run typecheck`, `npm run check:i18n`, `npm run build`.

No new host gate. The existing T13 Web gate proves the card renders; this
ticket changes only hint copy. If a reviewer insists, run the T13 settings
harness and assert the hint text; do not repeat the 20-step matrix.

## 5. Delivery

- Update ticket status, story/plan, and `tickets.toml` title/description/covers
  to this copy-only scope.
- Commit `docs(settings): clarify compaction takeover scope`.
- No version bump, tag, publish or daily-profile mutation.

## 6. Risks

- Users on Web may still expect the switch to work; the hint and README must be
  unambiguous and appear before any manual YAML example.
- Do not imply the switch is harmful; it remains safe and mounted as a root
  seam, but it does not replace preset engines.
- The old T16 auto-write design must not leak back into code or docs.
