---
id: 23
type: story
title: Android dsh-go native telemetry and embedding controls
parent: initiative-dsh-magic-context
covers: []
sources:
  - _bmad-output/initiative-dsh-magic-context/research-dsh-go-port-2026-11-16.md
  - _bmad-output/initiative-dsh-magic-context/dsh-go-port/notes.md
companions:
  - _bmad-output/initiative-dsh-magic-context/dsh-go-port/DESIGN.md
after: [22]
refined: true
hitl: true
risk: high
---

# Android dsh-go native telemetry and embedding controls

## Description

在同一个 Magic Context 包中提供 Android dsh-go 的原生上下文状态、详情和远程向量控制。复用已交付的遥测与嵌入能力，不重写宿主 App，不再将手机导航自动化或独立运行时 spike 作为编码前置。用户在候选包阶段配合真机验收；需要真实密钥时由用户自行设置。

## Requirements

Verify: 独立校验票面；本地协议/生命周期测试和既有回归；最终候选包在一台 Android 手机上的一条预定用户路径。模拟嵌入服务与真实模型结论分开，不承诺移动端全矩阵。

1. **同包双呈现**
   **Given** 电脑版和带原生桥接的 Android 本机宿主，
   **When** 加载同一候选包，
   **Then** Android 有一个原生状态条和“上下文”“向量检索”两个面板；没有桥接的电脑端仍正常加载原界面，不引入必需的手机服务。

2. **指标语义与会话隔离**
   **Given** 有会话范围、无会话范围或指标缺失，
   **When** 打开原生面板，
   **Then** 与已有服务端 summary 的同范围数字一致；无会话时明确显示全局，不任选一条会话；未知显示 `—`，不伪造 0、不重复计数。中文、英文覆盖按钮、状态、确认、错误与空态。

3. **订阅与卸载**
   **Given** 状态条/面板订阅后取消、插件卸载或桥接重挂载，
   **When** 生命周期结束或重建，
   **Then** 旧订阅、任务和定时器释放，不累积更新，不提前关闭仍被另一界面使用的遥测服务。

4. **原生配置与密钥边界**
   **Given** App 自带插件配置页，
   **When** 编辑已有配置，
   **Then** 原有默认值、校验和 volatile 生效方式保持不变；补必要的中英说明与分组，不复制桌面 Save 草稿机制。插件只保存密钥环境变量名；文档说明用户自行设置 `$DSH_HOME/.env` 后重启。代理不读取或搬运真实密钥，面板不发送或回显值。

5. **复用向量控制**
   **Given** 当前已生效的远程配置，
   **When** 用户加载模型、测试连接或确认开始重建，
   **Then** 使用同一嵌入 provider 与迁移状态机；模型 ID 来自接口、维度来自探测，无静态生产模型表。模型列表可复制 ID，实际模型字段仍由宿主原生配置修改。仅打开面板或保存配置不自动发起探测/重建。
   **And** 在服务端而非仅按钮层执行拒绝条件：记忆未启用、模型/必要密钥/探测缺失或可检索记忆为 0 时不能开始；底层任务 running/paused 时不能加载/探测。暂停/继续复用原状态。
   **And** 父级监听每次有效 volatile 配置提交；切换 local/off 立即 state-only disarm，不依赖面板订阅或 status 被调用。因此不打开面板的 local→remote 往返也仍需显式开始。

6. **动作时限**
   **Given** 网络耗时、取消、断线或配置目标变化，
   **When** 执行原生动作，
   **Then** 按宿主 deferred/cancel 协议处理；重建快速入后台，不等待整个 pass。异步探测完成后比较完整目标及密钥指纹；取消/目标变化不写缓存，返回取消/`target-changed`，不误报成功或对新目标执行。缓存淘汰键必须来自所写 entry，不能来自变化后的当前配置。

7. **Android 候选包验收**
   **Given** 用户已授权的现有手机、本机引擎、可恢复的配置与独立测试数据/会话，
   **When** 安装最终候选包并走预定路径，
   **Then** 记忆写入后可召回、状态条可进入本会话原生详情、向量操作能完成显式探测与重建；引擎完整重启后测试记忆仍可召回。
   **And** 报告记录实际包身份和运行版本，只覆盖观察到的分支；模拟嵌入不算真实供应商验收，本地 WASM 未通过时只报告实际 FTS 能力。

## Boundaries

- 不改 iOS、Flutter、dsh-go 宿主或其输入法问题；不增加网页岛、工具卡、快捷命令、供应商 SDK、新 HTTP 路由或新数据库 schema。
- 不重跑 T21 的浏览器全套 gate；手机验收只在候选包完成且断言冻结后做一次。文档/报告更正不得触发重建宿主。
- 不清理旧数据，不在日常会话触发回收；安装/恢复范围必须先说明。无 npm 发布、版本 bump 或自动推送授权。
- 不扩展 compaction takeover 范围；不改变 local/openai-compatible/off 默认值、空间隔离、FTS 降级和显式重建门槛。

## References

- parent — `_bmad-output/initiative-dsh-magic-context/initiative-dsh-magic-context.md`，dsh-go 移植调研与计划。
- design — `_bmad-output/initiative-dsh-magic-context/dsh-go-port/DESIGN.md`，手机路径与操作边界。
- research — `_bmad-output/initiative-dsh-magic-context/dsh-go-port/notes.md`，v1.1.0 源码、设备与凭据来源。

## Notes

- Decision: 2026-11-17 — 用户批准上述范围、短设计和实施计划，并要求继续实施；独立校验及定向确认已通过，复用该回执，不再重复票面评审。无发版或推送授权。
- Decision: 2026-11-17 — 用户只有 Android，使用最新版 App 的本机引擎；ADB 已证实 App 1.1.0，不把 main 的接口当发布版能力。
- Decision: 2026-11-17 — 用户允许在现有 `web` profile 测试；随后要求停止偏离重点的实机操作，回到 BMad，候选包完成后再验收。
- Decision: 2026-11-17 — 独立校验发现的服务端门槛与解除激活缺口已核实，实施计划补入同一 lane 的服务端守卫、父级 `loader/volatile-update` 监听及无面板往返测试，不引入轮询或宿主改动。
- Decision: 2026-11-17 — 校验所称“模型 B 使用模型 A 的探测维度”不成立：现有 readCache 按 endpoint/preset/auth/model/dimensions/keyPresent 精确匹配。仍须修复已证实的旧探测返回成功/淘汰当前目标缓存问题，采用 await 后目标与密钥指纹复核；不新增向量身份迁移机制。
- Decision: 2026-11-17 — 候选 `.tgz` 经 ADB 放入 App 可访问的共享目录，再由本机终端执行本地包安装；记录候选 hash 而非冒充已发布新版本。预检只读记忆开关摘要；若未启用，仅在测试插件配置中显式补 `memory.enabled` 与独立数据目录。模拟 provider 通过 `adb reverse` 连电脑临时服务，不使用真实嵌入密钥。
- Risk: 遥测服务生命周期调整可能影响电脑版，原生向量动作可能消耗配额，因此为 high；超出主用户路径的额外检查仅限“无手机桥接仍能加载并正常卸载”的本地生命周期回归。
