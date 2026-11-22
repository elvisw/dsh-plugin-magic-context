---
title: "Put Load models beside the model field, stop coupling it to Save, and add 撤销未保存更改"
ticket: 40
created: '2026-11-22'
status: done
baseline_revision: '508654e'
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

用户要求两件事：把「加载模型」放到「模型 ID」这个框附近；不要把「保存」和「加载模型 / 测试连接」耦合在一起（现在有草稿时按钮会变成「保存并加载模型」「保存并测试」，等于在这些动作里偷偷保存）。

用户问「如果存在草稿未保存、但用户不想保存怎么办」，并选定视线内的口径：两个远程动作**只读已保存配置**、不自动保存，因此需要一个不清空全部设置也能退出的出口——「撤销未保存更改」。

## Boundaries & Constraints

**Always:** 加载模型与测试连接永不写配置；有未保存更改时它们保持可见但禁用，并给出原因；撤销只清未保存的修改，绝不改已保存的配置；所有文案中英双语且来自字典。

**Never:** 不加服务端草稿路由（不改路由签名、不传 draft）；不在本票发版或改版本号；不改 Android 原生面板；不改回滚确认与密钥行自身的直接写入（它们不是字段草稿）。

</frozen-after-approval>

## Requirements

1. **加载模型移到模型字段旁**：与 `模型 ID` 的输入/下拉同级，放一个新的 `data-mc-model-field` 包装里；`#mc-field-embedding.model` 这个 id 仍留在控件本身上（T39 的 gate 断言它，`focusField` 也靠它聚焦），所以按钮是控件的**兄弟节点**。
2. **动作不再保存**：`保存并加载模型` / `保存并测试` 两个文案消失；`加载模型`、`测试连接` 只读已保存配置，永不调用 `mutate`。宿主的「保存」仍是字段草稿的唯一写入口。
3. **有草稿时禁用并说明**：`加载模型`、`测试连接`、`开始重建向量`、`回滚到本地` 在存在未保存修改时禁用且保持可见，卡片显示「先保存当前修改，再执行远程操作。」；状态快照还没返回时这句也必须能显示。
4. **撤销未保存更改**：紧跟在状态栏之后（作为**兄弟节点**，不放进 `role="status"` 的 live region），只要还有未保存的东西（字段草稿**或**密钥输入框里的文字）就出现；清掉它们、不碰已保存配置、清干净后自行消失；保存中与只读部署下禁用。
5. **其余不变**：开始/暂停/继续/回滚的门槛、模型选择器行为、探测结果行保持现状。

## Non-goals

- 不改服务端：路由仍只读已保存配置。
- 不加第二个保存按钮，不加宿主 footer 的全局重置，不为撤销加确认框。
- 本票不发版。
- `_bmad-output/.../ux-settings-redesign/EXPERIENCE.md`、其 `review-notes.md` 与 0.18.11 的 CHANGELOG 条目记录的是已被取代的旧设计，不回改。

## Code Map

- `src/client/index.js:539-576`：`embeddingActionState`，`load`/`test` 要加 `dirty`（`start`/`rollback` 已有）。
- `src/client/index.js:1438-1443`：`discard`，当前 `staged.size === 0 && !failed` 提前返回、不碰 `embeddingKeyDraft`。
- `src/client/index.js:1962-1969`：`shell`，`dirty` 只算 `staged.size > 0`，所以撤销的可见性不能用 `dirty`。
- `src/client/index.js:1323`：`embeddingKeyDraft` 状态。
- `src/client/index.js:2126`：`saveThen`（删除）。
- `src/client/index.js:2196-2211`：动作行里的 load/probe 按钮（移走 load、去掉 `saveThen` 与两处条件文案）。
- `src/client/index.js:2162-2167`：`renderEmbeddingTools` 在 `embeddingStatus === null` 时提前返回，导致脏表单没有原因文案。
- `src/client/index.js:2429-2513`：`renderModelField`，加载按钮与「从列表选择…」的落点。
- `src/client/index.js:2675-2692`：`renderStatusStrip`。
- `src/client/index.js:942-943`：`SETTINGS_EXTRA_COPY_KEYS` 里的两个 save-coupled key。
- `tests/client-pure.spec.ts`：`embeddingActionState` 用例区与 `__diagnostics` 暴露处。
- `_bmad-output/initiative-dsh-magic-context/acceptance-windows-dsh-t39-model-picker-and-probe-feedback/`：可复用的隔离宿主 harness（`prepare_t39.py` / `run_t39_host.py` / 假嵌入服务）。

## Tasks & Acceptance

