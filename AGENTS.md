# 项目代理规则

## 子代理模型与成本

- 对任务较重、且不属于研究或规划的子代理任务，优先使用 `deepseek-v4.1-flash`，以降低成本。
- 代码开发和代码评审类任务尤其应尽量使用 `deepseek-v4.1-flash`。
- 研究、规划类任务不受上述模型优先规则限制；按任务需要选择合适的子代理。
- 如果该子代理不可用，或有具体证据表明任务需要其他模型，应说明原因后再选择替代模型。

## BMad 与规划资料

- 本项目已就地部署 BMad：`_bmad/` 是工作流脚本，规划与研究资料在 `_bmad-output/initiative-dsh-magic-context/`。需要规划、研究或构建流程时，先读该 initiative 及对应 ticket，再按 BMad 技能执行。
- 历史研究仓库 `../dsh-magic-context` 仅为归档；资料冲突时以本仓库 `_bmad-output/` 为准。涉及 `/ctx-flush` / Issue #15 时，另有摘要见 [研究笔记](docs/research-handoff-ctx-flush-2026-11-11.md)。
- 规划资料不等于实施授权；安装、真实模型实验、发布和 Git 推送以用户当次指令为准。
