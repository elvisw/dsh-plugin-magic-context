---
title: DSH Magic Context 产品需求草案
template: prd
version: 1.0.0
type: initiative-prd
status: draft
created: 2026-11-07
updated: 2026-11-11
---

# DSH Magic Context 产品需求草案

## Table of Contents

- [Document purpose](#document-purpose)：读者、来源与草案状态
- [Vision](#vision)：解决工具内容导致的上下文膨胀
- [Users and journeys](#users-and-journeys)：用户已描述的使用需要
- [Glossary](#glossary)：原始历史、可见上下文、卸载与恢复
- [Features and requirements](#features-and-requirements)：FR-1 至 FR-8
- [Rules](#rules)：RULE-1 至 RULE-5
- [Non-goals](#non-goals)：不做什么
- [MVP scope](#mvp-scope)：候选首版边界，尚待确认
- [Success metrics](#success-metrics)：SM-1 至 SM-3
- [Change boundary](#change-boundary)：复用和变更边界
- [AI behavior and evaluation](#ai-behavior-and-evaluation)：模型行为与失败边界
- [API contract and versioning](#api-contract-and-versioning)：工具语义与版本基线
- [Decisions](#decisions)：已确认与未确认事项
- [Open questions](#open-questions)：OQ-1 至 OQ-5

## Document purpose

面向后续需求拆分、架构与实现。用户已确认独立维护 DSH 适配层、固定上游版本并尽量复用源码、提示词和测试。本文件是需求讨论草案，不代表已批准实施或已确定全部 V1 范围。

来源：本次用户需求及后续澄清；技术事实由相邻的 `../research-context-lifecycle/` 研究单独提供。源码研究已完成，不等于DSH运行兼容性已经验证。

### 2026-11-10 研究输入与待重评事项

本次仅追加草案状态说明，不修改下文FR、RULE、SM、OQ、版本基线或原有范围。下文保留原始移植草案的语境，**不应据此直接进入实施**。

- 后续已完成[竞品研究补充](../research-context-plugin-landscape/research-context-plugin-landscape.md)及[Windows真实DSH隔离验收](../acceptance-windows-dsh-2026-11-09/acceptance-report.md)。验收对象是第三方插件`dsh-plugin-magic-context@0.11.1`、宿主`0.2.2-rc.1`，不是本项目实现；不代表原有阶段0实施计划已执行。
- [#13](https://github.com/wk544863858/dsh-plugin-magic-context/issues/13)确认的是竞品现有原位恢复路径中的requeue缺陷；优先建议改为独立读取原文、返回新工具结果，新内容按新tag回收。若保留原位恢复，则需修状态转换。不能把旧tag重复回收用例直接用于新语义。
- [#14](https://github.com/wk544863858/dsh-plugin-magic-context/issues/14)是摘要发布后独立原文检索的能力边界确认/建议，不强求旧tag或撤销摘要，也不是已确认违反竞品契约。上游模式差异见验收报告与Issue留档，不自动改变本草案的固定上游版本。
- **待重评，尚未定案：**独立移植、上游贡献或受限fork的项目定位；FR-1/FR-4在不同恢复语义下的验收契约；MVP范围与是否继续原阶段0计划。研究建议优先贡献上游，但对上游的建议不等于本项目已批准的架构或范围变更。本次文档同步不新增或关闭OQ，也不冻结V1。

### 2026-11-11 追加研究输入：手动 flush

已向现成插件提交 [#15：增加 /ctx-flush](https://github.com/wk544863858/dsh-plugin-magic-context/issues/15)，[正文与源码依据](../acceptance-windows-dsh-2026-11-09/issue-ctx-flush.md)。核查插件 `dsh-plugin-magic-context@0.11.1` 已有自动队列处理，但没有发现用户主动强制处理 pending 并刷新相关缓存的入口；原版最迟在下一次模型请求中生效，不是强制生成摘要。此项与 #13 的重新入队缺陷、#14 的归档读取边界独立，本次仅源码/文档核查，未新增运行验收，也不新增 FR、修改版本基线或批准实施。

## Vision

把 Magic Context 的长期上下文管理能力移植到 DeepSeek Harness。首要用户痛点是工具调用内容快速占满编程 Agent 的上下文；核心价值是逐步卸载早期工具内容，并在需要时恢复原文，而非仅生成长期记忆。

复用上游设计与资产，保留缓存感知与跨会话能力的目标；避免因自行重新设计而遗漏稳定编号、工具配对和重启恢复等细节。

## Users and journeys

当前确认的使用者是提出需求的DSH编程Agent使用者；用户已明确计划开源。其他目标人群、发布支持范围和产品成熟度要求尚未确认。

用户已描述的需要：工具内容持续累积时，早期内容能够退出当前模型请求，需要确切细节时再恢复。未虚构具体角色、操作顺序或界面流程。

## Glossary

- **原始历史**：完整的原始消息、工具参数和结果，是恢复的依据。
- **可见上下文**：本次实际发送给模型的内容，不等同于原始历史。
- **卸载**：缩小可见上下文，不表示删除原始历史。
- **恢复**：按稳定引用返回原始内容，不以重新执行工具或生成摘要替代。
- **分区**：Historian 从一段历史生成的分层摘要。
- **项目记忆**：跨会话使用的持久事实，与待办意图和原始历史区分。
- **缓存稳定**：控制前缀改写，不表示提供商缓存永不失效。

## Features and requirements

待按研究证据细化，以下能力来自用户原始需求，不隐含其全部属于首版。

### 可逆工具卸载

- **FR-1**：Agent 可逐步卸载早期工具内容，并按稳定引用恢复对应原文；验收时必须能核对所恢复的调用与结果。
- **FR-2**：支持上游代理驱动缩减与关闭代理参与后的自动管理目标；两种模式的交付次序尚待确定。

### 长期上下文

- **FR-3**：后台 Historian 生成带重要性与多个保真层级的历史分区，使用独立配置的模型；分区渲染不依赖每轮 LLM 调用。

### 捕获与回忆

- **FR-4**：Agent 能跨会话检索项目记忆和原始会话，并按消息或范围恢复确切细节。
- **FR-5**：Historian 在压缩时捕获持久知识；Agent 也能显式维护项目记忆。
- **FR-6**：支持延迟意图笔记及自然边界重新呈现；开放条件 Smart notes 与 Dreamer 的依赖单独处理。
- **FR-7**：支持可关闭的后台搜索提示和选择开启的 Git commit 索引；跨 harness 互通的兼容层级尚待确认。

### 管理界面

- **FR-8**：在 DSH 插件 UI 中逐步提供状态、历史与记忆管理能力，不以独立桌面应用为前置条件。

## Rules

- **RULE-1**：以固定的 Magic Context 上游版本为来源，优先复用设计和资产；宿主差异集中在适配边界。
- **RULE-2**：不得将摘要或重新运行工具的结果冒充原始内容恢复。
- **RULE-3**：缩减不得破坏模型所需的工具调用与结果配对。
- **RULE-4**：后台工作不得无控制地改写缓存前缀；必要重建必须可解释。
- **RULE-5**：本阶段不安装依赖、不修改现有 DSH 配置、不开始产品实现。

## Non-goals

- 不从零另造一套近似 Magic Context 的独立缩减策略。
- 不把所有会话内容永久保留在模型请求中。
- 不承诺不受模型、提供商或宿主影响的永久缓存命中。
- 不将重写存储格式当作完成上下文移植的前提。

## MVP scope

已确认优先价值：FR-1 的可逆卸载闭环。**范围冻结受阻：OQ-1 尚未决定，完整 V1 功能未定。**

[ASSUMPTION: 建议先交付稳定引用、缓存感知缩减、原文恢复与重启一致性，再将 Historian、记忆和 UI 按依赖纳入后续增量；这只是版本切分提议，不是用户已经同意裁掉原始需求。]

用户允许巩固功能在移植复杂时降低优先级、考虑 V2；不是永久排除 Dreamer。Caveman、Git 索引、自动搜索提示和 UI 的具体阶段仍待决定。

## Success metrics

- **SM-1**：在受控的工具输出负载下，可见请求的工具正文占用应低于不启用卸载的基线；反向指标是任务所需证据的恢复成功与定位正确性。具体阈值待测量后确定，关联 FR-1。
- **SM-2**：恢复的工具参数与结果能与归档原文核对，重启后仍指向同一内容；不能以减少上下文为代价返回错误历史。关联 FR-1、FR-4。
- **SM-3**：比较累计模型成本、缓存前缀变化与前台延迟，而非只比较 token 下降；反向指标是请求拒绝、配对错误和无效恢复。阈值尚未设定。

## Change boundary

新增 DSH 适配和必要工具包装，尽量沿用上游核心行为及测试契约。项目隔离、数据库位置与文本存储是三个分开的决策，目前均不假定已经定案。

## AI behavior and evaluation

Agent 标记、自动缩减与 Historian 摘要需要分别评估。原文恢复不得生成不存在的内容；模型摘要不能代替精确工具证据。Historian 失败、预算不足或档案缺失时的具体降级策略留待设计草案及验证结果确认。

## API contract and versioning

目标工具语义沿用上游 `ctx_reduce`、`ctx_expand`、`ctx_search`、`ctx_memory`、`ctx_note`。固定研究来源为 MC `v0.49.40`；本机 DSH 观察版本为 `0.2.2-rc.1`，尚未确定公开支持范围。不得将内部源码别名假称为稳定公共 SDK。

## Decisions

- 用户选择的上游复用路线见 RULE-1，替代只参考功能重写的路线。
- 用户确认项目名称 `dsh-magic-context` 与四问题只读研究计划。
- 存储改造后移，不等于放弃按项目存储或文本存储诉求。
- 用户已同意先编写阶段0验证计划：隔离Windows/已安装DSH、文本/JSON、离线闭环；仅授权规划，不代表完整V1冻结或允许实现。计划见[阶段0计划](https://github.com/elvisw/dsh-magic-context/blob/main/docs/superpowers/plans/2026-11-07-stage0-context-lifecycle.md)（归档研究仓库）。
- 用户已单独授权研究归档、初始化Git与GitHub推送，并明确开源方向；许可证采用MIT。仓库维护授权不等于插件实现授权。

## Open questions

- **OQ-1**：V1 是否先聚焦 FR-1，其他能力按增量交付？由用户在实现计划前确定；阻塞版本范围。
- **OQ-2**：跨 harness 是未来可扩展，还是首版必须与现有 Magic Context 直接互读？由用户在存储定案前确定；影响 FR-4、FR-7。
- **OQ-3**：项目身份在 worktree、克隆和非 Git 目录中如何共享或隔离？由用户在存储设计前确定。
- **OQ-4**：存储需求主要是隔离、可迁移、可编辑，还是 Git 同步？由用户在存储改造前确定。
- **OQ-5**：开源方向和MIT已明确；支持的DSH版本与模型/提供商组合仍待用户在发布范围冻结前确定，不阻塞研究归档。
