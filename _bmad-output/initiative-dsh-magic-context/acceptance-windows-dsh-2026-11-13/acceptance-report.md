# Windows + Real DSH 0.11.2 Baseline Acceptance (T0-B)

日期：2026-11-13
状态：T0-B 完成；T0-A 取消（既有研究已覆盖，不再新跑，见第 6 节）。

## 1. 结论

在已覆盖的 DSH 场景上，`dsh-plugin-magic-context@0.11.2` 通过基线 gate：安装、真实宿主加载、同进程恢复、跨进程恢复、跨会话项目记忆、引擎注册均通过。**这不是完整产品验收**：

- #13（原位恢复后再次回收同一 tag）在 0.11.2 上仍可复现；第二次 reduce 显示 Queued，但没有第二次 drop，第二次 expand 被拒绝。
- #14（Historian 发布后按旧 tag 读取原文）在 0.11.2 上仍不可达；本次真实 Historian 已发布覆盖该 drop 的 compartment，expand 仍拒绝。
- 8a/8b/8c（0.11.2 的后台车道修复）未做宿主级覆盖；8a 没有“模型流永不 settle”的可用装置，8b/8c 未跑单测。
- 上游运行未执行；上游参考采用既有源码/测试研究记录（固定提交 `33fb6ac9` / `17801ffd`），不是本轮运行。本报告不新增上游运行证据，也不写运行级一致性结论。

因此：**0.11.2 可作为“DSH 可用”的基线，但不能宣称“历史始终可逆恢复”或“已对齐上游（运行级）”。** #13/#14 的契约与修复仍是 T1–T3 的范围。

## 2. 版本与运行模式

| 项 | 值 | 证据 |
|---|---|---|
| 宿主 | `@deepseek-ai/dsh@0.2.2-rc.1`，本地隔离安装，未全局安装 | `evidence/version-lock.json` |
| 宿主 lockfile | SHA-256 `38d9b33720a920dcc9b54b6c50cdc936ca74dfd3b8fb0f2876b04cfd5a1b3e88` | 同上 |
| DSH 子进程 Node | `24.21.0`（`nvm\installs\v24.21.0\node.exe`） | 同上 |
| 插件 | `dsh-plugin-magic-context@0.11.2` | `evidence/package-verification.json` |
| 插件 tarball integrity | `sha512-PSfr4ZL0kr7SygQK56unwaSUcv2GMb9uG8zFbPbz6fIe3jqrw4mKQw9AHNyS9NgwX39w2wwPpSzjzEkDphm9+w==` | 同上 |
| 插件 npm `gitHead` | `8d4b6aa78995cc35c43fc0377dd58f171f0fbb9e` | `evidence/version-lock.json` |
| 仓库 HEAD（运行窗口） | `d5dbad7047d08f22b83e2d5f867c310443937d10` | 同上 |
| 模型路由 | `deepseek-official/deepseek-flash`；真实 DeepSeek API；无模拟模型 | `evidence/smoke.stderr.txt`、`run-summary.json` |
| 隔离 root | `C:\Users\elvis\AppData\Local\Temp\opencode\dsh-mc-acceptance-0112-j4ydat07` | `experiment-root.json` |

插件 tarball 共 63 个包文件；安装文件与解包文件逐字节一致；`package.json` 只有 `prepublishOnly`，没有 `preinstall`/`install`/`postinstall`。

## 3. 结果表

