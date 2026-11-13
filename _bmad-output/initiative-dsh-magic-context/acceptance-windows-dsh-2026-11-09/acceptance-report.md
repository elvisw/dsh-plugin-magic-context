# Windows＋真实 DSH 隔离验收

日期：2026-11-09。实验已完成；**现有插件基本可用，但未通过“历史始终可逆恢复”的完整验收。建议先向上游贡献两个受限改进，不建议从零重做。**

**解释与建议更新：2026-11-10。** 以下运行结果仍属于插件 `dsh-plugin-magic-context@0.11.1`、DSH 宿主 `0.2.2-rc.1` 的既有实验。“历史始终可逆恢复”是本项目的验收目标，不是已证实的竞品承诺。后续核查原版并调整 #13、#14，只更新结论解释与改进建议，未重跑实验或验证修复。

| 场景 | 结果 | 证据 |
|---|---|---|
| Windows安装与真实宿主加载插件 | 通过 | 固定0.11.1，真实DSH加载、实际模型调用与工具执行成功 |
| 工具输出回收后精确恢复 | 通过 | 当前上下文确实出现占位符，再被原文替换；内容、身份字段、SHA-256一致 |
| 退出/重启后恢复 | 通过 | 不同进程恢复同一会话；磁盘文件已改变，恢复仍为旧历史原文 |
| 原位恢复后再次回收同一tag（插件0.11.1） | **失败：现有语义下的可复现缺陷** | 再次reduce显示Queued，但实际未再次回收；独立存储复现断言失败。若改为返回新结果，此旧tag用例不再适用 |
| 自动Historian生成并发布摘要 | 通过：加速条件下 | 真实模型生成摘要，并实际替换上下文中的9个节点 |
| Historian遮蔽后按旧tag恢复 | **现有路径不可达；能力边界待确认** | 新会话内的首次回收占位符被摘要覆盖后，expand拒绝恢复；原文仍在原始事件日志。不据此判定违反插件承诺 |
| 项目记忆跨会话读取/FTS | 通过 | 会话A写入项目事实，会话B通过FTS检索读到，结果携带相同记忆ID |
| 跨会话按旧tag恢复原始工具输出 | 未支持此路径 | 新会话的expand不能取得旧会话原文；不等于所有历史搜索能力都不存在 |
| compaction显式接管与恢复宿主引擎 | 注册层面通过 | 显式禁用basic后MC接管；禁用MC注册后宿主basic恢复 |
| 同时启用两个压缩引擎 | 配置风险 | 本次MC先占服务、basic未激活；stderr有警告，但进程仍退出0，并非自动安全回退 |

## 运行边界
Windows、Node24.21.0、DSH0.2.2-rc.1、dsh-plugin-magic-context0.11.1。复用已安装宿主，不复用用户profile或真实会话。全部模型场景使用真实DeepSeek API，路由为deepseek-official/deepseek-flash，未使用模拟模型。

临时根目录：`C:/Users/elvis/AppData/Local/Temp/opencode/dsh-mc-acceptance-kngotjd0`。仅对子进程重定向DSH_HOME、HOME/USERPROFILE、XDG、APPDATA/LOCALAPPDATA和包缓存；插件dataDir显式指向实验目录。关闭遥测、后台维护、用户画像采集和embedding/vector回填。凭据仅继承环境变量，不写入配置或报告。

npm发行包SHA-512与registry一致，检查了62个归档条目，无链接条目；未发现安装期生命周期脚本。安装限定到临时profile，并禁用依赖安装脚本。实验执行时未修改目标插件产品代码、现有PRD或日常DSH配置，未提交Git、未部署。2026-11-10 另经授权同步本地文档，PRD只补充研究输入与待重评标注，不改需求范围。实验目录保留用于复核；后续公开反馈见下文。

## 原文恢复证据

不是把模型回复“成功”当通过：observer记录真实宿主事件及当前上下文表面，分析`原始tool/result → 占位符 → 恢复tool/result`的来源链，比较完整content数组及其余消息字段。

- 会话内：session-7f20e2db-2f37-4c11-93b2-77398bdd4085，事件20→28→34。
- 跨进程：session-a31842e2-cdac-40d2-ba84-c2ad5b8da71c，事件20→28→48；至少两个不同进程。
- 两者原始文本UTF-8长度均为501字节；规范化content JSON的原始/恢复SHA-256均为`f389c94eacecfa7828160625f50bffd239aeb76bdeb7b898711211f478fa02c2`。
- 重启前已替换磁盘fixture的nonce；恢复旧nonce证明不是重新读盘或由模型重写。
- headless stdout的工具预览约8KB，不能据此判断原文截断。Historian负载的实际宿主事件保留28465字符，远大于stdout预览。

