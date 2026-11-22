---
title: "Pick the embedding model in the model field itself, and report the connection test"
ticket: 39
created: '2026-11-22'
status: built
baseline_revision: 'bb7f53e'
route: full
route_source: pinned
risk: medium
review: quick
review_source: pinned
lenses_ran: []
review_loop_iteration: 0
context: []
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

用户要求两件事：加载模型后，不要再在动作行下方突然冒出一个下拉框，而是就用原本的「模型 ID」框来选择；点「测试连接」后，界面必须明确显示成功或失败。用户原话是“太莫名其妙了”“没有明显告诉我测试成功还是失败”，所以这次是把两个控件收敛成一个，并给每次连接测试一个可见结果。

## Boundaries & Constraints

**Always:** 模型值只由一个控件承载（`embedding.model` 字段本身）。已保存或已草稿的模型 ID 不在已加载列表里时，字段保持文本框并原样显示该值，不允许因为加载列表而清空或替换。所有按钮文案与结果行都必须中英双语且来自字典。失败原因用中文（英文界面用英文）说明，不只显示机器码。

**Never:** 不改服务端、schema、解析器、凭据或模型列表请求；不在本票发版或改版本号；不为手机端做选择器（宿主是 schema 生成的表单）。

| 输入 | 预期 | 未达到时 |
|---|---|---|
| 远程 + 列表非空 + 已选预设 + 当前值为空 | 字段本身是下拉，首项为 `请选择模型…`，受控值为空（不显示任何模型） |
| 远程 + 列表非空 + 当前值属于列表 | 字段本身是下拉 |
| 远程 + 当前值不在列表 | 字段保持文本框且显示该值 |
| **未选择预设** | 字段始终是文本框，且不出现「从列表选择…」 |
| 选择「手动输入模型 ID…」 | 同一字段变回文本框，可输入自定义 ID，**不写入任何模型值** |
| 文本模式下点「从列表选择…」 | 回到下拉（列表非空时） | 不通过 |
| 改 provider / preset / endpoint / 密钥引用 | 已加载列表清空 | 不通过 |
| 测试连接成功 | 显示「连接成功 · 模型 · N 维 · ms」 | 不通过 |
| 测试连接失败 | 显示本地化原因，未知码才回退 `远程错误: <code>` | 不通过 |

</frozen-after-approval>

## Code Map

- `src/client/index.js:404-409`：`embedding.model` 字段声明（`kind: 'text'`）。
- `src/client/index.js:2006-2021`：卡片底部那个额外的 `model-select`（本票删除）。
- `src/client/index.js:2159-2213`：`renderField`，文本字段走 `SettingsValueField`。
- `src/client/index.js:1373-1401`：`renderSelectField`（现有下拉的样式参考）。
- `src/client/index.js:1827-1847`：`loadEmbeddingModels`（要加「已加载 N 个模型」）。
- `src/client/index.js:1794-1825`：`callEmbedding`（要返回结果而不是只清空消息）。
- `src/client/index.js:690-726`：`embeddingStatusFlags` / `EMBEDDING_STATE_KEYS` 一带，放新的纯函数。
- `src/dsh/go-view.ts:857-912`：`goEmbeddingErrorText` 的错误码 → 文案映射（只读参考，**不改**）。
- `tests/client-pure.spec.ts:593`：`__diagnostics` 解构处，新增纯函数要在这里暴露并断��。
- `docs/configuration.md:49-63`：远程向量说明。

## Tasks & Acceptance

