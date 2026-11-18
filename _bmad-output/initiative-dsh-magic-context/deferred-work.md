# Deferred work

- source_plan: `tickets/story-android-dsh-go-native-port-plan.md`
  summary: T23 原生模型列表不应因一次成功探测得出维度而误失效。
  evidence: 独立修复复核的非阻塞建议；modelConfigKey 包含探测所得 status.dimensions，Load models 后 Probe 会从 null 变为实际宽度，下一次 feed 清除列表。列表可以重新显式加载，不影响重建门槛；本轮不扩修。

- source_plan: `tickets/story-android-dsh-go-native-port-plan.md`
  status: resolved
  summary: 已修复原生向量面板首次打开时的 controls 初始化与订阅时序。
  evidence: 2026-11-18 既定 Android 路径实际触发缺按钮，升级为阻断并处理；新增回归先失败，视图改为直接读取当前状态后通过，修复候选在手机首次打开已显示并执行操作。见 T23 acceptance-report.md；没有扩展测试矩阵。

- source_plan: `tickets/story-android-dsh-go-native-port-plan.md`
  summary: 清除 Config 说明中剩余的 memory 对象存在性旧注释。
  evidence: 独立复核确认默认开启的用户文档已正确；src/index.ts 仍有“presence opens bridge”的历史注释，与 openMemoryLane 的 default-on 不一致。只属内部注释，本轮不因此重建产品门禁。
