# Stage 1 — 0.11.2 DSH 基线（T0-A 取消，改用既有研究）

状态：T0-B 完成；T0-A 取消（既有研究覆盖，不再新跑）；T0-C 合并进 T1。

## 决策

| 项 | 决定 | 来源 |
|---|---|---|
| D1 上游基准 | `cortexkit/magic-context` `v0.49.55`；npm `@cortexkit/opencode-magic-context@0.49.55` | 用户 2026-11-13 |
| D2 语义目标 | 不承诺兼容 fork 上游 `dsh-plugin-magic-context` 的既有行为；语义以原版 `cortexkit/magic-context` 为兼容目标。DSH 可用性仍是验收 gate；不要求运行级 parity | 用户 2026-11-13（修订） |
| D3 真实运行 | 授权真实运行本插件；T0-A 上游运行取消，改用既有研究记录 | 用户 2026-11-13 |
| #13 契约 | A（结果返回）；具体参数/降级/定位在 T1 落定 | 用户 2026-11-13 |
| #14 契约 | B+（保留原位恢复 + 增加只读历史检索） | `issue-historian-recovery.md:76-82` |
| #15 契约 | flush，最迟下一次模型请求生效，不触发摘要模型 | `issue-ctx-flush.md:24-30` |

## 独立审查与裁决（2026-11-13）

审查结论已返回。以下裁决写入台账，避免范围失控。

### Critical

| ID | 发现 | 裁决 |
|---|---|---|
| C1 | T0-A 隔离不完整，可能触碰日常 OpenCode `opencode.db`（4.7 GB）、`auth.json`、CortexKit `context.db`（45 MB）、桌面端目录；`MAGIC_CONTEXT_STORAGE_DIR` 只移动 harness 侧 DB，不移动 subc 状态 | **T0-A 取消。** 既有研究已覆盖上游行为；不运行上游，避免触碰日常数据。Stage 1 只做 T0-B。 |
| C2 | T0-B 标为 gate，但没有通过条件 | **补 gate 判据**（见下）。1–4、7、9 全 pass 且无新增 Critical 缺陷，才把 0.11.2 作为新基线；任一项 fail 则记录并建议回退 0.11.1。5、6 是已知缺陷观察，不参与 gate。 |
| C3 | T0-A 的 OpenCode 版本漂移（2.2.7 → 2.3.0），`transform_mode` 未钉死 | **T0-A 取消**；若未来另立运行级 parity 任务，再钉死 OpenCode 精确版本与 `transform_mode`（ts/rust）。 |
| C4 | DSH 本地安装为 `^0.2.2-rc.1`，未钉死；插件 `gitHead` 与本地 HEAD 未记录 | **补钉死**：记录 DSH 实际版本 + lockfile 哈希 + `gitHead`；记录插件 tarball integrity、npm `gitHead`、本地 HEAD；DSH 子进程固定 Node `24.21.0`，不混用 26。 |

### Important

