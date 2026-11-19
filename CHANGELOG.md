# 更新日志 / Changelog

本文件记录本仓库面向公众的版本变更，格式遵循 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)，
版本号遵循 [Semantic Versioning](https://semver.org/lang/zh-CN/)。

这是一个 **DeepSeek Harness（DSH）适配器**仓库，不是 magic-context 本体：它把
[magic-context](https://github.com/cortexkit/magic-context)（MIT，Copyright (c) 2025 Ufuk Altinok）
的上下文管理与记忆能力移植到 DSH 的插件 / surface 体系上。代码出处、被 vendored 的第三方文件与
钉住的上游 revision 见 [NOTICE](NOTICE)；上游自身的变更历史请见上游仓库。

## [0.18.4] - 2026-11-19

### Added

- README 增加免责与合法使用说明（T29）。两份 README 的「来源与许可」小节现在写明：本软件按 MIT
  以“现状”提供、不附带担保；它会按设计改写对话历史、丢弃工具输出，记忆保存在本地 SQLite 文件中，
  无法承受丢失的数据请自行备份；合法使用由使用者负责（请遵守当地法律）；模型提供商、向量服务与
  其他应用各有自己的条款与计费。并注明这段是便于阅读的说明、不构成法律意见，以 `LICENSE` 原文为准。
  没有新增标题，中英三段一一对应。

## [0.18.3] - 2026-11-19

### Changed

- README 不再把「按标签号回收/取回」当成用户操作（T28）。原文「常用操作」的第一项是
  `你：把 4 到 7 号标签回收掉`，第二项是 `把 5 号标签的原文取回来`——实际上没有人这样用：模型
  干活时会自己给用完的输出打标记，压力到 85% 时强制带自己丢弃受保护窗口之外的结果；取回同样是
  模型的动作，它在发现自己需要一条已被回收的结果时自己调 `ctx_expand`，占位符留在原地。两份
  README 的「常用操作」改成先说明「这件事不用你管」，并写明界面上没有任何地方要求用户挑标签；
  工具表注明这些是模型调用的工具，斜杠命令才是用户直接敲的。`registerTools` /
  `registerStatusCommand` 这类不常用开关从 README 移除，仍记录在 `docs/configuration.md`。

## [0.18.2] - 2026-11-19

### Fixed

- README 没有说明插件会**自己**丢弃工具输出（T27）。85% 压力起的强制带、提供商以请求过长拒绝后的
  回收加重试、以及 reduce-guidance 提醒，在文档里完全缺席，读者会以为不调用 `ctx_reduce` 就不会丢
  内容。两份 README 现在写明「日常回收由模型驱动、只有强制带会自动丢弃」的拆分，以及触发条件、受保护
  窗口、分档顺序、溢出路径与提醒阈值；`docs/glossary.md` 增加 `强制带` 与 `受保护窗口`；
  `docs/configuration.md` 说明 `forceThreshold` 的作用范围。这是 0.18.1 重写 README 时丢掉的事实，
  不是新增功能。

## [0.18.1] - 2026-11-19

### Verified

- Android 本地向量链路端到端验收通过（T25，已发布的 0.18.0 包）：维护 tick 回填 3 条记忆为
  384 维向量，`ctx_memory action=search` 对同时命中关键词与向量的行返回 `match=hybrid`、对只有
  向量能找回的行返回 `match=semantic`，重启后共享空间门禁 `parity: 1`。`memory.embedBackfill`
  在本次 gate 中关闭，因此 `hybrid` 只能来自存储行。产品缺陷为零，修复的是验收脚本自身的两处
  缺陷。证据见 `_bmad-output/initiative-dsh-magic-context/acceptance-android-dsh-go-2026-11-18-t25-local-vector/`。

### Added

- 项目图标 `docs/img/plugin-icon.png`（512×512，另有 256 版）：括号收纳三枚方块，用于市场条目与 README。图标为本仓库原创，不沿用上游 `cortexkit/magic-context` 的徽标。

### Fixed

- dsh-go 原生表单把四个枚举字段显示成文本框：`embedding.provider`、`embedding.preset`、`embedding.authHeader`、`journal.level` 在 schema 里是 `z.string()`，而手机端只把「成员全是常量的 union」渲染成选择器，于是照 schema 显示成自由文本；桌面端不受影响，因为本插件的客户端自己写死了 `select`。四处改为 `union` of `const`，并给每个选项加了中英标签。`src/dsh/config.ts` 的接口原本就声明了这些联合类型，schema 只是比接口宽松。**行为变化**：写入枚举之外的值现在会在加载配置时报错，而不是静默按默认值运行。

### Changed

- README / README.zh-CN 重写（T26）：术语表新增 `docs/glossary.md`；风险标记一节按市场扫描器实测数字说明四项 flag；压缩后的技术细节移入 `docs/configuration.md` 与 `docs/architecture.md`；重复陈述收成一处；中文长句与直译改写。

## [0.18.0] - 2026-11-18

### Added

- 远程向量 API Key 改为配置界面录入（T24）：桌面「向量检索」使用只写字段，值写入宿主凭据库；`embedding.apiKeyEnv` 是 `role('credential-ref')` 引用名，`embedding.apiKey` 是 `role('secret')` 的宿主桥接字段。运行时按字面 `apiKey` → 凭据库 → 环境变量解析；`apiKeyEnv` 默认 `SILICONFLOW_API_KEY`；空值表示未绑定；自定义预设下保存空引用即无认证，SiliconFlow 预设下仍会回退到默认环境变量。环境回退继续保留。已有 `.env` / 进程环境变量仍作为回退。桌面通过 `remote.credentials.set/unset` 写入，不经过 `configForms.mutate`；状态只报告已配置/未配置与来源，不回显密钥。Android 原生表单声明同一组 role，但 dsh-go 1.1.0 的 bridge 尚未返回 `credentialRef`，原生密钥输入当前仍被禁用（[issue #1493](https://github.com/ccch1mneyyy/dsh-Go/issues/1493)）。
- Android dsh-go 1.1.0 原生面（T23）：输入框状态条、上下文面板、向量检索面板。通过可选的 `ctx.inject(['dshGo'], …)` 注册，无桥接的桌面端照常加载；状态条与面板复用现有遥测摘要与向量车道，不在手机重算 token 或另写 embedding 客户端/配置写入器。
- 原生面向量操作：加载模型（可复制模型 ID）、测试连接、确认后开始重建、暂停/继续；网络动作走宿主 deferred 协议并传递取消信号。
- 原生配置说明与分组元数据；Android 可从 npm 安装同一个包，原生面要求 dsh-go 1.1.0。桌面密钥录入已验收；Android 原生表单使用同一组 role，但受 dsh-go bridge 的 `credentialRef` 缺口限制，原生密钥输入仍不可用。本轮只验收 Android 本机引擎、原生面板与本地 MiniLM WASM 原语；真机 gate 跑在预发布 T23 候选上，早于 T24 的原生视图改动，不声称 iOS、真实嵌入供应商或完整本地检索链路已验证。

### Changed

- 遥测服务改为父级持有，在维护 tick 之后创建，Web 路由重挂载只重新注册路由；dsh-go 桥接与 Web 路由共用同一个摘要服务，退出时只关闭一次。
- 向量动作的权威守卫下沉到服务端车道：记忆关闭、缺少密钥、未探测、空覆盖率、重建运行中/已暂停等条件即使绕过按钮也会被拒绝。
- 探测与模型列表在 await 后复核完整目标/密钥指纹；目标变化返回 `target-changed`，取消返回 `cancelled`，不写探测缓存、不显示旧目标成功。缓存淘汰键改为从被写入的 entry 派生，避免旧请求淘汰新目标的缓存。
- 插件父级监听 `loader/volatile-update`：有效提交到 `local`/`off` 时立即解除已有重建状态，不依赖面板打开或状态轮询；再切回远程仍需显式开始。
- 原生面板缺失值显示 `—`；未知值不写成 0。

### Fixed

- 原生向量面板首次打开时不再依赖尚未附着的数据订阅来决定按钮结构；视图直接读取当前本地状态。修复来自 Android 真机阻断，已补回归测试；没有引入自动探测或重建。

## [0.17.0] - 2026-11-17

### Added

- `/ctx-wrapup [messages_to_keep]`（T22）：为下一次 pre-step 排队一次手动 live-history 压缩，默认保留最新 20 条 eligible surface 条目。命令只写 `wrapup_request:<sessionId>` 标记，不调用模型、不改 surface；下一次 pre-step 走正常 execute lane，先落地 pending drop、修复 stranded wire，再跑一次 manual Historian，发布全部 unlanded compartment 并刷新基线。该趟跳过 force band；`attempts` 最多 3 次，deferred/baseline 失败会保留标记重试，terminal rejection 不重试。`refreshBaseline` 只渲染 landed compartment，避免 deferred/rejected digest 泄漏进基线。

## [0.16.0] - 2026-11-17

### Added

- 远程向量（T20）：可选的 OpenAI 兼容 embed endpoint，设置页支持 provider/preset/endpoint/auth header/model/维度探测/查询前缀/超时/批大小；模型列表动态加载，维度靠 `POST /embeddings` 探测并缓存。远程空间带 `embedding-remote:` 命名，保存配置不自动消耗额度，必须点「开始重建向量」；支持暂停/继续、完整后继续维护新记忆，以及通过普通 Save 回滚到本地。远程失败降级 FTS，不与本地向量混用。
- `/ctx-status` 增加 embedding 状态行（状态、provider/model、维度、可检索覆盖率）。
- `/mc-embedding` 插件路由：status/models/probe/rebuild（start/pause/resume/disarm），带方法、Origin/Host、JSON content-type 与请求体上限防护。

### Changed

- **Breaking — 设置界面（T21）**：顶层「设置 → Magic Context」改为宿主原生分区卡片——四项摘要（回收策略、历史摘要、向量空间、重建）、五个分区（常规 / 历史摘要 / 日志 / 向量检索 / 维护与诊断）、分区跳转行、高级折叠，以及宿主底栏上方的纯文本状态条。不再注册旧的 `plugins.item` / `plugins.row.config`，也不再有纯控件回退与卡片内第二个 Save；缺少 `settings.section` 的宿主将没有配置入口。
- 向量检索动作前置条件：加载模型要求 endpoint 可解析（已保存或 preset 默认），测试连接要求模型已保存且 endpoint 可解析；表单有未保存修改时按钮变为「保存并加载模型」/「保存并测试」，先走现有 revision-fenced Save，保存失败则不执行动作。开始重建与回滚要求表单干净；回滚严格按「确认 → 暂存 local → Save 成功 → disarm」执行。
- 设置卡片状态轮询：迁移中每 2 秒，其余每 15 秒；暂停、关闭、错误或页面隐藏时停止，`remote-ready` 保留 15 秒刷新。中文文案继续作为发版阻断项。

## [0.15.0] - 2026-11-16

### Added

- 遥测面板 v2：胶囊保留压力、token 对、Historian 与回收队列；弹层新增 100% 宿主 token 构成（系统 / 工具定义 / 消息）、估算的消息构成、Historian / 记忆 / 回收队列 / 维护 / 可回收 / 警告分区，全部中英文案走 `magic-context` 字典。服务端 `health` 增量提供 `adapterVersion`、`policy`、`contextBreakdown`、`messageComposition`、`historian`、`queue`、`memory`、`surface`，缺失值用 `null`/省略而不是 0。

### Changed

- README 的设置页截图更新为 0.14.0 的顶层「设置 → Magic Context」页面，包含 catalog-backed Historian 推理强度选择器；旧「插件」页卡片截图保留，供已发布旧版本引用。
- README 双语「界面与遥测」章节与能力表更新到遥测 v2：宿主 token 构成、估算消息构成、Historian/记忆/队列/维护/可回收/警告分区与中英截图（`docs/img/telemetry-panel-v2*.png`）；旧 `telemetry-panel.png` 保留，供已发布旧版本引用。
- `registerCompactionEngine` 明确为 flat/headless 宿主的根 seam：DSH Web 与桌面端的 agent preset 自带 compaction 引擎，设置页提示与 README 不再把它描述成通用接管。无运行时行为变更；上游 README 的同一说法已反馈为 [issue #16](https://github.com/wk544863858/dsh-plugin-magic-context/issues/16)。

## [0.14.0] - 2026-11-16

### Added

- 顶层「设置 → Magic Context」页（`settings.section`，order 30），与宿主「内置插件」导航项同级；旧「插件」页卡片保留为同一组件的旧位置/回退。
- 设置卡片全部自有文案（22 个字段的 label/hint、`Auto` 路由占位、摘要、表单框架、effort 选择器说明）进入 `magic-context` zh/en 字典，跟随 DSH 语言即时切换；宿主 catalog 的 provider/model/effort 名称保持原文。
- Historian 推理强度改为 catalog-backed 选择器：`默认` + 当前 Historian 路由模型公布的 effort id + 始终可用的 `自定义…`；Auto 路由、无 catalog 或无 reasoning 元数据时保留文本输入；未知旧值以 `Custom` 保留，不会被静默清空、改写或夹取。

### Changed

- README 与发布文档明确包名边界：npm 上无 scope 的 `dsh-magic-context` 是另一位维护者的独立实现，不是本 fork 或它的上游；本 fork 只以 `@elvisw/dsh-magic-context` 发布，安装命令必须保留 scope。
- README 文档索引拆分为 4 篇 current 与 21 篇 historical；`docs/` 下 25 篇文档标题后统一加 `> Status:` 证据基线，旧配置 UI 契约标记为 historical 并指向当前设置界面契约。

### Fixed

- 设置卡片在 `snapshot.status !== 'ready'` 时不再硬编码英文 `Magic Context adapter settings`，中文界面不会漏出英文。
- 点过 `Default`/Reset 后再选 `自定义…` 不再被已暂存的 clear 弹回默认值；已公布的 effort id 通过 `自定义…` 输入时不再误报“不在模型目录中”；清除暂存状态后 Save 不再可点却无写入。

## [0.13.0] - 2026-11-15

### Changed

- npm 包名迁移为 **`@elvisw/dsh-magic-context`**（0.12.x 为 `@elvisw/dsh-plugin-magic-context`）。loader row id `magic-context-dsh`、settings namespace、数据目录 `magic-context-dsh-poc`、schema v11 与存储格式不变。
- 新增一次性 profile/home/overlay patch 迁移脚本 `tools/migrate-profile-package-name.mjs`；0.12.x 升级必须先运行，否则 loader 按 `id` + `name` 匹配时会跳过旧配置行，表现为设置或自定义 `dataDir` 丢失。脚本随 npm tarball 与 hand-out 一起发布。
- 上游包、0.12.x fork 包与新包**不支持共装**：loader 不拒绝重复 row id，而是保留一条并可能隐藏重复设置行；升级前先移除旧包。

### Added

- `ctx_expand` 新增 `start`/`end` 范围与 `verbose` 预览：闭区间 DSH 日志事件 seq，只读 `user`/`assistant`/`tool/result` 转录，不要求先 drop、不改 drop 状态、不调用模型；`[compacted §C…§]` 与 adapter 记录被排除，`[dropped §N§]` 按字面保留。成功结果使用 `locator: "range"`，不含 `restored` 键。

## [0.12.3] - 2026-11-15

### Changed

- `/ctx-flush` 在队列为空时读取本会话最新一条 `drop-landed` 记录，回执显示落地数量与 UTC 时间；不新增 journal 行、不改 surface、不触发模型调用。

## [0.12.2] - 2026-11-15

### Added

- `historian.reasoningEffort`（可选，留空 = 模型默认）与设置卡片中的自由文本字段；对暴露 effort id 的 provider/model 生效，覆盖 historian、`/compact` 与 `/ctx-recomp`。

### Fixed

- Historian 在 provider 于 `finish` 之前抛出 `OUTPUT_TOKEN_LIMIT` 时不再误判为 `stream-error`：现在进入正常的 truncation 重试（默认 8192 → 16384），并保留一次 run 的单个 terminal journal 行。
- `drop-landed` 的 `estTokens` 改为在替换前采样原文，不再恒为 0。
- `memoryStats.total` 只统计 `active`/`permanent` 行，归档行不再造成 “total 1 / verified 0 / unverified 0” 的矛盾读数。

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

[0.18.4]: https://github.com/elvisw/dsh-plugin-magic-context/compare/v0.18.3...v0.18.4
[0.18.3]: https://github.com/elvisw/dsh-plugin-magic-context/compare/v0.18.2...v0.18.3
[0.18.2]: https://github.com/elvisw/dsh-plugin-magic-context/compare/v0.18.1...v0.18.2
[0.18.1]: https://github.com/elvisw/dsh-plugin-magic-context/compare/v0.18.0...v0.18.1
[0.18.0]: https://github.com/elvisw/dsh-plugin-magic-context/compare/v0.17.0...v0.18.0
[0.17.0]: https://github.com/elvisw/dsh-plugin-magic-context/compare/v0.16.0...v0.17.0
[0.16.0]: https://github.com/elvisw/dsh-plugin-magic-context/compare/v0.15.0...v0.16.0
[0.15.0]: https://github.com/elvisw/dsh-plugin-magic-context/compare/v0.14.0...v0.15.0
[0.14.0]: https://github.com/elvisw/dsh-plugin-magic-context/compare/v0.13.0...v0.14.0
[0.13.0]: https://github.com/elvisw/dsh-plugin-magic-context/compare/v0.12.3...v0.13.0
[0.12.3]: https://github.com/elvisw/dsh-plugin-magic-context/compare/v0.12.2...v0.12.3
[0.12.2]: https://github.com/elvisw/dsh-plugin-magic-context/compare/v0.12.1...v0.12.2
[0.12.1]: https://github.com/elvisw/dsh-plugin-magic-context/compare/v0.12.0...v0.12.1
[0.12.0]: https://github.com/elvisw/dsh-plugin-magic-context/compare/v0.11.2...v0.12.0
[0.11.2]: https://github.com/wk544863858/dsh-plugin-magic-context/compare/v0.11.1...v0.11.2
[0.11.1]: https://github.com/wk544863858/dsh-plugin-magic-context/compare/v0.11.0...v0.11.1
[0.11.0]: https://github.com/wk544863858/dsh-plugin-magic-context/compare/v0.10.1...v0.11.0
[0.10.1]: https://github.com/wk544863858/dsh-plugin-magic-context/compare/v0.10.0...v0.10.1
[0.10.0]: https://github.com/wk544863858/dsh-plugin-magic-context/compare/v0.9.0...v0.10.0
[0.9.0]: https://github.com/wk544863858/dsh-plugin-magic-context/releases/tag/v0.9.0
