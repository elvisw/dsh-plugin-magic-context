# T2 宿主验收报告（#13 A result-return expand）

日期：2026-11-14
对象：`dsh-plugin-magic-context@0.11.2` 本地构建（含 T2 改动）
宿主：`@deepseek-ai/dsh@0.2.2-rc.1`
运行模式：DSH headless，真实 DeepSeek `deepseek-flash`，隔离 profile

## 0. 结论

**T2 的宿主级验收通过。** 在真实 DSH 进程和真实模型下，`ctx_expand` 把原文作为**新的工具结果**返回；旧的 `[dropped §1§]` 占位符仍在 surface 上；旧 tag 再次 `ctx_reduce` 返回 `already dropped`；新结果获得新 tag，并可再次 reduce/expand；跨进程重启后仍从持久化日志恢复原文，即使磁盘 fixture 已改。

这不是 0.11.2 的完整基线复验，也不是 T3/T4/T5 的验收。范围仅限 T2 的 #13 A 行为。

## 1. 环境与构建身份

| 项 | 值 |
|---|---|
| 宿主 | `@deepseek-ai/dsh@0.2.2-rc.1`（`host-version.txt` = `0.2.2-rc.1`） |
| Node | `v24.21.0` |
| 插件 | `dsh-plugin-magic-context@0.11.2`，本地构建 |
| 安装来源 | `npm pack` 生成的 tarball，SHA-256 `0c25e8211168295ab272e04486e4c6cfa3e41bc5cd62a0f2f5de921aa0c16188` |
| 关键构建产物 | `lib/dsh/tool-bridge.js` SHA-256 `fc225d1db44aa9c2aadb075181190d843765434e71b630ec6d0d506331775860` |
| 安装一致性 | 安装后的 `tool-bridge.js` SHA-256 与本地构建**完全一致** |
| 模型 | `deepseek-flash`，通过 `llm-deepseek-api-key` 扩展；只记录 key 存在，不读取值 |
| 隔离根 | `C:\Users\elvis\AppData\Local\Temp\opencode\dsh-mc-t2-20261114-010407` |
| 证据 | 上述根下的 `evidence/`；`t2-analysis.json`、`t2-db-proof.json`、各 `*.driver.json`、`session-observer/*.jsonl` |

加速/隔离条件（已披露，不用于与默认配置做性能比较）：

- `policy.executeThreshold = 0`，让 queued drop 在下一步前落地；
- `registerCompactionEngine = false`，关闭宿主 compaction 引擎；
- `historianEnabled = false`，本报告不覆盖 Historian（T3）；
- `maintenance.enabled = false`；
- `memory` 全局写入/渲染关闭；
- `--permission-mode read-only`，`--approval-policy never`；
- 独立 `DSH_HOME`、`HOME`、`USERPROFILE`、`XDG_*`、`APPDATA`、`LOCALAPPDATA`，不复用日常 profile。

## 2. 验收项与结果

| T2 验收项 | 结果 | 宿主证据 |
|---|---|---|
| 1. result-return expand | **通过** | `ctx_expand` 的工具结果为 `§3§ §1§ <原文件内容>`；旧 `[dropped §1§]`（event seq 28）仍在 `surface` 上；旧占位符未被改写 |
| 2. 单 tag 载荷完整性 | **通过** | 去掉新的外层 `§3§ ` 后，内容与原始 read 结果逐字节相等；`t2-analysis.json` 的 `stripped_matches_earlier_result=true`；SHA-256 由分析脚本计算 |
| 3a. 旧 tag landed no-op | **通过** | 展开后再次 `ctx_reduce drop:"1"`，回执 `§1§ not queued: already dropped.`；数据库 `pending_drops` 中 tag 1 的 `landed_event_seq=28`，未新增 pending 行 |
| 3b. 旧 tag pending no-op | 单元/集成通过 | 宿主未单独构造；`tests/ctx-expand-result.spec.ts` 覆盖 |
| 4. 新 tag 生命周期 | **通过** | 展开结果新 tag 为 3；`ctx_reduce drop:"3"` 返回 `Queued 1 tag for reclaim.`；`ctx_expand tag:"3"` 返回 `§5§ §3§ §1§ <原文>`，再次得到同一 nonce |
| 5. API 形状 | 部分宿主通过 | 三次真实运行全部使用正式参数 `tag`；`tags` 多 tag 别名只在单元/集成测试覆盖，未在宿主路径触发 |
| 6. 跨进程重启 | **通过** | 第一进程 read + reduce 后退出；磁盘 fixture nonce 改为 `22cf...`；新进程 `--session-id` 恢复，`ctx_expand tag:"1"` 返回旧 nonce `bdff...`，随后 `ctx_reduce` 仍为 `already dropped` |
| 7. 失败路径 | 单元/集成通过 | `no such tag`、`not a tool-result tag`、`tag no longer available`、`not dropped`、`not dropped yet`、`raw source unavailable`、`no-session` 未逐一在宿主触发；测试覆盖 |
| 8. 测试 | 通过 | 目标 4 文件 / 37 用例；全量 76 文件 / 818 用例；typecheck 通过 |
| 9. 保留期对齐 | 不在 T2 | 属 T5；本报告不覆盖 |
| 10. Historian/flush | 不在 T2 | 分别属 T3 / T4；本报告不覆盖 |

