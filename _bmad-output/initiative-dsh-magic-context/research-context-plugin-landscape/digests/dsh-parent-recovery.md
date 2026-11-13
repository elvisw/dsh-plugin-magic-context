# DSH 生态补查：主代理恢复批次

访问日：2026-11-09。原因：原生态研究子任务ECONNRESET且当时无已保存摘要；本批只补三项直接相关方案。证据为本次websearch发现后实际取得的一方README、npm registry和GitHub元数据，未安装、未执行测试。

## dsh-multi-window-context-management

- Publisher：overact / npm。仓库：https://github.com/overact/dsh-multi-window-context-management
- 实读README：https://raw.githubusercontent.com/overact/dsh-context-management/main/README.zh-CN.md （旧仓库名重定向后的当前内容）；可固定到 https://github.com/overact/dsh-multi-window-context-management/blob/9dfab4803545a8d5d9c66c60ec77cfa302d94991/README.zh-CN.md
- npm：https://registry.npmjs.org/dsh-multi-window-context-management 。latest=0.7.0，发布时间2026-11-09T09:13:30.312Z，gitHead=9dfab4803545a8d5d9c66c60ec77cfa302d94991。
- README当前标题已改成新包名，版本0.7.0，作者声称针对DSH0.2.2-rc.1验证；不替换、不继承、不修补原生压缩引擎，监听压缩后追加窗口交接。工具new_context、notes_read/write、history_search/read。
- 关键原文：“item_<seq> 是稳定事件地址”；“history_read 的 format: json 可分页读取完整原始事件，包括调用参数和元数据”；“所有工具限定在调用者的会话内，不暴露会话选择参数”。恢复后重建窗口元数据；会话笔记独立持久化。
- 所以：不是只有摘要，已覆盖**同一会话跨窗口的历史原文分页恢复**；不开放任意跨会话工具访问，也不是ctx_reduce/ctx_expand同形实现。不能把所有压缩插件都写成不可找回原文。
- README有fixture/恢复测试说明，但本次未运行；恢复能力与宿主兼容性medium / unverified。版本发行记录high（限记录存在）。GitHub pushed_at=2026-11-09T08:19:57Z，未归档。
- 搜索返回过旧标题dsh-context-management / 0.3.6，已被本次当前README及registry0.7.0推翻，不采用旧摘要作为当前事实。

## dsh-context-rollover

- Publisher：athif23 / npm。仓库：https://github.com/athif23/dsh-context-rollover
- 实读README：https://raw.githubusercontent.com/athif23/dsh-context-rollover/main/README.md
- npm：https://registry.npmjs.org/dsh-context-rollover 。latest=0.2.2，发布时间2026-09-16T07:17:50.857Z，gitHead=0f3e381698283fdf1a507afac84328a54b49e318。
- 作者定义：“fresh working context + durable model-managed notes + small recent raw tail + recoverable full history”。不调用摘要模型，使用确定性checkpoint；提供new_context、get_context_remaining、notes、history(search/read over shadowed events)。
- 原始会话事件继续持久化，可定向检索读取；不是项目级语义记忆，也不是复制全部历史回工作窗口。Scope明确“Notes survive context rollovers within a session; no cross-session sync, embeddings, or cloud storage”。
- Web只在standard-rollover实验preset生效；默认standard不获得这些工具/指导。替换compaction backend，需要注意与其他provider冲突。
- 兼容说明仍写0.1.6-alpha.1 / npm0.0.1-rc.1，不把类型检查外推为当前DSH0.2.2运行兼容；文档有Windows junction注意事项，不能算本机验证。
- 能力：作者文档medium / unverified；发行元数据high（只限分发记录）。

## dsh-observational-memory

- Publisher：EPCN-fla / npm。仓库：https://github.com/EPCN-fla/dsh-observational-memory
- 本次实读为已发布0.4.1快照：https://cdn.jsdelivr.net/npm/dsh-observational-memory@0.4.1/README.en.md
- npm：https://registry.npmjs.org/dsh-observational-memory 。latest=0.4.3，发布时间2026-10-30T14:29:10.863Z，gitHead=23543fbd3c413e4767759bd322798f88b50b17b5。不能把0.4.1README当作0.4.3逐项实测。
- observer → reflector → dropper后台提炼；非空记忆在compaction时确定性render，**后台worker仍调用模型**，不能宣称总成本为零。
- recall(id)按记忆ID精确恢复观测/反思背后的带时间戳原始证据；原文：“It is an exact lookup, not search: the model cites ids it saw in compacted memory.”
- ledger存储在按session划分的插件文件中；Memory tab、工作进度/日志、rollback是作者文档列出的UI。不是任意跨会话全文检索，也不是ctx_reduce/ctx_expand完整对等物。
- README0.4.0兼容表截止DSH0.2.1预发布线，本次未验证0.4.3和DSH0.2.2。能力medium / unverified；发行记录high（只限元数据）。

## 本批检索边界

- 搜索词：`"deepseek-harness" "context" "plugin" memory compaction`。
- 搜索还出现dsh-context-truth、@muou000/improved-compact、dsh-agent-compact，以及官方Discussion #2783里memento/memory-plus等；未逐一实读，不纳入已核实候选矩阵。
- 这已足以否定“除了指定项目，DSH没有其他相关方案”。不声称生态穷尽，也不凭README保证可组合安装。
