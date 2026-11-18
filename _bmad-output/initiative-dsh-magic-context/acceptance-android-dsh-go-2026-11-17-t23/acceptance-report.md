# T23 Android 本机验收报告

**结论：预先冻结的最小路径通过，测试安装与配置已恢复。**
这是未发布候选的有限 Android 验收，不是移动端全矩阵或真实嵌入供应商验收。
准备始于 2026-11-17；手机步骤在 2026-11-18（UTC+8）完成。证据时间保留来源原值。

## 用户可用的结果

- 同一包提供原生输入框状态条、上下文详情、向量控制；配置沿用宿主原生页面。
- 本会话详情确实标注「本会话」，显示 2%、20,787 / 1,048,576；未知的记忆/画像 Token 数为 `—`。
- 用户实际加载并复制 `fixture-embed-a`，显式探测得到 16 维，开始重建后在 1/3 暂停，继续推进至 2/3。
- 真实模型执行三次记忆写入和检索；引擎重启后实际工具再次命中三条，数据库和 journal 独立于模型回复核对。
- 手机已卸下测试候选，原配置恢复；没有留下模拟端点供日常使用。

## 身份与范围

| 项目 | 实际记录 |
|---|---|
| App / 设备 | Android dsh-go 1.1.0，App 版本见 `evidence/adb-connected.txt`；LOCAL 由用户确认，本机 Linux/arm64 入口见 `phone-preflight.json`。本组证据未留存 Android OS 版本输出 |
| 引擎 | `@deepseek-ai/dsh@0.2.2-rc.1`；Node v24.22.1，Linux/arm64；见 `phone-preflight.json` |
| 包 | `@elvisw/dsh-magic-context@0.17.0` 的未发布 T23 开发工件；**不是 npm 已发布的 0.17.0 字节** |
| 最终候选 | 4,081,023 字节 / 71 files；SHA-256 `6fa8178c71ad55f5d6e4b553940206d486d9ec012d6e9031b445814a67bb93f4` |
| 代码一致性 | 60 个打包 `lib/` 文件与构建一致；手机观察到 `go-native.js` SHA-256 `e6087ff5bc8f91fd699b256f4041412f8ad8fe8f11031010db01ca38ef4df4d5` |
| 原生契约 | dsh-go 1.1.0 提交 `e9d3239bee18029d48618c7514303bc7fa7bbf8f`，不以 main 的未发布接口代替 |
| 测试会话 | `session-a887bf8d-209e-406a-8d48-48574e181bf2`，新建且专用于测试 |
| 插件数据 | `/root/.dsh/dsh-go/mc-t23-397f7ef8/data`，记忆库亦在此目录；不读取旧会话或原记忆库 |
| 嵌入服务 | 电脑的无认证模拟 OpenAI-compatible 服务，经 `adb reverse tcp:49723 tcp:49723` 访问 |

候选完整身份及本机路径见 [candidate-first-open-fix.json](evidence/candidate-first-open-fix.json)；
初版 `397f7ef8…` 仅保留为缺按钮问题的来源，不计作成功候选。

## 可核对的运行证据

| 断言 | 原始证据与实际内容 |
|---|---|
| 没有用模型复述冒充写入 | [重启前观察](evidence/phone-before-restart.json)：`memories.db` 中真实存在 id 1/2/3，三条 `T23_*` 内容、状态 active；journal 有同会话三次 `write` 成功及 `search` hits=3 |
| 暂停/继续确实推进 | 用户提供暂停截图显示 1/3、剩余 2；[继续后的实际截图](evidence/android-embedding-resumed.png) 显示 2/3、剩余 1、失败 0；journal 两条 `backfill` 各 created=1 |
| 部分向量已持久化 | 两次观察都有 memory_id 2/3 的 `embedding-remote:c03009ede909b5197b79fef7deea3f29` 行，每条 64 bytes（16 个 float32）；重建 state=running、processed=2、total=3、failures=0 |
| 是重启后的真实检索 | [重启后观察](evidence/phone-after-restart.json)：新 boot `1794934999630`，随后同会话 search `1794935023825`、hits=3、ok=true；三条记忆和两条向量与重启前相同 |
| 实际加载的是修复代码 | 前后观察的 `installedNativeSha256` 相同且与本机候选构建相符；不是只检查 package.version |
| 同会话与中文原生配置 | [会话详情](evidence/android-context-session.png) 与 [原生配置首屏](evidence/android-native-config.png)；只查看了配置，没有测试修改所有字段 |
| 恢复不是口头承诺 | [恢复回执](evidence/phone-restore.json)：依赖已移除、数据文件保留；原 patch 与恢复后 SHA-256 均为 `fb3ba638958c631944e9a3cffc4bebe38de35fc5379a5362d701d5bb2c618796` |

[restart-comparison.json](evidence/restart-comparison.json) 是便于阅读的比较摘要；
以上两份原始观察才是数据来源。用户另确认模型 ID 复制成功，以及恢复后的引擎重启；
不读取系统剪贴板，也未在卸载后再次调用模型来证明清理。

