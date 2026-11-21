# T34：Windows 上的 DSH 0.2.2-rc.5 兼容性验收

**证据结论：通过（仅限本次验证的 Windows Web 路径）。独立复核：PASS WITH CAVEATS。** 发布版 `@elvisw/dsh-magic-context@0.18.8` 在 `0.2.2-rc.5` 启动装载时被版本要求拒绝，日志明确 `Exact-version exemption: not active`，未使用任何版本豁免。只改 `version` 与 `engines.dsh` 的候选 `0.18.8-t34.rc5.1` 正常加载，Magic Context 设置入口可见；真实模型完成了 fixture 读取、回收、`/ctx-flush` 落地、`ctx_expand` 取回和新记忆写入，重启后的新进程又能用 `ctx_memory search` 命中原记录。**建议另开变更，把精确的 `0.2.2-rc.5` 加入兼容声明；本票未改产品代码或包声明。**

## 已验证

### 1. 输入与候选差异

- 官方宿主为 npm `@deepseek-ai/dsh@0.2.2-rc.5`，tarball SHA-512 与 npm `dist.integrity` 一致；隔离安装后宿主 CLI 自报 `0.2.2-rc.5`，运行 Node 为 `v24.21.0`。
- npm `@elvisw/dsh-magic-context@0.18.8` 的 `gitHead` 为 `a72f808e3dd7d7983ae139f2c4c9afd603824216`，与本地 `v0.18.8` 一致。候选直接由校验过的 registry tarball 重打包，没有重新构建。
- 两份包共 71 个成员，路径、内容和 tar 元数据全部相同，只有 `package/package.json` 的内容不同；解析后只有 `version` 和 `engines.dsh` 变化，原有 `0.2.1-rc.1 || 0.2.2-rc.1` 保留并追加精确 `0.2.2-rc.5`。见 [artifacts.json](evidence/artifacts.json)。

### 2. 发布版在 rc.5 上被拒载

真实 Web 宿主启动后，stderr 出现（节选）：

> `dsh: disabling profile plugin row "magic-context-dsh": Plugin @elvisw/dsh-magic-context@0.18.8 is incompatible with dsh 0.2.2-rc.5: requirements {"engines.dsh":"0.2.1-rc.1 || 0.2.2-rc.1"}. ... Exact-version exemption: not active.`

宿主本身仍启动，但该插件行被禁用；没有加载 0.18.8 的代码。完整脱敏行见 [release-web-startup.json](evidence/release-web-startup.json)。未执行 `allow-version`，也没有 `compatibility.json`。

### 3. 候选择载与设置入口

- 候选按 71 个 tarball 成员逐一核对已装字节，`package.json` 版本为 `0.18.8-t34.rc5.1`，`engines.dsh` 含精确 `0.2.2-rc.5`，见 [candidate-installed.json](evidence/candidate-installed.json)。
- 发布版通过单独的 profile 插件行测试拒载；候选通过 profile bundle 和 patch 行装载，加载了宿主和浏览器两部分。两份包均由隔离的 pnpm 安装，未经过 `dsh plugin add`。证据覆盖宿主启动装载，不覆盖安装器的兼容检查。
- Web 设置中用 `Ctrl+Alt+Comma` 打开设置，入口 `Magic Context` 可见，`[data-mc-section="embedding"]` 渲染成功，无控制台错误。见 [web-settings.json](evidence/web-settings.json) 与 [candidate-preflight-startup.json](evidence/candidate-preflight-startup.json)。

### 4. 回收、落地、取回与持久化（验收标准 1）

同一真实 Web 会话中：

| 事件 | seq | 结果 |
|---|---:|---|
| fixture 读取调用/结果 | 17/18 | 唯一一次读取，结果带 `§1§` |
| `ctx_reduce drop="1"` | 33 | `§2§ Queued 1 tag for reclaim.` |
| `/ctx-flush` + 下一条消息 | 45 | 原结果落地为 `[dropped §1§]` |
| `ctx_expand tag="1"` | 60/61 | 新的 `tool/result` 返回原文；外层新 `§3§`，内部保留原 `§1§` |
| `ctx_memory action="write"` | 66/67 | `§4§ Saved as memory 1 [PROJECT_RULES].` |

