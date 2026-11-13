# 会话与实验历史续接记录（2026-11-09 ~ 2026-11-13）

> **性质：**本文是根据本会话的历史摘要与仓库内既有资料整理的**重建稿**，不是逐字聊天记录，也不替代原始证据。事实细节以文中链接的验收报告、证据归档和 Issue 留档为准；两者冲突时以原始资料为准。
>
> 用途：让在 fork 仓库中新启动的智能体快速了解“做过什么、验证到什么程度、为什么这样决策、哪些还未做”。

## 1. 时间线

| 日期 | 阶段 | 结论/产出 |
|---|---|---|
| 2026-11-09 | 竞品与上游调研 | 现有插件 `dsh-plugin-magic-context` 已有真实交付；不建议按“大而全的 DSH 版 Magic Context”从零重做。见[竞品研究](research-context-plugin-landscape/research-context-plugin-landscape.md)。 |
| 2026-11-09 | Windows＋真实 DSH 隔离验收 | 在独立临时工作区，用 DSH `0.2.2-rc.1`、Node `24.21.0`、插件 `dsh-plugin-magic-context@0.11.1`、真实 DeepSeek 模型执行。精确恢复、跨进程恢复、跨会话记忆通过；复现两处缺陷。见[验收报告](acceptance-windows-dsh-2026-11-09/acceptance-report.md)。 |
| 2026-11-09 | 上游反馈 | 提交 [#13](https://github.com/wk544863858/dsh-plugin-magic-context/issues/13)（requeue 缺陷）与 [#14](https://github.com/wk544863858/dsh-plugin-magic-context/issues/14)（Historian 后原文检索）。 |
| 2026-11-10 | 对照原版 | 核对 `cortexkit/magic-context`：TypeScript 模式下 `ctx_expand` 从持久化历史读取原文、作为**新的工具结果**返回；Rust 模式拒绝 tag 查找。据此重写 #14，不要求撤销摘要。 |
| 2026-11-10 | 澄清 #13 | 插件 `0.11.1` 采用**原位替换**恢复（同一上下文位置），因此“再次回收旧 tag”有意义；缺陷在状态迁移（`landed_event_seq` 未清空）。#13 改为按插件语义描述。 |
| 2026-11-10 | 文档同步 | 把 #13/#14 的修订同步回验收报告、notes、REPRODUCE、竞品研究、PRD/initiative，并校验链接与证据。 |
| 2026-11-11 | #15 功能建议 | 源码核查确认无 `/ctx-flush` 或等价手动入口；提交 [#15](https://github.com/wk544863858/dsh-plugin-magic-context/issues/15)，[正文留档](acceptance-windows-dsh-2026-11-09/issue-ctx-flush.md)。 |
| 2026-11-13 | 方向调整 | 作者未回应公开 Issue，且已发布 `0.11.2`；改为**自主维护 fork**，不再以合并上游为前置条件。 |
| 2026-11-13 | 工作流迁移 | BMad 就地部署到 fork；全部规划/研究资料迁入本仓库；研究仓库转为归档。 |

## 2. 已验证事实（仅对 `dsh-plugin-magic-context@0.11.1` + DSH `0.2.2-rc.1`）

以下各项均有宿主事件或哈希证据，详见[验收报告](acceptance-windows-dsh-2026-11-09/acceptance-report.md)与[复现说明](acceptance-windows-dsh-2026-11-09/REPRODUCE.md)：

1. **同一进程精确恢复**：`ctx_reduce` 后原文变为占位符，`ctx_expand` 恢复为原文；恢复前后 SHA-256 与消息身份一致。
2. **跨进程恢复**：退出并重启 DSH、同时修改磁盘上的测试文件后，恢复内容仍与原始一致，证明来自持久化历史而非磁盘。
3. **跨会话边界**：新会话能读取项目记忆，但不能用旧会话的 tag 取回原始工具输出。
4. **引擎互斥**：两个压缩引擎同时启用时，本机运行为 MC 先注册、宿主引擎未激活；进程正常退出，但这不构成安全回退。
5. **缺陷：恢复后再次回收不落地**：`ctx_reduce` 返回 `Queued`，但同一 tag 不再进入 pending。根因在存储层未在重新入队时清空 `landed_event_seq`，有独立复现脚本。
6. **缺陷/边界：Historian 发布后旧 tag 不可达**：原文仍在宿主原始事件中，但插件当前 API 无法通过旧 tag 取回。

**未验证：**以上结论不覆盖 `0.11.2`。仓库虽已同步 `0.11.2` 的两个上游跟进提交，但尚未在本机做隔离验收。

## 3. 决策与理由

- **不重做完整插件**：现成插件已有可运行实现与测试，重做成本高且没有已被证明的独特卖点。
- **先验收再判断**：不把作者文档当运行证据；恢复、重启、跨会话、引擎冲突均以真实宿主事件核验。
- **向上游报告而非静默分叉**：#13/#14/#15 都附固定源码、最小复现与版本边界，便于作者复核。
- **改为自主维护**：公开 Issue 多日无回应，上游继续发布版本；目标转为自用可控，同时保留选择性吸收上游修复。
- **BMad 就地部署在 fork**：一个产品一个项目边界；避免装在 `plugin/` 父目录导致其他仓库误命中 `_bmad`。研究仓库只留归档。

## 4. 纠错与经验

- **版本措辞**：必须写完整包名与版本（如 `dsh-plugin-magic-context@0.11.1`），不能把插件行为写成“DSH 0.11.1”。
- **恢复语义**：原版是“读取原文并作为新结果返回”，插件 `0.11.1` 是“原位替换”；两者的再次回收含义不同，描述前必须核对实现。
- **能力边界不是缺陷**：Historian 后旧 tag 不可达，先作为边界确认与功能建议，不冒称 bug。
- **区分已验证/已建议**：Issue 中的新语义是建议，不是作者已接受的契约；文档中不能写成已实现。
- **模拟模型要标注**：任何由本地模拟模型驱动的步骤都与真实模型验收分开记录。
- **外部交付物改动要回写本地文档**：Issue 措辞调整后同步 PRD、验收报告与研究记录。

## 5. 未决事项与建议顺序

1. `0.11.2` 基线评估：对照 `0.11.1` 的差异，在隔离环境重跑关键验收（恢复、重启、requeue、Historian 边界）。
2. 按 BMad 流程把 #13/#14/#15 拆成 ticket；先定恢复契约（原位修复 vs 对齐原版结果返回），再实施。
3. #15 的 flush 需要明确缓存刷新信号与“下一次请求生效”的回执语义。
4. 自维护发布策略：包名、版本、发布凭据、与上游的同步节奏均未定。

## 6. 资料索引

- 验收与证据：[acceptance-windows-dsh-2026-11-09/](acceptance-windows-dsh-2026-11-09/acceptance-report.md)
- Issue 正文留档：[#13](acceptance-windows-dsh-2026-11-09/issue-requeue.md) · [#14](acceptance-windows-dsh-2026-11-09/issue-historian-recovery.md) · [#15](acceptance-windows-dsh-2026-11-09/issue-ctx-flush.md)
- 竞品与跨 harness 研究：[research-context-plugin-landscape/](research-context-plugin-landscape/research-context-plugin-landscape.md)
- 固定版本源码研究：[research-context-lifecycle/](research-context-lifecycle/research-context-lifecycle.md)
- 需求与范围：[PRD 草案](prd-dsh-magic-context/prd-dsh-magic-context.md) · [initiative](initiative-dsh-magic-context.md)
- 旧交接机制（历史）：[handoff-fork-development/](handoff-fork-development/handoff-fork-development.md)

## 7. 授权边界

本文只记录历史与未决事项，不构成实施、安装、模型实验、发布或 Git 推送的授权；这些动作仍以用户当次指令为准。