### 请求归属

[fixture-requests.jsonl](evidence/fixture-requests.jsonl) 共 7 行，全部 `authPresent=false`：

- 1–2：电脑的模拟服务自检（GET 模型列表、POST 测试嵌入），**不计入手机通过证据**。
- 3–4：手机显式加载模型、显式探测；5–6：开始、继续各一次单条回填。
- 7：重启后的真实记忆工具检索请求。

首次打开、记忆写入和开始前的 FTS 检索没有新增嵌入请求；不把本地模拟服务称为 SiliconFlow。
这条路径没有使用真实嵌入密钥。真实对话使用用户现有模型，凭据和完整模型配置没有进入证据。

## 缺陷、验证与复核

初版实际出现「有状态、无按钮」：初始视图早于数据订阅，却依赖订阅更新 controls。
新增 `renders current controls before a data subscriber exists` 回归先失败；最小修复改为视图读取
当前本地状态，不调用模型列表、探测或重建。修复后手机首次进入已出现并执行按钮。
见 [first-open-regression.txt](evidence/first-open-regression.txt)。

最终本地检查见 [local/checks.json](evidence/local/checks.json) 及其所指日志：
85 files / 1044 tests（`npm test -- --maxWorkers=4`）、typecheck、i18n、build 通过。
此前默认并发运行的两条固定 250ms 初始化测试失败保留在
`local/unit-test-unbounded-first-open-fix.txt`，未改其时序或把失败算成通过。

独立票面检查、一次 Quick diff review 及一次修复复核已经完成；修复复核 READY。
首次打开问题由既定真机路径自然暴露并修复，没有另开完整代码评审或扩展矩阵。
非阻塞的模型列表失效及历史内部注释建议仍在 `../deferred-work.md`；首次打开建议已标记解决。
最终独立只读报告审计为 **PASS WITH CAVEATS，无 Critical**；唯一来源标注修订已处理。
见 [report-audit.md](report-audit.md)，不以实现者的比较摘要替代审计。

## 隔离、恢复与复现

原 profile 未安装本包。`phone-install.cjs` 只追加一条有标记的测试插件配置：
独立 `dataDir`/`memory.dbPath`，关闭自动回填、Historian 和维护；单轮回填限制为 1，
所以继续一次推进一条，不期待自动达到 3/3。旧 patch 只保留长度/哈希和新增测试行，
没有复制整份模型配置或读取 `.env`、凭据库。恢复前校验原字节前缀，避免覆盖他人修改。

复现同一有限路径：

先在本目录启动 `python fixture_embedding.py --journal <新输出目录>/fixture-requests.jsonl`，
另一个电脑终端执行 `adb reverse tcp:49723 tcp:49723`。这些脚本是本次一次性验收辅助，
不是通用安装器；已有 checkpoint 时会拒绝重复安装。再次实验应使用新的测试目录并对应
调整脚本的限定路径，不要删除本次数据来绕过保护，也不要追加到留存的原始请求日志。

1. 按 `candidate-first-open-fix.json` 校验候选；ADB 传入共享目录，启用宿主「访问手机文件」。
2. 在 App 本机 Linux 终端运行安装脚本。脚本中的初版和修复版 hash 各有用途，复现时保留原目录关系；
   初版安装后由 `phone-update.cjs` 切换修复候选，再重启。不要拿同版本 registry 包替换。
3. 用真实 `ctx_memory` 写入本报告三条测试内容、检索；显式加载/复制模型、探测、重建并暂停/继续。
   原始执行中探测早于写入；这些操作之间没有自动回填。
4. `phone-observe.cjs` 导出 before-restart；完整重启引擎、真实工具再次检索；
   `phone-observe.cjs after-restart` 导出 after-restart。观察脚本只查询本次测试库并导出受限字段。
5. `phone-install.cjs --restore` 移除测试包、恢复原 patch；用户确认清理后再次重启引擎。

独立测试数据和测试会话未删除；模拟服务已主动停止，专用 ADB reverse 已移除。
后台 fixture 的退出码 1 来自清理时主动终止，不计作产品失败。
截图、README 和报告在门禁后才整理；运行时 `lib/` 和 manifest 未变，未重打包或重跑门禁。
当前仓库 README 新增了截图引用，不声称它与已留存 tarball 中的 README 字节相同。
没有新版本、npm 发布、Git 推送或电脑版 profile 升级。

## 明确未覆盖

- 真实嵌入供应商/密钥、iOS、SSH/中转主机、英文手机渲染。
- 本地 MiniLM WASM 原语已在同一台手机上另行验证（384 维、两条文本 891 ms，见 T24 的 `android/phone-local-embed.json`）；完整的本地检索/回填链路仍未验证。
- 重建完成 3/3、所有配置编辑、手机全局详情、网络失败/取消/重挂载的真机矩阵。
- 新一轮桌面浏览器 gate、完整长会话/历史摘要压缩；本地相关回归不冒充这些运行通过。

达到最小标准即停止；不为额外截图、报告措辞或哈希清单再做产品验收。
