## 要解决的问题 / Problem

希望在 Historian 发布摘要、旧节点不再出现在当前上下文后，仍有**独立读取原始历史的入口**。入口可以是持久化 tag，也可以是稳定的消息/事件标识；不要求一定沿用旧 tag，更不要求撤销整段摘要。

在 `dsh-plugin-magic-context@0.11.1` 的 Windows 隔离验收中，同会话回收/恢复、跨进程恢复都通过；但 Historian 将包含占位符的范围替换为摘要后，`ctx_expand` 无法再按旧 tag 恢复原文。

按能力边界确认/改进建议提交，而不是直接认定违反现有契约。README 对可逆 reclaim 和摘要发布均有介绍，但未找到明确说明两者叠加后的恢复范围。以下区分 DSH 已实测现象与原版实现参考。

> 2026-11-10 修订：核对原版后，将诉求从“旧 tag 必须恢复”收敛为“摘要发布后仍可独立检索原文”。原版也有不支持 tag 查询的模式，不能据此声称所有模式都保证旧 tag 可恢复。

## 环境与已观察行为

- Windows，Node.js `v24.21.0`，DSH `0.2.2-rc.1`
- npm 发行包 `0.11.1`，未修改目标插件源码
- 真实 headless DSH、真实 DeepSeek API 和真实后台 Historian；无模拟模型
- 独立 profile、会话库与插件 dataDir；只使用合成测试内容

为排除“恢复后再次回收”的另一问题，本场景使用**全新会话，只做首次 drop，从未 expand 后 requeue**。

复现路径：

1. 读取小型合成 fixture，得到 tag `1`。
2. 调用 `ctx_reduce {"drop":"1"}`，确认占位符已经实际出现在当前上下文。
3. 读取约 27KB 的合成负载；退出并恢复同一会话，推进后台 Historian。
4. 等待真实摘要完成并发布，确认 compartment 的来源列表包含该占位符。
5. 再调用 `ctx_expand {"tags":"1"}`。

实测的宿主事件链（仅事件序号，不含会话正文）：

```text
原始工具结果：event 21
首次 drop 占位符：event 31，发布摘要前在当前上下文中
compartment 发布：event 61，替换 9 个节点
sourceEventSeqs: [12,13,14,19,31,27,29,35,37]
发布后：占位符 31 不再处于当前上下文
ctx_expand(1): not restored: no dropped item carries this tag
原始事件 21：仍存在于宿主原始事件日志
```

**这是现有恢复接口不可达，不是物理原文已删除的证据。**

## 加速条件与验证边界

为以短会话稳定触发该路径，实验调整了：

- 模型 catalog 的 contextWindow：原始约 1M → `32768`
- `policy.executeThreshold: 0`
- `policy.historianProtectedNodes: 1`
- `policy.historianMinNodes: 1`
- `policy.historianTimeoutMs: 45000`
- 禁用宿主 `tool-result-pruner`，排除其他工具结果裁剪的干扰
- 关闭 maintenance、embedding/vector 回填；测试 driver 仅等待 15 秒，让真实异步摘要完成

Historian 实际约 4.281 秒完成，随后发布上述替换。没有伪造 usage、摘要或恢复结果。这验证的是该路径的行为，**不代表默认阈值下的百万 token 长会话、多轮 Historian 或超时恢复已覆盖**。

## 建议的方案 / Proposed solution

### 原版实际如何处理

核查对象是 `cortexkit/magic-context` 的 OpenCode 适配器，固定源码提交 `17801ffd2f9635af1abae893e37914359110f2c1`；也对照了本适配器声明跟进的上游 `v0.49.30` 的工具入口。本段是源码与测试核查，未另行运行原版验收。

- **TypeScript 模式的 tag 路径**：`renderItemByTag` 使用 `getTagById(sessionId, tag)` 查持久化索引，通过所属消息 ID 与工具调用 ID 读取原始工具内容，不要求当前上下文仍有该 drop 占位符。
- **消息/范围路径**：`ctx_expand(message=N)` 或 `start/end` 按消息序号读取历史。**消息序号和 tag 编号不同**；DSH 的事件序号也不能直接当成原版消息序号移植。
- **返回方式**：原文作为新的工具结果返回，不是撤销 compartment，也不是把旧内容重新插回旧位置。
- **Rust 模式例外**：当前工具明确拒绝 tag 查询，因为 Rust 与 TypeScript 的 tag 编号存储不同，混用可能取错内容；拒绝信息提示改用消息序号/范围，测试覆盖了该模式按消息恢复的路径。因此不能把“所有模式都支持旧 tag”当作上游契约。
- **数据确实缺失时**：读取路径会报告不可恢复；若只剩搜索索引文本，降级结果也明确声明不含工具输出，不能将它等同于完整原文恢复。

上游参考（固定提交，避免后续主干漂移）：

1. [tag 定位及原始消息读取：render.ts](https://github.com/cortexkit/magic-context/blob/17801ffd2f9635af1abae893e37914359110f2c1/packages/plugin/src/tools/ctx-expand/render.ts)
2. [模式分派及 Rust tag 拒绝信息：tools.ts](https://github.com/cortexkit/magic-context/blob/17801ffd2f9635af1abae893e37914359110f2c1/packages/plugin/src/tools/ctx-expand/tools.ts)
3. [Rust 模式拒绝 tag、但消息读取仍可用的测试](https://github.com/cortexkit/magic-context/blob/17801ffd2f9635af1abae893e37914359110f2c1/packages/plugin/src/tools/ctx-expand/rust-mode-tag.test.ts)
4. [仅剩搜索索引时的降级声明：search-archive.ts](https://github.com/cortexkit/magic-context/blob/17801ffd2f9635af1abae893e37914359110f2c1/packages/plugin/src/tools/ctx-expand/search-archive.ts)
5. [v0.49.30 的工具入口](https://github.com/cortexkit/magic-context/blob/v0.49.30/packages/plugin/src/tools/ctx-expand/tools.ts)

### 对 DSH 适配器的建议

1. 将“恢复当前 drop 占位符”和“读取摘要覆盖的原始历史”区分为两条语义；可以保留原位恢复，并增加只读历史检索。
2. 后一条路径应能通过持久化 tag 映射或稳定的消息/事件标识，沿宿主原始事件来源链定位内容，不以占位符仍在当前上下文为前提。具体工具名和参数由维护者选择，不要求照搬原版 API 或另存一份重复原文。
3. 结果作为新工具输出返回即可；不要求重建整个 compartment、撤销摘要或改写原历史。
4. 对“首次 drop → Historian 发布覆盖它 → 使用受支持的历史定位方式读取原文”增加回归测试，核验原文一致性及未发生重新执行工具。若 tag 不支持，明确给出可用的其他定位方式，而不是让恢复入口随占位符一起消失。
5. 文档明确哪些定位方式、数据留存条件及内容类型受支持；若原始数据确实已被删除，清楚说明失败或降级，不承诺任意情况下都可完整恢复。

## 备选方案 / Alternatives considered

- 关闭 Historian：可避开本次路径，但失去自动摘要；不等于证明其他压缩路径全部可逆。
- `/ctx-recomp`：文档描述的是重算摘要，不是按旧工具 tag 返回原文，不能直接代替此需求。
- 手动读取宿主原始事件日志：数据仍在，但不属于当前 `ctx_expand` 可直接使用的恢复入口。

## 公开披露

已搜索现有 issue，未找到相同报告。以上仅含合成测试的状态与事件序号，不含密钥、私人会话正文、记忆库内容或本机绝对路径；未上传完整会话归档。
