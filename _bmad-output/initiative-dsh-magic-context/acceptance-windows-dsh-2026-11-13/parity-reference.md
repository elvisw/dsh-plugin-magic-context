# T1 Reference — 上游研究记录 vs 插件运行证据

日期：2026-11-13
状态：**参考页，不是 parity gate。** T0-A 已取消，上游运行未执行；上游列引用既有研究（固定提交 `33fb6ac9` / `17801ffd`），证据等级是**源码/测试**，不是本机运行。插件列是 `dsh-plugin-magic-context@0.11.2` 在 DSH 上的 T0-B 运行证据。2026-11-13 修订：**不承诺兼容 fork 上游；语义目标改为原版 `cortexkit/magic-context`；#13 已选 A-only。**

## 版本口径

D1 的 `v0.49.55` 是当前上游版本标签；既有研究固定在 `33fb6ac9`（生命周期）与 `17801ffd`（Issue 对照）。不能把研究结论自动外推到未核查的后续差异；若未来需要运行级 parity，另立任务。

## 判定口径

- **一致**：两边都有本轮运行证据且行为相同。当前没有这样的行。
- **缺口**：插件缺少上游研究记录所描述的能力。
- **冲突**：两边语义相反，或插件回执与实际状态不一致。
- **有意适配**：插件按 DSH 限制选择不同实现，需 T1 明确接受。
- **未核查**：既有研究也没有覆盖，不能填“一致”。

## 矩阵

| 契约点 | 上游参考（研究记录，非运行） | 插件 `0.11.2`（本轮运行/源码） | 判定 | 去向 |
|---|---|---|---|---|
| `ctx_expand` 返回方式 | `research-context-lifecycle.md:49`：从原始历史读取并返回**新的工具结果**，不撤销缩减；`claims-mc.md:6`（ref=8）、`verifier-mc.md:8`、`analyzer-q2-mc.md:9` 均确认。 | 0.11.2 旧行为是原位替换；T2 宿主实测已改为新工具结果 `§3§ §1§ …`，旧占位符 seq 28 仍在 surface（`acceptance-windows-dsh-2026-11-14-t2-host/`）。 | **已实现/宿主通过** | T2 |
| 对已 dropped 的旧 tag 再 reduce | `analyzer-q2-mc.md:6`：`ctx_reduce` 验证并入队、去重、处理 compacted 冲突；对已 dropped 的 no-op 见 `issue-requeue.md:105-107`（Issue 源码核查，未运行）。 | T2 宿主实测：展开后再次 reduce 旧 tag 返回 `§1§ not queued: already dropped.`；`pending_drops` 仍为 landed。 | **已实现/宿主通过** | T2 |
| expand 新结果的 tag 分配 | `research-context-lifecycle.md:49`、`issue-requeue.md:106`：新结果按正常机制获得新 tag，后续回收新 tag。 | T2 宿主实测：新 tag 3 可 reduce，展开返回 `§5§ §3§ §1§ …`。 | **已实现/宿主通过** | T2 |
| 压缩/Historian 后按旧 tag 读取 | `research-context-lifecycle.md:51-53`：tag 按持久化身份；原始历史与 LKG 分离；恢复有类型边界。`analyzer-q2-mc.md:9-10` 确认 tag 路径读取 raw source，不要求占位符可见。 | compartment 1 覆盖 drop seq 34，发布后 `ctx_expand(1)` 返回 `no dropped item carries this tag`；原文事件 24 仍在 raw log（session-47130071…）。 | **缺口** | T3（#14，复用 A-only 读取） |
| `/ctx-flush` | `research-context-plugin-landscape.md:33`、`issue-ctx-flush.md:34-38`：`v0.49.30` 已有核心 flush，处理 pending，下一次消息生效，不生成摘要。 | 源码/运行均未发现 `ctx-flush`；`ctx_reduce` 只有排队，管理拍处理。 | **缺口** | T4（#15） |
| 工具参数形状 | `issue-historian-recovery.md:63`（源码核查）：`tag`、`message`、`start/end`、`verbose`；TS tag 路径可用，Rust 拒绝 tag。 | `ctx_expand {"tags":"1"}`（复数、逗号分隔）；`ctx_reduce {"drop":"1"}`。 | **已定（Q2/Q3）** | T2 实现 `tag`；T3 实现 `message`；`tags` deprecated 多 tag 别名 |
| 跨会话 raw history | 既有研究未给出上游运行级结论；插件边界见 `research-context-plugin-landscape.md:90`。 | `ctx_memory` 跨会话可用；`ctx_expand` 不能取另一会话 raw tool output（session-0c0c…）。 | **未核查/差异** | T1/T3 说明边界 |
| 跨会话项目记忆 | 上游有项目记忆；本轮未运行上游。 | 会话 A 写 memory 1；会话 B 读到同一 marker，observer 有 FTS 命中。 | **DSH 可用** | 基线保留 |
| tag 保留期 | 原版保留/清理策略未核对；插件 `tagsRetentionDays: 30` 是 fork 默认。 | 本轮未做 30 天边界。 | **已定（Q5）** | T5 移除 30 天 prune；不新增消息/会话删除路径 |
| 压缩引擎/互斥 | 上游有自身 compaction；本轮未运行。 | conflict/takeover 由 MC 注册；fallback 由宿主 basic 注册；仅注册层。 | **DSH 适配** | 不纳入上游 parity |

## T1 输入

1. **#13 已选 A-only**：`ctx_expand` 改为独立读取 + 新工具结果；旧节点保持 dropped；旧 tag reduce 为 no-op；新 tag 可回收；不再保留原位恢复。需定义参数形状、失败/降级、重复调用、tag 保留期。
2. **#14 与 A-only 合并**：Historian 后使用同一条只读路径；不要求占位符可见、不撤销摘要、不重新执行工具。需定义定位标识（持久化 tag；message/range 见 Q2）与数据缺失时的失败/降级。
3. **#15**：`/ctx-flush` 只处理当前会话 pending，最迟下一次模型请求生效，不触发 Historian；需定义缓存刷新、空队列、重复调用、无会话、功能关闭、存储失败。
4. **上游 API 形状**：原版是 `tag`/`message`/`start`/`end`/`verbose`；Q2 决定 V1 范围，Q3 决定是否保留 fork 的 `tags` 过渡别名。兼容目标是原版，不是 fork 上游。

## 明确不写

- 不写“上游与插件一致”（运行级）。
- 不写“上游已验证”。
- 不把研究记录或源码核查当作运行证据。
- 不把 #13/#14 的复现当作 T0 失败；它们是已知缺陷观察。