- [ ] 单测覆盖：空值（有预设）为下拉且受控值为空、值属于列表才下拉、值不在列表保持文本、**未选预设始终文本且不出现从列表选择**、手动项不写值、手动模式点「从列表选择…」回到下拉、目标变化清空列表、「加载成功且值为空/属于新列表时退出手动模式」。
- [ ] 新增纯函数 `embeddingModelFieldMode(input)`：输入 `provider`、`preset`、`models`、`value`、`manual`、`picker`，返回 `'text'` 或 `'select'`。仅当 provider 为远程、**preset 非空**、models 非空、`manual !== true`、且 `value` 为空或包含在 models 中时返回 `'select'`；值不在列表时只有 `picker === true` 才返回 `'select'`；其余一律 `'text'`。
- [ ] 新增纯函数 `embeddingModelSelectValue(value)`：下拉的受控值为 `value` 属于列表时取 `value`，否则取空串；空值由下拉第一个 `请选择模型…`（`value: ''`）选项承载，保证受控 select 不会显示未选中的第一项。
- [ ] 未选择预设（`preset` 为空）时：模型字段**始终是文本框**，「从列表选择…」也不渲染——此时没有已选服务，列表不属于任何目标。
- [ ] 新增纯函数 `embeddingProbeResultText(result)`：成功返回 `{ ok: true, textKey: 'settings.embedding.probeResultOk', params: { model, dimensions, latency } }`；失败返回本地化 key 与参数（未知码回退到原码文本）。
- [ ] 新增 `EMBEDDING_ERROR_KEYS` 映射（覆盖 `embedding-lane.ts` 与 `embedding-remote.ts` 实际可返回的全部 code）：`missing-key`、`invalid-key-env`、`auth-failed`、`rate-limited`、`model-not-found`、`bad-request`、`server-error`、`timeout`、`network`、`invalid-response`、`invalid-json`、`dimensions-unsupported`、`dimensions-changed`、`model-substituted`、`input-too-long`、`response-too-large`、`probe-failed`、`models-failed`、`probe-required`、`model-required`、`not-remote`、`memory-disabled`、`busy`、`target-changed`、`cancelled`、`endpoint-required`、`invalid-endpoint`、`blocked-endpoint`、`endpoint-query`、`endpoint-userinfo`、`dns-failed`、`not-ready`、`cache-write-failed`、`state-write-failed`、`already-running`、`paused`、`not-paused`、`already-paused`、`not-running`、`already-complete`、`coverage-missing`；`bad-response` 归到 `invalid-response`；其余返回 `undefined`（调用方回退到原码）。
- [ ] `renderField` 对 `embedding.model` 分支：`select` 模式渲染受控下拉（`value` 取 `embeddingModelSelectValue`），选项为已加载 id + 末尾「手动输入模型 ID…」；选中手动项时只 `setManualModel(true)`，**不 stage**；`text` 模式维持 `SettingsValueField`，列表非空且值不在列表（或处于手动模式）时在字段下方渲染「从列表选择…」按钮，点击 `setManualModel(false)` 并聚焦字段。
- [ ] `manualModel` 为组件内 `useState`。重置规则：provider 不再是远程、列表清空、或加载成功且当前值为空/属于新列表时置 false；provider/preset/endpoint/apiKeyEnv 的草稿或已保存值变化时清空 `embeddingModels` 与 `manualModel`（沿用 T37/T31 的 effect 写法，比较值取 `view(...)` 的当前文本）。
- [ ] 删掉 `renderEmbeddingTools` 里的 `model-select` 块与 `modelOptions`。
- [ ] `loadEmbeddingModels` 成功时 `setEmbeddingMessage(t('settings.embedding.modelsLoaded', { count }))`；空列表保留 `noModels`。
- [ ] `callEmbedding` 改为返回 `{ ok, body }` 且不再无条件清空消息；`测试连接` 分支用 `embeddingProbeResultText` 设置结果行；`loadEmbeddingModels` 与 `callEmbedding` 的 catch 分支把 `fetch` 失败归为 `network`、解析失败归为 `invalid-response`。其他动作（pause/resume/start）行为不变。
- [ ] 结果行加 `data-mc-embedding-result` 属性，值区分 `ok`/`error`，供 gate 断言；成功用 `var(--dsw-alias-state-success-primary, #2a8)` 着色，失败用 warning 色。
- [ ] 补齐字典：`settings.embedding.modelsLoaded`、`settings.embedding.probeResultOk`、`settings.embedding.modelManual`、`settings.embedding.modelPickFromList`、`settings.embedding.error.*`（中英各一套），并加入 `EMBEDDING_COPY_KEYS`。
- [ ] 更新 `docs/configuration.md` 远程向量段与 `CHANGELOG.md` 的 Unreleased。
- [ ] 跑一次 `npm test`、`npm run typecheck`、`npm run check:i18n`、`npm run build`；随后做一次隔离 Web gate，证据放 `_bmad-output/initiative-dsh-magic-context/acceptance-windows-dsh-t39-model-picker-and-probe-feedback/`。T38 的证据目录不改写，报告里注明「底部下拉断言已被本票取代」。

