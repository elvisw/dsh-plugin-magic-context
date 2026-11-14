# 更新日志 / Changelog

本文件记录本仓库面向公众的版本变更，格式遵循 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)，
版本号遵循 [Semantic Versioning](https://semver.org/lang/zh-CN/)。

这是一个 **DeepSeek Harness（DSH）适配器**仓库，不是 magic-context 本体：它把
[magic-context](https://github.com/cortexkit/magic-context)（MIT，Copyright (c) 2025 Ufuk Altinok）
的上下文管理与记忆能力移植到 DSH 的插件 / surface 体系上。代码出处、被 vendored 的第三方文件与
钉住的上游 revision 见 [NOTICE](NOTICE)；上游自身的变更历史请见上游仓库。

## [0.12.1] - 2026-11-14

### Changed

- 文档：README（中英文）新增本 fork 与上游 `wk544863858/dsh-plugin-magic-context` 的差异说明，并在“出处与许可 / Provenance & license”补充上游 `wukai` 与 `magic-context` 的版权；`NOTICE`、`LICENSE` 同步。无代码、schema 或运行时行为变更。

## [0.12.0] - 2026-11-14

**恢复语义与原版对齐。** 这个版本把上下文恢复从 fork 的“原位改写”改成原版 Magic Context 的“读取持久历史、作为新的工具结果返回”，补齐 Historian 覆盖后的原始 seq 读取与手动 `/ctx-flush`，并移除按时间删除 tag 的 fork 私有保留策略。`ctx_expand` 的行为变更是 breaking：旧 tag 不会被复活；需要继续缩减时，对新结果重新 `ctx_reduce`。

### Added

- `ctx_expand` 的 `message` 定位：接受当前会话的 DSH log event seq（含被 Historian shadow 的原始 `tool/result`），与 `tag`/`tags` 互斥；`[compacted §C…§]` 节点被拒。
- `/ctx-flush` 斜杠命令：把当前会话已 pending 的 drop 标记为下一次 preStep 落地，回执区分本次新标记、此前已标记与 `pendingNext` 上界；不启动 Historian、recomp、摘要或模型调用。
- `pending_drops.flush_requested`（schema v11）；v10 库自动迁移。

### Changed

- npm 包名迁移到 `@elvisw/dsh-plugin-magic-context`。Cordis loader row id 仍为 `magic-context-dsh`，settings namespace 与插件数据目录不变；安装新包前需要移除旧的 `dsh-plugin-magic-context`。
- **Breaking:** `ctx_expand` 不再原地恢复占位符，也不再改写旧事件；它读取持久化的原始 `tool/result`，作为新的工具结果返回并分配新 tag。旧 tag 保持 dropped；再次 reduce 旧 tag 是 no-op（`already dropped`）。
- `ctx_expand` 正式参数为单值 `tag`；旧 `tags` 逗号/区间多 tag 形式保留为 deprecated 别名，下一 major 移除。多 tag 结果用 `\n\n---\n\n` 合并，并按请求顺序返回。
- `ctx_expand` 成功返回 `{ok:true, restored:[tag], refused:[], content}`；失败返回 `{ok:false, restored:[], refused:[], reason}`，不再显示 “restored 0”。
- §N§ tag 注册表不再按 30 天 TTL 删除；删除 `tags.retentionDays` 与 `AdapterStores.pruneTags`。旧 profile 中的 `tags.retentionDays` 会被忽略，且每进程最多告警一次；`journal.retentionDays` 不变。当前适配器没有自动的消息/会话删除路径，消息/会话删除与 compaction 状态保留仍是契约目标，不是现状。
- `/ctx-flush` 在 `pre-step` 的独立 flush lane 落地，不在管理拍；同轮 execute 的 force band 会看到 flush 后的 stale 压力读数，避免按旧读数二次回收未标记内容。

### Fixed

- 旧 tag 在 restore 后再次 `ctx_reduce` 不再显示 “Queued” 假回执：drop 状态以持久化 `pending_drops` 为准，历史占位符离开 surface 后仍能判定 `already dropped` / `already queued`。
- Historian 发布 `[compacted §C…§]` 覆盖占位符后，仍可通过 `message` 从原始日志读取原文；不重跑原工具、不改写摘要或 compartment。
- `ctx_expand` 的多 tag 别名按请求顺序拼接，不再被范围解析的升序排序打乱。

## [0.11.2] - 2026-11-11

**后台车道不再会静默停摆。** 跟进上游 magic-context v0.49.50（区间 v0.49.30→v0.49.50，375 个非 merge
提交）后，修掉三处我们自己代码里成立的缺陷：维护车道可能因一次不返回的模型流而永久停摆、verify 的
`skip` 判定不留痕导致候选池原地打转、压缩后仍拿过期压力读数二次丢弃上下文。

### Fixed

- **维护车道不再可能静默永久停摆**：verify 与画像评审的模型调用此前没有任何墙钟上限，而维护定时器
  的 interval 是在**首个 tick 的 `finally`** 里才安装的——一次永不 settle 的 provider 流会让 TTL 过期、
  记忆 verify、画像评审、向量回填在本进程生命周期内全部停摆，且面板只显示「从没跑过」。现在两个调用
  各带 120 秒预算（`withDeadline`：abort 释放连接 + `Promise.race` 兜住不响应 signal 的 seam），调度
  改为在首个 tick 之前就装上 interval，并额外记录「单次 tick 超过一个 interval」的 warn 行。
- **verify 的 `skip` 判定会被记住**：模型判定「仅凭文本无法判断」的行此前只会计数、不落任何状态，而
  候选池固定取 16 行 unverified——一旦累积到 16 条这样的行，每 tick 都会重复提问同一批、新记忆永远
  得不到判定，且每次都付一次模型调用。现在 skip 以内容哈希记进 `metadata_json`（状态仍是 unverified，
  skip 属于不确定而非结论），扫描时跳过已记住的行；内容一经修改（含 stale 重写、人工编辑）哈希失配，
  该行自动回到池中。
- **force band 不再对过期的压力读数二次丢弃**：使用量读数描述的是 provider 实际服务的那份 prompt，一旦
  压缩写入 compartment 或基线重冻，那份 prompt 就不存在了。此前读数不会因此作废，压缩后的下一步仍可能
  按旧百分比再丢一批本可保留的工具结果（不可逆）。现在读数早于最近一次历史变更时，force band 只记一行
  `skipped-stale-reading` 审计、不再回收；execute 决策仍照旧使用该读数（没有更新的信号可用）。

### Changed

- 文档口径校正：`maintenance.ts` 顶部关于上游 dreamer 扫描范围的说明已按上游 v0.49.50 更正（上游也只扫
  宿主进程已打开的项目）；`policy.ts` 把「缓存过期即进入 execute 带」显式标注为**已论证的分歧**——上游
  v0.49.44 移除了该分支，理由是重建会丢 signed thinking 并提前折叠 m[0]，而这两项成本在 DSH 侧都不存在，
  且适配器没有 `/ctx-flush` 等价杠杆来手动落地排队中的 `ctx_reduce`。

## [0.11.1] - 2026-11-07

**设置卡片目录自检。** 修复卡片把有效路由钉误标为 `(not in catalog)`：移除或改名 provider
后打开设置卡片，不会再拿过期目录比对配置值。

### Fixed

- 设置卡片不再把有效路由钉误标为 `(not in catalog)`：卡片挂载时若模型目录缓存已超过 60 秒
  就先重读一次宿主目录（`ensureFresh`）。此前目录只在 `llm/models-updated` /
  `connection/reset` 事件到达时刷新，卡片若错过事件（例如在移除/改名 provider 之后才打开），
  就会拿旧目录比对配置值，把实际存在的 `zth-anthropic/deepseek-flash` 标成不在目录中。
  事件驱动的即时刷新语义不变，只是补上了「打开时自检」这一层。自检阈值提为命名常量
  `MODEL_CATALOG_MAX_AGE_MS`（60 秒），便于按部署节奏调整。

## [0.11.0] - 2026-11-06

**设置卡片路由钉与门面重排。** 两类后台生成路由（维护 verify 与生成 historian）可以在设置
卡片里从宿主模型目录直接钉住或清空；画像评审的「无事可做」跳过改为每天一条 journal 心跳；
README 双语门面按「30 秒可装 → 5 分钟可感」重排并配实拍截图。

### Changed

- README 门面吸引力重排（双语同步）：npm registry 一行安装前置（源码构建降为开发子节）、
  新增「快速上手」（含 `ctx_reduce` → `[dropped §N§]` → `ctx_expand` 真实参数示例）、英文版
  补痛点引子与状态行、移除首段指向 DSH 的失效链接记号（DSH 无公开仓库页）、新增 npm version
  badge、能力表机制列短语化（镜像链/水位/内部日期细节下沉）、修正「`memory: {}` 才启用记忆
  车道」的过时说法（0.9.0 起默认开启，退路为 `memory.enabled: false`）、去除硬编码版本号与
  用例数；「界面与遥测」一节插入设置卡片与遥测胶囊面板实拍截图（`docs/img/`，README 用
  raw.githubusercontent 绝对 URL 引用，npm 页面可渲染且不增包体积）。
- 画像评审 pass 的「无事可做」跳过不再静默：`no-candidates` / `too-few` / `too-few-sessions`
  现在各打一条 info journal 心跳行，并同时写 24h 节流戳（`profile_last_review_at`）——每天恰好
  一条评审记录，journal 里的安静不再可能被误读为「车道死了」，也顺带消除了 `too-few-sessions`
  在池长期单会话时每 30 分钟重复打日志的隐患。失败类跳过（`llm-off` / `llm-failed` /
  `invalid-output`）语义不变：不写戳、下个 tick 重试。
- README 拆分为双语：`README.md` 默认英文完整版，`README.zh-CN.md` 中文完整版，顶部互链；
  门面重写为记忆优先的叙事（项目记忆/本地向量/共享域在前，上下文管理在后），版本与测试数据
  同步刷新（0.10.1 / 上游 v0.49.30 / 宿主 0.2.2-rc.1 / 782 用例）。

### Added

- 设置卡片新增**两档生成路由钉**（维护 / 生成两类，均成对生效）：
  - `maintenance.verifyProvider` / `verifyModel` — 元数据类后台（verify/评分/自动归档分类/画像审阅）；
  - `historian.provider` / `model` — 生成类后台（historian 带外摘要 + `/compact` 摘要，此前只能跟随会话路由）。

  两组都从宿主已配置的模型目录（客户端 `remote.session.modelCatalog()`）下拉选择，带「Auto = 跟随
  会话路由」与一键清空；宿主不提供该 RPC 的 shell 退回纯文本输入（值仍可手填）。切换 provider 时自动
  清掉不属于它的旧 model 草稿；保存按「成对钉住 / 成对清空」写回，语义与 host 的 pin 判定一致
  （`maintenance-wiring.ts`、`liveRoute`：两者都非空才钉住）。`historian.{provider,model}` 现已由
  Config schema 声明，并在 pre-step、compaction engine、`/ctx-recomp` 三条路径上**实时读取**（改配置
  下一次调用即生效）；空值 = 保持原有「跟随会话」行为。

## [0.10.1] - 2026-11-05

**发布链路切换。** 本版本没有运行时代码变更，内容是把 npm 发布认证从一次性 token 切换到
npm Trusted Publishing（OIDC）：仓库不再保存任何 npm 凭据，发布由 GitHub Actions 的 OIDC
身份授权，provenance 签名保持不变（本版本即 trusted publisher 的首次验证发布）。

### Changed

- `.github/workflows/release.yml`：移除 `NODE_AUTH_TOKEN` 与 `NPM_TOKEN` secret 依赖，发布改由
  OIDC 授权；npmjs.com 的 trusted publisher 绑定到本仓库的 `release.yml`

## [0.10.0] - 2026-11-05

**首个 npm 制品版本。** 自 0.9.0 起的累积变更；从本版本开始，推送 `v*` tag 会由 GitHub Actions
跑完整门禁并自动发布到 npm 注册表（带 provenance 签名，可在 npm 页面验证来源）。

### Added

- 上游跟进：紧急回收（emergency）的 fit 护栏——估算出的表面用量装不下时保留原结果、不再重试
  （对齐上游 #731）
- 上游跟进：historian 无进展闸——会话历史没有更新时自动档等待下一个更新节点，`forcedRange`
  手动路径放行（对齐上游 #802）
- 上游跟进：`userObservations` 产出开关——画像收集器未装备时向 prompt 注入明确的 disabled
  说明，避免模型空转
- 发布流水线：`.github/workflows/release.yml`（tag 推送 → 版本 / 分支 / 重复发布三道护栏 →
  完整门禁 → `npm publish --provenance`）

### Changed

- **展示层命名统一**：全局域（原 machine）、工作域（原 org）的界面文案、路由选项、分类提示与
  `ctx_memory` 工具描述统一为新名称；内部 token（kind 值、`dir:global:*` 身份、`suggested_domain`
  列、classifier 词表）保持不变，历史记忆与 journal 零迁移
- 依赖：`vitest` 4.1.12、`@types/node` 24.19.2 及传递依赖刷新；CI 的 actions 升到 v7，
  dependabot 对 `@deepseek-ai/*` 宿主包与主版本升级改为人工处理

### Fixed

- reduce-guidance：nudge 记录的 turn 曾是硬编码 0，使同档位的粘性抑制间隔在 ≥5 轮会话里恒满足、
  热会话会在每个 system prompt 组装时重发提醒；改为记录真实用户轮数

## [0.9.0] - 2026-10-20

**首个公开发布。** 这是本适配器第一次以独立开源仓库的形式发布：此前它作为 magic-context 仓库的
`packages/dsh-plugin` 存在，于 2026-10-08 抽出为独立仓库。本条目只描述公开发布时仓库里已有的能力，
不追溯更早的仓库内部历史。

### Added

- 以 DSH bundle 形态安装的 Magic Context 插件，包含：
  - 可逆上下文回收：工具结果打 `§N§` 标签，`ctx_reduce` 只入队、在 execute 带内落地为
    `[dropped §N§]`，`ctx_expand` 恢复原文；
  - 压力调度：持久 usage → 压力评估 → execute / defer 决策，含 `CONTEXT_WINDOW_EXCEEDED` 紧急回收；
  - historian 带外摘要：一次性 LLM 调用重放真前缀，产出四层摘要与 facts / events，只写 store
    不动线缆，execute 带内发布为 `[compacted §C<n>§]`；
  - `m[0]`/`m[1]` 记忆基线：冻结基线 + 增量车道（`<new-memories>` / `<memory-updates>` /
    `<user-profile>`），内容未变则零变更；
  - 插件自有项目记忆库（`memories.db`，基于内建 `node:sqlite`），含 `ctx_memory` 检索与读写维护；
  - 本地向量检索车道：`vendor/` 内的 onnxruntime-web WASM 后端 + 钉死 revision / sha256 的
    MiniLM 下载，失败 fail-open 降级 FTS；
  - 机器 / 组织全局域与用户画像：入队可自动化，发布永远经人审批；
  - 30 分钟维护 tick（TTL 归档、LLM verify、向量回填、全域候选入队）；
  - 可接管的 `ctx.compaction` 压缩接缝（首装默认 `registerCompactionEngine: false`）；
  - GUI 集成：插件页设置卡片、`shell.overlay` 遥测徽标与胶囊面板、`session-notice` 会话流提示。
- 界面文案中英双语，`npm run check:i18n` 校验两侧字典一致。
- 公开的本地闸门：`npm run typecheck`、`npm test`、`npm run build`、`npm run check:i18n`，
  以及一次跑完的 `npm run gate`。
- 开源仓库配套文档：`README.md`、`docs/`、`CONTRIBUTING.md`、`SECURITY.md`、
  `CODE_OF_CONDUCT.md`、`NOTICE`、本 CHANGELOG，以及 GitHub issue / PR 模板与 CI 工作流。

### Notes

- 上游基线 **magic-context v0.46.0**（commit `651c105a9`，MIT）；本仓库新增部分 © 2026 wukai，
  整体以 MIT 发布，见 [LICENSE](LICENSE)。
- 运行环境：Node.js **>= 22.19**（依赖内建 `node:sqlite`，不引入原生模块）。已在 DSH
  **0.2.1-rc.1** 上用 Node 24.15 验证；CI 覆盖 Node 22.x 与 24.x。
- 插件数据目录沿用上游命名空间（`~/.local/share/cortexkit/magic-context-dsh-poc/`）以保持出处
  连续，自 2026-10-13 起与上游 MC 数据库分家，插件自有 `memories.db` 无共享兼容义务。

0.12.0 之前的 tag 位于上游仓库 `wk544863858/dsh-plugin-magic-context`；从 0.12.0 起，版本与 tag 属于本 fork。

[Unreleased]: https://github.com/elvisw/dsh-plugin-magic-context/compare/v0.12.1...HEAD
[0.12.1]: https://github.com/elvisw/dsh-plugin-magic-context/compare/v0.12.0...v0.12.1
[0.12.0]: https://github.com/elvisw/dsh-plugin-magic-context/compare/v0.11.2...v0.12.0
[0.11.2]: https://github.com/wk544863858/dsh-plugin-magic-context/compare/v0.11.1...v0.11.2
[0.11.1]: https://github.com/wk544863858/dsh-plugin-magic-context/compare/v0.11.0...v0.11.1
[0.11.0]: https://github.com/wk544863858/dsh-plugin-magic-context/compare/v0.10.1...v0.11.0
[0.10.1]: https://github.com/wk544863858/dsh-plugin-magic-context/compare/v0.10.0...v0.10.1
[0.10.0]: https://github.com/wk544863858/dsh-plugin-magic-context/compare/v0.9.0...v0.10.0
[0.9.0]: https://github.com/wk544863858/dsh-plugin-magic-context/releases/tag/v0.9.0
