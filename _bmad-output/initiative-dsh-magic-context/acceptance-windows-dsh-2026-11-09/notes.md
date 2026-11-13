# 实验笔记

## 环境与版本
- Windows；Node v24.21.0；已有dsh.exe为0.2.2-rc.1，只复用已安装宿主，不复用用户profile。
- 根目录：C:/Users/elvis/AppData/Local/Temp/opencode/dsh-mc-acceptance-kngotjd0；路径指针experiment-root.json。
- npm包dsh-plugin-magic-context固定0.11.1，sha512与registry一致；62个归档条目，无链接条目；包没有安装期生命周期脚本。
- 临时profile的pnpm-workspace.yaml为nodeLinker: hoisted、autoInstallPeers: false；宿主文档说明peer imports可使用原生分发的fallback。
- DSH_HOME隔离宿主；插件dataDir可显式指定，memory-lane将memories.db放在adapter DB旁。额外隔离子进程HOME/USERPROFILE，防止默认路径或embedding缓存落到日常目录。
- 本机存在DEEPSEEK_API_KEY，仅记录存在性；最终执行37个真实agent模型step及2次真实Historian调用，凭据未写入产物。

## 来源
- 竞品研究：../research-context-plugin-landscape/research-context-plugin-landscape.md
- 目标插件：https://github.com/wk544863858/dsh-plugin-magic-context
- Context7 /deepseek-ai/deepseek-harness：headless README、CLI boot文档、Python SDK插件安装与DSH_HOME隔离文档，访问2026-11-09。
- 已读发行包package.json、cordis.patch.yml、lib/index.js、lib/dsh/memory-lane.js、lib/dsh/tool-bridge.js；未把README中的依赖描述视作发行包实际manifest（manifest仍只有peer + 两项运行依赖）。

## 证据规范
每个场景记录宿主/插件版本、命令、模型模式、退出状态、原文与恢复内容的长度/哈希、隔离存储路径、可复现日志。密钥与真实用户会话不得进入产物。

## 最终状态
- 完整结果见acceptance-report.md；证据包与机器可读分析已复制到本目录evidence，不依赖临时目录来查看主要证据。
- 已确认恢复后requeue不落地的缺陷；首次drop被Historian覆盖后，原始事件尚存但expand接口不可达。
- verify_acceptance.py校验运行证据；repro_requeue.mjs在未修改的0.11.1上刻意退出1。未修目标产品，不应说“全部测试通过”。

## 2026-11-10 后续澄清与文档同步

- 版本名需区分：插件为`dsh-plugin-magic-context@0.11.1`，DSH宿主为`0.2.2-rc.1`，不存在本次实验的“DSH 0.11.1”。
- #13的事实不变：插件原位恢复后，同一tag重新入队未落地。原文恢复事件替换旧占位符，仍占据原位置；因此旧tag的再次回收在现有实现中有意义。该结论不适用于仅返回原文副本的实现。
- #13的优先建议调整为原版已核查的“独立读取原始历史、返回新工具结果”，新内容按新tag回收；若保留原位恢复，才继续修现有requeue状态转换。建议尚未实现或验证。
- #14按能力边界确认/改进建议处理：要求摘要发布后仍有独立原文读取入口，不强求旧tag或撤销摘要。只实测了当前旧tag入口失效，原始事件仍在，不据此断言物理删除或违反竞品承诺。
- 原版OpenCode固定提交`17801ffd2f9635af1abae893e37914359110f2c1`仅做源码/测试核查：TS按持久化tag查原文；Rust拒绝tag并引导消息序号/范围。消息序号、tag和DSH事件序号不能混用。此补充不改变本项目PRD既有上游版本基线。
- 固定源码与公开反馈见[Issue #13留档](issue-requeue.md)、[Issue #14留档](issue-historian-recovery.md)；本地同步验收解释、复现说明及竞品研究补充，PRD/initiative仅标注新输入和待重评事项。未重跑模型实验，不改原始日志、证据归档或测试脚本，不把上游建议视为本项目已批准设计。

## 2026-11-11 手动 flush 功能建议

- 已检查现有公开 Issue，无同类请求，新增 [#15](https://github.com/wk544863858/dsh-plugin-magic-context/issues/15)，[正文留档](issue-ctx-flush.md)。本次是源码核查，不是新的 DSH/模型实验；原始验收证据不变。
- 插件 `dsh-plugin-magic-context@0.11.1`（上游 HEAD `93ef5fe4a06a2c05f53e6a6225346919e860d74e`）有自动处理 pending 的能力，但缺少用户显式强制落地入口。ctx-status 是状态读取，手动 compact 是 Historian checkpoint，二者不等价于 flush。
- 原版参考包括 `v0.49.30` 的 executeFlush 和固定提交 `3c2b53940270b7e020b8ee23e8ce10214430f50e` 的命令文档/Pi 适配器：处理 pending 加相关刷新信号，下一请求生效；不能仅凭核心函数就宣称画面同步清空。
- 建议不额外启动摘要模型、不回收未排队内容，并报告真实完成/待执行状态。首次正常入队即可作为独立验收，不能混入 #13 的 restore/requeue，也不扩展为 #14 的原文检索。
- 已同步验收报告、竞品研究、PRD/initiative 的研究输入和 fork 交接入口；不修改既有 FR、版本基线或批准实施范围，不自动提交或推送本轮文档。
