# dsh-go 移植启动依据

## 已有资料

- `../research-dsh-go-port-2026-11-16.md`：固定源码 `f5fa9256db4c82d601078b8064056b93dc3560ec`，属于静态研究，没有手机运行证据。
- 既定顺序：电脑版遥测稳定后，手机运行时验证，再接原生 `dshGo` 呈现；Web `shell.overlay` 不作为手机主界面。
- 旧研究中的“后续远程嵌入”已由 T20 交付，设置页由 T21 重做，当前发布版本为 `@elvisw/dsh-magic-context@0.17.0`。这些变化要纳入移植，不重新实现供应商客户端。
- 旧便笺中的“T19 手机移植”不是现有票号；实际 T19 是远程嵌入研究。新票号须从当前票树分配。

## 2026-11-17 只读核实

- GitHub 仓库规范名称：`ccch1mneyyy/dsh-Go`，未归档。
- main 提交：`de8979d89d2205fc8872871e54904ddcda891b87`，提交时间 `2026-11-17T08:04:11Z`。
- 相对旧研究提交，GitHub compare 显示 ahead 554 commits。因此不能把旧研究的版本与接口直接当成用户已安装 App 的事实。
- 初次核实时尚未连接手机；后续连接事实见下文。没有安装插件、调用手机模型、验证 SQLite/WASM 或修改 dsh-go。

## 待确认

用户已确认：只有 Android 设备，App 一直跟随最新版，使用手机本机引擎。无需再次询问平台或本机/远程模式。实际安装版本现已通过 ADB 记录；尚需落实隔离验收方式。

## Android 首期与 iOS 发布状态（2026-11-17）

