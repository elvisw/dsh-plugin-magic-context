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
| The draft added a second sticky Save while the host `SettingsForm` footer already owns the only Save. | The host footer remains the only Save surface; there is no global Reset. The card adds a non-button status strip above it and never renders a duplicate Save. |
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
- Added explicit seat variants: Settings gets the full redesign; legacy `plugins.item` / `plugins.row.config` seats are removed, not restyled.
- Added a release-blocking Chinese localization contract with a shared exception list.
- Moved Decision Gates before the field appendix and made the main file request the decision before implementation.

## Confirmed host facts

- `@deepseek-ai/dsh-client-ui-primitives@0.2.2-rc.1` `SettingsFormProps` has **no footer slot** and **no `busy` prop**; it renders a fixed footer with one Save button. There is no global Reset.
- `SettingsForm` disables Save when `!dirty || invalid || saving`; `saving` is the only busy-like flag.
- `onDiscard` runs on unmount; there is no close interception. Closing Settings drops drafts.
- `src/client/index.js` registers `settings.section`, `plugins.item` and `plugins.row.config` today. T21 will register only `settings.section` and remove the legacy seats; this requires the 0.2.2-rc.1 `settings.section` slot.

## Deferred or host-dependent

- A full per-key zh/en copy table belongs in the T21 implementation ticket; this design defines the contract, not the final string catalog.
- No HTML mock or browser screenshot gate was produced for the redesign yet; those belong to T21.
- Final host version support policy for removing the legacy seats belongs in the T21 ticket; the design assumes 0.2.2-rc.1+.

## Final focused confirmation

A fifth focused review checked the revised files against the host contract and the T20 server/client code. It found four Criticals and nine Fixes; all are now reflected in the spines:

- **Load models** requires only a saved endpoint or a preset default; **Test** requires a model. Flow 2 and the button matrix agree.
- **Status enumeration** now uses the real 10 server states, including `remote-off` and `remote-target-missing`.
- **Migrating** no longer claims the host Save can be disabled through a missing `busy` prop; the card guards `onSave` and says so.
- **Chinese wireframes** no longer show `Historian`, `Journal`, `Auto`, `Default`, `baseline`, `timeout` or `API Key` as UI labels; the exception list is explicit.
- Invalid-field focus, snapshot-error retry, Pause outside the disabled fieldset, local vector-space source, preset endpoint behavior, advanced query instruction, fallback Save removal and pre-Save disarm are all documented as T21 requirements.
- T21 must update `docs/dsh-plugin-settings-ui-contract.md` when the legacy seats are actually removed.

## Verdict

The design is ready for a user decision, not yet for implementation. T21 should be created only after the spines and wireframes are accepted.
