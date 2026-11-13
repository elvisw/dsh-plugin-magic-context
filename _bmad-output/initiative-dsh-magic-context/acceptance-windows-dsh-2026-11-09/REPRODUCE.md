# 复核与复现

命令工作目录为本文件所在目录。不要把实验profile复制到日常DSH目录。

`experiment-root.json` 是本机临时实验目录的定位指针，不纳入 Git。新 clone 只有归档证据，不自动具备原本机环境；下述依赖原目录的校验需有匹配的本机指针与目录。不要为了通过校验而伪造指针或复用日常 profile。

## 适用语义与版本（2026-11-10补充）

- 现有脚本与证据针对插件`dsh-plugin-magic-context@0.11.1`、DSH宿主`0.2.2-rc.1`。插件的`ctx_expand`会原位替换旧占位符，不是仅返回原文副本，因此本轮requeue场景再次回收同一tag有意义。
- [#13](https://github.com/wk544863858/dsh-plugin-magic-context/issues/13)优先建议改为独立读取历史、作为新工具结果返回。若采用该语义，旧节点继续保持已回收状态，应针对新结果的新tag回收；原有“expand后再次reduce旧tag”的断言不再适用。脚本保留为旧版缺陷证据，不能直接作为新语义的回归验收。
- [#14](https://github.com/wk544863858/dsh-plugin-magic-context/issues/14)的目标是Historian发布后仍可独立读取原文，不强求旧tag或撤销摘要。下述实验只复现0.11.1旧tag路径不可达；未来需按实际提供的定位入口另写验收，不能把原版消息序号与DSH事件序号视为同一编号。
- 若实现改动，需另验返回内容保真、新结果标记与回收、摘要后独立定位，以及缺失数据的失败/降级说明。当前未实现或运行这些新验收；原始脚本和证据保持不变。

## 无模型费用的复核

1. 阅读acceptance-report.md及evidence内JSON。
2. 用evidence/archive-sha256.txt核对redacted-runtime.zip；压缩包含原始脱敏宿主事件、当前上下文快照、stdout/stderr、activity.log与配置。
3. 在本机实验目录仍存在时运行`uv run python verify_acceptance.py`。退出0表示证据支持报告，包括产品的预期失败；不是产品全部通过。
4. 运行`node repro_requeue.mjs`复现存储层缺陷。未修改的插件0.11.1在现有原位恢复语义下预期退出1；不调用模型。该脚本不修改插件源码，只在临时root/unit-requeue下创建独立数据库。

## 在新隔离目录重做

这是实验脚本，不是可直接跨机部署的通用测试套件。prepare_experiment.py内的DSH_EXE与临时父目录需要适配本机。不得指向或重用日常profile。需要Windows、可用的DSH、Node24，以及由环境继承的DeepSeek API凭据；真实模型部分会产生费用。

1. 把本实验目录复制到一个新的报告目录，但不复制experiment-root.json和evidence。旧指针有防覆盖保护，不要删除旧证据来强行重跑。
2. 在新副本运行`uv run python prepare_experiment.py`，取得新的root。脚本校验固定0.11.1发行包并创建隔离路径。
3. 用`run_host.py --label install --timeout 180 -- plugin --profile headless add dsh-plugin-magic-context@0.11.1 --ignore-scripts --store-dir <root>/pnpm-store`安装。宿主包解析若需profile配置，参照证据中的pnpm-workspace.yaml（hoisted、autoInstallPeers=false）。
4. 运行`uv run python prepare_scenarios.py`。将新root/overlays/base-control.yml复制到新root/dsh-home/profiles/headless/cordis.patch.yml，仅作用于新实验profile。observer模块的来源是报告目录；test-driver副本须保留在profile内，以便解析宿主peer imports。
5. 用`run_host.py --label <新标签> -- --profile headless --json --permission-mode read-only --approval-policy never "<实验提示>"`执行场景。已运行的逐项提示、参数、会话ID及stdout/stderr在证据包中；重做时使用新会话ID，不要直接复用包里的ID。不要覆盖旧label以免丢失证据。
6. 重启恢复：先read→reduce并退出；改变fixture.txt的nonce；通过--session-id恢复旧会话，只允许expand，不再read。以事件内容、身份字段与哈希判断，而非模型回复。
7. requeue（仅现有原位恢复语义）：关闭Historian，按read→reduce→expand→reduce→expand执行，每次一项工具调用、分属不同model step；两次reduce指向同一tag，并确认expand确实把原文替换回旧位置。若只返回新结果，不使用此流程判断缺陷。
8. Historian：使用--patch <新root>/overlays/historian.yml，在全新会话中read小fixture→首次reduce→read大fixture。恢复该会话后先调用acceptance_wait等待15秒，再于下一step调用expand。必须先确认compartment发布且来源列表覆盖真实drop，才可归因于遮蔽。
9. `run_engine_sweep.py`执行三个注册互斥场景。该项只验证激活/注册，不替代真实满窗compaction测试。

analyze_evidence.py适用于新observer记录；verify_acceptance.py中的已验收会话ID与固定长度属于本轮证据断言，不能不改就套用于新一轮。finalize_evidence.py也引用本轮分析文件，重新归档前须生成新一轮相应分析。
