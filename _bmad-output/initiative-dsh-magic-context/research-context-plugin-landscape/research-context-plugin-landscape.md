---
type: market
topic: context-plugin-landscape
decision: 是否继续独立开发 dsh-magic-context
source: native-web-research
status: complete
preset: standard
validation: normal
created: 2026-11-09
updated: 2026-11-11
---

# 上下文插件竞品与开发价值评估

**决策：是否继续独立开发 dsh-magic-context。** 访问日：2026-11-09。

证据分级：**源码支持**表示本次读取了实现；**作者自述**表示来自维护者文档；**发行证据**表示注册表/CI记录存在。均不等于本机运行验证。没有独立的不同数据源确认时，承重声明仍记为 `medium / unverified`，不是断言虚假。

## 2026-11-10 补充：隔离验收与恢复语义澄清

本节追加后续证据与建议；下方原始调研各节仍保留2026-11-09网络研究时的范围。其中“未运行/未验收”指该次调研，不代表后续隔离实验未发生。原始证据分级不追溯改写，也未重新调研其他候选的最新版本。

- **已取得运行证据：**Windows、DSH宿主`0.2.2-rc.1`、插件`dsh-plugin-magic-context@0.11.1`的真实宿主/模型隔离实验已完成；安装、工具回收与精确恢复、重启恢复、项目记忆跨会话检索通过。仍不是完整产品验收通过，范围和加速条件见[验收报告](../acceptance-windows-dsh-2026-11-09/acceptance-report.md)。
- **#13的缺陷与建议需分开：**该插件通过surface replace原位恢复，同一tag随后再次回收是有效请求，但存在requeue未落地缺陷。优先建议对齐原版的独立历史读取与新工具结果返回；采用后应回收新结果的新tag，不再沿用旧tag的requeue用例。若保留原位恢复，再修现有状态转换。见[#13及固定源码留档](../acceptance-windows-dsh-2026-11-09/issue-requeue.md)。
- **#14是能力边界确认/改进建议：**实测Historian遮蔽后旧tag入口不可达，原始事件尚存；不据此断言原文物理删除或违反既有承诺。目标是提供不依赖当前占位符的原文读取入口，可以使用持久化tag或稳定消息/事件标识，不要求旧tag、撤销摘要或重建旧位置。见[#14及固定源码留档](../acceptance-windows-dsh-2026-11-09/issue-historian-recovery.md)。
- **上游参考不是新运行验收：**对原版OpenCode适配器固定提交`17801ffd2f9635af1abae893e37914359110f2c1`核查源码和测试：TS可按持久化tag定位，Rust明确拒绝tag并引导消息序号/范围；原文作为新工具结果返回。不能宣称原版所有模式支持旧tag，也不能将DSH事件序号当成原版消息序号。
- **决策含义不变，但依据更具体：**优先贡献上游，不从零重做；仅改变返回方式不会自动解决归档定位。两个Issue已提交并修订，不等于作者接受或已修复。本项目范围、正式技术设计及PRD版本基线仍需单独决策，此补充不自动批准实施。

## 2026-11-11 补充：手动 flush 入口

核查时目标插件默认分支仍为 `93ef5fe4a06a2c05f53e6a6225346919e860d74e`、版本 `dsh-plugin-magic-context@0.11.1`。源码已有管理拍落地 pending 的能力，但未发现 `/ctx-flush` 或等价的用户主动强制处理入口；`/ctx-status` 只读取状态，手动 `/compact` 则生成 Historian checkpoint，不能混同。

