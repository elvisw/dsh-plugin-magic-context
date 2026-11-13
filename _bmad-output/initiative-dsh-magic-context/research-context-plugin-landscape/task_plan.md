# Task Plan: 上下文插件竞品与开发价值

## Goal
查找已存在的 DSH 同类插件与其他宿主替代方案，评估本项目是否值得继续独立开发。

## Phases
- [x] 确认需求边界和研究范围；用户批准标准联网调研。
- [x] 核查指定竞品的功能、版本、维护与局限。
- [x] 搜索其他 DSH 竞品和跨宿主替代方案，保存带来源摘要。
- [x] 对照需求，形成继续/收窄/贡献/停止建议。
- [x] 检查引用和证据边界，交付报告。

## Decisions Made
- 归入既有 initiative；不修改配置、需求或代码，不安装插件、不调用产品模型。
- 类型 market，附带指定竞品 teardown；优先第一手 GitHub README、代码、release、issues。
- 标准强度、广度优先：主代理查指定竞品，两名研究子代理分别查 DSH 生态和跨宿主替代。
- 最多两轮，每维度每轮最多 8 个实际阅读来源；normal 核查。允许搜索与 gh，只读。
- 来源自述与实测区分；搜索未发现不等于不存在；无独立确认的可靠自述标记 medium/unverified。

## Errors Encountered
- 请求远程 src/dsh/tools.ts 得到404；用已取得的远程 tree 确认实际文件为 tool-bridge.ts 后读取成功。
- 对 raw Markdown 误用 gh --jq，得到 JSON parse error；未继续重复读取同一 README，使用已取得的英文正文。
- PowerShell foreach批量写memlog被portable scanner拒绝；改为独立append，不放宽权限。
- memlog调用遗漏append子命令；读取子命令帮助后纠正，追加成功。
- 根目录无task_plan.md；本次计划位于研究run文件夹内。
- 两个general研究子任务ECONNRESET；回收跨宿主工具证据，主代理另存DSH三项第一方文档与registry补查；未把网络失败当成检索不存在。

## Status
报告完成：指定竞品与8项其他方案、PRD差距表、采用/贡献/受限fork/停止建议、来源及复查时点已落盘。21项引用完成编号与独立语义检查；发现的过宽表述已缩窄，structure/prose建议已处理。离线HTML从同一Markdown生成并校验来源锚点与零外部资源。未安装DSH插件、执行其测试，未修改PRD、配置或产品代码。
