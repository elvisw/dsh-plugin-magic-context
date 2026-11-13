---
title: DSH 与 Magic Context 上下文生命周期源码研究
type: codebase
status: complete
validation: normal
created: 2026-11-07
updated: 2026-11-07
repositories:
  mc: cortexkit/magic-context
  dsh: deepseek-ai/deepseek-harness
commits:
  mc: 33fb6ac9a39c8bb299776b6b514ea0815a15a225
  dsh: fcc0ad462172522aaf5c93a7b2e01f6b9f0b0159
claims:
  verified: 15
---

# DSH 与 Magic Context 上下文生命周期源码研究

## 阅读结论

两个系统都有保留原始历史、生成较小模型上下文的机制，但宿主契约不同：MC 的内部 Transcript 是当前请求的可变表示；DSH 的请求由事件日志派生并被冻结，`agent/request` 不是正文改写钩子。[1][2][3]

上游跨宿主共享的是源码与内部接口，不是可直接安装的通用核心 SDK；已有测试覆盖编号、缩减、重放和恢复的若干契约，但不构成 DSH 移植已经可运行或所有平台缓存稳定的证据。[3][4][5]

本文只陈述源码事实。复用选择、版本切分和实现建议另见设计草案，不能把本报告当作已通过的运行时验证。

## 已研究问题

1. **How / DSH**：模型请求怎样从 Session 事件形成？哪些钩子、变更与持久化约束参与？
2. **How / MC**：稳定编号、排队缩减、持久重放与原文恢复怎样形成闭环？
3. **Where / MC**：共享源码、宿主边界和构建/运行依赖在哪里？
4. **How / both**：现有测试具体断言了哪些行为，又没有证明什么？

## 1. DSH 请求与持久化

请求链路为：输入队列 → 捕获模型选择、解析工具、组装提示 → pre-step 接纳 → 准备调用 → 追加提示与已接纳输入 → 派生并冻结请求 → 模型流 → 助手结果与有序工具结果落日志。[1]

`buildRequest` 使用当前 surface 的派生消息并冻结消息、数组和请求。`agent/request` 只处理调用控制，不能更改已捕获的模型选择；`llm/stream` 也明确不允许改写 loop 已构造的内容。[1]

持久内容编辑通过追加新事件表达。surface replacement 要求有效的当前端点与完整来源引用；单个工具结果替换只能改变其内容。原事件仍然在日志里。注册的消息投影还有解释器完整性约束，不能假定其可任意卸载而不影响恢复。[1]

内存 append 与 durable flush 不相同。前者校验、冻结并提交内存状态；后者等待持久化监听器并传播失败。取消不是回滚，已提交事件仍在。工具配对安全必须由具体变更路径检查，不能假定任意 append 都替调用方保证完整配对。[1]

## 2. MC 可逆卸载闭环

工具 tag 基于会话中的原消息归属与 call ID；稳定身份不等于当前数组下标。`ctx_reduce` 先验证并入队，之后受缓存改写许可与保护窗口约束，才执行首次卸载。[2]

卸载决定及模式先持久化、待处理项出队，然后才改变当前请求表示。后续请求重放已保存模式，不按年龄重新生成不同字节。`ctx_expand` 从原始历史读取并返回新的工具结果，不撤销旧的缩减决定，也不重新执行原工具。[2]

原始历史、缩减元数据与最后健康请求快照是不同数据。原始记录来自宿主或注册的 raw provider；LKG 保存已经变换的前缀及来源身份校验信息。恢复会拒绝错位、缺失、错误命名空间或不安全结构，而不是猜测内容。[2]

这里的“完整恢复”有类型边界：文本和工具输入/输出可以被渲染，但推理与结构噪声可能省略；附件/图片可能只返回位置或提示。它不是任意二进制对象的字节级还原保证。[2]

## 3. 共享源码与宿主边界

Pi 的 `@magic-context/core/*` 是指向 plugin 源目录的构建别名。两份包清单公开的是宿主插件入口，不存在这两份清单已经公开独立 core SDK 的证据。[3]

共享层有当前请求 Transcript、原始历史 RawMessageProvider、隐藏模型调用与调度等内部契约；宿主包装仍负责注册、模型选择、取消、历史读取和后台任务生命周期。OpenCode transform 的可注入接口存在宿主默认值，不传回调不是自动获得中立行为。[3]

上游构建使用 Bun，但产物目标为 Node ESM；运行期 SQLite 可选择使用内建的 Bun/Node 接口。嵌入、worker、附件与宿主 SDK 仍有独立依赖分支，不能把“TypeScript 可复用”推成“整个发布包可无差别加载”。[3]

## 4. 测试证据及其边界