| # | 场景 | 结果 | 关键证据 |
|---|---|---|---|
| 1 | 发行包完整性、无安装期脚本、安装文件一致 | **pass** | `package-verification.json`：63 文件、0 missing、0 mismatch |
| 2 | 隔离安装、宿主加载、真实模型调用 | **pass** | `smoke.stdout.txt`：`SMOKE_OK`；session-0128722d… |
| 3 | 同进程精确恢复 | **pass** | `restoration-analysis.json`：drop seq 28 → restore seq 34；content/identity/hash 全等 |
| 4 | 跨进程精确恢复 | **pass** | session-c6250978…；两个进程 23176/15424；drop 28 → restore 48；fixture nonce 已改 |
| 5 | 原位恢复后再次回收同一 tag | **observed：缺陷仍存在** | session-f1c2fddd…；只有一次 drop/restore；第二次 expand 返回 “no dropped item” |
| 6 | Historian 发布后旧 tag 恢复 | **observed：能力边界仍存在** | session-47130071…；compartment 1 覆盖 drop 34；expand 拒绝；原文事件 24 仍在 |
| 7 | 跨会话项目记忆 / FTS | **pass** | 会话 A 写 memory 1；会话 B 读到 `MEM_c886…`，observer 中有 FTS 命中 |
| 8a | 维护车道在“模型流永不 settle”下不永久停摆 | **not-covered** | 本轮无替身装置；不做无归因长跑 |
| 8b | verify skip 记忆不重复提问 | **not-covered** | 未跑单测；不冒充宿主级 |
| 8c | force band 过期读数 | **not-covered** | 未跑单测；不冒充宿主级 |
| 9 | 引擎互斥（注册层） | **pass（注册层）** | conflict/takeover = `MagicContextCompactionEngine`；fallback = `BasicCompactionEngine` |
| 10 | 披露、隔离、旧证据、凭据边界 | **pass（报告约束）** | 本报告第 5 节；旧证据 26 文件哈希未变 |

## 4. 关键证据

### 4.1 同进程恢复

session `session-5aac249a-ae41-4b3a-9f77-c8fa11fdd049`（进程 10672）：

- 原始工具结果 seq 20；drop 占位符 seq 28；恢复 seq 34。
- `content_equal = true`，`identity_equal = true`。
- 原始/恢复内容 SHA-256 均为 `4559d229958c5d4f424fdc3a967ed3bb14944763e999291049aa62bf52e5e6dc`。
- 原始文本 UTF-8 506 字节；**不是**旧 0.11.1 的 501 字节断言，旧的 `verify_acceptance.py` 未复用。

### 4.2 跨进程恢复

session `session-c6250978-c716-418b-b69b-df662e1d1d66`：

- 进程 23176 执行 `read → ctx_reduce`，退出；磁盘 `fixture.txt` 的 nonce 改为新值；进程 15424 恢复同一会话。
- drop seq 28；restore seq 48；`content_equal`、`identity_equal`、SHA-256 均与原始一致（同上哈希）。
- 恢复文本仍含旧 nonce `9a601b5765b64bc19ec3c13e5235dd4a`，证明来自持久化历史，不是重新读盘或模型重写。

### 4.3 #13：requeue 缺陷

session `session-f1c2fddd-122d-4781-b41a-8cef0820ac9f`：

- `read` tag 1 → `ctx_reduce` drop 1 → `ctx_expand` tag 1（成功）→ `ctx_reduce` tag 1（显示 Queued）→ `ctx_expand` tag 1（拒绝）。
- observer 只记录到 drop seq 31、restore seq 37，没有第二次 drop。
- 存储层复现 `repro_requeue.mjs` 在 0.11.2 上退出 1：`{"expected_pending":[1],"actual_pending":[]}`，见 `evidence/requeue-regression-0112.txt`。
- 结论：0.11.2 **没有修复 #13**；Queued 回执与实际状态仍不一致。

### 4.4 #14：Historian 遮蔽

采用全新会话 `session-47130071-e625-4c8e-bd50-a61da6b7d70a`，只做首次 drop，排除 #13 的 requeue 干扰：

- drop 占位符 seq 34（原文 seq 24）；发布前在 live surface 上，发布后不在。
- 真实 Historian：`digest ready` 于 15:02:22.447，9 nodes，4,287 ms；compartment 1 于 15:02:39.257 发布，nodeSeq 64。
- `covered_seqs = [12,13,14,22,34,30,32,38,40]`，**包含 drop seq 34**；`covers_drop = true`。
- `ctx_expand(1)` 于 15:03:01.936 返回 `restored 0, refused 1`，原因 `no dropped item carries this tag`。
- 原始事件 24 仍在宿主 raw log；这是“入口不可达”，不是原文物理丢失。
- 结论：0.11.2 **没有实现 #14 的独立原文检索**。

