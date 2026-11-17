---
ticket: 21
title: "Settings UI redesign — plan"
status: in-progress
---

# Plan — Settings UI redesign

Ticket: 21
Story: `tickets/story-settings-ui-redesign.md`
Design source: `_bmad-output/initiative-dsh-magic-context/ux-settings-redesign/`

## 1. Scope lock

This is a presentation/interaction ticket over the existing T13/T20 settings
card. It does not add config fields, server routes, schema changes or a second
write path.

- `src/client/index.js`: `section`/`placement` on every `FIELDS` entry, section
  renderer, summary, jump row, status strip, action preconditions, rollback
  ordering, registration cleanup, complete zh/en copy.
- `tests/client-pure.spec.ts`: field coverage, state mapping, summary/action
  pure helpers, copy and registration assertions; render-path assertions where
  the node-side bundle allows them.
- `docs/dsh-plugin-settings-ui-contract.md`, `README.md`, `README.zh-CN.md`,
  `CHANGELOG.md`, `PARITY.md`: host constraints, single-seat decision and layout
  change.
- Acceptance directory: one isolated DSH Web gate and its report/evidence.

No package.json/version, release, daily profile, database or provider change.

## 2. Implementation shape

### 2.1 Field metadata

Add `section` and `placement` to every `FIELDS` entry, keeping `FIELDS` as the
only inventory. `fieldSections()` groups those entries by those properties; it
does not keep a second key list:

- 常规: execute/force/assumed/ttl/protected (common);
  baseline/memoryBudget/memoryLimit (advanced).
- 历史摘要: enabled, provider/model pair, effort (common);
  minNodes/maxTokens/maxTokensCeiling/timeout (advanced).
- 日志: enabled, retention (common); mirror (advanced).
- 向量检索: provider/preset/endpoint/model/apiKeyEnv (common);
  authHeader/dimensions/queryInstruction/documentPrefix/timeoutMs/
  queryTimeoutMs/batchSize (advanced).
- 维护与诊断: registerCompactionEngine, verify provider/model pair (common).

Expose a pure `fieldSections()`/equivalent helper so the node-side spec can
assert 34 fields, one section each, correct placement and no orphan.

### 2.2 Renderer

- Build section metadata once: title/description keys only. Field membership and
  advanced/common placement come from each `FIELDS` entry, not a second key list.
- `SettingsForm` remains the outer shell; render children as:
  summary strip, jump row, sections, status strip.
- Reuse the existing `SettingsValueField`, route picker, effort picker and
  embedding action renderer; change grouping and labels rather than duplicating
  field logic.
- Advanced disclosures are native buttons with `aria-expanded`; opening/closing
  does not stage anything. Focus moves into the first control on open and back
  to the button on close.
- Invalid advanced fields open and focus immediately when they become invalid;
  the host Save is disabled by the shell in that state.
- Summary vector metric is a button that scrolls to 向量检索.
- Status strip is text-only and reads `shell.dirty`, invalid count, saving,
  busy/migration and failed state. No Save/Reset controls.

### 2.3 Actions

- Add pure helpers for action availability/reasons:
  `embeddingActionState({state, dirty, writable, model, endpoint, probeOk, keyPresent, memoryEnabled, ...})`
  and `actionWithSaveLabel(key, dirty)`; unit-test the matrix. Refresh is blocked
  only by an in-flight request; Pause/Resume ignore draft/read-only.
- Dirty Load/Test evaluate the draft that Save will write, run the existing
  `save()` programmatically, await acceptance, then perform the action; failure
  leaves the action unperformed. Route calls always see saved config.
- Start and Rollback require clean form; start requires `coverage.total > 0`,
  a probe, an available key and enabled memory, and its confirmation count is
  `coverage.missing`; rollback follows Save→disarm.
- `callEmbedding` no longer rejects Pause on `shell.dirty`/`!writable` if the
  host transport allows the action; refresh remains status-only.
- Keep the ten-state mapping in one table used by summary and section chips.

### 2.4 Registration and fallback

- `apply` registers only `settings.section` inside `whileServed`; remove
  `plugins.item`/`plugins.row.config` and `ROW_CONFIG_KEY`.
- Remove the `SettingsForm === undefined` plain-control branch and its Save.
  If primitives are absent, render a localized unavailable message with no
  writable controls or Save.
- Keep the telemetry badge untouched.

## 3. Tests

- `tests/client-pure.spec.ts`:
  - `fieldSpecs` covers 34 fields; section/placement union equals the `FIELDS`
    key set exactly once; no section is empty except intentionally none.
  - summary formatting for policy/Historian/vector/rebuild, unknown `—`.
  - ten-state mapping and chip/short labels.
  - dirty Load/Test labels and action matrix; start/rollback preconditions;
    rollback ordering helper.
  - all new copy keys present in zh and en; no new hardcoded UI English.
  - settings registration source contains only `settings.section`; no
    `plugins.item`/`plugins.row.config`/`ROW_CONFIG_KEY`; no fallback Save.
- Existing T20 tests remain green; no behavior changes to embedding routes.
- `npm test`, `npm run typecheck`, `npm run check:i18n`, `npm run build`.

## 4. Host gate

Use the existing T20 harness pattern with a fresh isolated profile and local
fake OpenAI-compatible endpoint.

Scenarios:

1. Open Settings → Magic Context; assert one nav entry, summary labels/values,
   four metrics, no second Save.
2. Jump to each section; assert section titles and that drafts survive.
3. Open/close advanced disclosure; assert fields appear and focus returns.
4. Switch zh/en; assert all new strings change, including visible text and
   `aria-label`/tooltip values, and drafts survive where the host exposes an
   in-place switch. The isolated gate switches language from General and
   reopens the card when the host has no in-card language control.
5. Change a number to make the form dirty; assert `N 项未保存`, host Save
   enabled, no in-card Save.
6. With a remote config, assert first-time dirty Load/Test labels when saved
   endpoint/model are empty; assert Save-then-route ordering.
7. Start with confirmation; assert the count uses `missing` and that Start is
   disabled at zero searchable memories; then migrate/pause/resume.
8. Rollback: assert no disarm request before accepted Save, then
   confirm → Save → disarm → `已回滚到本地`.
9. Narrow viewport (<560) and medium (560–759); assert single-column layout,
   no horizontal page scroll, actions wrap.
10. Console errors zero; screenshots at 1280 and narrow width.

Use an isolated `DSH_HOME`, profile, XDG/APPDATA paths and data directory; never
touch the daily profile. Record the exact tarball hash and host version.

## 5. Evidence and close

- `acceptance-windows-dsh-2026-11-17-settings-redesign/` with report,
  REPRODUCE, secret scan, manifest and screenshots.
- Independent diff review, then fix Critical/Fix only; independent report audit.
- `tickets.py mark 21 built`, commit, then `mark 21 done`.
- No release or package version change in this ticket.