- [ ] `embeddingActionState`：`load` 与 `test` 的 `disabled` 追加 `|| dirty`；其余不动。
- [ ] 新增纯函数 `embeddingDraftControls(input)`：`{ discard: { hidden, disabled } }`，`hidden = !(dirty || keyDraft)`，`disabled = saving || writable === false`。
- [ ] 删除 `saveThen`；`加载模型` 直接调 `loadEmbeddingModels`，`测试连接` 直接调 `callEmbedding('/mc-embedding/probe', undefined, { reportProbe: true })`；删掉两处 `shell.dirty ? … : …` 文案分支。
- [ ] 从两份字典与 `SETTINGS_EXTRA_COPY_KEYS` 同时删除 `settings.action.saveAndLoad` / `settings.action.saveAndTest`（`settingsCopyKeys` 要求其中每个 key 都已定义，只删字典会红）。
- [ ] `renderModelField` 外层加 `data-mc-model-field="true"` 包装，内放控件 + `加载模型` 按钮（`data-mc-model-load`，`hidden` 由 `actions.load.hidden` 决定，`disabled` 用 `actions.load.disabled`），`从列表选择…` 也收进同一个包装。
- [ ] 新增 `discard` 的可用性判定（`staged.size > 0 || failed || embeddingKeyDraft !== ''`），清空 `staged`、`failed`、`embeddingKeyDraft` 并 bump 一次 `revision`；不碰 `embeddingModels`、`embeddingMessage`。
- [ ] 状态栏之后渲染 `撤销未保存更改`（`data-mc-discard-drafts`，次级链接样式），可见性/禁用来自 `embeddingDraftControls`。
- [ ] `renderEmbeddingTools` 的 `embeddingStatus === null` 分支：仍渲染原因行（脏时），让禁用有解释。
- [ ] 字典新增 `settings.embedding.discardDrafts`（中英），加入 `EMBEDDING_COPY_KEYS`。
- [ ] 文档：`docs/dsh-plugin-settings-ui-contract.md` 的 Embedding actions 段、`docs/configuration.md` 的向量段、`CHANGELOG.md` 的 Unreleased。
- [ ] 单测：`dirty` 时 load/test 可见但禁用；clean 时可用；`embeddingDraftControls` 四种输入；`settingsCopyKeys` 不再含两个 save-coupled key。
- [ ] 跑 `npm test`、`typecheck`、`check:i18n`、`build`；再做一次隔离 Web gate，证据放 `_bmad-output/initiative-dsh-magic-context/acceptance-windows-dsh-t40-decoupled-embedding-actions/`。

**Acceptance Criteria**

- `加载模型` 与 `模型 ID` 控件在同一个 `[data-mc-model-field]` 包装里，不再是卡片底部动作行里的按钮。
- 单独点 `加载模型` 只发只读请求，profile 补丁字节不变。
- 编辑任意字段后：`加载模型` 与 `测试连接` 变灰但可见，卡片出现「先保存当前修改，再执行远程操作。」，状态栏后出现「撤销未保存更改」。
- 点「撤销未保存更改」后：宿主的保存按钮变灰、`加载模型` 恢复可点、字段回到已保存值、补丁仍逐字节不变。
- 只在密钥输入框打字时，「撤销未保存更改」也出现，点击后输入框清空。
- 从下拉选一个模型并用宿主保存后，profile 里出现该 ID；随后 `测试连接` 给出成功行。

## Implementation Notes

- 用户 2026-11-22：「请把`加载模型`这个按钮放到`模型 ID`这个框附近，还有`保存并加载模型`，`保存并测试`这种功能上的耦合莫名奇妙，不要这么耦合，分开它们。」
- 用户随后追问草稿出口，选定文案「撤销未保存更改」。
- 关于「按钮变灰而不是隐藏」：T38 修的就是「按钮不出现」，再隐藏会退回那个问题；禁用 + 原因行才能说明它存在但暂时不能用。
- `embeddingKeyDraft` 不进 `staged`，所以 `shell.dirty` 对它为假；撤销的可见性必须用独立谓词，否则「只输了密钥」时按钮不出现，而计划里又要清它——这条是独立校验指出的 Critical 3。
- gate 的步骤顺序有讲究：改 endpoint 会清空已加载列表（T39 的目标键 effect），所以撤销之后要重新加载一次再选模型；不能沿用「撤销后直接选」。

## Plan Change Log

## Review Triage Log

- 独立票面校验（`deepseek-flash`）：NEEDS CHANGES。三条 Critical 成立：① `#mc-field-embedding.model` 是控件本身不是容器，按钮无法「在它内部」（改为 `data-mc-model-field` 包装 + 兄弟节点）；② gate 步骤顺序自相矛盾（改 endpoint 清列表后不能直接选模型，中途要重新加载）；③ `discard()` 不清 `embeddingKeyDraft` 且它有 `staged.size === 0` 提前返回，撤销对「只输密钥」不可达（改为 `unsaved()` 谓词 + 清 key 草稿）。Fix 采纳：删 key 必须同时删 `SETTINGS_EXTRA_COPY_KEYS`（否则 `settingsCopyKeys` 与 i18n 检查都红）；「宿主 footer 是唯一写入口」改为「字段草稿的唯一写入口」；`formLabels` 本来就没有 `reset`；Suggest 采纳：撤销按钮不能放进 `role="status"` 的 live region，脏表单且无状态快照时也要有原因行。
- 独立 diff 复核（`deepseek-flash`）：NEEDS CHANGES。两条 Critical：① `discard()` 不复位 `modelPickerForced`，强制下拉后撤销会显示空下拉（已复位 `manualModel` 与 `modelPickerForced`，并新增 `discard-drops-forced-picker` 断言）；② 「点加载后补丁不变」在干净表单上是空转证据（保留字节断言，但把「没有隐式保存」的保证归因到脏态禁用那几步，报告措辞已改）。Fix 全部采纳：两个按钮断言精确可见文本（防字典键删除后回退成原始 key）、`load-is-not-inside-the-control` 同时要求控件存在、撤销把密钥保存中的忙碌态也算禁用、成功/失败行断言收紧到 `16 维`/`\d+ ms`/`检查密钥是否有效`、console error 计入失败、新增 `evidence/provenance.json` 绑定 tarball 与源码字节。
- 复核修复后的只读复校（`deepseek-flash`）：CLOSED，七项全部关闭，无新 Critical。唯一观察是「只有密钥草稿时撤销也会复位模型字段的视图标志」，属视图复位不丢数据，不改。

## Verification

- 一次 `npm test`（含新的纯函数用例）、`typecheck`、`check:i18n`、`build`。
- 一次隔离 Web gate（假嵌入端点、DSH `0.2.2-rc.5`）：51 步 0 失败、0 console error，覆盖加载按钮位置、无隐式保存、脏态禁用与原因行、撤销清空草稿（含密钥草稿与强制下拉）、选模型后保存、测试连接成功与失败。

