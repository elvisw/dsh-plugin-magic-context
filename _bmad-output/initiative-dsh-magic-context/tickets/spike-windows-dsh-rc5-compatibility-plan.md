---
title: '验证 Windows DSH 0.2.2-rc.5 兼容性'
type: chore
ticket: 34
created: '2026-11-21'
status: built
baseline_revision: 'c962b5c5880cc83f64dd25343e5549331a0fd3d5'
route: full
route_source: pinned
risk: high
review: quick
review_source: pinned
lenses_ran: [quick]
review_loop_iteration: 0
context: []
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

分清 `@elvisw/dsh-magic-context@0.18.8` 在 Windows 上是仅被 DSH `0.2.2-rc.5` 的版本检查挡住，还是正常加载后也有回归。用一个只改兼容声明的候选完成一次真实 Web 会话验收。

## Boundaries & Constraints

**Always:** 保留已支持的旧版本；只测试精确 `rc.5`；新建临时宿主、配置、会话及数据库。用户已授权隔离安装与少量真实模型调用，只使用测试数据，不落盘或输出凭据。

**Never:** 不使用 `allow-version`；不改日常安装或数据；不改仓库产品代码或包声明，不推送、不发版，不验其他宿主或手机。

| 输入 | 预期 | 未达到时 |
|---|---|---|
| registry `0.18.8` | 真实加载日志显示版本拒载、无豁免 | 核对装入的包和实际宿主版本；不能用配置 dump 代替加载 |
| 本地候选 | 仅 `package.json` 的 `engines.dsh` 和防缓存所需的候选版本号不同 | 有任何其他成员或清单字段差异即停止 |
| 候选 + 真实模型 | 设置入口正常；完成回收、取回、重启后检索 | 记录首个失败点；区分环境阻断和插件回归 |

</frozen-after-approval>

## Code Map

- `v0.18.8` 指向 `a72f808e3dd7d7983ae139f2c4c9afd603824216`，与 npm `gitHead` 相同。根据 npm `dist.integrity` 核实 tarball 后重打候选，避免重新构建引入无关差异。
- `acceptance-windows-dsh-2026-11-17-t22-wrapup-real/`：复用隔离 Web 进程和浏览器操作方式，不复用旧根、含 token 的日志或截图。
- `acceptance-windows-dsh-2026-11-15-combined-0.12.2/run_combined_scenarios.py`：复用通过原始 `callId`/seq 比较宿主事件的判据，不跑旧矩阵。`/ctx-flush` 后下一条消息才落地。

## Tasks & Acceptance

- [x] `acceptance-windows-dsh-t34-rc5/`：准备两个隔离 profile 根及同一份官方 `rc.5` 安装；用已有合格 Node 24。断言所有宿主及插件数据路径属于本次新根。
- [x] 核查 tarball 成员与清单字段；启动发布版复现拒载，随后启动候选并核对已装字节和 Web 设置入口。非模型预检失败就停止，不花模型调用。
- [x] 用 Web 会话读一次 fixture；从宿主事件取实际 tag，请模型排队回收，通过 `/ctx-flush` 与下一条消息落地。通过 `ctx_expand` 取回原文并写一条独立项目标识的测试记忆。重启隔离宿主，再用 `ctx_memory search` 查同一项目。
- [x] `acceptance-windows-dsh-t34-rc5/acceptance-report.md`：关联脱敏的事件、journal 或数据库证据；独立复核报告。只有通过才建议另行更新兼容声明。

**Acceptance Criteria**

- 给定已落地的占位符，当模型取回时，新的 `tool/result` 回传原文，原始持久事件仍在，原调用未重跑，占位符未被原位还原。
- 给定已写入的测试记忆，当新的宿主进程完成检索时，工具回执命中原记录 ID，并与数据库或 journal 对得上。

## Implementation Notes

- 2026-11-21：用户已批准计划并要求继续。仓库只写本票验收资料；测试安装只在 `%TEMP%/opencode` 新建专用根中进行。分阶段写入已完成检查的证据，环境失败时保留根供续跑，不重复已成功的路径。只发布筛选后的证据（不含任何凭据、含 token 的 URL、私有日志或设备截图）；不执行任何 Git 远端写操作。
- 安装中止：只读检查确认用户主目录的 `package.json` 和 `package-lock.json` 都引用本次试验 tarball，且 `node_modules` 中出现宿主包。保留试验根与安装日志；无可靠操作前基线，不卸载、不重装、不自动回滚。详见 [安装事故与隔离记录](../acceptance-windows-dsh-t34-rc5/acceptance-report.md#6-隔离与主目录)。已取得的 tarball 比对可复用；没有启动 DSH Web 或发起真实模型调用。
- 用户明确不恢复主目录。按原授权从同一试验根的隔离安装续跑，先在不安装、不启动宿主的情况下确认 npm 和 pnpm 的目标、配置、缓存和 store 都不会写入主目录；同时记录已受影响的主目录清单与锁文件的当前摘要，预检和正式验收后核对未再发生变化。不要删除被主目录清单引用的试验包；不要重新打包或重复已通过的比较。无模型预检通过才运行一次正式 Web 门禁；未通过则停止并保存证据。
- 2026-11-21 续跑完成：npm 使用显式 `--prefix`，本次使用的 npm/pnpm 缓存、配置和 store 位于试验根下，主目录三个清单的摘要从事故后基线起未再改变。发布版启动时因版本要求被禁用（`Exact-version exemption: not active`）；候选通过 profile bundle 和 patch 行装载，设置入口可见。真实模型完成 fixture 读取、回收、取回和记忆写入；重启后新进程检索命中原记录。没有重打包、没有 `allow-version`、没有产品代码变更。完整证据与限制见报告。

## Plan Change Log

## Review Triage Log

- 独立只读复核（`deepseek-v4.1-flash`）：PASS WITH CAVEATS。三项技术判定通过；补明首次安装越界与事故后基线、两份包都未经过 `dsh plugin add`、证据为脱敏摘要并收窄预检措辞。均为报告或证据范围修正，不重跑产品验收。

## Verification

- `git diff --check` 无错误；仓库产品字节无变更，不跑旧版本的产品全矩阵。
- 唯一最终宿主验收以启动记录、Web 设置入口、宿主持久事件和重启后的检索记录为准；模型自述不算证据。
- 发布版拒载见 `evidence/release-web-startup.json`；候选设置见 `evidence/web-settings.json`；回收/取回/写入见 `evidence/lifecycle.json`；重启检索见 `evidence/restart-search.json`；主目录摘要见 `evidence/home-isolation.json`。
- `gate.py` 的断言已按 0.18.8 实际形状修正：expand 结果去掉外层新 tag 后与原结果（含原 tag）逐字节比较；这是验收脚本修正，不是产品变更。
- 独立复核已完成；报告中的“通过”仅指上述证据覆盖的 rc.5 Web 路径。
