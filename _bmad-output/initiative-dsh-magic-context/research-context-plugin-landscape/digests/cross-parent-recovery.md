# 跨宿主补查与摘要边界修正

访问2026-11-09。主代理在研究子任务连接重置期间补查；未安装或实测。

- 实读 https://raw.githubusercontent.com/Opencode-DCP/opencode-dynamic-context-pruning/master/README.md ：当前为单compress工具、range/message两模式、去重与错误输入清理；宿主历史不修改，请求侧替换。作者明确“Development on DCP has slowed because most new context-management work has moved to Sleev”；不采用旧fork的discard/extract工具或缓存命中数字作为当前事实。缓存净收益取决于对话、频率和provider pricing。
- 实读 https://raw.githubusercontent.com/cortexkit/magic-context/master/README.md ：官方当前列OpenCode、Pi、OMP；历史分层、缓存感知回收、项目记忆、Dreamer、ctx_search/expand/note，Pi扩展与OpenCode共享数据库。不能当成DSH直接插件；不将“never forgets”或永久缓存命中营销语句当运行证明。
- 原cross-harness.md由恢复子代理从其先前工具结果落盘，可作为来源摘要。采用其README和源码存在性信息，运行能力统一保持medium/unverified，不照搬“高”信心。
- 不采纳原摘要的以下推论：(1) Rust模式tag拒绝而ordinal可读，不等于原文整体不可恢复；(2) DCP恢复保留的原始消息，不等于只能恢复有损摘要；(3) opencode-recall超8KB默认拒绝、可force，不是截断，最后push较早不等于维护者宣布停止；(4)“不曾发现全能方案”不是市场不存在的证明。
- Sleev只作为代理层替代趋势，技术恢复语义未验证；claude-mem只作为观察式跨会话记忆，不与可逆回收等同。opencode-recall只作早期机制参考，不作为推荐即装的成熟替代。
