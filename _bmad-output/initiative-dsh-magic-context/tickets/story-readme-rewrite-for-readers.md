---
id: 26
type: story
title: README rewrite for readers
parent: initiative-dsh-magic-context
covers:
  - README.md
  - README.zh-CN.md
  - docs/configuration.md
  - docs/architecture.md
  - docs/glossary.md
  - CONTRIBUTING.md
sources:
  - README.md
  - README.zh-CN.md
  - docs/configuration.md
  - docs/architecture.md
  - CONTRIBUTING.md
companions:
  - _bmad-output/initiative-dsh-magic-context/tickets/story-readme-rewrite-for-readers-plan.md
after: [25]
refined: true
hitl: true
risk: low
---

# README rewrite for readers

## Description

两份 README 目前的写法让读者费解，原因不是内容错，而是行文方式：

- **AI 腔。** 三名词并列的卖点句、"作为…的证明"、修辞性形容词，读起来像宣传稿而不是说明书。
- **莫名省略。** `H` / `Q<n>`、回收带、四层摘要、`execute` band、`overlay`、`composer`
  这类术语第一次出现时没有解释，读者不知道指什么。
- **重复。** 同一件事讲多遍。实测：旧插件页卡片移除在中英文各 3 处（英文 42/101/228，
  中文 41/100/227），压缩接管只对 flat/headless 在英文 37/70/168、中文 36/69/167，
  记忆默认开启各 2 处，row id 共用各 2 处。
- **内部实现占了主要篇幅。** schema 版本号、内部表名、默认值散落在面向使用者的段落里。
- **链接墙。** 历史资料一行 19 个链接，英文 2564 字符、中文 2252 字符。

本票把两份 README 改成"按使用路径排布、术语先解释、技术细节外移"的说明书，并把外移内容
落到既有 `docs/configuration.md`、`docs/architecture.md` 与新建 `docs/glossary.md`。

本票**只改产品仓库里的文档文件**：不改产品代码、不改配置 schema、不加功能、不发版。
验收产物（脚本、JSON、报告）写在 `_bmad-output/` 下的票目录，不属于产品。

## Requirements

1. **按使用路径排布**
   **Given** 一个刚听说这个插件的人，
   **Then** 前四节（安装、装完会看到什么、常用操作、命令与工具）只回答：怎么装、装完能看到
   什么、常用操作怎么做、有哪些命令；这四节内不出现配置键默认值、schema 版本号、内部表名。

2. **不使用 AI 词汇**
   **Then** 两份 README 都不含计划文档 `## Banned-word list` 一节**硬表**列出的词，
   逐字独立命中为零。软表是人工判断项，允许保留并说明理由；句式类要求（不写三名词并列的
   卖点句、不写"不仅是 X 还是 Y"）同样由人工复核判断，不做机械检查。

3. **不省略**
   **Then** 每份 README 按**自己实际出现的词**解释，三组分明：

   - **两边都有、都要解释**：`§N§`、`H` / `Q<n>`、historian、FTS5、tick、parity、
     overlay、composer、flat/headless、pre-step、HMR、surface、compartment、embedding、
     `execute band`、`four summary layers`（中文侧以 `四层摘要` 指同一概念）。
   - **只在中文 README 出现**：回收带、基线、门禁、嵌入、四层摘要。
   - **只在英文 README 出现**：reclaim band、baseline、gate、four summary layers。

   每个词在各自 README 的首次出现处带一句解释，或链到 `docs/glossary.md`。
   不要求英文 README 承载中文词汇，也不要求中文 README 承载英文词汇的原文——
   共有的技术词（`compartment`、`execute band`、`§N§`、`HMR`、FTS5 等）在中文文件里
   按「中文名（英文原词）」或直接使用英文原词都可以，两种写法都算出现。
   三组里的词必须在对应 README 里真实出现；不出现就不能算"首现解释"的对象。

