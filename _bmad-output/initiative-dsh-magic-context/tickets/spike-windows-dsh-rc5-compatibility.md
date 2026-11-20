---
id: 34
type: spike
title: "Verify Magic Context compatibility with DSH 0.2.2-rc.5 on Windows"
parent: initiative-dsh-magic-context
covers: []
after: []
refined: true
hitl: true
risk: high
---

# 验证 Windows 版 DSH 0.2.2-rc.5 的兼容性

## Description

电脑上的 DSH `0.2.2-rc.5` 跳过了 `@elvisw/dsh-magic-context@0.18.8`。日志显示精确版本豁免未启用。本票只回答：拒载是否仅由版本声明引起，还是在正常加载后也有运行问题？补丁发版决策等待此结论；与 T33 无依赖。

**开工停点：独立票面复核结束后，须收到用户对隔离安装和少量真实模型调用的单独授权。收到前，两者均不得执行；复核通过不等于授权。**

风险高：插件会改写投给模型的上下文，并持久化记忆。额外检查原始工具结果在宿主持久事件中仍然存在，且原始调用没有因取回而重新执行。

## Approach

1. 核对官方 `rc.5` 来源和实际运行版本、npm 上 `0.18.8` 的完整性。复用已有 Windows 隔离做法，新建配置、会话存储及插件数据库。真实模型只读入获准使用的凭据，不把凭据或日常业务数据复制进证据包。
2. 在同一版本的宿主上，用原版包记录一次拒载；再用从 `v0.18.8` 构建的独立本地候选过正常加载检查。候选只给兼容声明追加精确的 `0.2.2-rc.5`，保留旧项；如需用不同的候选版本号避免包管理器复用，须记录它。逐成员比较候选与发布包：除 `package.json` 中上述声明和必要的候选版本号外，有任何差异就停止验收，不能把加载差异只归因于版本声明。
3. 只跑一次最终宿主验收：通过隔离 Windows Web profile 的真实会话，触发一个可追踪的工具结果，回收后取回原文，并写入一条测试记忆；重启同一个隔离宿主后，在合适的项目作用域检索该记录。准备好断言再运行；失败时先区分宿主安装或模型访问问题与插件行为回归，不扩大测试矩阵。

## Acceptance Criteria

1. **区分版本拦截与正常加载。** 已发布的 `0.18.8` 在 `rc.5` 被拒载；本地候选无需豁免即加载，Web 的 Magic Context 设置入口可打开。以精确版本、安装产物摘要和宿主启动记录为证，不以安装退出码作加载凭据。
2. **回收后仍能取回原文。** 通过用户会话看到原结果变成占位符；取回返回新的工具结果，文本与旧结果一致。另从宿主持久事件按原调用标识读出仍保存的原始 `tool/result`；确认原调用没有重跑，旧占位符没有被原位还原。
3. **重启后能检索同一条记忆。** 新宿主进程启动后用检索工具命中测试记录；工具回执与 journal 或数据库的记录 ID 对得上。需要时使用隔离的项目标识区分主动检索和已经注入上下文的内容。
4. **结论与证据相符。** 将结果记入 `acceptance-windows-dsh-t34-rc5/acceptance-report.md`，列出未覆盖项并经独立复核。只有以上检查通过，才建议把精确的 `rc.5` 加入发布兼容声明；如果失败或被环境阻断，则记录首个失败点，声明不变。

## References

- parent — `../initiative-dsh-magic-context.md`
- 宿主 — [DSH 0.2.2-rc.5 发布页](https://github.com/deepseek-ai/deepseek-harness/releases/tag/dsh-v0.2.2-rc.5)
- 发布包 — [@elvisw/dsh-magic-context@0.18.8](https://www.npmjs.com/package/@elvisw/dsh-magic-context/v/0.18.8)

## Notes

- Decision: 2026-11-21 — 仅 Windows `0.2.2-rc.5`；不使用 `allow-version`，也不改日常配置、安装或数据。
- Decision: 2026-11-21 — 独立复核的一项 Critical 和两项 Fix 已写入本票；用户已单独授权隔离安装与少量真实模型调用。
- 不包含其他 RC、Android、完整 UI 回归或生产数据迁移。票据批准不等于允许发布、推送或更新日常安装。