- MC 的缓存 fixture 对比归一化后的前缀，从第二个请求开始，移除 cache_control；并非真实提供商命中率测量。[4]
- DSH 的重建测试对比结构化消息和控制字段，不等于 HTTP 请求逐字节相同。另有需 API key 的真实 DeepSeek 缓存测试，本次没有执行。[5]
- MC 有选定变更边界的真实子进程 SIGKILL fixture，也有正常关闭后重开数据库的 fixture，两者不能混为任意崩溃保证。部分 LKG fence 测试显式跳过 Windows。[4]
- DSH 测试断言原始工具结果保留在日志、缩减结果进入 surface 并可重放；raw-query 测试与模型主动恢复的完整闭环不是同一项验证。[5]
- MC 的恢复 fixture 区分 tag 与消息序号，并检查正确兄弟工具；这不代表原始来源被删除后仍能恢复。结果身份的特定 expected-failure fixture 也不能被测试标题掩盖。[4]

**本次没有安装依赖，没有执行测试或模型调用。** 测试文件中的断言是契约证据，不是本机通过记录。

## Where the answers meet

DSH 的 surface 和 MC 的 Transcript 都决定模型可见内容，但持久化与可变性契约不同；MC 的 raw provider 与 DSH 的完整事件日志则都区别于缩减后的请求表示。这些共同概念不消除宿主接口差异。[1][2][3]

## Open questions

- DSH 消息投影的解释器版本化、插件禁用与冷恢复怎样相互约束？本次未完整追踪。
- 上游策略在 DSH 上怎样保持合法且可重建的历史布局？需要单独的集成验证，静态源码不能回答可运行性。
- Windows 的 LKG fence 外层调用与实际恢复路径怎样衔接？局部 helper 与跳过的测试不足以给出全平台保证。
- 大型恢复结果如何分页/限额、多模态附件如何归档？现有文本恢复观察不能直接推广。
- 本机 CLI 版本与源码 release-merge 对应，但发布包与源码的逐文件一致性未核对。

## Prior documents

项目启动时没有研究报告或 ADR。此前聊天引用的 MC master 提交不同于本次固定 release，不作为本报告的 release 证据。

## Sources

来源均为两仓库固定提交的实现与测试；访问日期2026-11-07。发布者及源码快照：[cortexkit / MC](https://github.com/cortexkit/magic-context/tree/33fb6ac9a39c8bb299776b6b514ea0815a15a225)，提交日期2026-11-07；[deepseek-ai / DSH](https://github.com/deepseek-ai/deepseek-harness/tree/fcc0ad462172522aaf5c93a7b2e01f6b9f0b0159)，提交日期2026-11-04。逐条行号和符号在下列 digest 与 `claims-dsh.md`、`claims-mc.md` 中，按仓库分别进行机械锚点检查。

| ID | 来源与入口 | 证据范围 |
|---|---|---|
| [1] | [DSH Q1](digests/analyzer-q1-dsh.md)、[复核](digests/verifier-dsh.md)；deepseek-ai，fcc0ad46 | 请求、surface、flush、取消和配对 |
| [2] | [MC Q2](digests/analyzer-q2-mc.md)、[复核](digests/verifier-mc.md)；cortexkit，33fb6ac9 | 编号、缩减、原始恢复与边界 |
| [3] | [MC Q3](digests/analyzer-q3-mc.md)、[复核](digests/verifier-mc.md)；cortexkit，33fb6ac9 | 源码别名、宿主与运行依赖 |
| [4] | [两端测试 Q4](digests/analyzer-q4-tests.md)、[复核](digests/verifier-tests.md)，其中 MC 33fb6ac9 | fixture、SIGKILL、原文恢复 |
| [5] | [两端测试 Q4](digests/analyzer-q4-tests.md)、[复核](digests/verifier-tests.md)，其中 DSH fcc0ad46 | 结构重建、保留原始事件、真实缓存测试条件 |

## Verification and freshness

每问最多深入15个文件；实际分别15、15、15、13个，允许不同问题重复读取同一文件。无新增历史问题。源码通过固定提交的 Git 对象读取；项目需求不作为事实证据。两名定位研究员、四名分析员与独立复核员分别工作，研究员未收到产品需求草案。[1][2][3][4]

已完成15项关键事实的独立语义复核；按仓库检查的29处源码锚点全部定位成功。引用编号与来源表一致，相关文件的12个本地链接均存在。脚本只接受单仓库根，因此分别检查 companion claims，不将两个 SHA 混在一个根下检查。PRD 与设计仍为待用户确认的草案，研究完成不授权实现。

结构与措辞检查的处理记录见 `review-structure.md`、`review-prose.md`；设计可执行性检查及未决事项见 `review-builder.md`。PRD 的标识和目录检查未发现未定义、重复或失效条目。这些均为文档/源码证据校验，不是运行期通过记录。

固定版本升级、DSH 请求/surface 契约变更、worker/SQLite依赖或模型提供商变化时需要重查。临时 clone 不是产品运行依赖；证据保留远程仓库、完整提交和相对路径，可重新获取。