- 用户决定：首期仅在 Android 设备测试，iOS 不作为交付验收门槛。
- 上游 [README](https://github.com/ccch1mneyyy/dsh-Go#readme) 明确说明：Android 版已发布；iOS 仍在开发和真机测试，需要 Mac 自行签名编译，没有公开安装包。
- `gh release list` 与 [最新公开 Release v1.1.0](https://github.com/ccch1mneyyy/dsh-Go/releases/tag/v1.1.0) 核对：发布时间 `2026-11-15T01:15:18Z`，非 prerelease；附件为 `dsh-go-1.1.0-arm64.apk`、`SHA256SUMS`、`update.json`，没有 iOS 安装包。
- 公开最新版本不等于用户设备已安装版本；后续接口核对应以用户目标 App 对应源码为准，不直接以 main 代替。

## 已发布版本与本地落点

- `v1.1.0` 固定提交：`e9d3239bee18029d48618c7514303bc7fa7bbf8f`，提交时间 `2026-11-15T01:05:23Z`。首期接口核对使用此版本，而不是较新的 main。
- 当前插件工作基线：`bf9c62fa694884fb4390b1564fc2f0cf138174ae`，包版本 `@elvisw/dsh-magic-context@0.17.0`。
- `src/dsh/telemetry.ts:119-125,502-516` 的 `TelemetryService.summary(sessionId?)` 可直接作为原生视图数据源，无需手机绕道访问插件 HTTP 路由或维护第二份 token 统计。
- `src/index.ts:848-988` 目前在 `webServer` 注入作用域内创建 telemetry。若原生视图需要独立于 Web 路由注册，必须处理服务创建/销毁的归属；不应直接假设存在一个可全局访问的 summary 服务。
- `src/client/index.js:2151` 的 `buildTelemetryView` 在浏览器模块中，不能在服务端直接导入整个浏览器脚本。原生呈现应复用数据契约，是否抽取纯映射在设计中明确，不复制统计逻辑。
- `src/dsh/embedding-lane.ts:85-106` 已提供 `status/models/probe/start/pause/resume/disarm` 方法，可复用行为；不能为了手机另写一套 embedding 客户端或迁移状态机。
- Context7 未检索到对应 dsh-Go 文档，只返回其他 DSH 项目；本次改用上游发布 tag 的文档与源码，不拿桌面客户端文档替代手机协议。

## 设备访问

- 本机已有 `adb.exe`；首次 `adb devices -l` 返回空列表并启动了本机 ADB daemon。未连接或操作手机。
- 连接前用户确认尚未连 ADB。已说明：方案/源码准备无需连接，真机验收时可用 USB 或无线调试；ADB 连接本身不等于安装/配置修改授权。

## v1.1.0 原生接口核对

以下均固定到 `e9d3239bee18029d48618c7514303bc7fa7bbf8f`，属于源码契约，不是手机运行结论。原始参考文件在临时目录 `dsh-go-port-reference/`；上游链接统一为 `https://github.com/ccch1mneyyy/dsh-Go/blob/e9d3239bee18029d48618c7514303bc7fa7bbf8f/` 加文件路径。

- `docs/plugins/slots.md:53-88`、`examples/plugins/dsh-go-example-usage/lib/index.js:84-96`：通过 `ctx.inject(['dshGo'], ...)` 注册 `strip` 与 `panel`，不能加入插件顶层必需注入。未装桥接的电脑宿主不得因此无法加载插件。数据订阅返回取消函数。
- `examples/plugins/dsh-go-example-usage/package.json:31-43`：`dshGo.v = 1`；一个 `composer.strip` 可打开已声明 panel。`slots.md:36-48` 限制所有 surface ID 在插件内唯一、状态条文字最多 24 字。
- `docs/plugins/slots.md:79-107`：会话面板有 `scope.sessionId`，全部功能入口没有；不可缺省为别的会话。view/data 使用 `caps.locale`，action 使用 `event.locale`；发送完整数据快照，桥接处理差量和限频。
- `docs/plugins/actions.md:60-90`：普通动作窗口 3 秒；网络探测需要 deferred + AbortSignal，延后效果只允许 insert/copy/toast/patch。重建不应等待整个后台 pass 完成再返回。
- `docs/design/plugin-config.md:77-84,179-187`：原生配置已有分组与即时 volatile 修改，不是桌面卡片的 Save 草稿模型。不能把 Web 的字段中文词典、保存前置或自有按钮假定为通用 schema 表单已经具备。
- `runtime/build-runtime.sh` 的发布源码默认版本为 DSH `0.2.2-rc.1`、Node `24.22.1`；这不是已读取手机运行中引擎版本的证明。

## 同机隔离的当前边界

- v1.1.0 的 `SafeMode.kt:98-116` 和 `runtime/lib/rtbuild.py:937-944,1612-1617` 支持独立 HOME/DSH_HOME/profile/端口、复用桥接 overlay 的源码路径。
- 但 `app/lib/state/hosts_state.dart:26-38` 只有 local/ssh/relay，local 为单例；尚未证明能直接新增任意 localhost HTTP 主机。`docs/guide/zh/03-engine-hosts.md:74-81` 的 SSH“只连接”可能接入第二实例，手机上的 SSH 服务和生命周期尚未验证。
- 因此不声称同机隔离已可执行，也不把多用户/另一台手机认定为唯一方案。不能覆盖日常 `web` profile，不能写日常 `/tmp/dsh-web.pid`，不能用覆盖安装的 `dev-run.sh` 代替隔离。
- 后续用户明确允许使用现有 `web` profile 测试，所以上述第二实例/SSH 接入研究停止，不作为 T23 编码前置。候选包验收须使用独立插件数据目录及测试会话，先说明可恢复的配置备份范围，不清理原数据、不修改模型凭据。

## 2026-11-17 ADB 只读连接检查

用户连接手机并要求测试后执行：

```text
adb devices -l
adb -s <device> shell getprop ro.build.version.release
adb -s <device> shell getprop ro.product.manufacturer
adb -s <device> shell pm list packages dsh
adb -s <device> shell dumpsys package io.github.ccch1mneyyy.dsh_app
```

- 连接状态 `device`，无需额外安装 USB 驱动；设备识别型号 `25102RKBEC`，厂商 `Xiaomi`，Android `17`。
- 包名 `io.github.ccch1mneyyy.dsh_app`，`versionName=1.1.0`、`versionCode=11150838`；安装标志未见 `DEBUGGABLE`，不能把 `run-as` 访问沙箱当成现成能力。
- 没有安装/卸载、启动/停止 App 或引擎、读会话内容或凭据、修改配置或调用模型。此检查只证明连接和 App 版本，不是插件 Android E2E 通过。

## 后续操作与用户纠偏（2026-11-17）

- 用户允许直接使用现有 `web` profile 后，通过 App 页面进入本机终端，读取 `node -v`，实际为 `v24.22.1`。导航打开过 App 和终端，没有重启引擎、安装插件或修改配置。
- `adb shell input text` 输入的版本参数出现重复字符；改用逐键事件后 `node -v` 成功。仅记录自动化输入限制，不据此修改 dsh-go。
- SQLite/FTS5 探针仅生成在电脑临时目录 `dsh-go-port-reference/android-probe/`，尚未推送或执行；SQLite/FTS5、手机 DSH 版本、插件加载、WASM 与记忆路径仍未验证。
- 用户指出移植不应演变为研究手机 App 的实机操作，并再次要求走 BMad。执行顺序改为：停止手机操作 → T23 票面/短设计/计划 → 独立票面校验 → 用户确认 → 实现 → 一次候选包 Android 最小验收。不将 ADB 终端自动化扩为产品功能或前置 spike。
- 重型编码与代码评审优先 `deepseek-v4.1-flash`；当前已由该子代理核对手机管理进程的 embedding 凭据来源这一具体计划缺口，不做新的全量宿主调研。

## 远程嵌入密钥来源：已关闭的计划缺口

- 发布 tag 的 `docs/guide/zh/11-faq.md` “App 能对话，headless 命令却报 MISSING_CREDENTIAL”明确列出进程环境、启动目录 `.env`、`$DSH_HOME/.env` 的顺序；终端 export 不是 App 已运行进程的环境。
- 不仅依赖子代理结论：实现者复读了该原文，并核对留存 DSH 包的 `@deepseek-ai/dsh-app-boot/lib/index.js:4475-4510`。`loadLayeredEnv` 的 4491-4493 行逐层将未存在的变量写入 `process.env`；`@deepseek-ai/dsh/lib/bin.js:2` 使用此启动器。候选包验收仍需记录手机实际 DSH 版本，不以电脑源码代替手机通过。
- 因而本轮无需改写 embedding 认证机制：用户自行编辑手机 `$DSH_HOME/.env` 并重启引擎，插件继续只保存变量名。明文文件和 shell 历史风险须在用户文档中说明；不让代理读取、写入或搬运真实密钥。
- App 凭据存储不是环境变量注入；不得声称在 App 任意模型服务里填 Key 就会被 embedding provider 读到。本轮不新增 credential-ref 或凭据服务适配。

## T23 首次独立票面校验与源码核对

- 回执为 not approvable，3 条 Blocking Fix。保持 draft / refined:false，只修改设计/票/计划，未开始产品实现。
- F1 成立：`src/client/index.js:536-585` 是按钮呈现门槛，不能被服务端直接复用；`src/dsh/embedding-lane.ts:458-557` 缺完整动作拒绝条件。计划是在现有 lane/小型服务端纯 helper 落权威守卫，原生与 HTTP 调用同一 lane；保留浏览器呈现，不为了“抽出来两边 import”引入新打包链。
- F2 成立：`deriveState:376-395` 只有 status 观察到 local/off 才 disarm。所用宿主的 `cordis-plugin-loader/src/index.ts:34` 声明 `loader/volatile-update`；`src/config/entry.ts:184-198` 先更新所有引用，再同步向所属 fiber 发一次路径事件。父级监听此事件，在有效 local/off 提交时 disarm，能覆盖不打开面板的往返。`cosmokit/src/volatile.ts:9-12` 本身只有 get，没有 subscribe；不虚构引用订阅 API。
- F3 部分成立：`readCache:194-218` 已按模型等完整 cache key 匹配，因此旧 A entry 不会直接成为 B 的探测宽度。真正的问题是 `probe:491-523` 无 await 后目标复核，且 `writeCache:223-240` 用当前配置淘汰而非所写 entry：旧结果可能误报成功并淘汰 B 的既有 entry。计划补完整目标/密钥指纹复核及取消传递，不因此改写向量身份机制。
- 三条建议作为本次执行说明补齐，不新增验收场景：候选 tgz 的本机安装路径与 hash；测试 memory 显式启用/独立目录；模拟服务用 adb reverse 可达且无真实嵌入密钥。
- Context7 的 Cosmokit 查询只返回名称相近的分子工具库，没有使用这些无关结果；上述接口结论来自实际依赖源码与类型，而非训练记忆。
- 定向复核结论：READY FOR USER PLAN APPROVAL。校验者独立确认 loader 事件契约，并撤回“跨模型混用维度”的原判断；三项计划缺口均闭合。仅代表可供用户确认的计划，T23 仍为 draft / refined:false，未实施、未安装、未声称手机通过。
