# Plan — decouple Load models / Test from Save, add 撤销未保存更改

## Files

| File | Change |
|---|---|
| `src/client/index.js` | move the load control into `renderModelField`, delete `saveThen` and both save-coupled label keys, gate the remote actions on `dirty`, add the discard button |
| `tests/client-pure.spec.ts` | pin the new `embeddingActionState` matrix and the discard visibility helper |
| `docs/dsh-plugin-settings-ui-contract.md` | rewrite the "Embedding actions" bullets |
| `docs/configuration.md` | one sentence: load/test read the saved configuration; a pending edit must be saved or discarded first |
| `CHANGELOG.md` | Unreleased entry |

## 1. Predicate (pure, testable)

Add `embeddingRemoteActionsState({ ... })`? No — extend the existing one:

```js
load: { hidden: !showRemote, disabled: busy || progressing || paused || dirty || !writable || !endpoint || !keyOk || !memoryOk }
test: { ... same ... dirty ... }
```

`start` already requires `!dirty`. `rollback` already requires `!dirty`. So only `load` and `test`
gain `dirty`.

Add a tiny helper for the discard affordance so the spec can pin it without a DOM:

```js
function embeddingDraftControls(input) {
  const source = input !== null && typeof input === 'object' ? input : {}
  const dirty = source.dirty === true
  const saving = source.saving === true
  return { discard: { hidden: !dirty, disabled: saving || source.writable === false } }
}
```

## 2. Load control into the model field

`renderModelField` gains a `<button data-mc-model-load="true">` in both branches (select and text),
disabled by `actions.load.disabled`, labelled `settings.embedding.loadModels` ("加载模型"), calling
`loadEmbeddingModels` directly. It stays inside the `#mc-field-embedding.model` container so the gate
can assert containment. `actions.load.hidden` still governs whether it renders at all.

The card-wide action row keeps 刷新 / 测试连接 / 开始重建向量 / 暂停 / 继续 / 回滚到本地. 测试连接
stays in the row: it is a connection test of the whole target, not of one field.

## 3. Remove the save coupling

- Delete `saveThen`.
- `加载模型` → `loadEmbeddingModels` (GET only).
- `测试连接` → `callEmbedding('/mc-embedding/probe', …, { reportProbe: true })` (POST, reads saved config).
- Delete the label branches that chose `settings.action.saveAndLoad` / `saveAndTest`, and delete both
  dictionary keys so the i18n check cannot keep them alive. `scripts/mc-i18n-check.mjs` asserts zh/en
  key parity, so removing from one dictionary without the other fails — remove from both.
- `settings.embedding.savedFirst` stays (it is the reason line, now the only explanation for the
  disabled state).

## 4. 撤销未保存更改

Button next to the status strip (`renderStatusStrip`), rendered only while `shell.dirty` and the form
is writable. `onClick: discard`. Styling: the same transparent-link style as `从列表选择…`
(`MODEL_LINK_STYLE`) so it reads as a secondary escape, not a primary action. `data-mc-discard-drafts`
for the gate.

Wording: keep the user's `撤销未保存更改` — it matches the status strip's `N 项未保存` and cannot be
confused with discarding saved settings. English: `Discard unsaved changes`.

`discard()` already clears `staged`, resets `failed`, and bumps the revision; it does not touch
`embeddingModels`, the key draft, or the messages. Two follow-ups in the same function:
- clear `embeddingKeyDraft` too (a typed key is a draft the reader may want to abandon);
- leave `embeddingMessage` alone — it may describe a completed probe, not an edit.

## 5. Tests

`tests/client-pure.spec.ts`:
- `dirty: true` → `load.disabled === true`, `test.disabled === true`, both `hidden === false`.
- `dirty: false` → both enabled (with the rest of the preconditions satisfied).
- `embeddingDraftControls`: clean → `discard.hidden === true`; dirty → visible; dirty + saving →
  disabled; dirty + read-only → disabled.
- Reuse the existing "no save-coupled labels" assertion? Not present; add one that greps
  `src/client/index.js`? That belongs to the phase-map style checks, not a pure spec. Instead assert
  `SETTINGS_EXTRA_COPY_KEYS` does not contain `settings.action.saveAndLoad` / `saveAndTest`.

## 6. Gate

New root `_bmad-output/initiative-dsh-magic-context/acceptance-windows-dsh-t40-decoupled-embedding-actions/`
reusing the T39 harness (`prepare_t39.py` / `run_t39_host.py` / fake server) with the profile renamed
`t40` and the seed model left empty. Steps:

1. open Settings → Magic Context, provider remote, model empty;
2. `加载模型` is a descendant of `#mc-field-embedding.model`;
3. click `加载模型` → `已加载 3 个模型`; read the profile patch bytes before and after and assert they
   are identical (no implicit save);
4. type into `embedding.endpoint` → `加载模型` disabled, `撤销未保存更改` present;
5. click `撤销未保存更改` → host Save disabled, `加载模型` enabled, endpoint back to the saved value,
   patch still byte-identical;
6. pick a model from the select, click the host Save (the only writer), assert the patch contains it;
7. `测试连接` → success line.

## 7. Docs

- `docs/dsh-plugin-settings-ui-contract.md` §Embedding actions: replace the "Dirty Load/Test are
  labelled 保存并加载模型 / 保存并测试" bullet with "Load models and Test never write configuration; while
  drafts are pending they are disabled and the card shows 先保存当前修改，再执行远程操作。A 撤销未保存更改
  button clears the drafts."
- `docs/configuration.md`: after the picker paragraph, one sentence.
- `CHANGELOG.md` Unreleased: one entry covering the move, the decoupling and the discard button.

## 8. Out of scope

- No `?draft=` route, no server-side draft evaluation.
- No change to Start/Pause/Resume/Rollback semantics beyond the existing `dirty` gate.
- No change to the Android native panels (they have their own action list).
