---
title: "Make the service preset own the endpoint, and stop showing a key input for local embeddings"
ticket: 37
created: '2026-11-21'
status: done
baseline_revision: 'fc94fad'
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

用户指出两件事：选了「硅基流动」这类服务预设后，接口地址等字段仍要用户填写，预设名不副实；选了本地 MiniLM 后，之前保存过密钥时 API Key 输入行仍然出现，看起来像本地也需要密钥。要让预设决定接口地址与认证头的呈现（默认/空值时由预设固定，只留 API Key 与模型），并把本地的密钥行收成一行「清除已保存的密钥」。

## Boundaries & Constraints

**Always:** 预设为 `siliconflow` 且保存值为空或等于预设默认时，Web 隐藏接口地址与认证头输入，显示固定地址；保存值非默认时必须保持可见并说明「保存值优先，清空后回到预设地址」。运行时解析器不改，升级不得改变任何现有配置的请求目标。预设为空或未知时按解析器同样的归一化处理。本地/关闭时不显示密钥输入。

**Never:** 不改 `src/core/embedding-remote.ts` 的解析语义、不做配置迁移、不静默改道；不新增预设；不改凭据引用的空值语义；不改 dsh-go App；不在本票发版或改版本号；不为本票同时跑定向测试与全量测试两轮门禁。

| 输入 | 预期 | 未达到时 |
|---|---|---|
| 预设 siliconflow + endpoint 为空/默认 | 输入消失，显示只读固定地址 | 不通过，不允许「隐藏但仍可编辑」 |
| 预设 siliconflow + endpoint 非默认 | 输入保留 + 一行「保存值优先」 | 不通过，不允许静默忽略保存值 |
| 预设 custom | 两项可编辑 | 不通过 |
| 本地 + 已存凭据 | 只有状态与「清除已保存的密钥」，没有输入框 | 不通过 |
| 本地 + 字面密钥 | 状态行 + 说明「在 profile 补丁中移除」，没有按钮 | 不通过 |
| 本地 + 无密钥 | 没有密钥行 | 不通过 |

</frozen-after-approval>

## Code Map

- `src/client/index.js:599-624`：`REMOTE_ONLY_EMBEDDING`、`embeddingFieldVisible`；`:1225-1234` 的 `providerText` / `storedKeyPresent` / `specVisible`；`:2224-2230` 分区渲染。
- `src/client/index.js:1947-2044`：`renderSecretField`；`:631-663` `embeddingKeyRowState`（`clearVisible` 目前只对 credential 为真）。
- `src/client/index.js:1665-1671`：`currentEndpoint` / `currentPreset` / `endpointResolvable`。
- `src/client/index.js:1236-1247`：切换 provider 时的草稿剪枝，沿用同一模式处理预设。
- `src/index.ts:1327-1356`：`preset` / `endpoint` / `authHeader` 的 schema 描述（手机端文案）。
- `src/core/embedding-remote.ts:100-160`：解析器现状（本票不改，仅作为归一化与默认值的对照）。
- `tests/client-pure.spec.ts`：`embeddingFieldVisible` 现在按三参调用（约 :94），需同步签名与用例。
- `docs/configuration.md:49-63`：远程向量说明。

## Tasks & Acceptance

