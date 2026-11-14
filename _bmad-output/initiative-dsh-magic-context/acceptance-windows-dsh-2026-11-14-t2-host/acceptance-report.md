# T2 宿主验收报告（#13 A result-return expand）

日期：2026-11-14
对象：`dsh-plugin-magic-context@0.11.2` 本地构建（含 T2 改动）
宿主：`@deepseek-ai/dsh@0.2.2-rc.1`
运行模式：DSH headless，真实 DeepSeek `deepseek-official/deepseek-flash`，隔离 profile

## 0. 结论

**T2 中宿主可观测的 1、2、3a、4、5（`tags` 多 tag）、6、7（代表性失败）通过。** 在真实 DSH 进程和真实模型下，`ctx_expand` 把原文作为**新的工具结果**返回；旧的 `[dropped §1§]` 占位符仍在 surface 上；旧 tag 再次 `ctx_reduce` 返回 `already dropped`；新结果获得新 tag，并可再次 reduce/expand；`tags:"1,2"` 仍按旧式逗号列表工作；`no such tag`、`not dropped` 和 `tags:"1,999"` 的部分失败都返回逐 tag 结果；跨进程重启后仍从持久化日志恢复原文，即使磁盘 fixture 已改。

**3b（pending no-op）和 7 的其余失败名仍只有单元/集成证据。** 9（保留期）、10（Historian/flush）不在 T2。`tags` 多 tag 的单份 payload hash 不适用（按票面约定）。

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
| 模型 | `deepseek-official/deepseek-flash`（provider `deepseek-official`），通过 `llm-deepseek-api-key` 扩展；只记录 key 存在，不读取值 |
| 隔离根 | `C:\Users\elvis\AppData\Local\Temp\opencode\dsh-mc-t2-20261114-010407` |
| 证据 | 上述根下的 `evidence/`；`t2-analysis.json`、`t2-db-proof.json`、各 `*.driver.json`、`session-observer/*.jsonl` |

加速/隔离条件（已披露，不用于与默认配置做性能比较）：

- `policy.executeThreshold = 0`，让 queued drop 在下一步前落地；
- `registerCompactionEngine = false`，关闭宿主 compaction 引擎；
- `historianEnabled = false`，本报告不覆盖 Historian（T3）；
- `maintenance.enabled = false`；
- `memory` 用户渲染/收集/复核与 `machine` 域关闭；**写入/auto-promote 未关闭**（DB meta：`memory_write=read-write auto-promote`、`autoPromote=true`）；本次没有观察到 `memories.db` 内容被写入；
- `--permission-mode read-only`，`--approval-policy never`；
- 独立 `DSH_HOME`、`HOME`、`USERPROFILE`、`XDG_*`、`APPDATA`、`LOCALAPPDATA`，不复用日常 profile。

## 2. 验收项与结果

| T2 验收项 | 结果 | 宿主证据 |
|---|---|---|
| 1. result-return expand | **通过** | `ctx_expand` 的工具结果为 `§3§ §1§ <原文件内容>`；旧 `[dropped §1§]`（event seq 28）仍在 `surface` 上；旧占位符未被改写 |
| 2. 单 tag 载荷完整性 | **通过** | `SHA-256(event 20 全文) = SHA-256(event 34 去掉外层 §3§ + 一个尾随空格) = fc8d53e54a918499c2e8fc5ac35a46de08dc79b9e82643f86e0eeb3e597d2414`，见 `t2-hash-pair.json`；`t2-analysis.json` 中 event 20 的 `fd8984…` 是再剥掉原始 `§1§ ` 后的另一个投影，不是比较对象 |
| 3a. 旧 tag landed no-op | **通过** | 展开后再次 `ctx_reduce drop:"1"`，回执 `§1§ not queued: already dropped.`；数据库 `pending_drops` 中 tag 1 的 `landed_event_seq=28`，`queued_at` 停留在第一次入队（6fc4 `1794589470989`、095d `1794589483444`），未新增 pending 行 |
| 3b. 旧 tag pending no-op | 单元/集成通过 | 宿主未单独构造；`tests/ctx-expand-result.spec.ts` 覆盖 |
| 4. 新 tag 生命周期 | **通过** | 展开结果新 tag 为 3；`ctx_reduce drop:"3"` 返回 `Queued 1 tag for reclaim.`；`ctx_expand tag:"3"` 返回 `§5§ §3§ §1§ <原文>`，再次得到同一 nonce |
| 5. API 形状 | **通过** | 正式参数 `tag` 在回环/生命周期/重启场景使用；`tags:"1,2"` 在补充场景中由宿主接受，按请求顺序返回两份原文，新 tag 5 覆盖合并结果；`tags` 多 tag 不适用单份 hash |
| 6. 跨进程重启 | **通过** | 第一进程 read + reduce 后退出；磁盘 fixture nonce 改为 `22cf...`；新进程 `--session-id` 恢复，`ctx_expand tag:"1"` 返回旧 nonce `bdff...`，随后 `ctx_reduce` 仍为 `already dropped`；PID 13328 → 27236，observer 同一 session 的 processId 随之变化 |
| 7. 失败路径 | 部分宿主通过 | 宿主触发 `no such tag`、`not dropped`、`tags:"1,999"` 的部分失败；`not a tool-result tag`、`tag no longer available`、`cross-session tag`、`not dropped yet`、`raw source unavailable`、`no-session` 仍由单元/集成测试覆盖 |
| 8. 测试 | 通过 | 全量 76 文件 / 818 用例，见 `evidence/unit-test.txt`；typecheck 通过，见 `evidence/typecheck.txt`。目标子集 4 文件 / 37 用例是先前运行，未单独留日志 |
| 9. 保留期对齐 | 不在 T2 | 属 T5；本报告不覆盖 |
| 10. Historian/flush | 不在 T2 | 分别属 T3 / T4；本报告不覆盖 |