- 取回结果去掉外层 tag 后与原结果逐字节相同（`samePayloadWithoutTagPrefix: true`）。
- 原始持久事件仍在；占位符是新的持久事件（seq 45），仍在 surface 上，原调用未重跑（`readCount: 1`，原 `callId` 只有一次调用）。
- 原生 DSH JSONL（zstd）中同时存在原始结果、占位符和 expand 结果；见 [lifecycle.json](evidence/lifecycle.json) 的 `nativeEventLog`。
- 插件事务记录：queued `journal.id=80`、landed `journal.id=81`、restore `journal.id=84`、write `journal.id=85`。

### 5. 重启后的检索（验收标准 2）

隔离宿主重启为新进程后，新会话只调用一次 `ctx_memory action="search"`：

- 验收脚本在原始工具回执中核对 `id=1` 和写入的合成项目约定。[restart-search.json](evidence/restart-search.json) 只保存回执摘要、journal 编号和数据库记录，不含回执原文。
- journal `id=97` 记录 `action=search`、显式项目、同一 identity、`hits=1`、`ok=true`。
- 数据库仍是原记录 `id=1`、原 `project_path`、原 `source_session_id`，`retrieval_count` 从 0 变为 1。

### 6. 隔离与主目录

- 本票首次安装时，npm 向上找到了用户主目录作为安装根，写入了下述三个清单和锁文件，并改动了 `node_modules`。续跑的摘要基线是在事故之后取得的，不能证明首次安装没有越界。按用户决定未恢复主目录。
- 续跑前在不安装、不启动宿主的情况下检查：npm 的 cache/userconfig/globalconfig 与 pnpm 的 store/globalconfig 全部解析到本次试验根内；探测命令本身未改动主目录。见 [isolation-precheck.json](evidence/isolation-precheck.json)。
- 从事故后的基线起，`package.json`、`package-lock.json`、`node_modules/.package-lock.json` 的 SHA-256 在续跑安装、无模型预检和最终验收后均不变。仓库只保留筛选、脱敏后的证据，[home-isolation.json](evidence/home-isolation.json) 为派生摘要；原始阶段快照保留在试验根中，其中安装快照使用当时的脚本输出格式，与仓库中的最终脚本格式不同。
- 观察窗口内有一个与本票无关的外部进程在执行 `npm install -g @deepseek-ai/dsh`；它改动了主目录 `.npmrc` 和 npm cache。本票脚本不写 `.npmrc`，也不把这两个位置作为写目标；因此只把三个清单的稳定性作为本票的隔离断言，并如实记录其余变化。

## 未执行与风险

| 检查 | 状态 |
|---|---|
| `dsh plugin add` 安装路径 | 发布版和候选均未经过该命令；分别验证的是启动时拒载与正常装载，未用 `allow-version` |
| 其他宿主（Desktop/Android）或旧版本矩阵 | 未执行，超出本票边界 |
| 主目录恢复 | 未执行；用户明确不恢复，主目录 `package.json` 仍引用试验 tarball，不能删除试验根 |

已知风险：本次只覆盖 rc.5 Web 上的一条回收/取回/记忆路径；候选未发布，兼容声明也未修改。`/ctx-flush` 的“下一条消息才落地”依赖宿主事件顺序，证据以 seq 和原生 JSONL 为准，不以模型自述为准。

独立复核确认了候选差异、启动装载、原始结果持久化及重启检索；保留意见为上文列明的首次安装越界、未覆盖的安装路径和证据来源。补充说明未改变产品字节，未重跑宿主或模型。

## 复现入口

- `prepare.py --resume-with-verified-mirror <试验根>`：校验 tarball、隔离安装 rc.5 宿主并核对 CLI 版本。
- `preflight.py <试验根> --candidate-only`：复核候选字节、设置入口；省略该参数会重跑发布版拒载检查（已取得的证据无需重跑）。
- `gate.py <试验根> --restart-only`：复用已记录的 lifecycle 证据，只跑重启后的检索。
- `isolation_check.py --verify <试验根> after-gate`：复核三个主目录清单摘要。

真实模型调用共 **6 个回合**（3 个真实模型宿主进程：首个 seed 因读取路径错误未产生业务证据，换新宿主重跑；随后 lifecycle 与 restart）。未留存凭据、带 token 的 URL 或截图；未推送、未发版。仓库产品代码和包声明未变，只新增本票验收资料。
