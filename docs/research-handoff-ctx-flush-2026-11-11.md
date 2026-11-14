# 研究增量交接：#15 手动 /ctx-flush

日期：2026-11-11；2026-11-13 随 BMad 部署更新资料路径。**本文件仅交接新增研究，不授权实现、安装、实验、提交或发布，也不表示维护者已接受方案。** 已在进行的任务继续遵守其原有授权；不要自动把 #15 合并进 #13/#14 的工作范围。

> **历史基线说明（2026-11-14）**：本文对象是 `dsh-plugin-magic-context@0.11.1`，其中的“拟议契约”和“未实现”描述属于当时状态。`/ctx-flush` 已在 `0.12.0` 实现并通过宿主验收；当前行为以 `_bmad-output/initiative-dsh-magic-context/acceptance-windows-dsh-2026-11-14-t4-host/acceptance-report.md` 和 `tickets/recovery-contract.md` 为准。本文保留为研究留档，不再作为当前实现状态。

## 1. 资料来源与阅读顺序

规划与研究资料已迁入本仓库 `_bmad-output/initiative-dsh-magic-context/`，由 BMad 管理；`../dsh-magic-context` 仅作归档。从本文件所在目录读取：

```text
../_bmad-output/initiative-dsh-magic-context/acceptance-windows-dsh-2026-11-09/issue-ctx-flush.md
../_bmad-output/initiative-dsh-magic-context/handoff-fork-development/handoff-fork-development.md
../_bmad-output/initiative-dsh-magic-context/acceptance-windows-dsh-2026-11-09/acceptance-report.md
```

先读 #15 正文，再按需要追溯整体交接和验收边界。

迁移前的公开快照仍可作为归档证据（`face7b537063752780e48efe7777d3a828dfded4`）：

- [#15 正文与固定源码依据](https://github.com/elvisw/dsh-magic-context/blob/face7b537063752780e48efe7777d3a828dfded4/_bmad-output/initiative-dsh-magic-context/acceptance-windows-dsh-2026-11-09/issue-ctx-flush.md)
- [整体交接说明](https://github.com/elvisw/dsh-magic-context/blob/face7b537063752780e48efe7777d3a828dfded4/_bmad-output/initiative-dsh-magic-context/handoff-fork-development/handoff-fork-development.md)
- [验收报告](https://github.com/elvisw/dsh-magic-context/blob/face7b537063752780e48efe7777d3a828dfded4/_bmad-output/initiative-dsh-magic-context/acceptance-windows-dsh-2026-11-09/acceptance-report.md)
- [公开讨论 #15](https://github.com/wk544863858/dsh-plugin-magic-context/issues/15)：实施前另查最新回复，不能把留档当实时状态。

两种路径都不可读时先请求材料或访问权限，不依赖本次聊天记忆补全证据。若本地文件已变化，注明实际使用的提交，不将未提交内容冒称为上述固定快照。

## 2. 已核查事实，不等于新功能已实测

- 对象是插件 **`dsh-plugin-magic-context@0.11.1`**，源码基线 `93ef5fe4a06a2c05f53e6a6225346919e860d74e`；本轮交接开始时本地 fork HEAD 仍为该提交。`0.11.1` 不是 DSH 宿主版本；旧隔离实验使用宿主 `0.2.2-rc.1`。
- 已有自动处理 pending 的底层能力，但源码核查未发现 `/ctx-flush` 或等价的用户主动强制落地入口。不能描述为“整个回收功能未实现”。
- `/ctx-status` 读取状态，手动 `/compact` 走 Historian checkpoint；都不是强制处理 pending 的等价入口。
- 原版 `v0.49.30` 已有核心 executeFlush；另核对固定提交 `3c2b53940270b7e020b8ee23e8ce10214430f50e` 的命令文档和 Pi 适配器。核心状态更新还需配合适配器刷新/强制 materialization 信号，变化在下一次模型请求中生效，不是同步清空当前画面。
- 以上 #15 结论仅来自源码/文档核查，未新增真实宿主或模型实验，未实现命令。旧证据校验通过不能当作 #15 测试通过。

## 3. 拟议契约，实施前待确认

目标是让用户明确承担一次缓存失效，以处理**当前会话已经排队的有效项**：

1. 不再等待正常的压力阈值/TTL；不等于触发全局紧急回收，也不额外回收未排队内容。
2. 刷新相关注入缓存，最迟下一次模型请求生效。若命令仅设置下一拍执行标记，回执应区分“已处理”和“待下一次请求落地”。
3. flush 本身不为处理队列而启动新 Historian、recomp 或摘要模型调用；已有后台任务仍按自身策略运行。不要不加区分地调用会扩大回收范围或生成摘要的管理路径。
4. 空队列、重复调用、无会话、无效项及存储失败均返回真实结果，遵守会话与工具配对边界。明确主动失效缓存可能增加后续请求的计费输入。

这是建议，不是已批准的设计。入口、缓存信号、ready compartment 发布边界及兼容性由后续方案明确，不能只新增命令名就宣称完成。

## 4. 与 #13/#14 的边界

- [#13](https://github.com/wk544863858/dsh-plugin-magic-context/issues/13) 是原位恢复后重新入队的状态缺陷。若记录已被 pending 查询排除，仅调用同一个查询的 flush 不会修复它。验证 #15 应从新会话首次正常入队开始，避免混入 restore/requeue。
- [#14](https://github.com/wk544863858/dsh-plugin-magic-context/issues/14) 是 Historian 后独立检索原文的能力建议。flush 不改变 `ctx_expand` 返回语义或历史定位方式，也不承诺解决该问题。
- 本交接不改变原有 #13/#14 的首次接手范围；若用户只授权原任务，先报告 #15 这一独立输入，是否安排开发另行确认。

## 5. 若后续获准开发，应提出的验收

- 在正常阈值/TTL 尚不满足时首次排队，flush 后检查下一次模型请求的实际上下文或宿主事件，确认占位符落地，而不是仅检查成功回执。
- 验证刷新后不复用旧注入；其他会话及未排队项不变，原始事件仍可追溯。
- 单独检查重复/空队列和失败路径；证明 flush 本身未新增摘要模型调用。
- 替身测试注明边界；真实 DSH 测试隔离 config、会话与插件数据库，只使用合成数据。凭据不打印、不复制、不持久化，费用与触发条件单列，不覆盖旧证据。

本轮只需读取、核对当前代码和反馈、报告理解及未决契约；不要据本文件直接开始修改或运行上述验收。
