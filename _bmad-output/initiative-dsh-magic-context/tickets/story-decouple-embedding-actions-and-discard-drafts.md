---
id: 40
type: story
title: "Put Load models beside the model field, stop coupling it to Save, and add 撤销未保存更改"
parent: initiative-dsh-magic-context
covers: [src/client/index.js, tests/client-pure.spec.ts, docs/dsh-plugin-settings-ui-contract.md, docs/configuration.md, CHANGELOG.md, _bmad-output/initiative-dsh-magic-context/acceptance-windows-dsh-t40-decoupled-embedding-actions/]
after: [39]
refined: false
hitl: true
risk: medium
---

# Put Load models beside the model field, stop coupling it to Save, and add 撤销未保存更改

## Description

`加载模型` lives in the generic action row at the bottom of the vector card, far from the field
it fills, and the label changes to `保存并加载模型` / `保存并测试` whenever any draft is pending.
Those two buttons then perform a save the reader did not ask for. The host footer already has a
Save button; a second, hidden save path inside an unrelated action is the coupling the reader
objects to.

Removing the auto-save leaves a second hole: with drafts pending, the remote actions can no longer
run, and the host footer has no Reset, so the reader's only way out of an unwanted edit is to close
Settings and lose everything else too.

## Requirements

1. **Load models sits with the model.** The `加载模型` control is rendered next to the `模型 ID`
   field — inside a new `data-mc-model-field` wrapper that holds the field row, the load control and
   the `从列表选择…` affordance. The `#mc-field-embedding.model` id stays on the input/select itself
   (T39's assertions and the invalid-field focus path both depend on that), so the load control is a
   sibling of the control, not its child. It is rendered only while the provider is remote.
2. **No action saves by itself.** `保存并加载模型` and `保存并测试` are gone. `加载模型` and
   `测试连接` always read the saved configuration and never call the settings `mutate`. The host
   footer Save stays the only writer of field drafts; the key row's own 保存密钥/清除凭据 and the
   rollback confirmation keep their existing direct writes (they are not field drafts).
3. **Dirty means disabled, with a reason.** While the form has unsaved changes, `加载模型`,
   `测试连接`, `开始重建向量` and `回滚到本地` are disabled and the card states
   `先保存当前修改，再执行远程操作。` They stay visible so the reader can see the action exists, and the
   reason line must appear even when the status snapshot has not loaded yet.
4. **撤销未保存更改.** A `撤销未保存更改` control appears immediately after the status strip (a
   sibling, not inside its `role="status"` live region) whenever there is anything unsaved — either a
   staged field draft or text typed into the key input. It clears those drafts, leaves the saved
   profile untouched, and disappears once they are gone. It is disabled while saving and on a
   read-only deployment.
5. **Nothing else moves.** Start/pause/resume/rollback keep their gates, the model picker keeps its
   behaviour, and the probe result line is unchanged.

## Non-goals

- No server-side change: the routes still read the saved configuration only.
- No second Save, no global Reset footer, no confirmation dialog for the discard.
- No version bump in this ticket.

## Verification

- Pure specs pin: `load`/`test` are disabled while `dirty`, enabled when clean; the save-coupled label
  keys are gone from `src/client/index.js` and from `SETTINGS_EXTRA_COPY_KEYS`; the discard control's
  visibility helper is true for a staged draft and for key text alone, false when both are empty, and
  disabled while saving or read-only.
- One Web gate on the rc.5 host: the `加载模型` button is a sibling of the `#mc-field-embedding.model`
  control inside the `data-mc-model-field` wrapper; editing a field disables `加载模型` and shows
  `撤销未保存更改`; clicking it clears the drafts, the host Save becomes disabled and `加载模型` becomes
  enabled again; `加载模型` never writes the profile patch by itself.

## Notes on scope

- `<EXPERIENCE.md>`, `<review-notes.md>` and the 0.18.11 CHANGELOG entry describe the superseded
  `保存并加载` label. They are historical records of earlier tickets; this ticket updates
  `docs/configuration.md` and the settings UI contract, and leaves those files alone.
