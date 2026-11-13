---
type: initiative
title: dsh-magic-context
parent: none
---

# dsh-magic-context

## 2026-11-10 研究输入与当前边界

- [竞品研究与后续补充](research-context-plugin-landscape/research-context-plugin-landscape.md)：不建议从零重做完整插件，优先验证现成方案和贡献差距。
- [Windows真实DSH隔离验收](acceptance-windows-dsh-2026-11-09/acceptance-report.md)：插件`dsh-plugin-magic-context@0.11.1`、宿主`0.2.2-rc.1`的基础回收/恢复和重启等场景通过，但现有原位恢复路径有requeue缺陷，Historian后旧tag入口不可达；不是完整产品验收通过。
- 上游反馈：[#13](https://github.com/wk544863858/dsh-plugin-magic-context/issues/13)区分现有原位恢复缺陷与“原文作为新工具结果返回”的优先建议；[#14](https://github.com/wk544863858/dsh-plugin-magic-context/issues/14)建议摘要后独立检索原文，不强求旧tag或撤销摘要。已提交不等于作者接受或修复。
- [现有PRD](prd-dsh-magic-context/prd-dsh-magic-context.md)仍是草案，仅补充研究输入和待重评说明。独立移植/贡献上游/受限fork的正式定位、恢复契约和MVP范围尚未重新定案；原有需求、上游版本基线及阶段0计划不因Issue建议自动变更。
- 本次仅同步文档。未重跑模型实验，不改原始证据、测试脚本或产品代码，不新增实施授权。

## 2026-11-10 fork 轻量交接

- 用户已准备相邻的 `dsh-plugin-magic-context` fork；当前先用[轻量交接说明](handoff-fork-development/handoff-fork-development.md)复用本仓库研究，不迁移 BMad、不复制两套规划。
- 已只读核对本地 fork 基线；本阶段仅编写交接资料和核对入口，未修改 fork 或批准插件实现。恢复契约、任务范围及执行授权仍需后续确认；未来是否使用统一 workspace 按持续维护需要再定。

## 2026-11-11 新增功能建议输入

- 已提交 [#15：手动 /ctx-flush](https://github.com/wk544863858/dsh-plugin-magic-context/issues/15)，[源码核查与正文留档](acceptance-windows-dsh-2026-11-09/issue-ctx-flush.md)。插件已有自动队列处理，缺少用户强制处理 pending 并刷新相关缓存的入口；建议最迟下一次模型请求生效，不额外生成摘要，不替代 #13/#14。
- 本次未新增运行验收，不更改原始证据、FR 或阶段0范围。该建议尚待维护者及用户决策，不自动扩展 fork 首次接手或实施授权。

## 2026-11-13 转为自主维护并就地部署 BMad

- 用户决定：不再把作者回应、上游接受或合并 PR 作为目标，改为自主维护本 fork；仍保留选择性吸收上游修复的可能。此方向决定不等于自动授权基线升级、实现、安装、模型实验或发布。
- BMad 已就地部署在本仓库：`_bmad/` 为工作流脚本（仅 `config.toml` 纳入版本管理），规划与研究资料在 `_bmad-output/initiative-dsh-magic-context/`。原先存放在 `dsh-magic-context` 仓库的资料已整体迁入；该仓库转为归档，不再作为权威来源。
- 上文“2026-11-10 fork 轻量交接”中“不迁移 BMad、不复制两套规划”的描述自本节起失效；旧交接文档仅作历史记录。
- 2026-11-13 已完成 `dsh-plugin-magic-context@0.11.2` 的 DSH 隔离基线（T0-B）：安装、同进程/跨进程恢复、跨会话记忆、引擎注册通过；#13/#14 仍复现，8a/8b/8c 未覆盖。T0-A 上游运行取消，上游参考改用既有研究记录。详见 [0.11.2 验收报告](acceptance-windows-dsh-2026-11-13/acceptance-report.md)。
- 当前状态：恢复契约 T1 已签收；T2（#13 A）已 refine，T3（#14 + `message`）、T4（#15）、T5（保留期）待 refine。后续按 BMad 流程逐项实施；0.11.2 可作为 DSH 可用基线，但不宣称历史始终可逆或运行级上游 parity。
- 会话层面的决策、纠错与未决事项整理在[会话与实验历史续接记录](session-continuity-2026-11-13.md)，供新会话快速接续；原始证据仍以验收报告与证据归档为准。

## Notes

- Decision: 2026-11-13 — 当前是 entry 型 initiative，先做 T1（契约），暂不建 epic；T1 签收后再建实现 epic，T2（#13 A）作为 tracer。
- Decision: 2026-11-13 — 不承诺兼容 fork 上游 `dsh-plugin-magic-context` 的既有行为；语义以原版 `cortexkit/magic-context` 为目标。Q1–Q5 已签收：A-only；V1 `tag` + `message`；`tags` deprecated；flush 下一次 preStep；移除 30 天 prune。见 `tickets/recovery-contract.md`。
- Decision: 2026-11-13 — T1 已完成；T2（#13 A）、T3（#14 + `message`）、T4（#15）、T5（保留期对齐）已建票，T2 为 tracer。Q2 的 `message` 拆到 T3，Q5 拆到 T5，交付顺序变化但目标不变。
- 注：T1 完成票内仍写 “T2–T4”，是签收当时的记录；T5 为后续拆分，现行范围以本条与 `tickets/recovery-contract.md` 为准。
- 2026-11-14 — T2（#13 A）完成：全量 76 文件 / 818 用例通过（`evidence/unit-test.txt`），真实 DSH `0.2.2-rc.1` + `deepseek-official/deepseek-flash` 的宿主可观测项 1/2/3a/4/6 通过（结果返回、旧 tag no-op、新 tag 生命周期、跨进程重启）；3b/5/7 仅单元/集成，9/10 不在 T2。独立证据审计后修正了报告结论范围和 T0-B 污染披露。报告：[T2 宿主验收](acceptance-windows-dsh-2026-11-14-t2-host/acceptance-report.md)。T3/T4/T5 待 refine。