**加速条件（必须披露）：** 模型 catalog `contextWindow=32768`；`policy.executeThreshold=0`；`historianProtectedNodes=1`；`historianMinNodes=1`；`historianTimeoutMs=120000`；禁用宿主 `tool-result-pruner`；等待 40 秒（两次 `acceptance_wait` 各 20 秒）。第一次尝试使用 45,000 ms 超时/15 秒等待，Historian 未在 expand 前发布，expand 成功，未用于因果结论；第二次改用 120,000 ms/40 秒等待后才得到上述发布证据。该结果**不代表**默认 1M 窗口、默认阈值、连续多次 Historian 或超时路径。

### 4.5 跨会话项目记忆

- 会话 A `session-e6bd61a6-10ac-43c1-a721-4a18ae22067b`：`ctx_memory` write 成功，`Saved as memory 1 [CONFIG_VALUES]`。
- 新会话 B `session-0c0cfbf2-43a0-46ce-9f36-0101d00d7082`：`ctx_memory` search 找到同一 marker `MEM_c886d7cfa3784c69b9a983f9c3056b45`，observer 中可见 FTS 命中；`ctx_expand(1)` 对新会话的旧会话 raw history 仍拒绝，符合当前“项目记忆跨会话、raw history 不跨会话”的边界。

### 4.6 引擎互斥

| 场景 | 进程 | 实际 compaction owner |
|---|---|---|
| conflict（MC 注册 + basic 未禁用） | 22436 | `MagicContextCompactionEngine` |
| takeover（MC 注册 + basic 禁用） | 22024 | `MagicContextCompactionEngine` |
| fallback（MC 注册关闭） | 27068 | `BasicCompactionEngine` |

conflict 的 stderr 仍有警告：`compaction-basic ... service "compaction" has been registered at <MagicContextCompactionEngine>`。本次只声明**注册层**通过，不声明“安全回退”或满窗 compaction 已验收。

## 5. 隔离、凭据与旧证据

- 插件 `dataDir` 显式指向实验 root 的 `plugin-data`；`~/.local/share/cortexkit/magic-context-dsh-poc` 在运行前后都不存在，未发生默认目录兜底。
- `activity.log` 的每个 boot 记录 `dbPath` 都在实验 root 下。
- 运行窗口内，真实 `~/.local/share/cortexkit/magic-context`（+401 KB）与 `~/.local/share/opencode`（文件数/字节变化）有变动；**归因未知**，可能是用户日常 OpenCode/桌面端后台活动。没有证据表明 T0-B 的 DSH 子进程写了它们；T0-A 因此取消，不运行上游。
- 凭据只从环境继承，未写入配置或报告；observer 按环境变量名替换值。**未做通用秘密检测**；`collect_evidence.py` 只检查环境变量值是否出现在证据文本中。
- 旧证据目录 `acceptance-windows-dsh-2026-11-09/` 的 26 个文件 SHA-256 未变：`old-evidence-sha256.txt`，`hash_old_evidence.py --verify` 通过。

## 6. T0-A 上游参考：取消（既有研究覆盖）

**状态：cancelled。** 不再运行上游实验。既有研究已在固定提交上核对并独立复核；验收 gate 只要求插件在 DSH 可用，语义目标按 2026-11-13 修订为原版 Magic Context，重复运行不会增加决策所需信息。

| 问题 | 既有记录 | 证据等级 |
|---|---|---|
| expand 返回新工具结果、不撤销缩减 | `research-context-lifecycle.md:49`；`claims-mc.md:6`（ref=8）；`verifier-mc.md:8`；`analyzer-q2-mc.md:9` | 源码+独立复核，`33fb6ac9` |
| tag 按持久化身份、`ctx_reduce` 入队 | `research-context-lifecycle.md:47-51`；`analyzer-q2-mc.md:5-6` | 源码+复核 |
| 压缩后 tag 定位与类型边界 | `research-context-lifecycle.md:51-53`；`analyzer-q2-mc.md:9-10` | 源码+复核 |
| `/ctx-flush` 语义 | `research-context-plugin-landscape.md:33`；`issue-ctx-flush.md:34-38` | 源码/文档，`v0.49.30` |
| 测试不能证明什么 | `research-context-lifecycle.md:65-69`；`analyzer-q4-tests.md` | 测试断言，不是本机通过 |