| ID | 发现 | 裁决 |
|---|---|---|
| I1 | `verify_acceptance.py` 硬编码旧 session/长度/进程号，不能直接复用 | **不复制旧断言。** 新写 `verify_0112.py`，只校验本轮证据；旧脚本保留为历史。 |
| I2 | 插件 `dataDir` 有真实目录兜底，补丁未生效会静默写日常目录 | **加硬断言**：运行前记录 `~/.local/share/cortexkit/magic-context-dsh-poc` 与相关真实目录的哈希/存在性；运行后断言未变；断言 `plugin-data` 下 DB 存在且路径在实验 root 内。 |
| I3 | 上游 `setup` 交互式、`/ctx-flush` 是聊天内命令，非交互驱动未确认 | **T0-A 取消**，不再需要非交互驱动；既有研究记录替代运行。 |
| I4 | 模型 route/model ID 未记录；T0-A 隔离后凭据注入未说明 | T0-B 已记录 `provider/model`（`deepseek-official/deepseek-flash`）与 API 路由；T0-A 取消，不再需要上游凭据注入。 |
| I5 | observer 落盘整段 surface/events；脱敏只按环境变量名替换 | 报告写明“仅按环境变量名替换，未做通用秘密检测”；证据不公开上传；报告不粘贴会话正文。 |
| I6 | 8a 没有“模型流永不 settle”的测试装置；修复含 120s 截止 | **8a 标 not-covered**，除非本轮能低成本搭出替身；不用单测冒充宿主级。不等待 120s 做一次无归因的长跑。 |
| I7 | T0-A 场景 4 缺“首次 drop → 压缩”前置；压缩触发方式未定 | T0-A 取消，不再适用。 |
| I8 | T0-A 缺重启后定位、flush 幂等/拒绝路径 | T0-A 取消，不再适用。 |
| I9 | 上游后台/自更新副作用未限制 | T0-A 取消；未来若运行上游再关闭 dreamer/自更新并记录开关。 |
| I10 | 旧 profile 的 observer URI 指向已不存在的归档路径；新目录复制清单未列 | 新 `prepare_scenarios.py` 已指向新 `REPORT_DIR/observer.mjs`；本轮复制 `observer.mjs`、`test-driver.mjs`、`fixtures/` 已确认存在。 |
| I11 | 0.11.2 是否仍接受旧 overlay 的 `memory` 块未确认 | 本轮用实际 memory 场景验证；若失败，记 not-covered + 原因，不推断。 |

### Minor

