---
title: "Offer Load models and Test as soon as the provider draft is remote"
ticket: 38
created: '2026-11-22'
status: built
baseline_revision: '963fe0a'
route: full
route_source: pinned
risk: low
review: quick
review_source: pinned
lenses_ran: []
review_loop_iteration: 0
context: []
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

用户选硅基流动、配好 API Key 后找不到模型下拉：因为切到远程但还没保存时，加载模型/测试连接按钮仍按「已保存状态」藏着。要让这两个动作在草稿 provider 为远程时就出现，按钮本来就会先保存再执行。

## Boundaries & Constraints

**Always:** 只放宽 `load` / `test` 的可见性；`start` / `pause` / `resume` / `rollback` 仍按已保存/已武装状态。已保存远程时行为不变。不改进程内的解析、模型请求或响应解析。

**Never:** 不自动在每次渲染时拉模型列表；不改模型输入框本体；不在本票发版。

| 输入 | 预期 | 未达到时 |
|---|---|---|
| 保存状态 local + 草稿 remote | 加载/测试按钮可见（文案为「保存并加载/保存并测试」），开始重建仍隐藏 | 不通过 |
| 未传草稿标记 | 与旧行为一致 | 不通过 |
| 已保存 remote | 行为不变 | 不通过 |

</frozen-after-approval>

## Code Map

- `src/client/index.js:539-572`：`embeddingActionState`；`remote` 由 `state` 推导，`load/test.hidden = !remote`。
- `src/client/index.js:1747-1761`：调用点，已有 `providerText`。
- `tests/client-pure.spec.ts:687-730, 845-849`：动作矩阵用例，含 local 隐藏断言。
- 复现证据：`_bmad-output/initiative-dsh-magic-context/acceptance-windows-dsh-t38-pending-remote-actions/t38_probe.cjs`（切换草稿后按钮集合无加载/测试）。

## Tasks & Acceptance

- [x] `embeddingActionState` 接受 `remoteDraft`，用 `remote || remoteDraft === true` 控制 `load.hidden` 与 `test.hidden`；其余动作不变。
- [x] 调用点传入 `remoteDraft: providerText === 'openai-compatible'`。
- [x] `tests/client-pure.spec.ts` 增加草稿远程用例（`load.hidden===false`、`load.disabled===false`、`test.hidden===false`、`start.hidden===true`），并保留 local 默认隐藏断言。
- [x] 一次真实 Web gate：本地 profile（`apiKeyEnv` 用默认引用）→ 切远程（不保存 provider）→ 在卡片里保存密钥 → 按钮可见且可点 → 点击「保存并加载」→ provider 写入、假端点收到带认证的模型请求、模型列表成为下拉 → 选模型并保存。
- [x] 报告与 `REPRODUCE.md` 落在本票 acceptance 目录；不重跑 T37 的门禁。

**Acceptance Criteria**

- 草稿为远程时 `load` 可见且可点击，`test` 可见但模型为空时禁用，`start` 仍隐藏。
- 点击后先保存 provider，再加载模型；下拉出现且可选中并写入配置。
- 已保存远程的旧行为不变。

## Implementation Notes

- 2026-11-22 用户反馈「选硅基流动、配好 API Key 后模型 ID 没法选」；在 rc.5 隔离宿主复现为：草稿切换后按钮集合只有刷新/高级/保存密钥/清除凭据，保存后才出现加载模型。
- 密钥字段绑定的是已保存的 `apiKeyEnv`；默认引用本来就非空，所以用户可以在 provider 仍是草稿时先保存密钥，然后卡在找不到模型列表这一步。

## Plan Change Log

## Review Triage Log

## Verification

- `npm test` 作为唯一一轮单测 gate（包含 `tests/client-pure.spec.ts`），不重复跑定向 + 全量两轮。
- 一次隔离 Web gate（假嵌入端点，preset=custom 指向本地假服务）。
- 不改 `src/core/embedding-remote.ts`、不改 `src/dsh/embedding-lane.ts`，因此不重跑模型请求与凭据路径的既有验收。
