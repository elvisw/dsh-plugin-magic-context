# 指定竞品：wk544863858/dsh-plugin-magic-context

访问日：2026-11-09。固定 HEAD：93ef5fe4a06a2c05f53e6a6225346919e860d74e。无安装、无本机测试、无真实模型调用。

## Claim cards

### C1 已有发行物，且近期有维护
- claim: npm latest 实际为 0.11.1，gitHead 指向上述 HEAD；2026-11-07 changelog 与提交对应；GitHub latestRelease 却仍为 v0.9.0（2026-10-20），不可混为一个版本。
- sources: https://registry.npmjs.org/dsh-plugin-magic-context/latest ; https://github.com/wk544863858/dsh-plugin-magic-context/blob/93ef5fe4a06a2c05f53e6a6225346919e860d74e/CHANGELOG.md ; https://github.com/wk544863858/dsh-plugin-magic-context/releases/tag/v0.9.0
- publisher: npm registry（元数据）/ wk544863858（代码与日志）；pub_date: 2026-11-07（changelog）；accessed: 2026-11-09
- confidence: medium；class: release；独立第三方实际安装成功未验证。
- 当前 CI success: https://github.com/wk544863858/dsh-plugin-magic-context/actions/runs/42383941346 ; Release success: https://github.com/wk544863858/dsh-plugin-magic-context/actions/runs/42384021323

### C2 不是只有“记忆”同名，而是直接覆盖可逆工具回收
- claim: ctx_reduce 入队；ctx_expand 从当前 surface 上匹配的占位符 sourceEventSeqs 取得原始工具结果 content 并 replace；不是重新执行工具或生成摘要。
- source: https://github.com/wk544863858/dsh-plugin-magic-context/blob/93ef5fe4a06a2c05f53e6a6225346919e860d74e/src/dsh/tool-bridge.ts ; https://github.com/wk544863858/dsh-plugin-magic-context/blob/93ef5fe4a06a2c05f53e6a6225346919e860d74e/src/dsh/seams.ts
- publisher: wk544863858；pub_date: HEAD 2026-11-07；accessed: 2026-11-09；class: capability；confidence: medium（源码核查，无独立运行复现）
- tests: https://github.com/wk544863858/dsh-plugin-magic-context/blob/93ef5fe4a06a2c05f53e6a6225346919e860d74e/tests/phase1.spec.ts 明确用真实 DSH agent loop + MockAdapter，断言正文→占位符→原正文；不能推导所有宿主版本都可用。
- 边界：expand 参数只有 tags，且在当前 surface 枚举中找占位符；不是上游 message/start/end 任意历史恢复接口。整段已被 Historian 遮蔽后的恢复需要另测，不能把当前测试外推为全历史可恢复。

### C3 作者文档宣称的功能很广，但不是完整 MC 等价物
- source: https://github.com/wk544863858/dsh-plugin-magic-context/blob/93ef5fe4a06a2c05f53e6a6225346919e860d74e/README.md
- claim: 四层 Historian、项目 SQLite 记忆、MiniLM WASM+FTS、共享域、维护 tick、UI、压力/紧急回收；默认不接管 compaction-basic。Node >=22.19。
- publisher: wk544863858；pub_date: HEAD 2026-11-07；accessed: 2026-11-09；class: capability；confidence: medium（作者自述+部分源码核查）。不要承诺“从不破坏缓存”：文档同时承认 priced bust，只是控制落地时机。

### C4 明确放弃上游存储互读，存在可贡献缺口
- source: https://github.com/wk544863858/dsh-plugin-magic-context/blob/93ef5fe4a06a2c05f53e6a6225346919e860d74e/PARITY.md
- claim: 作者明确 own corpus，自2026-10-13与 MC 共享库分离，无存储兼容义务；full dreamer 仅维护 tick 切片；watermark age reclaim、edit-marker、准确 tokenizer/图像估算等缺失。
- publisher: wk544863858；pub_date: comparison 2026-10-30；accessed: 2026-11-09；class: scope；confidence: medium（维护者声明，部分条目过时）。
- 重要冲突：PARITY 的 embedBackfill 默认 off 与当前 README on 冲突，旧版号/宿主锚点也滞后。只引用明确产品边界，不用其全部配置作为最新事实。
- 工具列表与已读 tool-bridge 仅列 ctx_reduce、ctx_expand、ctx_memory；未见上游独立 ctx_search、ctx_note。记忆搜索是 ctx_memory(action=search)，不等于跨会话原始历史检索。

### C5 Windows/本机DSH兼容不够证据
- source: https://github.com/wk544863858/dsh-plugin-magic-context/blob/93ef5fe4a06a2c05f53e6a6225346919e860d74e/.github/workflows/ci.yml
- claim: 公共 CI 只在 ubuntu-latest 上测试 Node 22.x/24.x；未见 Windows CI，故 Windows 可作为验证工作而不是先验已坏。
- publisher: wk544863858；pub_date: HEAD 2026-11-07；accessed: 2026-11-09；class: compatibility；confidence: medium
- README 代码基线 DSH 0.2.1-rc.1；changelog 0.11.0 提到门面同步宿主0.2.2-rc.1，表述不同，不直接认定不支持0.2.2。

## Search craft / rejected evidence
- 搜索 `DeepSeek Harness magic context plugin`。第三方 dshfind 旧页说尚未npm发布，已被 registry 当前数据否定；不以聚合页判定安装现状。
- GitHub issues 列表本次返回空；这既不能证明没有 bug，也不证明广泛使用。star 不用于开发价值判断。
- 没有独立用户量、成功率、成本/延迟对比或 Windows 实测。

## Follow-up worth doing
- 隔离 profile 上测：文本/JSON原文一致、重启稳定引用、Historian后恢复、工具配对与真实模型缓存/成本。
- 先询问维护者是否愿接收 ctx_search/ctx_note、Windows CI、导入导出或互通工作，再决定贡献还是受限 fork。
