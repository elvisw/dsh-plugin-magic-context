# Design review notes

Reviewed with the `bmad-review` lenses on 2026-11-17:

- **Adversarial** — 19 findings
- **Edge-Case Hunter** — 43 findings
- **Editorial Structure** — 19 findings
- **Editorial Prose** — 16 findings

The first three ran against the draft snapshot; Prose ran against the snapshot with the Chinese contract added.

## Blocking issues found and fixed

| Issue | Fix |
|---|---|
| Summary claimed a live “context pressure” metric that the Settings snapshot does not provide. | Summary now shows reclaim policy (`execute / force`), Historian, vector space and rebuild coverage; a source table defines every value and its `—` fallback. |
| The draft added a second sticky Save while the host `SettingsForm` footer already owns Save/Reset. | The host footer remains the only Save/Reset surface. The card adds a non-button status strip above it and never renders a duplicate Save. |
| Flow 2 clicked `加载模型` / `测试连接` while the form was dirty, contradicting the “save first” rule. | Load/Test now use saved config; when dirty, their labels become `保存并加载模型` / `保存并测试`, and one revision-fenced Save runs first. |
| The field inventory did not enumerate all fields, and the count was wrong (34, not 35). | Added the full 34-field inventory grouped by section and common/advanced placement. |
| Rollback could claim success before the config was saved. | Rollback order is now confirm → stage local → Save → `disarm` → show `已回滚到本地`; if Save fails, remote stays armed. |
| The redesign silently changed behavior under a “layout only” label. | Added an explicit behavior-change list: save-and-act, Start/Rollback preconditions, no second Save, status polling. |

## Other fixes applied

- Unified breakpoints to **760 / 560** and removed the 900/720 conflict.
- Added the missing Journal wireframe section and preserved rebuild coverage in the narrow summary.
- Split card states from remote states; added status enum, alert priority and a state × button matrix.
- Added polling, snapshot-error/retry, invalid-field focus, probe in-flight/cancel, model-list empty/error, unsupported-dimensions and coverage-incomplete states.
- Added rollback pending-save, rollback-complete and remote-inactive behavior.
- Clarified read-only values (`readOnly` + `aria-disabled`) and made Pause available in read-only mode where transport permits.
- Made security/limitation hints non-truncating.
- Added explicit seat variants: Settings gets the full redesign; legacy Plugins cards stay unchanged.
- Added a release-blocking Chinese localization contract with a shared exception list.
- Moved Decision Gates before the field appendix and made the main file request the decision before implementation.

## Deferred or host-dependent

- Whether the host `SettingsForm` exposes a footer slot or busy state; if not, the status strip is non-sticky.
- Whether the host exposes a close interception; if not, unsaved drafts are lost on close and the design says so.
- A full per-key zh/en copy table belongs in the T21 implementation ticket; this design defines the contract, not the final string catalog.
- No HTML mock or browser screenshot gate was produced for the redesign yet; those belong to T21.
- The legacy `plugins.item` / `plugins.row.config` cards are intentionally not redesigned.

## Verdict

The design is ready for a user decision, not yet for implementation. T21 should be created only after the spines and wireframes are accepted.
