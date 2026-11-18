# 架构与内部结构

这页写给要改代码或排障的人。只想用插件的话不用看。

## 目录

```
src/
  dsh/     # 全包唯一允许 import @deepseek-ai/* 的目录（防腐层）。
           # 事件名、payload 形状、surface 词汇表全部收拢在这里，
           # DSH 升级只改这个目录。
  core/    # 中性逻辑与存储：policy/stores/journal/memory-*/domains。不依赖 DSH。
  client/  # 浏览器半侧（设置卡片 + 遥测徽标），纯 JS，构建时原样拷为 lib/client.js。
  index.ts # 组合根：boot probe（fail-loud）→ 接缝监听 → 中性存储。
```

## 隔离纪律

DSH 还在 developer preview，破坏性变更属于预期内。这个包的结构就是照这个前提设计的。

**能力探测 fail-loud。** `probeDshSeams` 在启动期校验接缝可用性，不可用就抛错，绝不静默假装在管理上下文。

**版本 fence。** 适配器库 schema 链当前 v11，前向迁移，库比代码新就拒开。自有语料库 `memories.db` 版本线从 v95 起（2026-10-13 切换，之后续号归本插件），由 `MEMORY_SCHEMA_MAX_VERSION` 守住，超出时读路径拒绝、写路径转只读并告警。

**测试即探针。** 集成测试同时是接缝契约测试。DSH 升级后重跑，破坏点能精确定位到 `src/dsh/`。

## 双库

**适配器库** `~/.local/share/cortexkit/magic-context-dsh-poc/dsh-magic-context.db`：tags / usage / pending_drops / compartments / baseline / domains / queues / journal，schema v11。

**自有语料库** `~/.local/share/cortexkit/magic-context-dsh-poc/memories.db`：项目记忆 + 全域行 + 画像 + 向量。legacy `context.db` 已封存不读，2026-10-13 硬切换，与上游只做功能跟进，没有存储兼容义务。

## 存储与检索引擎

记忆行的身份是 `git:<root-sha>` 或 `dir:<hash>`，自动从工作目录推导。

全文索引用 FTS5，分词器是 `porter unicode61`，与上游一致。这个分词器**不切分中文**：一整段连续汉字会被当成一个 token，所以中文查询在全文通道基本命中不了，只能靠向量通道。这是上游既有行为，不是本适配器的缺陷，详见 [memory-architecture-challenge](memory-architecture-challenge-2026-10-10.md)。

混合得分按 `0.7 × 余弦 + 0.3 × 倒数排名` 合并，只有单一来源时乘 0.8 惩罚。命中标签 `hybrid` / `semantic` / `fts` 就是这么来的。

向量由包内 onnxruntime-web WASM 跑 MiniLM-L6，384 维，无原生编译、无 API key。模型文件按 revision + sha256 钉住，两个镜像回退，缓存在插件数据目录。任何失败都 fail-open 降级全文检索。

`memory_embeddings` 的主键是 `(memory_id, model_id)`，所以同一个模型下一条记忆只可能有一行向量。远程空间带 `embedding-remote:` 前缀，与本地空间互不混用。

## 组件地图

完整代码结构见 [src/](../src/)。几个主要落点：

| 关注点 | 文件 |
|---|---|
| 配置 schema 与 volatile 读取 | `src/dsh/config.ts` |
| 工具定义（`ctx_reduce` / `ctx_expand` / `ctx_memory`） | `src/dsh/tool-bridge.ts` |
| pre-step 决策与回收落地 | `src/dsh/pre-step.ts` |
| historian 与 compartment 发布 | `src/dsh/historian.ts`、`src/dsh/management-pass.ts` |
| 记忆写入与检索 | `src/core/memory-write.ts`、`src/core/memory-search.ts` |
| 向量车道 | `src/core/vector-lane.ts`、`src/dsh/memory-lane.ts` |
| 远程向量客户端 | `src/core/embedding-remote.ts` |
| 遥测路由 | `src/dsh/telemetry.ts` |
| 浏览器半侧 | `src/client/index.js` |
| Android 原生桥接 | `src/dsh/go-native.ts`、`src/dsh/go-view.ts` |

## 与上游的对齐

与 OpenCode / Pi 两个上游适配器的逐条行为对齐和刻意差异见 [PARITY.md](../PARITY.md)，裁决分 aligned / host-imposed / intentional 三种，每条引用宿主文件。
