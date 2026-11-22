---
title: "Say why a remote action is blocked, and tell readers to load models before picking"
ticket: 41
created: '2026-11-22'
status: in-progress
baseline_revision: '7e74e94'
route: full
route_source: pinned
risk: low
review: quick
review_source: pinned
lenses_ran: []
review_loop_iteration: 0
context: []
---

## Code Map

- `src/client/index.js:584-608`：`embeddingBlockReason` 与 `EMBEDDING_BLOCK_KEYS`（本票新增）。
- `src/client/index.js:2060-2090`：`actionInputs`（与 `embeddingActionState` 同一组输入）。
- `src/client/index.js:2470-2530`：`renderModelField`，加载按钮与新的原因行。
- `src/client/index.js:2352-2360`：动作行的原因行（原 `shell.dirty` 专用行）。
- `src/client/index.js:3511` / `3874`：模型字段提示语（中英）。
- `tests/client-pure.spec.ts`：`embeddingBlockReason` 用例。

## Tasks & Acceptance

- [x] `embeddingBlockReason(action, input)`：按 `readonly → busy/progressing/paused → memory → endpoint → dirty → key → model(仅 test)` 返回代码。
- [x] 字段行内渲染原因（`data-mc-model-block`）+ `title`；`saved` 时附「保存」按钮（`data-mc-model-block-save`）。
- [x] 动作行原因改用同一解析（`data-mc-actions-block`），不再只覆盖 `dirty`。
- [x] 中英提示语与 7 个 block 文案加入字典与 `EMBEDDING_COPY_KEYS`。
- [x] 单测覆盖全部代码、优先级与字典键存在性。
- [x] 隔离宿主 gate `t41_ui_gate.cjs` 20 步 0 失败。
- [x] 文档与 CHANGELOG。

**Acceptance Criteria**

- 切到 OpenAI 兼容后，字段行内立刻可读到「先保存当前修改」，并有一个可点的「保存」。
- 保存后未配密钥时，字段行内读到「尚未配置 API Key」，而不是一个无解释的灰按钮。
- 配好密钥后原因消失、按钮可点，加载成功，profile 字节不变。
- 模型提示语讲明「先加载、再选择、列表外可直接填」。

## Implementation Notes

- 先做了只读复现（`t41_probe.cjs`），确认两个阶段的症状不同：draft 阶段有解释但位置错；无密钥阶段完全没有解释。修的是后者与位置，不是「加大超时」这类猜测。
- 原因顺序把「未保存修改」放在「缺密钥」之前：保存是一次点击，输入密钥要打字。
- 保存按钮是显式动作，不是 T40 否掉的隐式保存。

## Plan Change Log

- 独立 diff 复核（`deepseek-flash`）：NEEDS CHANGES。Critical：gate 用可见文本「保存」定位，命中的是宿主 footer 的同名按钮，内联保存的 onClick 完全坏掉也能通过——改为点 `[data-mc-model-block-save="true"]`，并断言该次点击后原因从 `saved` 变为 `key`。Fix 采纳：`paused` 从 `busy` 拆出单独文案（暂停应点继续，加载/探测在途不是迁移）；文档的「disabled remote action always」收窄到 Load/Test（Start 另有 probe/coverage/dimensions 门槛）；Suggest 采纳：补「矩阵禁用 ⇒ 原因非空」的等价性单测（3 种状态 × 64 种开关组合）、表单无效时禁用内联保存、原因行接入 `aria-describedby`。

## Verification

- `npm test`、`typecheck`、`check:i18n`、`build`。
- T41 隔离宿主 gate（23 步）+ T40 隔离宿主 gate 回归（同一批客户端字节）。
