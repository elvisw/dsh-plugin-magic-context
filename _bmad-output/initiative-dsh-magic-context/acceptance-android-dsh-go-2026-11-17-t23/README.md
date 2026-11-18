# T23 Android 候选包验收

状态：**2026-11-18 既定 Android 本机路径通过，测试安装和配置已恢复**。
结论、原始证据索引、操作复现与未覆盖项见 [acceptance-report.md](acceptance-report.md)。
首版缺按钮的真机阻断已补失败回归并作最小修复；修复后的检查为 85 文件 /
1044 测试（4 workers）、类型检查、双语校验和构建通过。默认并发的一次失败输出
也保留，不将其算作通过。不为本次文档整理重跑产品检查或重新打包。
目标：用户已确认的 Android dsh-go 1.1.0、本机引擎；候选包完成并通过代码评审后才开始。

首版候选：`@elvisw/dsh-magic-context@0.17.0` 的未发布开发工件，
4,080,948 字节 / 71 文件，
SHA-256 `397f7ef89b254ecd20c7728411f3ee99f0adc9e5ac563d1279f8153d25eda5d2`。
完整身份见 [candidate.json](evidence/candidate.json)，连接检查见
[adb-precheck.txt](evidence/adb-precheck.txt)。
恢复连接见 [adb-connected.txt](evidence/adb-connected.txt)，入口和隔离安装回执见
[phone-preflight.json](evidence/phone-preflight.json) /
[phone-install.json](evidence/phone-install.json)。
只有实际阻断路径的代码修复才生成替换包；新包身份见
[candidate-first-open-fix.json](evidence/candidate-first-open-fix.json)，修复依据见
[first-open-regression.txt](evidence/first-open-regression.txt)。
当前新 SHA 为 `6fa8178c71ad55f5d6e4b553940206d486d9ec012d6e9031b445814a67bb93f4`，
4,081,023 字节 / 71 文件。手机上安装代码的校验值见前后数据库观察文件；
最终只验证到部分重建 2/3，未声称重建完成或真实嵌入供应商通过。

重启前后：[phone-before-restart.json](evidence/phone-before-restart.json) /
[phone-after-restart.json](evidence/phone-after-restart.json)；
恢复结果：[phone-restore.json](evidence/phone-restore.json)。

## 冻结的最小验证集

语义断言：原生视图消费同一范围的真实 telemetry summary；未知值不变成 0，
显示或保存配置不会自动探测、启动远程重建。
本地集成断言必须使用 `createTelemetryService().summary()`，不能只校验手写 payload。

真机只走下面这一条路径，不扩展 Web 全矩阵或手机故障注入：

1. **交付与预检**：记录候选 `.tgz` 的 SHA-256、字节数、基线/开发提交及手机实际运行版本。
   经 ADB 传入共享目录，在 App 本机终端安装。只备份待修改的插件配置和安装引用，
   不复制或读取 `.env`、模型凭据或旧会话。测试使用独立插件数据目录和新会话。
2. **记忆与原生呈现**：在新会话通过真实工具写入少量可辨识的测试记忆并检索；
   打开状态条、本会话详情和原生配置页。记录界面与作用域证据，不将模拟桥接当手机通过。
3. **显式向量操作**：电脑模拟 OpenAI-compatible 服务通过 `adb reverse` 供手机访问，
   自定义预设不使用认证密钥。只在用户点按后加载模型、探测、确认目标和缺失数、开始重建，
   并在可观察的部分进度下暂停/继续；记录请求与重建结果。只称模拟嵌入验收，不称 SiliconFlow 通过。
4. **持久化**：完整重启本机引擎，在测试会话再次使用工具检索测试记忆；
   以工具结果/测试数据库记录证明持久化，不以模型复述之前的消息代替。
5. **收尾**：恢复测试改过的插件配置和安装引用，不删除原数据。保存一份简短报告与必要截图。
   不发布、推送或升级日常电脑版；只声明实际观察到的路径和分支。

## 执行约束

- 手机断连、共享目录不可达或安装失败时记 blocked，不先研究第二实例、SSH 或通用手机自动化。
- 原生配置不暴露 `memory`；只预检记忆开关摘要，确需补充时仅改测试插件行。
- 可用现有 `memory.vectorBackfillLimit` 限制单轮回填，以稳定观察部分进度；不得为验收新增产品配置。
- 完成代码修复、最终检查及打包后再跑一次手机 gate。只改报告、清单或文案，不重建宿主或重复 gate。
- 本地 WASM、真实嵌入供应商、iOS、所有失败分支均不因这条路径自动视为通过。