## 3. 关键运行摘要

| 场景 | 宿主进程 | 工具调用 | 结果 |
|---|---|---|---|
| 回环 + 旧 tag no-op | 1 | `read` → `ctx_reduce 1` → `ctx_expand tag 1` → `ctx_reduce 1` | 旧 tag 回执 `already dropped`；最终文本含原 nonce |
| 新 tag 生命周期 | 1 | `read` → `ctx_reduce 1` → `ctx_expand 1` → `ctx_reduce 3` → `ctx_expand 3` | 新 tag 3 可回收，展开结果 `§5§ §3§ §1§` |
| `tags` 别名 + 失败路径 | 1 | 两次 `read` → `ctx_reduce 1` → `ctx_reduce 2` → `ctx_expand tags:"1,2"` → `ctx_reduce 5` → `ctx_expand 5` → `ctx_expand 999` → `read` → `ctx_expand 9` → `ctx_expand tags:"1,999"` | 旧式逗号列表可用；新 tag 5 覆盖合并结果；三个失败回执按预期 |
| 跨进程重启 | 2 | 第一进程 `read` → `ctx_reduce 1`；第二进程 `ctx_expand 1` → `ctx_reduce 1` | 恢复旧 nonce；旧 tag 仍 `already dropped` |

五次宿主调用均 `exit_code=0`，`final_reason.kind=completed`。

### 3.1 补充场景：`tags` 别名与失败路径

session `session-d8f87512-083e-47b2-a406-8d7ae005c08f`，driver `t2-alias-failures.driver.json`：

- 两次 `read` 得到 tag 1、2；分别 drop 后 `ctx_expand tags:"1,2"` 返回 `§5§ §1§ <原文>` + `\n\n---\n\n` + `§2§ <原文>`，旧 tag 1/2 的 `[dropped §1§]`、`[dropped §2§]` 仍在 surface；DB 中 tag 1/2 的 `landed_event_seq` 为 34/42。
- 新 tag 5 被 drop 后 `landed_event_seq=56`，surface 有 `[dropped §5§]`；`ctx_expand tag:"5"` 返回 `§7§ §5§ §1§ <原文>`。
- `ctx_expand tag:"999"` → `§999§ not restored: no such tag.`
- 第三次 `read` 得到 tag 9，不 drop，`ctx_expand tag:"9"` → `§9§ not restored: not dropped.`
- `ctx_expand tags:"1,999"` → 恢复 `§1§` 原文，并在末尾返回 `§999§ not restored: no such tag.`，不是整体成功。
- 汇总证据：`t2-alias-failures.analysis.json`；`t2-db-proof.json` 中 d8f session 的 tag 1/2/5 记录。

## 4. 证据索引