已提交 [Issue #15](https://github.com/wk544863858/dsh-plugin-magic-context/issues/15)，[固定源码与正文留档](../acceptance-windows-dsh-2026-11-09/issue-ctx-flush.md)。原版 `v0.49.30` 已有核心 flush；另对照固定提交 `3c2b53940270b7e020b8ee23e8ce10214430f50e` 的文档与 Pi 适配器：处理 pending 并发出刷新信号，下一次模型请求生效，不是同步清空上下文或强制生成摘要。此结论只有源码/文档支持，未新增运行验收；功能建议不代替 #13 的状态修复或 #14 的检索能力，不改变既有采用建议，也不自动批准 fork 实施。

## 决策摘要

**不建议按当前“大而全的DSH版Magic Context”方向从零重做。建议先采用并验证`wk544863858/dsh-plugin-magic-context`，把本项目暂时定位为差距验证与可贡献扩展。** 源码与作者文档显示，其范围包含可逆工具回收、Historian、持久记忆与基础UI。本项目尚未证明存在这样的关键场景：现成方案无法满足，且用户确实需要。[2][3][8]

这不是建议删除项目或立即安装依赖。现有需求与研究仍可作为验收清单；只有出现可复现的关键缺口，再比较上游贡献、受限fork和独立实现的成本。以下是产品建议，不是已批准的PRD变更。

## 还找到了哪些现成方案

以下能力除特别标注外均为作者文档或源码支持，**medium / unverified：没有本次独立运行验收**。npm版本只证明发行记录存在，不证明兼容或好用。

### DSH直接相关插件

| 项目 | 当前发行证据 | 做什么 | 与本项目的边界 |
|---|---|---|---|
| [dsh-multi-window-context-management](https://github.com/overact/dsh-multi-window-context-management) | npm0.7.0，2026-11-09发布；README称验证DSH0.2.2-rc.1。[10][13] | 原生压缩后追加窗口交接；会话私有笔记；history_search/read；按稳定item_seq分页读取完整原始事件 | **已经不只是摘要**，同一会话跨窗口的原文定位与恢复也有现成方案；工具不开放任意跨会话访问，不是ctx_reduce同形实现。[10] |
| [dsh-context-rollover](https://github.com/athif23/dsh-context-rollover) | npm0.2.2，2026-09-16发布。[14] | 模型主动换窗；持久笔记＋近期原文尾部＋history(search/read)；确定性交接不调用摘要模型 | 会话内为主，无跨会话同步；Web须用standard-rollover实验preset，默认standard不获得其工具。当前DSH兼容性待测。[11] |
| [dsh-observational-memory](https://github.com/EPCN-fla/dsh-observational-memory) | npm0.4.3，2026-10-30发布；本次能力文档为0.4.1快照。[12][15] | observer→reflector→dropper后台记忆；压缩时render；recall(id)恢复某条记忆背后的原始证据；Memory tab | recall是按已知记忆ID精确查证，不是任意历史全文搜索；后台worker仍消耗模型调用，不能称整体零成本；不是完整MC对等实现。[12] |

### 跨宿主替代与参考

| 项目 | 类别与本次证据 | 对本项目的意义 |
|---|---|---|
| [Magic Context / CortexKit](https://github.com/cortexkit/magic-context) | OpenCode、Pi、OMP上的完整上下文管理与记忆体系：缓存感知回收、Historian、Dreamer、跨会话搜索和原文展开；官方README称Pi与OpenCode共享数据库。[16] | 完整能力的上游参考，不是可直接装进DSH的插件；“跨宿主记忆”本身也已有方案，DSH接入价值需单独证明 |
| [Dynamic Context Pruning / DCP](https://github.com/Opencode-DCP/opencode-dynamic-context-pruning) | OpenCode请求侧压缩，当前单compress工具，range及message（实验性）两模式；不修改宿主历史。已读decompress源码显示压缩块可置为inactive；底层消息恢复的完整路径未逐行复核或运行验收。[17][18] | **不能误称纯永久删除**。但块级解压不等于本项目所有稳定引用、跨会话检索和记忆需求；作者明确新工作优先转往Sleev。[17] |
| [claude-mem](https://github.com/thedotmack/claude-mem) | 工具活动→observations→跨会话检索与注入；调研摘要核到2026-11-09仍有release。[19] | 是跨会话观察式记忆的替代层，不等于卸载工具输出后逐项恢复原文；不要因有记忆功能就视为完整替代 |
| [Sleev](https://sleev.ai) | 本地代理层上下文优化；厂商宣称支持多种coding harness。DCP维护者明确迁移开发重心，技术主张未独立验证。[17][20] | 对“再做一个通用压缩器”构成路线竞争；DSH接入、精确恢复、隐私与回退细节均未确认，不推荐直接替代安装 |
| [opencode-recall](https://github.com/SleepingBag945/opencode-recall) | 早期工具I/O落盘方案，保留blob指针并用rcl_restore读回快照；已读源码默认超8KB拒绝，force可覆盖。[21] | 说明“落盘＋指针＋按需读取”也已有实现；0.1.0及较早的更新记录不足以支持将其直接当作成熟替代；8KB是拒绝阈值而非静默截断 |

**反向证据：** 竞争确实存在，但这些方案并非全部等价，也没有本次实测能证明任一方案完整满足本项目八组需求。DSH的跨会话原文搜索、Smart notes及与上游数据互通仍是待核实缺口；上游MC已有对应能力，不代表其DSH适配已完成。[16] 不能据此直接判定项目“毫无价值”。同会话跨窗口的历史原文读取已有方案，不能再把它单独当作空白市场；观察记忆的recall则仅限按已知记忆ID查证，不是任意历史读取。[10][11][12]

## 指定项目：核心范围已有实现与文档证据

`wk544863858/dsh-plugin-magic-context` 是本项目最直接的替代，而不是名字相近的普通记忆插件。

- **已经发布，而不是只有规划**：npm `latest=0.11.1`，`gitHead=93ef5fe4a06a2c05f53e6a6225346919e860d74e`；changelog记载2026-11-07更新，当日对应CI成功。[1][7][9]
- **核心闭环有源码及测试代码，未在本次执行**：`ctx_reduce`只入队；`ctx_expand(tags)`寻找当前surface上的占位符，沿`sourceEventSeqs`读取原始工具结果content，再替换回surface。已读恢复路径不重新执行原工具，也不生成替代摘要。集成测试代码使用真实DSH agent loop和MockAdapter，编写了原正文→占位符→原正文的断言，不代表本次已跑通。[3][4][5]
- **作者文档描述的范围广于我们尚未实施的阶段0**：列出四层Historian、项目SQLite记忆、FTS＋本地向量、共享域、维护tick、GUI设置及遥测。按README，默认不接管宿主compaction-basic；若启用接管，要处理互斥配置。[2]
- **仍不是完整Magic Context移植**：独立`ctx_search`、`ctx_note`未见于已读工具接口；记忆检索用`ctx_memory(action=search)`，不等于跨会话的原始历史全文检索。[2][3] 作者明确独立维护自有corpus，不承担上游数据库互读义务；完整Dreamer、watermark age reclaim、精确tokenizer及图像计量未移植，并非完全没有计量（仍有chars/4估算）。[8]
- **兼容性有待测，而不是已证明不可用**：已读`ci.yml`配置为`ubuntu-latest`＋Node22/24，未穷尽其他工作流；本次没有Windows安装、DSH0.2.2-rc.1运行或重启测试。README的0.2.1-rc.1源码基线与新changelog提到的0.2.2-rc.1应区分，不能拿旧锚点直接宣布不兼容。[2][6][9]

### 文档与实现边界

1. README的“never breaks the live prefix”不应解释成永久缓存命中。其配置和实现同时承认回收落地是受控的priced bust。[2][3]
2. `ctx_expand`依赖当前surface可见占位符；整段被Historian遮蔽后的恢复、任意消息范围和跨会话恢复，不在已读phase1测试证明范围内。[3][4][5]
3. PARITY仍有旧版号及默认值与README冲突（例如embedBackfill）；它适合提供有明确意图的产品边界，不应把其所有配置当作最新事实。[2][8]

## 对照本项目需求：有缺口，但缺口不自动等于新项目机会

本表的需求来自本项目PRD（只用于比较），外部能力来自本次检索。它不是验收报告，也没有修改PRD或冻结V1。

| 需求 | 指定竞品本次证据 | 对继续开发的含义 |
|---|---|---|
| FR-1 可逆卸载与精确恢复 | 当前工具占位符闭环有源码和mock集成测试代码，本次未执行；重启及Historian后恢复尚未独立验收。[3][4][5] | 先采用现有实现做契约验证，而非重复实现同一闭环 |
| FR-2 代理参与/不参与管理 | 标记入队、压力调度与紧急回收已有；不等于完整上游自动模式，PARITY明确watermark age reclaim未移植。[2][8] | 先确定真正需要的自动策略，优先小范围扩展 |
| FR-3 Historian | 作者文档列出四层带外摘要与发布；预算/调用组织不同于上游，未独立验收。[2][8] | 非空白，不宜以“有Historian”作新项目定位 |
| FR-4 跨会话检索并恢复原始历史 | 项目记忆检索已有；已读接口未提供上游任意message/range及跨会话原文检索恢复。[2][3] | 最值得验证的功能缺口之一；先确认是否可贡献扩展 |
| FR-5 持久事实记忆 | 作者自述已做项目SQLite、FTS/向量、Historian事实提升。[2] | 直接重复的价值弱 |
| FR-6 延迟意图笔记/Smart notes | 已读工具接口未列ctx_note；维护tick不等于完整Dreamer。[2][3][8] | 若确实需要，可作为独立扩展议题；不是已冻结V1 |
| FR-7 搜索提示/Git索引 | 文档有searchHint；未在已读接口和范围文档确认Git提交索引。[2][8] | “未确认”不能写成“绝不存在” |
| FR-8 DSH UI | 作者文档列出配置卡和遥测；不能等同完整历史/记忆管理界面。[2] | 基础UI方向已重复，特定管理体验仍需需求验证 |

### 真正可能形成差异的方向

- **可审计的长程恢复契约**：同会话跨窗口读取原文已有其他DSH插件；更值得验证的是重启、再次压缩、Historian遮蔽及跨会话后，稳定引用和完整性保证是否一致。如现有方案已满足，就不另做。[3][4][5][10][11]
- **跨宿主迁移或互通**：指定竞品明确不承担MC存储互读义务，因此这里有边界差异；但本项目OQ-2尚未确认它是否首版必需，不能先造需求。[8]
- **Windows/DSH兼容验收与回归套件**：提供能运行、能复查的证据；公共Ubuntu CI未覆盖的部分是验证机会，不是现有产品缺陷的证明。[6]

这些方向首先是**贡献或验证机会**。只有在用户确需、现有插件有可复现缺口且维护者不接受兼容扩展时，才足以支持受限fork或独立实现。使用较新上游基线、换存储目录或再写一层adapter，本身都不是用户收益。

## 建议采用的决策门槛

| 路径 | 当前建议 | 理由 |
|---|---|---|
| 从零复制完整功能 | 暂停 | 核心范围已被直接竞品覆盖，尚无已验证的独有需求 |
| 采用现有插件 | 优先验证 | 最快判断当前需求是否已被满足，但不预设兼容或可靠 |
| 向现有插件贡献 | 优先于fork | 测试、兼容修复和小功能无需另负担一整套产品维护 |
| 受限fork或独立模块 | 条件成立后再做 | 需要关键差距、扩展不可行及可承担维护成本的证据 |
| 学习性实现 | 可以，但另设边界 | 学习价值可以成立，不应把它误当作尚未证明的产品机会 |

**验证清单：** 在隔离环境用真实DSH及Windows测试回收后恢复原文、重启后恢复、Historian遮蔽后的定位、跨会话查找原始历史、compaction配置互斥。区分需求不支持与实现缺陷，不以源码或Ubuntu CI替代验收。[2][3][4][5][6]

**独立实现的额外门槛：** 差距属于首版必需，现有项目不能兼容扩展，且差异是架构性的；维护收益还要超过持续追踪宿主和上游的成本。长程恢复、互通与Smart notes目前均是假设方向，不是已批准的首版范围。[8]

**BMad交接：** 若接受方向调整，下一步由`bmad-agent-pm`（John）基于本报告更新现有PRD，将首个产出改成有明确通过/失败标准的验证实验，而不是直接进入架构和开发。本次未改动PRD、initiative配置或安装插件。

## 时效与限制

| 信息 | 何时重查 | 本次限制 |
|---|---|---|
| npm版本、维护和CI | 安装前，以及约30天后 | 发行存在不代表真实用户采用或可靠运行 |
| DSH/Windows与compaction行为 | 每次宿主或插件升级前 | 本次未安装、运行或执行其测试；Windows状态未验证 |
| 工具恢复与跨会话能力 | 验证实验前；相关接口变更时 | 源码路径及mock测试不等于完整端到端验收 |
| 候选名称、版本和开发重心 | 安装前，约30天内复查 | 索引仍有dsh-context-management 0.3.6旧名/版，当前已改名且发布0.7.0；DCP开发转向Sleev；文档快照未必等于最新发行。[10][13][17] |
| 商业价值及差异化需求 | 决定独立开发前 | 未做用户访谈、成本基准或收益实测，不能声称ROI已成立 |

本次检索不是穷尽性证明；“未找到”不等于“不存在”。可通过Refresh复查版本与维护，通过Deepen针对原文恢复或兼容性进一步研究。

## 来源

| 编号 | 支持内容 | Publisher / URL | 发布日期或固定版本 | 访问日 | 可信度 |
|---|---|---|---|---|---|
| [1] | npm当前版本与gitHead | [npm registry](https://registry.npmjs.org/dsh-plugin-magic-context/latest) | 0.11.1；此端点无时间字段 | 2026-11-09 | medium；发行元数据 |
| [2] | 指定竞品功能、配置和运行边界 | [wk544863858 README](https://github.com/wk544863858/dsh-plugin-magic-context/blob/93ef5fe4a06a2c05f53e6a6225346919e860d74e/README.md) | HEAD 2026-11-07 | 2026-11-09 | medium；作者自述 |
| [3] | ctx工具参数及恢复实现 | [wk544863858 tool-bridge.ts](https://github.com/wk544863858/dsh-plugin-magic-context/blob/93ef5fe4a06a2c05f53e6a6225346919e860d74e/src/dsh/tool-bridge.ts) | 同上固定SHA | 2026-11-09 | medium；源码支持 |
| [4] | sourceEventSeqs与原始content恢复 | [wk544863858 seams.ts](https://github.com/wk544863858/dsh-plugin-magic-context/blob/93ef5fe4a06a2c05f53e6a6225346919e860d74e/src/dsh/seams.ts) | 同上固定SHA | 2026-11-09 | medium；源码支持 |
| [5] | 回收恢复集成测试覆盖边界 | [wk544863858 phase1.spec.ts](https://github.com/wk544863858/dsh-plugin-magic-context/blob/93ef5fe4a06a2c05f53e6a6225346919e860d74e/tests/phase1.spec.ts) | 同上固定SHA | 2026-11-09 | medium；本次未执行 |
| [6] | Ubuntu CI矩阵，不证明Windows状态 | [wk544863858 CI workflow](https://github.com/wk544863858/dsh-plugin-magic-context/blob/93ef5fe4a06a2c05f53e6a6225346919e860d74e/.github/workflows/ci.yml) | 同上固定SHA | 2026-11-09 | medium；配置支持 |
| [7] | 当前SHA CI成功记录 | [GitHub Actions CI](https://github.com/wk544863858/dsh-plugin-magic-context/actions/runs/42383941346) | 2026-11-07 | 2026-11-09 | medium；平台记录 |
| [8] | 独立存储和有意未移植模块 | [wk544863858 PARITY](https://github.com/wk544863858/dsh-plugin-magic-context/blob/93ef5fe4a06a2c05f53e6a6225346919e860d74e/PARITY.md) | 比较日期2026-10-30；部分条目滞后 | 2026-11-09 | medium；作者自述 |
| [9] | 0.10/0.11发行历史与宿主描述 | [wk544863858 CHANGELOG](https://github.com/wk544863858/dsh-plugin-magic-context/blob/93ef5fe4a06a2c05f53e6a6225346919e860d74e/CHANGELOG.md) | 最新条目2026-11-07 | 2026-11-09 | medium；作者自述 |
| [10] | DSH多窗口、稳定事件ID与会话隔离边界 | [overact README](https://github.com/overact/dsh-multi-window-context-management/blob/9dfab4803545a8d5d9c66c60ec77cfa302d94991/README.zh-CN.md) | 0.7.0；2026-11-09 | 2026-11-09 | medium；作者文档 |
| [11] | 换窗、原始历史与preset边界 | [athif23 README](https://github.com/athif23/dsh-context-rollover/blob/main/README.md) | 日期未知；当前main | 2026-11-09 | medium；作者文档 |
| [12] | 观察记忆、精确recall及后台调用 | [EPCN-fla npm README快照](https://cdn.jsdelivr.net/npm/dsh-observational-memory@0.4.1/README.en.md) | 固定0.4.1；日期未核 | 2026-11-09 | medium；作者文档 |
| [13] | 多窗口包发行 | [npm registry](https://registry.npmjs.org/dsh-multi-window-context-management) | 0.7.0；2026-11-09 | 2026-11-09 | high；仅分发记录 |
| [14] | rollover发行 | [npm registry](https://registry.npmjs.org/dsh-context-rollover) | 0.2.2；2026-09-16 | 2026-11-09 | high；仅分发记录 |
| [15] | 观察记忆当前发行 | [npm registry](https://registry.npmjs.org/dsh-observational-memory) | 0.4.3；2026-10-30 | 2026-11-09 | high；仅分发记录 |
| [16] | MC多宿主、工具及共享记忆 | [CortexKit README](https://github.com/cortexkit/magic-context/blob/master/README.md) | 当前master；逐段日期未知 | 2026-11-09 | medium；作者文档 |
| [17] | DCP当前机制、缓存权衡及转向Sleev | [Opencode-DCP README](https://github.com/Opencode-DCP/opencode-dynamic-context-pruning/blob/master/README.md) | 当前master；逐段日期未知 | 2026-11-09 | medium；作者文档 |
| [18] | DCP块级解压实现 | [DCP decompress.ts](https://github.com/Tarquinen/opencode-dynamic-context-pruning/blob/HEAD/lib/commands/decompress.ts) | 研究所读HEAD；未固定SHA | 2026-11-09 | medium；源码摘要，未运行 |
| [19] | claude-mem定位及发行 | [thedotmack仓库](https://github.com/thedotmack/claude-mem) | 摘要核到v15.13.0；2026-11-09 | 2026-11-09 | medium；README/release摘要 |
| [20] | Sleev代理层定位 | [Sleev官网](https://sleev.ai) | 发布日期未知 | 2026-11-09 | low；厂商主张，技术未验证 |
| [21] | recall快照落盘及恢复阈值 | [SleepingBag945 restore-tool.ts](https://github.com/SleepingBag945/opencode-recall/blob/HEAD/lib/restore-tool.ts) | 摘要核到0.1.0；未固定SHA | 2026-11-09 | medium；源码及README摘要 |