- [x] 客户端新增纯函数 `normalizeEmbeddingPreset(value)`：空串→`siliconflow`，`siliconflow`→`siliconflow`，其余（含未知值）→`custom`；与 `resolveEmbeddingConfig` 的 `remote.preset` 结果一致。
- [x] 客户端新增纯函数 `embeddingPresetOwnsTransport(preset, endpoint, authHeader)`：预设归一化为 siliconflow、endpoint 归一化后为空或等于 `https://api.siliconflow.cn/v1`、authHeader 归一化为 `authorization` 时才返回真。endpoint 比较前去掉尾部 `/` 与 `/embeddings`。
- [x] 改 `embeddingFieldVisible(key, provider, keySource, preset, presetOwns)`：远程时，`embedding.endpoint` 与 `embedding.authHeader` 仅在 `preset=own` 时隐藏；本地/关闭时 `embedding.apiKey` 仅在 `keySource` 为 `credential` 或 `literal` 时返回真。`specVisible` 传入草稿优先的 `presetText`。
- [x] 向量卡片补两段文案：预设固定时一行只读「接口地址：https://api.siliconflow.cn/v1（硅基流动预设固定）」/「Endpoint: https://api.siliconflow.cn/v1 (fixed by the SiliconFlow preset)」；保存值非默认时一行「已保存的接口地址优先于预设，清空后才会使用预设地址」/「The saved endpoint takes precedence; clear it to use the preset address」（认证头同理）。
- [x] 切换预设为 siliconflow 且预设接管传输时，剪掉 `embedding.endpoint` / `embedding.authHeader` 的草稿（沿用 `:1236-1247` 的 effect 写法），并在 Notes 记录「会丢弃这两个字段的未保存输入」。
- [x] `endpointResolvable` 改用归一化后的预设：`endpoint !== '' || normalizeEmbeddingPreset(preset) === 'siliconflow'`。
- [x] 改 `renderSecretField`：本地/关闭且 `keySource==='credential'` 时只渲染状态行 + 清除按钮（复用 `clearSecret`）；`keySource==='literal'` 时只渲染状态行 + 「该值来自配置文件，请在 profile 补丁中移除」；`embeddingKeyRowState.clearVisible` 保持仅 credential，避免死按钮。
- [x] `src/index.ts` 的 `endpoint` 描述改为「接口地址（自定义预设）」/「Endpoint (Custom preset only)」，`authHeader` 改为「认证头（自定义预设）」/「Auth header (Custom preset only)」；`preset` 描述去掉「本地不适用」的歧义，改为「服务预设」/「Service preset」。中文标签均在 18 码点内。
- [x] 更新 `docs/configuration.md` 远程向量段与 `CHANGELOG.md` 的 Unreleased：写明硅基流动预设固定地址与认证头、保存的自定义地址优先、清晰说明自定义预设才显示这两项。
- [x] 跑一次 `npm test`（含更新后的 `tests/client-pure.spec.ts`）、`npm run typecheck`、`npm run check:i18n`、`npm run build`；随后做一次隔离 Web gate，证据放 `_bmad-output/initiative-dsh-magic-context/acceptance-windows-dsh-t37-preset-and-key-row/`。

**Acceptance Criteria**

- 给定预设 siliconflow 且保存值为空/默认，Web 上看不到接口地址与认证头输入，只看到固定的只读地址；切到 custom 后两者出现并可编辑。
- 给定预设 siliconflow 但保存了非默认地址，两个输入仍在，并有一行说明保存值优先。
- 给定本地 MiniLM 且已存凭据，页面没有密钥输入，只有一行状态与清除按钮；无密钥时没有该行；字面密钥只显示状态与移除提示。
- 给定远程 siliconflow 配置，`endpointResolvable` 与动作矩阵行为不变；「测试连接」仍请求固定地址。
- 手机端两个字段的说明写明仅自定义预设。

## Implementation Notes

- 本票回应 2026-11-21 用户反馈；用户选择：预设决定 endpoint 的呈现、本地已存密钥只留清除行。
- 解析器不改是本票的关键约束：先前草案让 runtime 忽略保存的 endpoint，会把老用户的自定义地址（可能带自有凭据）静默改发到第三方，已放弃。
- 切换预设到 siliconflow 会剪掉 endpoint/authHeader 的未保存草稿；保存值非默认时字段保持可见，不触发剪枝。

## Plan Change Log

- 2026-11-21：初稿让运行时忽略保存的 endpoint；票面校验指出这会把老用户静默改道到第三方。改为只改呈现层，解析器不动。

## Plan Change Log

## Review Triage Log

- 独立票面校验（`deepseek-flash`）：NEEDS CHANGES。两条 Critical 成立：① 字面密钥没有清除通道，需求 4 不能承诺按钮；② 让 runtime 忽略保存的 endpoint 会把老用户静默改道到第三方。已改为 UI 呈现规则 + 解析器不动；字面密钥改为只显示状态与移除提示。另采纳 Fix：预设归一化、`endpointResolvable`、endpoint 比较归一化、测试签名、gate 目录进 covers、只跑一次测试。

## Verification

- 一次 `npm test` + `typecheck` + `check:i18n` + `build`，不重复跑定向与全量两轮。
- 一次隔离 Web gate（假嵌入端点），覆盖：预设固定时隐藏、切 custom 出现、非默认保存值可见并提示、本地已存凭据只剩清除行、本地无密钥无行、测试连接请求打到固定地址。
- 不改 `src/core/embedding-remote.ts`，因此不重跑 T24/T25 的凭据与回填路径；不改 action matrix 的判定，只改它的输入归一化。
