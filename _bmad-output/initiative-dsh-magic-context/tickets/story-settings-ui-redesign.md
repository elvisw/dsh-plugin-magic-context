---
id: 21
type: story
title: "Settings UI redesign: sections, summary and host-native actions"
parent: initiative-dsh-magic-context
covers: [src/client/index.js, tests/client-pure.spec.ts, docs/dsh-plugin-settings-ui-contract.md, README.md, README.zh-CN.md, CHANGELOG.md, PARITY.md, scripts/mc-i18n-check.mjs]
after: [20]
refined: true
hitl: false
risk: medium
---

# Settings UI redesign: sections, summary and host-native actions

Status: ready-for-dev after the frozen UX design. This ticket implements the
design in `_bmad-output/initiative-dsh-magic-context/ux-settings-redesign/`
(`DESIGN.md`, `EXPERIENCE.md`, `wireframes/settings-redesign.md`). It changes
presentation and interaction only; the field set, defaults, validation,
revision-fenced Save and config schema do not change.

## Goal

Make the Magic Context settings surface answer four questions before the user
scrolls: what reclaim policy is running, whether the Historian is enabled and
at which effort, which vector space is active, and whether a rebuild is
running. The current flat list of 34 fields becomes five host-native sections
with a summary strip, jump row, advanced disclosures and a text-only status
strip above the host footer.

T21 also removes the two legacy Plugins seats. Only `settings.section` is
registered. A host without that seat or without the DSH primitives has no
configuration card; this is an intentional, release-noted breaking change.

## Required behavior

1. **Registration and host constraints.**
   - Register only `settings.section`; delete the `plugins.item` and
     `plugins.row.config` registrations and the `ROW_CONFIG_KEY` export. The
     telemetry badge seats (`shell.overlay` / `conversation.composer.dock`) stay
     untouched. Update the i18n check so its settings-seat assertion allows the
     retained telemetry seats and rejects both legacy plugin seats.
   - Do not add a second Save, a global Reset, a footer slot, a `busy` prop or
     a close-interception prompt. The host footer remains the only visible Save.
   - If `SettingsForm`/`SettingsValueField` is absent, render the localized
     unavailable notice only; do not render the old plain-control fallback or
     its in-card Save.
   - Pause is rendered outside any disabled fieldset and remains available
     during migration subject to transport permissions.

2. **Information architecture.**
   - Summary strip: reclaim policy (`execute/force`), Historian
     (`on/off` + effort), vector space (local/remote + model), rebuild state
     (state + `covered/total`). Local and `rollback-local` show `本地` and
     `未启用` for rebuild; only a remote target uses `status.model` and coverage.
     Values come only from the config snapshot and `/mc-embedding/status`; unknown
     is `—`, never `0`. No live pressure metric.
   - Five sections in this order: 常规, 历史摘要, 日志, 向量检索, 维护与诊断.
   - Put `section` and `placement` on each `FIELDS` entry and derive the five
     groups from those properties; `FIELDS` is the only field inventory and the
     grouping owns no second key list. Grouping must cover all 34 fields exactly
     once. General advanced:
     baseline/memory budgets/limit. Historian advanced: min nodes/max tokens/
     ceiling/timeout. Journal advanced: mirror. Embedding advanced: auth header,
     dimensions, query instruction, document prefix, timeouts, batch size.
   - Jump row scrolls to sections without remounting or losing drafts.
   - Status strip is the last child before the host footer, text only:
     `已保存`, `N 项未保存`, `N 项无效`, `保存中…`,
     `迁移中，暂停后可保存`. It does not render buttons and is not sticky.
   - Responsive breakpoints: ≥760 two columns and four-up summary; 560–759 one
     column and two-by-two summary; <560 one column, labels above controls,
     wrapped actions. No horizontal page scroll.
   - Chinese is release-blocking: every new section title, summary label,
     hint, alert, status, action, `aria-label` and tooltip is dictionary-backed;
     switching locale updates immediately without remounting or dropping drafts.
     Only the agreed exception list may remain Latin.

3. **Embedding actions.**
   - Load models requires an endpoint that resolves after the pending Save
     (already saved or a preset default, or a non-empty endpoint draft); Test
     requires a model and a resolvable endpoint. The preconditions are evaluated
     against the draft that Save will write, not only the previously saved value.
     If the form is dirty, the buttons become `保存并加载模型` / `保存并测试`,
     run one existing revision-fenced Save, and only then call the route. If Save
     fails, the action never fires. The route always sees the saved config.
     Both buttons are disabled while a rebuild is migrating or paused.
   - Start requires a clean form, a saved model, a successful probe, a non-empty
     searchable set (`coverage.total > 0`) and an available API key; it opens a
     confirmation whose count is `coverage.missing` (the rows actually needing a
     request) and says quota may be spent. Rollback requires a clean form and
     opens a confirmation that remote rows are kept and local search may be
     partial. Missing key, disabled memory and unsupported dimensions disable
     the relevant remote actions.
   - Rollback order is confirm → stage provider `local` → Save accepted → call
     `disarm`. Never call disarm before the accepted write. If Save fails,
     remote remains armed.
   - Pause/Resume do not depend on draft state and remain usable in a read-only
     form subject to transport permissions. Refresh only refreshes status and is
     blocked only by an in-flight request.
   - Poll status every 2s while migrating, otherwise every 15s while visible;
     stop on paused/`remote-off`/error and when the document is hidden; keep the
     15s refresh while `remote-ready`; deduplicate requests.
   - Keep the real ten-state mapping (`remote-off`, `local`, `remote-unprobed`,
     `remote-configured-not-started`, `remote-target-missing`,
     `remote-migrating`, `remote-paused`, `remote-ready`, `remote-error`,
     `rollback-local`). Do not add a separate `off` state; `remote-off` is one
     of the ten and keeps the existing `settings.embedding.state.off` key.

4. **Docs and evidence.**
   - Update `docs/dsh-plugin-settings-ui-contract.md` for the single
     `settings.section` entry, no-footer-slot/no-busy/no-close-intercept facts,
     the removed legacy seats and the removed plain-control fallback.
   - Update both READMEs, `CHANGELOG.md` and `PARITY.md` for the breaking change
     and the new Settings layout. Do not change package version or publish.
   - One real DSH Web gate on a fresh isolated profile verifies: summary labels,
     five section headings, a jump-row click that scrolls to the embedding
     section, advanced disclosure, Chinese copy, no second
     Save, dirty action labels, start confirmation, pause/resume/rollback, a
     first-time dirty Load/Test with empty saved values, Start disabled at zero
     searchable memories, no disarm request before an accepted Save, and zero
     console errors. Chinese checks scan visible text and `aria-label`/tooltip,
     not only a sample string. A fake OpenAI-compatible endpoint is sufficient;
     do not call a paid vendor.
   - Unit tests cover section/placement coverage for all 34 fields (union equals
     the `FIELDS` key set exactly once), the ten-state mapping, summary
     formatting (local/unknown), action precondition logic, copy parity and the
     absence of legacy registrations.

## Non-goals

- New config fields, new server routes, schema or migration changes.
- dsh-go native UI, telemetry popover redesign, remote-embedding provider work.
- Reintroducing a second Save/Reset or a fake unsaved-exit prompt.
- Real vendor calls, package/release/profile changes.
