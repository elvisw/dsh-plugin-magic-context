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

1. **Load models sits with the model.** The `加载模型` control is rendered inside the `模型 ID` field
   row (next to the text input or the select), not in the card-wide action row. It is visible only
   while the provider is remote (saved or drafted).
2. **No action saves by itself.** `保存并加载模型` and `保存并测试` are gone. `加载模型` and
   `测试连接` always read the saved configuration and never call the settings `mutate`.
3. **Dirty means disabled, with a reason.** While the form has unsaved changes, `加载模型`,
   `测试连接`, `开始重建向量` and `回滚到本地` are disabled and the card states
   `先保存当前修改，再执行远程操作。` — the same sentence the card already shows. They stay visible
   so the reader can see the action exists.
4. **撤销未保存更改.** A `撤销未保存更改` button appears next to the status strip while drafts are
   pending. It clears every draft (the same `discard()` the host calls on unmount), leaves the saved
   profile untouched, and disappears once the form is clean. It is disabled while a save is in flight.
5. **Nothing else moves.** Start/pause/resume/rollback keep their gates, the model picker keeps its
   behaviour, and the probe result line is unchanged.

## Non-goals

- No server-side change: the routes still read the saved configuration only.
- No second Save, no global Reset footer, no confirmation dialog for the discard.
- No version bump in this ticket.

## Verification

- Pure specs pin: `load`/`test` are disabled while `dirty`, enabled when clean; the label keys no
  longer include a save variant; the discard affordance is exposed only while drafts exist.
- One Web gate on the rc.5 host: the `加载模型` button is inside the `#mc-field-embedding.model`
  container; editing any field disables `加载模型` and shows `撤销未保存更改`; clicking it clears the
  drafts, the Save button becomes disabled and `加载模型` becomes enabled again; `加载模型` never
  writes the profile patch by itself.