隔离根 `C:\Users\elvis\AppData\Local\Temp\opencode\dsh-mc-t2-20261114-010407\evidence\` 下：

- `preflight.json` — 插件 tarball、构建产物哈希、fixture 哈希、key 存在性
- `host-version.txt` — `0.2.2-rc.1`
- `t2-roundtrip.driver.json` / `.stdout.txt` / `.stderr.txt`
- `t2-lifecycle.driver.json` / `.stdout.txt` / `.stderr.txt`
- `t2-restart-drop.driver.json` / `.stdout.txt` / `.stderr.txt`
- `t2-restart-expand.driver.json` / `.stdout.txt` / `.stderr.txt`
- `t2-alias-failures.driver.json` / `.stdout.txt` / `.stderr.txt`
- `t2-analysis.json` — surface 节点、占位符存活、去外层标记后的 SHA 匹配（派生文件）
- `t2-hash-pair.json` — event 20 全文与 event 34 去外层标记后的直接哈希对
- `t2-alias-failures.analysis.json` — tags 别名、新 tag 5、三个失败回执与 DB 落地状态
- `t2-db-proof.json` — `tags` / `pending_drops` 的持久化状态（含 `queued_at`）
- `session-observer/*.jsonl` — 逐个 session 的完整事件与 surface 快照

本目录 `evidence/` 是仓库内副本，保留：`t2-analysis.json`、`t2-hash-pair.json`、`t2-alias-failures.analysis.json`、`t2-db-proof.json`、五个 driver JSON，以及 `unit-test.txt` / `typecheck.txt`（本轮 `npm test` 与 `npm run typecheck` 原始输出）。`session-observer` 原始 JSONL 体积较大，保留在隔离根，不纳入仓库。报告中的分析 JSON 是派生证据；直接证据是隔离根下的原始 driver 与 observer JSONL，以及 `t2-hash-pair.json`、`t2-alias-failures.analysis.json` 和 `t2-db-proof.json`。

## 5. 隔离事故（必须披露）

第一次 T2 运行使用的 overlay 由旧根路径生成时只替换了反斜杠形式，导致 `dataDir` 和 observer `outDir` 仍指向已完成的 T0-B 根 `dsh-mc-acceptance-0112-j4ydat07`。三次 T2 运行因此写入了该根。

**实际污染范围（独立审计后修正）：**

- **T0-B plugin DB**：`plugin-data/dsh-magic-context.db` 追加了 3 个 T2 首轮 session（`session-f598f83e…` 4 个 tag、`session-8607d3bd…` 5 个 tag、`session-230861c4…` 4 个 tag；共 13 个 tags、4 条 `pending_drops`）。T0-B 原有 session 行仍在。
- **T0-B `plugin-data/activity.log`**：追加了首轮 T2 的 boot/pass/drop 记录，`dbPath` 指向 T0-B 的 plugin DB。
- **T0-B `evidence/session-observer`**：新增 3 个 T2 session JSONL；`engine-owners.jsonl` 从 14 行追加到 18 行（新增 PID 13688、21060、10796、968）。仓库内 T0-B 证据副本未变（仍是 6 个 observer 文件、14 行），被写的是隔离根里的原始证据目录。
- **仓库内 T0-B 报告/证据副本**：未被首轮 T2 运行改写；本轮只向 T0-B 报告追加了 5.1 披露。T0-B 结论不依赖这些追加行（其恢复、requeue、Historian 结论使用 observer seq、内容哈希、stdout 和独立 `unit-requeue` DB）。但“T0-B 的 DB/observer 证据目录仍是原始基线”不再成立。

处理：

- 立即停止使用该根；首轮 T2 根 `dsh-mc-t2-20261114-010038` 的指针归档为 `experiment-root-contaminated-t0b.json`（该文件记录的是 `010038`，不是 T0-B 根）；
- 修正路径替换为同时处理 `\` 与 `/`，并增加“overlay 不得引用旧根”的断言；
- 在全新根 `dsh-mc-t2-20261114-010407` 重新执行全部三个场景；本报告只采用新根证据。

**日常 profile**：未发现 T2 写入日常 DSH/OpenCode profile、日常会话库或日常插件数据目录的证据；对 `~/.local/share/cortexkit/magic-context` 只做了 mtime 抽查，不是全量哈希证明。

## 6. 限制

- 只验证一个模型、一个合成 fixture、一个 isolated profile；不证明所有模型或真实项目内容。
- 宿主已触发 `tags` 多 tag、`no such tag`、`not dropped` 和 `tags:"1,999"` 部分失败；其余失败名（`not a tool-result tag`、`tag no longer available`、`cross-session tag`、`not dropped yet`、`raw source unavailable`、`no-session`）仍由单元/集成测试覆盖。
- Historian 覆盖、`/ctx-flush`、保留期不在本报告；分别由 T3/T4/T5 承担。
- 未做默认窗口压力、满窗 compaction、并发/崩溃恢复。
- 本报告是 T2 范围的宿主验收，不替代 0.11.2 全量基线报告。