**版本口径：** 研究固定提交为 `33fb6ac9`（生命周期）与 `17801ffd`（Issue 对照）；D1 的 `v0.49.55` 是当前版本标签，不能把研究结论自动外推到未核查的后续差异。若未来需要运行级 parity，另立任务。

**只读探针（2026-11-13）：** `setup --help` 只有 `--dry-run`/`--harness opencode`/`--no-dashboard`；`opencode run --help` 没有显式 slash-command；`opencode --version` 为 2.3.0；本机无 Docker。这些只说明“不适合现在跑”，不再作为待办。

因此本报告**不新增**上游 `v0.49.55` 的运行证据；`parity-reference.md` 上游列引用上述研究记录，标注“源码/测试，非运行”，不写运行级“一致”。

## 7. 本报告不能证明什么

- 不能证明 #13/#14 已修复；相反，两者在 0.11.2 上仍可复现。
- 不能证明 8a/8b/8c 的 0.11.2 后台修复在宿主级生效；作者单测不等于宿主验收。
- 不能证明默认 1M 窗口、真实满窗 compaction、多轮 Historian、并发/崩溃恢复、桌面 UI、embedding 语义检索质量。
- 不能证明上游 `v0.49.55` 的运行行为；上游参考是既有源码/测试研究（`33fb6ac9` / `17801ffd`），不是本轮运行。
- 不能证明 `0.11.2` 是长期基线；它只是“已覆盖的 DSH 场景可用”。#13/#14 是否接受为已知缺陷，仍是 T1/T2/T3 的决策。

## 8. 复现

工作目录为本报告目录。不要把实验 profile 复制到日常 DSH 目录。

1. 复制本目录到新的报告目录，但**不要复制** `experiment-root.json`、`evidence/`。旧指针有防覆盖保护。
2. 在新副本运行 `uv run python prepare_experiment.py`，取得新的 root。脚本会下载/校验 0.11.2，并创建隔离路径。
3. 确保本机有 Node 24.21.0、`@deepseek-ai/dsh@0.2.2-rc.1` 的本地安装，以及可用的 pnpm；本实验用 `tools\bin\pnpm.cmd` 指向已知 12.18.0 native。
4. 安装插件：`uv run python run_host.py --label install --timeout 240 -- plugin --profile headless add dsh-plugin-magic-context@0.11.2 --ignore-scripts --store-dir <root>/pnpm-store`。
5. 运行 `uv run python prepare_scenarios.py`，生成 overlays 与合成负载。
6. 运行 `uv run python run_0112_scenarios.py`（可加 `--only roundtrip|restart|repeat|memory|historian|engine`）。
7. 运行 `uv run python verify_0112.py`，再运行 `uv run python collect_evidence.py`。
8. 旧证据复核：`uv run python hash_old_evidence.py --verify`。

`experiment-root.json` 只是本机临时指针；新 clone 只有报告与归档证据，不自动具备原本机环境。

## 9. 产物

| 文件 | 内容 |
|---|---|
| `task_plan.md` | 决策、独立审查裁决、gate 判据、执行台账 |
| `acceptance-report.md` | 本报告 |
| `parity-reference.md` | T1 参考页（上游列引用既有研究记录，非运行） |
| `evidence/` | 关键 JSON、stdout/stderr、observer 子集、`redacted-runtime.zip` |
| `evidence/archive-sha256.txt` | 归档 SHA-256 |
| `old-evidence-sha256.txt` | 旧证据 26 文件哈希清单 |
| `prepare_experiment.py`、`run_host.py`、`prepare_scenarios.py`、`run_0112_scenarios.py`、`verify_0112.py`、`collect_evidence.py` | 本轮脚本 |

**用量：** 12 次完成调用、32 个 agent 模型 step；agent 报告 usage `inputTokens=19887`、`cacheReadTokens=261120`、`outputTokens=4064`、`totalTokens=285071`；Historian 2 次完成（9,414 + 9,506 totalTokens）。这些是宿主报告的数字，不是货币账单。