详见[evidence/restoration-analysis.json](evidence/restoration-analysis.json)。

## 缺陷1：插件原位恢复后再次reduce未生效

在Historian关闭的独立会话session-39d42cc1-efb0-42b7-8061-4bf5e6048d54执行：

`read → reduce(1) → expand(1) → reduce(1) → expand(1)`。

第一次恢复成功；第二次reduce仍称Queued，但事件里只出现过一次drop。第二次expand返回“no dropped item carries this tag”。这不是原文丢失：它仍在当前上下文；缺陷在于再次回收没有实际发生。

**为何再次回收旧tag有意义：**插件0.11.1的`ctx_expand`将原文替换回当前上下文的原节点位置，自己的工具回复只是状态确认。本场景事件21（原文）→31（占位符）→37（原文）先后占据同一位置，恢复后仍对应tag 1；因此再次reduce(1)是当前设计下的有效请求。原版已核查的OpenCode实现则独立读取历史、将原文作为新的工具结果返回；在这种语义下，后续应回收新结果的tag，而不是再次回收旧tag。两种契约不能混用，固定源码引用见[Issue #13留档](issue-requeue.md)。

发行包`lib/core/stores.js:466–471`给出直接原因：queueDrop遇到已落地记录只更新queued_at，不把landed_event_seq清空；listPendingDrops却只选该字段为NULL的行。完整宿主复现与存储层复现相互印证，且检查过提取包与实际安装文件逐字节一致。

运行`node repro_requeue.mjs`，插件0.11.1预期退出1：期待pending为[1]，实际为[]。这是已运行的现有原位恢复路径缺陷复现，不是已修复的回归测试，也不能直接作为建议的新语义的验收要求。详见[evidence/requeue-regression.txt](evidence/requeue-regression.txt)。

## 能力边界2：Historian摘要遮蔽后旧tag路径不可达

采用全新会话session-2a5ef657-e236-4270-bbc3-4c4d4998799d，确保只做首次drop，排除缺陷1的干扰：

1. 读取小fixture并reduce(1)，事件31的占位符确实处于当前上下文。
2. 读取约27KB合成负载；退出并恢复会话，触发真实后台Historian。
3. Historian用4.281秒生成摘要；事件61发布compartment，来源列表明确包含占位符31，替换9个节点。
4. 下一步expand(1)返回“no dropped item carries this tag”。原始事件21仍存在，原占位符却已不在当前上下文。

因此是**恢复接口不可达，而非证据表明物理原文被删除**。实测确认的是现有旧tag路径失效，不是所有可能的历史读取方式都经过测试，也不是已确认的契约违例。#14的改进诉求是摘要发布后提供独立原文检索入口，可以使用持久化tag或稳定消息/事件标识，不强求旧tag，不要求撤销摘要或重建旧位置。

**原版参考的边界：**核查OpenCode适配器固定提交`17801ffd2f9635af1abae893e37914359110f2c1`的源码与测试，未另行运行原版验收。TS模式可按持久化tag索引读取原始内容；消息/范围路径不依赖当前占位符；Rust模式明确拒绝tag查询并引导使用消息序号/范围。DSH事件序号不等于原版消息序号，不能直接照搬编号。具体引用见[Issue #14留档](issue-historian-recovery.md)。原版也不承诺数据已删除时仍能完整恢复。

**加速条件必须披露：**测试将catalog窗口由原始约1M改为32768，executeThreshold=0、historianProtectedNodes=1、historianMinNodes=1，并禁用宿主tool-result-pruner；测试driver仅等待15秒，让真实异步摘要完成。没有伪造usage、摘要或恢复结果。这证明该路径的行为，不等于默认阈值、真实1M长会话、连续多次Historian或超时恢复都已验收。

第一次探索会话混入了重复回收缺陷，故不用于建立Historian因果结论；最终结论仅使用上述独立重测。详见[evidence/historian-fresh-analysis.json](evidence/historian-fresh-analysis.json)。

## 采用建议

1. **不要从零重做大而全插件。**安装、真实工具回收、精确恢复、重启持久化、项目事实跨会话复用均有运行证据。
2. **优先上游贡献：**#13建议对齐原版的独立历史读取与新工具结果返回，原节点保持已回收状态，需要回收返回内容时使用新tag；若保留原位恢复，再修requeue状态转换。#14建议让摘要发布后的原文可独立寻址，不依赖占位符可见、不强求旧tag或撤销摘要。只改返回方式并不会自动解决历史定位，二者都需配套测试。以上是建议，未实现或验证，也不代表本项目已批准该技术设计。
3. 日常试用需固定版本、备份会话，明确互斥配置。关闭Historian可避开本次遮蔽路径，但不等于原生compaction或其他压缩路径都可逆；不能宣传为“历史始终能完整取回”。
4. 只有上游不接受恢复能力、且该需求确属硬要求时，才考虑围绕“归档可逆恢复”的受限fork。

## 证据与复核

### 后续源码核查与功能建议（2026-11-11）

- 新增 [Issue #15：增加 /ctx-flush，手动强制处理当前会话待回收队列](https://github.com/wk544863858/dsh-plugin-magic-context/issues/15)，[正文与固定源码留档](issue-ctx-flush.md)。核查时上游 HEAD 仍为 `93ef5fe4a06a2c05f53e6a6225346919e860d74e`，插件为 `dsh-plugin-magic-context@0.11.1`：已有自动队列处理能力，但未发现用户主动强制 flush 的命令或等价入口。
- 原版 `v0.49.30` 已有核心 executeFlush；另核对固定提交 `3c2b53940270b7e020b8ee23e8ce10214430f50e` 的命令文档与 Pi 刷新信号。目标是显式处理 pending、刷新相关缓存，最迟下一次模型请求生效，不是同步清空上下文或强制生成 Historian 摘要。
- #15 与 #13 的 requeue 状态缺陷、#14 的归档检索边界分别处理，新增命令不自动修复二者。本次只有源码/文档核查和功能建议，未新增模型实验、未验证新功能，不改变上表既有运行结果或原始证据；提交不等于维护者接受。

### 上游反馈（2026-11-09）

经用户授权，已用脱敏复现内容提交：

- [Issue #13：原位恢复后再次回收失效；建议 ctx_expand 对齐原版结果返回语义（插件 0.11.1）](https://github.com/wk544863858/dsh-plugin-magic-context/issues/13)。2026-11-10 经用户授权补充：插件 `dsh-plugin-magic-context@0.11.1`（DSH 宿主 `0.2.2-rc.1`）使用 surface replace 原位恢复，事件21→31→37先后占据同一位置，因此现有语义下再次回收同一tag有意义；优先建议改为原版的独立历史读取与工具结果返回，新返回内容按新tag回收，不再要求旧tag重新入队。保留原位恢复时的状态修复作为备选。正文留档：[issue-requeue.md](issue-requeue.md)。
- [Issue #14：Historian 发布后提供独立的原文检索入口（参考上游 tag/消息序号恢复）](https://github.com/wk544863858/dsh-plugin-magic-context/issues/14)。按能力边界确认/改进建议提交，非直接判为契约违例；2026-11-10 经用户授权，依据原版实现修订为独立检索原文，不强求旧 tag 或撤销摘要，并补充 TS/Rust 模式差异和固定源码引用。正文留档：[issue-historian-recovery.md](issue-historian-recovery.md)。

未上传完整日志或会话归档；公开正文不含本机绝对路径或真实会话正文。提交成功不等于作者已经阅读、确认或修复。

- [evidence/run-summary.json](evidence/run-summary.json)：14次完成的headless调用、37个agent模型step、2次Historian模型调用。agent记录usage为input58434、cacheRead280576、output4928；辅助Historian另列，不能当货币账单。
- [evidence/engine-sweep.json](evidence/engine-sweep.json)：三个压缩引擎配置场景。
- [evidence/redacted-runtime.zip](evidence/redacted-runtime.zip)：脱敏stdout/stderr、调用参数与退出码、宿主事件/上下文快照、插件activity.log、profile与测试overlay。完整性摘要见[archive-sha256.txt](evidence/archive-sha256.txt)。仅对当时环境中敏感变量值做自动脱敏检查，不声称进行了通用秘密检测。
- 复核命令：`uv run python verify_acceptance.py`。它校验证据一致性与预期失败；退出0不意味着产品完整验收通过。
- 本次未覆盖：DSH桌面UI、其他宿主版本、多项目权限边界、默认百万token压力、原生compaction实际满窗触发、embedding语义检索、大规模检索质量、并发崩溃与多轮归档恢复。
