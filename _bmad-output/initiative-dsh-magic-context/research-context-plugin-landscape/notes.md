# Notes: 上下文插件竞品

## Project context (用于研究问题，不作为外部事实证据)
- README 与 PRD：核心 FR-1 是稳定引用、可逆卸载、恢复归档原文，而非摘要或重新执行工具。
- FR-2 双模式；FR-3 Historian；FR-4 跨会话检索恢复；FR-5 项目记忆；FR-6 延迟笔记；FR-7 提示/Git 索引；FR-8 DSH UI。
- 当前仅研究与规划，无可安装插件；阶段0隔离 Windows/DSH、文本/JSON、离线闭环待实施授权。

## Source digests
研究结果分别写入 digests/；最终来源编号在主报告统一。

## Decision reasoning (分析判断，不是外部事实)
- 是否继续独立实现，取决于剩余用户价值而非旧代码/文档投入；本项目尚无产品代码，切换成本主要是验证已有方案。
- FR-1 已有直接竞品实现和mock闭环测试，继续同名同定位移植将重复承担DSH快速变更、工具配对、缓存调度、持久化恢复等维护。
- 未满足或未证明部分：任意历史/跨会话原文检索恢复、延迟笔记、可验证Windows支持、可选的MC互通。先证明用户需要和现有方案不可扩展，再决定fork或独立项目。
- Windows CI缺失只构成补测试机会，不构成该插件已不兼容的证据。
- 本项目固定MC版本较新不自动形成产品差异；需要指出具体新增能力或修复并验证价值。
- 不把已有竞品“未列出某功能”直接写成源码绝对不存在；按本次已读接口/文档范围标注。

## 2026-11-11 后续源码核查

- 新增 [#15：手动 flush 功能建议](https://github.com/wk544863858/dsh-plugin-magic-context/issues/15)，[正文与固定来源](../acceptance-windows-dsh-2026-11-09/issue-ctx-flush.md)。已有自动 pending 处理能力，缺少显式强制入口；下一请求生效，不是同步清空上下文或生成摘要。
- 不将该能力缺口与 #13 的状态缺陷混同，也不声称它解决 #14。仅补充源码/文档核查，原运行证据和需求基线不变，未修改 fork 或提交本轮资料。

## Process issues
- PowerShell foreach复合命令被portable shell scanner拒绝；改为独立memlog append调用，无产品代码变更。
