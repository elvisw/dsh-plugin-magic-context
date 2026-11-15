# 0.12.3 发布与 registry 安装冒烟

日期：2026-11-15
版本：`@elvisw/dsh-plugin-magic-context@0.12.3`
发布提交：`a5dd51a`（`chore(release): 0.12.3`）
tag：`v0.12.3`

## 1. 发布结果

| 项 | 值 |
|---|---|
| release workflow | run `43677159715`，`success` |
| workflow head | `a5dd51a451fee04fdc168a4ed526e9a5c47fe11e` |
| registry version | `0.12.3` |
| `dist-tags.latest` | `0.12.3` |
| provenance | SLSA v1 |
| registry shasum（SHA-1） | `14175a767425cdd5a161e96a7918237aedfb2294` |
| tarball SHA-256 | `32ba182d345fb0070ac703989d6d356e6084bb234211cda8f90e53ec484d8ae7` |
| tarball 大小 | 3,998,452 bytes |

本地 `npm pack` 产物与 `npm pack @elvisw/dsh-plugin-magic-context@0.12.3`
从 registry 下载的 tarball 逐字节一致（同一 SHA-256，`artifact.json`）。

## 2. Registry 安装冒烟（user-path）

在全新隔离根 `...dsh-mc-registry-0123-20261115-123624` 中：

1. `bootstrap-profile --profile headless`。
2. 用真实用户安装命令：
   `dsh plugin --profile headless add @elvisw/dsh-plugin-magic-context@0.12.3 --ignore-scripts`。
3. `--dump-config` 显示 `name: '@elvisw/dsh-plugin-magic-context'` 与
   `id: magic-context-dsh`，`dataDir` 指向新根。
4. 真实模型 smoke 返回 `REGISTRY_0123_OK`。
5. 安装后的 `lib/dsh/flush-command.js` SHA-256
   `895f96c421b4b4ca13b1b5809e15158d3316c1bd60e331eaf36c90c07f5b08af`
   与 0.12.3 本地构建一致。

这不等于日常 profile 的升级验证；它是 registry 工件的安装/加载/真实模型
路径验证。P4 的空队列命令行为已在本地构建的隔离宿主门禁中按三个进程
（seed → flush → flush-empty）验证，报告见
`../acceptance-windows-dsh-2026-11-15-p4-flush-feedback/acceptance-report.md`。

## 3. 实际用户端到端测试：建议安排

**需要，但建议分成两层，不必阻塞本次发布。**

### 3.1 已完成的自动化层

- registry 安装、插件加载、`--dump-config`、真实模型响应：本报告。
- `/ctx-flush` 空队列回执、命令窗口无 usage/无新 journal/无 surface 变化：
  P4 隔离宿主门禁。

### 3.2 仍需要真实用户层

这一层无法由 headless harness 替代，建议在**日常 profile**升级后由使用者
执行一次：

1. 确认日常 profile 从 0.12.2 升级到 0.12.3；插件版本显示 0.12.3，
   数据目录仍是 `~/.local/share/cortexkit/magic-context-dsh-poc/`。
2. 打开 DSH 的插件设置卡片，确认 Historian 区仍显示
   `Historian reasoning effort`，保存/清空后配置可持久化。
3. 进行一次正常长对话，触发 `ctx_reduce`，再 `ctx_expand`；确认恢复内容
   作为新的工具结果返回，旧占位符不被改写。
4. 在 composer 里实际输入 `/ctx-flush`：
   - 有 pending 时，确认回执仍显示 requested / already marked /
     pendingNext；
   - 已经落地后再次输入，确认显示最近落地数量、UTC 时间和
     “already in effect”；
   - 确认不会触发模型调用，也不会新增摘要/Historian 运行。
5. 重启 DSH，确认已有会话、tag、记忆和设置仍在；schema 仍是 v11，
   没有重新索引或数据迁移提示。

这一层是**用户可见路径**的验收，不是代码回归；如果第 4 步在真实 TUI 中
表现与 headless 驱动不同，应单独开缺陷票，不要用 headless 结果覆盖。

## 4. 边界

- 本次 registry 冒烟没有走 TUI 按键派发；`commands.execute` 的真实注册表
  路径由 P4 门禁覆盖。
- 没有对日常 profile 做读写或哈希比对；隔离根只做环境重定向。
- 没有重新验证 T0 全量基线、上游 parity 或 T4 force-band 变体。
- 0.12.3 是 patch；0.12.0 的恢复语义和 schema v11 不变。

## 5. 证据索引

| 文件 | 内容 |
|---|---|
| `evidence/registry.json` | `npm view` 的版本、dist-tags、provenance、gitHead、shasum、integrity |
| `evidence/workflow.json` | release run 结论、headSha |
| `evidence/git-tag.txt` | `v0.12.3` tag 对象 |
| `evidence/artifact.json` | 本地与 registry tarball SHA-256 |
| `evidence/registry-host/` | 全新 profile 的 bootstrap、registry install、dump-config、真实模型 smoke、安装覆盖层 |
| `evidence/unit-test.txt` | 76 文件 / 857 用例 |
| `evidence/typecheck.txt` | `tsc --noEmit` |
| `evidence/i18n.txt` | ALL PASS |