## 3. 关键运行摘要

| 场景 | 宿主进程 | 工具调用 | 结果 |
|---|---|---|---|
| 回环 + 旧 tag no-op | 1 | `read` → `ctx_reduce 1` → `ctx_expand tag 1` → `ctx_reduce 1` | 旧 tag 回执 `already dropped`；最终文本含原 nonce |
| 新 tag 生命周期 | 1 | `read` → `ctx_reduce 1` → `ctx_expand 1` → `ctx_reduce 3` → `ctx_expand 3` | 新 tag 3 可回收，展开结果 `§5§ §3§ §1§` |
| 跨进程重启 | 2 | 第一进程 `read` → `ctx_reduce 1`；第二进程 `ctx_expand 1` → `ctx_reduce 1` | 恢复旧 nonce；旧 tag 仍 `already dropped` |

四次宿主调用均 `exit_code=0`，`final_reason.kind=completed`。

## 4. 证据索引

`C:\Users\elvis\AppData\Local\Temp\opencode\dsh-mc-t2-20261114-010407\evidence\` 下：

- `preflight.json` — 插件 tarball、构建产物哈希、fixture 哈希、key 存在性
- `host-version.txt` — `0.2.2-rc.1`
- `t2-roundtrip.driver.json` / `.stdout.txt` / `.stderr.txt`
- `t2-lifecycle.driver.json` / `.stdout.txt` / `.stderr.txt`
- `t2-restart-drop.driver.json` / `.stdout.txt` / `.stderr.txt`
- `t2-restart-expand.driver.json` / `.stdout.txt` / `.stderr.txt`
- `t2-analysis.json` — surface 节点、占位符存活、去外层标记后的 SHA 匹配
- `t2-db-proof.json` — `tags` / `pending_drops` 的持久化状态
- `session-observer/*.jsonl` — 逐个 session 的完整事件与 surface 快照

本目录的 `evidence/` 已保留关键 JSON 和 driver 记录；`session-observer` 原始 JSONL 体积较大，保留在上述隔离根，不纳入仓库。

## 5. 隔离事故（必须披露）

第一次 T2 运行使用的 overlay 由旧根路径生成时只替换了反斜杠形式，导致 `dataDir` 和 observer `outDir` 仍指向已完成的 T0-B 根 `dsh-mc-acceptance-0112-j4ydat07`。三次 T2 运行因此向该根写入过会话/tag 数据。

处理：

- 立即停止使用该根；旧指针改名为 `experiment-root-contaminated-t0b.json` 留档；
- 修正路径替换为同时处理 `\` 与 `/`，并增加“overlay 不得引用旧根”的断言；
- 在全新根 `dsh-mc-t2-20261114-010407` 重新执行全部三个场景；本报告只采用新根证据；
- T0-B 的原始报告与证据文件未被改写，但其 `plugin-data` 数据库不再是纯净基线。后续引用 T0-B 数据库时必须以这一点为准。

本事故未触碰日常 DSH profile、日常会话库或日常插件数据目录。

## 6. 限制

- 只验证一个模型、一个合成 fixture、一个 isolated profile；不证明所有模型或真实项目内容。
- 未触发 `tags` 多 tag 别名、失败路径、Historian 覆盖、`/ctx-flush`、保留期；分别由单元测试或 T3/T4/T5 承担。
- 未做默认窗口压力、满窗 compaction、并发/崩溃恢复。
- 本报告是 T2 范围的宿主验收，不替代 0.11.2 全量基线报告。