| ID | 处理 |
|---|---|
| M1 | 场景表改为“9 个可执行场景 + 1 条报告约束”，不再说 10 个可执行。 |
| M2 | DSH 子进程固定 Node `24.21.0`（`NODE_EXE`），宿主工具链 26 仅用于本会话；报告写明。 |
| M3 | #13 在 0.11.2 仍未修；由源码 + 存储层复现双证。 |
| M4 | 隔离表补 `%TEMP%\opencode\mc-t0-2026-11-13\tools\`。 |
| M5 | 生成旧证据目录 SHA-256 清单，运行后复核。 |
| M6 | 成本按旧 14 次调用为基准；T0-A 取消，不把上游成本计入本轮。 |

## T0-B gate 判据

| 场景 | 通过条件 | 是否 gate |
|---|---|---|
| 1 包完整性 | tarball SHA-512 与 registry 一致；无 install/postinstall；安装文件与解包逐字节一致 | 是 |
| 2 安装/加载/真实调用 | 隔离 profile 安装 0.11.2；宿主加载；真实模型返回；工具可用 | 是 |
| 3 同进程恢复 | 占位符实际出现；expand 后原文/身份/SHA-256 与原始一致 | 是 |
| 4 跨进程恢复 | 重启后仍取旧原文；磁盘 fixture nonce 已变；至少两个进程 | 是 |
| 7 跨会话记忆 | 会话 A 写入；会话 B FTS 读到同一记忆 ID | 是 |
| 9 引擎互斥 | 三个注册层场景符合预期；只声明注册层 | 是（注册层） |
| 5 requeue | 记录 0.11.2 实际事件链；预期仍失败 | 否（缺陷观察） |
| 6 Historian 遮蔽 | 记录旧 tag 不可达；原文仍在原始事件；不据此判契约违例 | 否（能力边界） |
| 8a 维护截止 | 无宿主级替身则记 not-covered | 否 |
| 8b/8c | unit-only 或 not-covered，单独标注 | 否 |
| 10 报告约束 | 披露加速条件、模拟步骤、凭据与旧证据边界 | 是（报告审查） |

**Gate 结论规则：** 1–4、7、9、10 全 pass，且无新增 Critical 缺陷 → 0.11.2 可作为 DSH 新基线；任一项 fail → 记录失败并建议回退 0.11.1，不宣布新基线。

## 隔离环境

| 用途 | 路径 |
|---|---|
| 插件基线 root | `%TEMP%\opencode\dsh-mc-acceptance-0112-j4ydat07\`（由 `prepare_experiment.py` 生成） |
| DSH 工具 | `%TEMP%\opencode\mc-t0-2026-11-13\tools\dsh\`（本地安装，非全局） |
| pnpm shim | `%TEMP%\opencode\mc-t0-2026-11-13\tools\bin\pnpm.cmd`（指向已知 12.18.0 native） |
| 新报告目录 | `_bmad-output/initiative-dsh-magic-context/acceptance-windows-dsh-2026-11-13/` |

插件基线沿用旧脚本隔离变量：`DSH_HOME`、`HOME`/`USERPROFILE`、`XDG_*`、`APPDATA`、`LOCALAPPDATA`、`npm_config_store_dir`、`npm_config_cache` 全部指向新 root；`PATH` 前置 `tools\bin`。

上游参考已取消，不再运行。若未来另立运行级 parity 任务，需额外隔离 `MAGIC_CONTEXT_STORAGE_DIR`、`MAGIC_CONTEXT_LOG_PATH`、`HOME`/`USERPROFILE`、`APPDATA`/`LOCALAPPDATA`、OpenCode 配置，并在证明零日常写入后再执行。

## T0-B：插件 0.11.2 在 DSH 上的基线

环境：Windows、DSH 子进程 Node `24.21.0`、DSH `0.2.2-rc.1`、插件 `0.11.2`；真实 DeepSeek API（`deepseek-official/deepseek-flash`）；隔离 profile。

| # | 场景 | 证据 | 真实模型 | 判定 |
|---|---|---|---|---|
| 1 | tarball SHA-512 对 registry；无 install/postinstall；安装文件与解包逐字节一致 | 哈希/文件 | 否 | pass/fail |
| 2 | 隔离安装、宿主加载、真实模型调用与工具执行 | 宿主事件 | 是 | pass/fail |
| 3 | 同进程 `read → reduce → 占位符 → expand → 原文`，内容/身份/SHA-256 一致 | 宿主事件 + 哈希 | 是 | pass/fail |
| 4 | 退出/重启、改 fixture nonce 后恢复旧会话，仍取旧原文 | 宿主事件 + 哈希 | 是 | pass/fail |
| 5 | `drop → expand → reduce 同 tag → expand`，记录实际事件链 | 宿主事件 | 是 | observed（预期失败） |
| 6 | 全新会话首次 drop，真实 Historian 发布覆盖占位符，旧 tag expand 不可达 | 宿主事件 + 真实 Historian | 是 | observed（能力边界） |
| 7 | 会话 A 写项目记忆，会话 B 通过 FTS 读取，记忆 ID 一致 | 宿主事件 + 插件 DB | 是 | pass/fail |
| 8a | 维护车道在“模型流永不 settle”下不永久停摆 | 替身/模拟 | 否 | not-covered（本轮无装置） |
| 8b/8c | verify skip / force band stale | 单测为主 | 可选 | unit-only 或 not-covered |
| 9 | 引擎互斥：三个注册层场景 | 宿主启动 + 注册事件 | 启动即可 | pass/fail（注册层） |
| 10 | 披露加速条件；模拟步骤单独标注；旧证据不动；不复用日常 profile；不打印凭据 | 报告约束 | 不适用 | 报告审查 |

## T0-A：取消（既有研究已覆盖）

**决定（2026-11-13）：不再运行上游实验。** 既有研究已在固定提交上核对并独立复核了本项要问的行为；验收 gate 不要求运行级 parity，语义目标按 D2 修订对齐原版。继续跑上游只会重复研究，并引入真实 OpenCode/CortexKit 数据面的隔离风险。

研究记录（均为源码/测试证据，不是本轮运行）：

| 问题 | 既有记录 | 证据等级 |
|---|---|---|
| expand 是否返回新工具结果 | `research-context-lifecycle.md:49`；`claims-mc.md:6`（ref=8）；`verifier-mc.md:8`；`analyzer-q2-mc.md:9` | 源码+独立复核，固定提交 `33fb6ac9` |
| 旧 tag 再 reduce / dropped 语义 | `analyzer-q2-mc.md:6`（ctx_reduce 入队、去重、compacted 冲突）；`research-context-lifecycle.md:47-49` | 源码+复核 |
| 压缩/tag 定位 | `research-context-lifecycle.md:51`；`analyzer-q2-mc.md:5`、`:9`；`verifier-mc.md:5`、`:8` | 源码+复核 |
| flush | `research-context-plugin-landscape.md:33`；`issue-ctx-flush.md:34-38`；`v0.49.30` 源码/文档 | 源码/文档，未运行 |
| 测试边界 | `research-context-lifecycle.md:65-69`；`analyzer-q4-tests.md`；`verifier-tests.md` | 测试断言，不是本机通过 |

**版本口径：** 研究固定提交为 `33fb6ac9`（生命周期）与 `17801ffd`（Issue 对照）；D1 的 `v0.49.55` 是当前版本标签，不能把研究结论自动外推到未核查的后续差异。若未来需要运行级 parity，另立任务，不作为本阶段 gate。

**取消的探针：** 2026-11-13 只做了只读 `setup --help`/`opencode run --help`/`opencode --version`；结果（`setup` 无非交互完成参数、`opencode` 2.3.0、无 Docker）仅说明“不适合现在跑”，不再作为待办。

## T0-C：合并进 T1

不再单独产出实验矩阵。`parity-reference.md` 保留为 T1 的参考页：上游列引用上述研究记录并标注“源码/测试，非运行”，插件列引用 T0-B 本轮证据；不写运行级“一致”。

## 执行台账

- 2026-11-13：用户批准 Stage 1；#13 选 A。
- 2026-11-13：环境预检；旧 `DSH_EXE` 路径不存在；本地安装 `@deepseek-ai/dsh@0.2.2-rc.1` 到 `tools\dsh`；Node 24.21.0 子进程。
- 2026-11-13：`prepare_experiment.py` 参数化为 0.11.2；tarball integrity 通过；root=`dsh-mc-acceptance-0112-j4ydat07`；63 个包文件。
- 2026-11-13：pnpm 缺失 → 用旧实验的 12.18.0 native 建 `tools\bin\pnpm.cmd`；插件 0.11.2 安装成功；`package.json` 固定 `0.11.2`。
- 2026-11-13：smoke 真实模型调用成功（`SMOKE_OK`，session-0128722d...）。
- 2026-11-13：独立审查完成；C1–C4、I1–I11、M1–M6 已裁决；T0-A 取消（既有研究覆盖）；T0-B gate 判据补齐。
- 2026-11-13：旧证据 SHA-256 清单生成（见 `old-evidence-sha256.txt`）。
- 2026-11-13：T0-B 完成。1–4、7、9 pass；5、6 observed；8a/8b/8c not-covered。Gate 在覆盖范围内通过；0.11.2 可作 DSH 基线，但不宣称 #13/#14 已修。
- 2026-11-13：回读既有研究后，T0-A 取消；上游参考改用 `research-context-lifecycle` / `research-context-plugin-landscape` 的固定提交记录；报告、参考页、证据归档完成。
- 2026-11-13：用户修订 D2：不再承诺兼容 fork 上游 `dsh-plugin-magic-context` 的既有行为，语义目标改为原版 `cortexkit/magic-context`；T1 选择 A-only。
- 2026-11-13：T1 契约签收：Q1 A-only；Q2-B `tag` + `message`；Q3 `tag` 正式、`tags` deprecated 多 tag 别名；Q4 标记 + 下一次 preStep；Q5 移除 30 天 prune，按原版消息/会话删除与 `compacted` 状态。
- 2026-11-13：T2（#13 A）、T3（#14 + `message`）、T4（#15）、T5（保留期）建票；T2 完成 refine，独立校验后拆出 T5，`message` 归 T3。
- 2026-11-14：T2 第二轮独立校验通过；hash 限定单 tag、多 tag 用分隔包装、旧 tag 用 durable pending/landed 判定、错误名对齐 D5。`tickets.py next` 显示 T2 `ready_to_start`，T3/T4/T5 blocked on T2。
