# 配置参考

这页是完整清单。日常只需要改几项的人，看 README 的「设置」一节就够。

改配置有两条路，语义不同。

**GUI 设置页**（设置 → Magic Context）改的是 volatile 字段，保存即生效，宿主在决策点现读，不需要重启。

**手写 profile 覆盖行**里的 `config` 是**整体替换**包内 patch 的 config，不是深合并。只写 `memory:` 会把 `registerCompactionEngine: false` 抹掉。手写覆盖时要把想保留的键一起写出来。

bundle 自带配置只有一行 `registerCompactionEngine: false`，其余全部走默认值（记忆、回收、historian 都默认开）。

## 压缩接管

> **只适用于 flat/headless。** 在 DSH 0.2.2-rc.1 里，Web 与桌面端的 agent 跑在各自的 agent preset 内，每个 preset 自己挂载 `compaction` group。profile patch 顶层的 `compaction-basic` 行替换不到 preset 里的引擎。所以这个开关对 Web 和桌面端无效，而且必须先停用该组合的根 `compaction-basic` 行才会生效。上游 0.11.2 的两行接管方案有同样的限制，已反馈到 [上游 issue #16](https://github.com/wk544863858/dsh-plugin-magic-context/issues/16)。

没有 preset 自有压缩引擎的 flat/headless profile 可以这样接：

```yaml
- id: magic-context-dsh
  name: '@elvisw/dsh-magic-context'
  config:
    registerCompactionEngine: true
- id: compaction-basic
  name: '@deepseek-ai/dsh-compaction-basic'
  disabled: true          # 仅 flat/headless
```

## 键

完整类型见 [src/dsh/config.ts](../src/dsh/config.ts)。除注明外，都可以写在 profile 覆盖行里。

| 组 | 键（默认值） | 说明 |
|---|---|---|
| 总开关 | `enabled` (true) · `registerTools` (true) · `registerStatusCommand` (true) · `sessionNotices` (true) · `reduceGuidance` (true) · `searchHint` (true) | `enabled: false` 保持加载但完全惰性；`sessionNotices` 控制会话流里的管理提示行 |
| 压缩接缝 | `registerCompactionEngine`（代码默认可解析即挂；bundle 随发 false）· `compactionBase`（宿主注入基类） | 仅 flat/headless 根 seam；接管时需同时禁用根 `compaction-basic`。pre-step 每步 `reconcileEngine` 动态挂/卸 |
| 压力策略 | `policy.*`：`executeThreshold` (65) · `forceThreshold` (85) · `ttlMs` (5 min) · `assumedContextWindow` (256k) · `protectedToolResults` (8) · `historianTimeoutMs` (120 s) · `historianMaxTokens` (8192，低于会被抬到 8192) · `historianMaxTokensCeiling` (32768) · `baselineTokens` (2000) · `memoryBudgetTokens` (8000) · `memoryLimit` (40) · `forceWaitReadyMs` (0) | 阈值在下一个决策点生效，包括 `/ctx-status` 与 compaction engine 路径。`compartmentGuardMode` / `compartmentEntrantTokens` 已退役，不再是可配置项 |
| historian | `historianEnabled` (true) · `historian.{provider, model}`（成对钉住；空 = 跟随会话最后路由）· `historian.reasoningEffort`（可选，留空 = 模型默认） | 带外摘要与 `/compact` 摘要的生成路由。GUI 有 catalog-backed 下拉：`默认`、路由模型实际公布的 id、用于旧值/未知值的 `自定义`。Auto 路由下保留文本输入，因为此时不知道会话模型。provider 级 `OUTPUT_TOKEN_LIMIT` 空补全会走预算翻倍重试。这是 verify 之外唯一的 LLM 消耗点 |
| 项目记忆 | `memory.{}`：`enabled` (true，0.9.0 起默认开启) · `dbPath` · `project`（省略用会话 cwd）· `domainProjects` · `shareCategories` · `autoPromote` (true) · `write` (true) | `write: false` 让 `ctx_memory` 退回只读 |
| 检索 / 向量 | `memory.embedBackfill` (true，查询侧内嵌补分) · `memory.vectorBackfill` (true，维护 tick 回填) · `memory.vectorBackfillLimit` (24 行/tick) | 向量车道任何失败 fail-open 降级全文检索 |
| 远程向量 | `embedding.provider` (local) · `embedding.preset` (siliconflow) · `embedding.endpoint` · `embedding.authHeader` (authorization) · `embedding.model` · `embedding.apiKeyEnv` (凭据引用，默认 `SILICONFLOW_API_KEY`；空 = 未绑定) · `embedding.apiKey` (空；role secret，仅宿主桥接) · `embedding.dimensions` (0 = 探测) · `embedding.queryInstruction` · `embedding.documentPrefix` · `embedding.timeoutMs` (8000) · `embedding.queryTimeoutMs` (2500) · `embedding.batchSize` (16) | 细节见下一节 |
| S(t) 衰减 | `memory.scoring.{enabled (true)，alpha (0.4)，beta (0.2)，archiveThreshold (2)，halfLives}` | 统计恒收集；分发缺省 enabled=true 接管排序。只写在 profile JSON 里，不进设置卡片 |
| 全局域 | `memory.global.machine.{enabled (true)，excludeProjects，autoStage (true)}` · `memory.global.user.{render (true)，collect (true)，review (true)}` · `memory.global.review.batchLimit` (50) | 入队可自动化（≤3 条/pass，≥10 候选待审时暂停），**发布永远是人**。LLM 分类失败 fail-closed |
| 用户画像 | `memory.global.user.{render (true)，collect (false)，review (false)}` | 读 / 收集 / 评审三半独立，写共享库的两个半边默认关 |
| 域解析 | `memory.domains.source` (`adapter` \| `contract`) | `contract` 是对照用的回退杆，不是支持终态 |
| 维护 | `maintenance.{enabled，intervalMs (30 min)，verifyProvider，verifyModel}` | LLM verify 需显式路由，未钉则跟随主对话最新路线。GUI 可从宿主模型目录下拉选择，Auto = 不钉 |
| 观测 | `journal.{enabled (true)，level (info)，retentionDays (30)，mirror (true)}` | level/mirror 对下一条写入生效。挂载时就是 off 的 journal，运行中打开需要重启。`retentionDays` 有 `min(1)` 下限 |

## 远程向量

默认用本地 MiniLM。要用 OpenAI 兼容的嵌入 API（例如硅基流动），打开**设置 → Magic Context → 向量检索**，选 `OpenAI 兼容 API`，加载模型列表，选模型，点**测试连接**。

插件用一条短文本探测维度。模型 ID 和维度都不写死在代码里。

API Key 在同一个分区录入。字段只写不读，值存进 `apiKeyEnv` 指向的宿主凭据库，卡片只显示**已配置 / 未配置**和来源。密钥不会进 profile patch、日志、数据库或浏览器状态。

`$DSH_HOME/.env` 和进程环境变量仍然作为回退，保存的凭据优先。默认引用名是 `SILICONFLOW_API_KEY`。自定义预设下清空引用名就是无认证（要显式保存空值）；SiliconFlow 预设下清空会回退到默认环境变量。宿主没提供凭据库时字段禁用，环境变量回退照旧。

点**开始重建向量**才会启用目标空间并开始有界回填。在那之前，远程检索只走全文检索，保存配置也不发送 embedding 请求。旧本地向量保留。**回滚到本地**走普通的 revision-fenced Save。远程失败只降级到全文检索，绝不回退到本地向量。远程空间带独立命名，覆盖率按 `active` + `permanent` 记忆算。

整个 `embedding` block 按设计只作为用户级配置。当前宿主没有暴露 project/tier 来源，所以运行时还没强制拒绝项目级覆盖。

这是一个 local-first 插件：启用远程端点后，你检索的记忆文本会发送到那个端点。用可信或自建端点，优先 HTTPS（只有 localhost 或局域网服务器适合明文 HTTP）。模型可用性和价格会变，以服务商当前页面为准，例如 [SiliconFlow 模型接口](https://api-docs.siliconflow.cn/docs/api/models-get) 与 [嵌入接口](https://api-docs.siliconflow.cn/docs/api/embeddings-post)。

## Android 上的配置

配置入口沿用 App 自带的插件设置页，与桌面表单共用同一份 volatile schema。

那份 schema 的说明文字是短标签：已发布的 dsh-go 表单（`app/lib/ui/engine_settings/schema_fields.dart` 的 `labelFor` → `_fitsTitle`）只在说明不超过 18 个码点且单行时才把它当标签，过长会退回 humanizeKey。

`memory` 刻意不写进这份 schema，原生配置不提供记忆开关。记忆与桌面一致，默认开启；要退出就在 profile 补丁里写 `memory.enabled: false`。

远程向量的密钥在桌面设置页录入。原生设置页也声明了同一组 role，但 dsh-go 1.1.0 的 bridge 还没把同级 `role('credential-ref')`（`apiKeyEnv`）传给 App，所以原生密钥输入框当前显示未绑定并禁用，见 [dsh-go issue #1493](https://github.com/ccch1mneyyy/dsh-Go/issues/1493)。bridge 修好之前，手机端可以直接用本地 MiniLM（不需要密钥）；需要远程向量就在桌面或 Web 设置页保存凭据。

把 provider 切回 `local`（或 `off`）会立即解除已武装的远程重建，即使没打开面板。再切回同一个远程配置，仍然要显式点一次**开始重建**。