4. **删除重复**
   **Then** 按下表分级处理。计数按"该说法在单份 README 里出现的次数"，
   安装命令里必须出现的 `@elvisw/` 不计入包名那一条。

   | 事实 | 现状（英 / 中） | 目标 |
   |---|---|---|
   | 旧插件页卡片已移除 | 3 / 3 | 恰好 1 |
   | 压缩接管仅 flat/headless | 3 / 3 | 恰好 1 |
   | 记忆默认开启 | 2 / 2 | 恰好 1 |
   | row id 共用不能共装 | 2 / 2 | 恰好 1 |
   | 中文 FTS 分词限制 | 1 / 1 | 恰好 1（现状已达标，改写不得删） |
   | 包名与 scope 的散文提醒 | 1 / 1 | 恰好 1（现状已达标，改写不得增） |
   | `ctx_expand` 的恢复语义陈述 | 6 / 6 | 恰好 1（此处计语义陈述，不计工具名；其余位置改为指向该节） |
   | 宿主没上报的值不写成 0 | 4 / 4 | ≤ 2（各自分区最多一次） |
   | 五个分区 / 四项摘要 | 2 / 2 | ≤ 2 |
   | 同一个包服务手机端、没有第二个包 | 2 / 2 | ≤ 2 |
   | 上游版本号 | 3 / 3 | 收成一处，两个数字各带适用范围 |

   小计：**7 条"恰好 1"、3 条"≤ 2"、1 条"收成一处"**，共 11 条。
   表中未列的说法不再设全局阈值；若改写中发现新的重复，记进验收报告而不是临时扩表。

5. **技术细节外移**
   **Then** README 不出现 `pending_drops`、`flush_requested`、`memory_embeddings` 这类表名，
   不出现 `schema v11` 或其它 schema 版本号，不出现配置键默认值全表。复数形式 `compartments`
   作为表名同样不出现；单数 `compartment` 允许出现，因为 Req 3 要求解释它。
   这些内容出现在 `docs/configuration.md` 或 `docs/architecture.md`，README 给出指向链接。
   `flush_requested` 目前在两份 README 里承担"v10 自动迁移"这条升级信息，
   删除前必须先写进 `docs/architecture.md` §双库，不能无处可去地删掉。

6. **两份 README 结构对齐**
   **Given** `CONTRIBUTING.md:6` 要求两份 README 保持结构对齐，
   **Then** 两份的标题结构完全相同：1 个一级标题 + 12 个二级标题，顺序与层级一一对应，
   **不使用三级标题**。计数集合固定为"一级 + 二级"，三级标题计数必须为 0。

7. **可读的排版**
   **Then** 没有单行超过 400 字符；没有单行超过 5 个链接；正文段落的定义是"连续的、
   非列表项、非表格行、非围栏代码的文本行组成的一块"，每个这样的段落不超过四句
   （按句末标点 `。`/`！`/`？`/`.`/`!`/`?` 计）。

8. **npm 页面可读**
   **Given** `package.json` 的 `files` 不含 `docs/`（实测为
   `lib`、`vendor`、`cordis.patch.yml`、`tools/migrate-profile-package-name.mjs`、
   `README.md`、`NOTICE`、`LICENSE`），
   **Then** README 里所有指向 `docs/` 的链接使用绝对 URL，且每个目标都实际存在。
   Req 只依赖"不含 `docs/`"这一条事实，`files` 的其余内容不构成约束。

9. **说清它访问什么**
   **Given** dsh-go 市场用启发式扫描把本包标成 high risk，四项标记是
   `native-code`（high）/ `shell`（medium）/ `network`（low）/ `filesystem`（medium），
   **Then** 两份 README 各有一节说明这四项各自为什么存在、触发它的产物级证据、以及失效时的
   行为。**分工固定**：README 只写"打包产物里的哪个文件/哪种行为"（如
   `vendor/onnx/ort-wasm-simd-threaded.wasm`、两条只读 git 调用、两个 `.invalid` URL 基准），
   `src/` 源码路径与实现约束只写进 `docs/architecture.md`。README 不得引用 `src/` 路径，
   也不出现 `defaultDataDir()` 之类内部函数名——只写键名 `dataDir` 与它的默认路径。
   必须包含这四条实测结论：
   - `native-code` 只由 `vendor/onnx/ort-wasm-simd-threaded.wasm` 触发。它是 WASM 字节码，
     不是原生模块，不需要原生编译——与既有"No native compilation"的承诺一致，不得暗示相反。
   - `shell` 命中 12 个文件，其中只有 2 个真的导入 `node:child_process`：
     `lib/core/memory-bridge.js`（`git rev-list --max-parents=0 HEAD`）与
     `lib/dsh/project-drift.js`（`git rev-parse --show-toplevel`），都是 3 秒超时的只读调用；
     另外 10 个是 `db.exec('PRAGMA …')` 与正则 `.exec()` 命中扫描器正则造成的误报，
     共 52 处 `exec` 属于这一类。
   - `network` 命中 7 个文件，逐个归类后没有遗漏：
     出站请求只有 2 个文件——`lib/core/embedding-local.js`（首次拉取 sha256 钉死的模型资产，
     之后走本地缓存）、`lib/core/embedding-remote.js`（只在用户显式启用远程向量并点下重建之后
     才访问用户自己配置的 endpoint）；
     `lib/client.js` 的 4 处 `fetch()` 全部是同源相对路径（`/mc-embedding/*`、
     `/mc-telemetry/*`），请求的是宿主自己的回环路由，文件里唯一的绝对 URL 是输入提示文案
     （`例如 https://api.siliconflow.cn/v1`），不是请求；
     `lib/dsh/telemetry.js` 与 `lib/dsh/embedding-lane.js` 里的
     `telemetry.invalid` / `embedding.invalid` 只是 `new URL()` 的解析基准，不构成请求；
     剩下 2 个是 vendored onnxruntime（`ort-wasm-simd-threaded.mjs`、`ort.node.min.mjs`），
     我们传本地文件路径，运行时不触网。
   - `filesystem` 是真实行为，不作辩解：适配器库、`memories.db`、journal、模型缓存默认写在
     `<home>/.local/share/cortexkit/magic-context-dsh-poc/`，可用配置键 `dataDir` 改。
     默认路径与 `dataDir` 的落点写进 `docs/architecture.md`；README 只写键名与默认路径。