**Acceptance Criteria**

- 加载模型后，模型 ID 字段本身变成下拉，列出假服务端的模型 ID；卡片底部不再出现第二个下拉。
- 选择某个模型后保存，profile 里写入该 ID。
- 「手动输入模型 ID…」把同一字段变回文本框，可以填列表外的 ID 并保存。
- 已保存一个不在列表里的模型 ID 时，加载列表不会把字段变成下拉、也不会清空该值。
- 测试连接成功显示包含模型、维度与耗时的成功行；密钥错误时显示中文原因。

## Implementation Notes

- 用户 2026-11-22 反馈：「加载模型选择菜单要在下面突然出现，太莫名其妙了，应该用原有的模型 ID 这个框」以及「点击测试连接以后，UI 上也没有明显告诉我测试成功还是失败」。
- 用户随后要求改为方案 B：**空值也渲染下拉**，额外放一个「请选择模型…」的空选项；并补充约束——**未选择预设时模型字段必须是文本框**（此时没有已选服务，列表没有归属）。
- T38 的 gate 把“底部出现下拉”写成了断言。T39 不改写该历史证据，只在报告里注明它已被取代，T39 gate 只断言字段形态。
- 空选项是本票的关键约束：受控 `<select>` 在 `value=''` 且没有空选项时会显示第一个选项，而保存值仍为空，用户会以为已选好但保存什么都不写。
- 错误码到文案的映射与手机端 `goEmbeddingErrorText` 保持同义，不共享代码（客户端是纯 JS bundle，手机端是 TS 视图层）。

## Plan Change Log

## Review Triage Log

- 独立票面校验（`deepseek-flash`）：NEEDS CHANGES。两条 Critical 成立，已改：① 空值下拉会显示未被选择的第一个模型（改为带显式空选项的受控值，`embeddingModelSelectValue` 收敛）；② 「手动输入…」哨兵值可能被 `stage` 成模型 ID（改为只切模式、不写值，并加单测）。Fix 全部采纳：目标变化清空列表、手动模式双向回路、错误码覆盖 `model-required`/`endpoint-*`/`dns-failed`/`response-too-large` 等、catch 分支归类为 `network`/`invalid-response`、不改写 T38 历史证据。
- 独立 diff 复核（`deepseek-flash`）：NEEDS CHANGES，无 Critical。Fix 1 忙碌提示继承成功绿色 → 已补 `setEmbeddingResultOk(false)`；Fix 2 切换目标或改模型后残留旧成功行 → 已清空结论行并有 gate 断言 `model-edit-clears-verdict`；Suggest 成功行可能拼出 `null` → 改成按实际返回字段拼段，三者全缺退回「连接成功」。
- 报告独立审计（`deepseek-flash`）：NEEDS CHANGES。Critical 1 「票面说空值保持文本、实现是空值下拉」——用户随后明确要求改成方案 B（空值也下拉 + 「请选择模型…」空选项），票面、计划、报告与实现已全部对齐到 B。Critical 2 「gate 用已删除的 `data-mc-model-select` 找第二个下拉，断言恒真」——已改为按「含 fixture 模型 option 的 select 数量」计数，并断言该唯一控件的 `id` 就是 `mc-field-embedding.model`。Fix：成功行的延迟数字与证据不一致已更正；「目标变化清空列表」「fetch/JSON 归类」补了纯函数单测；宿主启动未 unset `DEEPSEEK_API_KEY` 导致一次真实模型目录请求已在报告披露；`REPRODUCE.md` 补齐宿主与 Playwright 路径依赖及 `t39-pack` 清理；`?token=` 不再写未脱敏副本。

## Verification

- 一次 `npm test`（含新的纯函数用例）、`typecheck`、`check:i18n`、`build`。
- 一次隔离 Web gate（假嵌入端点），覆盖：字段本身变下拉、选择后保存、手动模式、列表外的值不被替换、测试连接成功行、测试连接失败的中文原因。
- 不改服务端与解析器，因此不重跑 T24/T25 的凭据与回填路径。