## Non-goals

- 不改产品代码、不改配置 schema、不改版本号、不发版。
- 不重写 `docs/` 里既有文档的正文（除承接本票外移内容、补 `dataDir` 键、补 `flush_requested`
  迁移说明、补 `## 观测` 一节，与新增 `docs/glossary.md`）。
- 不改 `PARITY.md`、`CHANGELOG.md` 的历史条目。
- 不为 README 重做截图；既有截图继续引用。
- 不把英文 README 翻译成中文风格，两份各自按目标语言的自然写法。
- 不改 `package.json`；Req 8 只读它的 `files` 字段。

## Verification

独立子代理核对票面与计划只声明本票能做到的事，且不越界到产品代码。

机械检查由一个检查脚本完成，脚本与输出一起存进本票验收目录
（`evidence/readme-lint.mjs` 与 stdout、`evidence/link-check.json`），结果可复现，但脚本不进入
产品仓库、不进 CI：这是文档质量检查，不是产品门禁。检查项：两份 README 均为 1 个一级标题 +
12 个二级标题且顺序相同、三级标题计数为 0；计划 `## Banned-word list` 的硬表逐字零命中；
Req 4 表格里 7 条"恰好 1"各文件恰好一次、3 条"≤ 2"不超过 2 次；
Req 5 的禁列标识符零命中（含 schema 版本号）、单一 `compartment` 允许出现；
无超过 400 字符的行、无超过 5 个链接的行；`docs/glossary.md` 存在且覆盖 Req 3 的词表，
且 Req 3 列表里每个词在对应 README 中真实出现；README 不出现 `src/` 路径与 `defaultDataDir`。

Req 9 另有独立核对：以**已发布的 0.18.0 tarball**（不是本地重新打包）为对象，用
dsh-go-market 的扫描规则复算四项标记与逐文件归属，结果存进
`evidence/market-risk-scan.json`，并记录 tarball 的 SHA-256 与"与 registry 一致"的核对结果。
该 JSON 必须同时带每个标记的级别（取扫描器源码的 `LEVELS` 常量，见 `evidence/` 里保存的
扫描脚本副本），供 lint 比对 README 里写的级别，以及 `numbersForReadme` 里的八个数字
（4 个标记、shell 命中 12、真实 `child_process` 2、误报 10、`exec` 命中 52、network 7、
filesystem 6、native-code 1）。README 里写的数字与级别必须与该 JSON 逐项一致，
四个级别也在 lint 断言范围内。

链接检查分两条路：指向本仓库的 `blob/main/...` 目标用 `git ls-files` 离线核对（约 90 个，
全部落在同一个仓库，逐个发 HTTP 只会触发限流）；真正外部的目标（徽章、npm 包页、dsh-go
issue、上游仓库）逐个请求一次。仓库内相对路径检查文件存在性。结果写入
`evidence/link-check.json`。

人工阅读复核由独立子代理执行，只回答两件事：一个没接触过本项目的人能否按 README 装好并完成
一次回收操作；以及能否用自己的话复述安装和回收各发生了什么。不复审产品行为。
