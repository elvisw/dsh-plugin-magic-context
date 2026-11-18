---
id: 25
type: story
title: Android local-vector end-to-end acceptance
parent: initiative-dsh-magic-context
covers:
  - _bmad-output/initiative-dsh-magic-context/acceptance-android-dsh-go-2026-11-18-t25-local-vector/
  - README.md
  - README.zh-CN.md
  - PARITY.md
  - CHANGELOG.md
sources:
  - _bmad-output/initiative-dsh-magic-context/acceptance-windows-dsh-2026-11-18-t24-credential-key/android/phone-local-embed.json
  - _bmad-output/initiative-dsh-magic-context/acceptance-android-dsh-go-2026-11-17-t23/acceptance-report.md
  - _bmad-output/initiative-dsh-magic-context/acceptance-windows-dsh-2026-11-14-vector-bootstrap/acceptance-report.md
companions:
  - _bmad-output/initiative-dsh-magic-context/tickets/story-android-local-vector-e2e-plan.md
after: [24]
refined: true
hitl: true
risk: medium
---

# Android local-vector end-to-end acceptance

## Description

在真实 Android 设备上验证**完整本地向量链路**，而不只是嵌入原语：写入记忆 → 维护 tick 用
包内 MiniLM WASM 回填向量 → `ctx_memory action=search` 走混合检索命中。T23/T24 已证明
`openLocalEmbedder()` 能在手机上产出 384 维向量（891 ms），但那条探针**绕过了插件运行时**：
它直接 import `lib/core/embedding-local.js`、手工传 `cacheDir`，没有经过 `openMemoryLane` /
`openEmbeddingLane` / `vectorBackfill` / 共享空间门禁 / 检索引擎中的任何一环。

本票的唯一产出是**验收结论与证据**：不新增功能、不改产品代码、不发版。若真机暴露缺陷，
只记录并另开票，不在本票内顺手修。

## Requirements

1. **隔离与可恢复**
   **Given** 手机会员日常使用的 `web` profile，
   **When** 安装测试包，
   **Then** 安装在独立的 `dataDir` 与 `memories.db` 下，配置以 test-owned 块追加到
   `cordis.patch.yml` 并记录原字节哈希；结束后 `--restore` 必须回到原字节，
   且测试数据保留可查。

2. **使用已发布产物**
   **Given** npm 上的 `@elvisw/dsh-magic-context@0.18.0`，
   **When** 推送安装包，
   **Then** 记录 tarball 的 SHA-256 并在回执中写下，同时核对 registry 的
   `dist.integrity`（sha512/base64）本地重算值一致——`dist.shasum` 是 SHA-1，不是本票的核对字段；
   不使用本地未发布的构建。

3. **本地模型不走网络**
   **Given** 手机无法稳定访问 HuggingFace，
   **When** 回填触发首次加载，
   **Then** 三份资产（`model.onnx`、`tokenizer.json`、`tokenizer_config.json`）
   预置在 `<dataDir>/models/`，SHA-256 与 `EMBEDDING_ASSETS` 的钉住值一致；
   运行期日志中没有资产下载请求。

4. **维护 tick 完成回填**
   **Given** 三条记忆与 `memory.vectorBackfill: true`、`memory.embedBackfill: false`、
   `maintenance.intervalMs: 60000`，
   **When** 宿主运行一个 tick，
   **Then** `memory_embeddings` 出

现与记忆条数相符、`model_id` 为
   `embedding-provider:<md5>` 的行，每条 BLOB 长度为 384×4 = 1536 字节；
   journal 出现 `vector-lane` 的 `backfill` 行（`created` 等于记忆条数、`failed` 为 0）。
   共享空间门禁在**首个进程内为 `no-sample`**（此时库中还没有可比的样本，门禁按维度一致放行），
   其 `parity-pass` 由重启后的进程给出——见 Requirement 6：门禁结果按进程 memo，
   同一进程内不会因为回填新增了行而重新校验。
   `embedBackfill: false` 是必需的：默认开启时检索引擎会对没有存储向量的
   FTS 候选在内存里现算向量，那样 `hybrid` 无法区分"回填成功"与"只有内存填充"。

5. **检索走混合通道**
   **Given** 向量已回填且 `embedBackfill` 关闭，
   **When** 执行 `ctx_memory action=search`（`project: "git:t25-fixture"`），
   **Then** 返回结果至少一行 `match=hybrid` 或 `match=semantic`；
   不得只出现 `fts`。`semanticMatches` **不在**工具回执里
   （`tool-bridge.ts:1206` 只返回 `search` 文本与 `hits`），因此该计数由
   journal 的 `vector-lane` 行或只读 core 查询取证，不写成工具输出断言。

6. **重启后仍成立**
   **Given** 上述状态，
   **When** 重启本机引擎并重新检索，
   **Then** 向量行、混合检索结果保持，不出现重复回填；且新进程的 `vector-lane` 门禁给出
   `parity-pass`——门禁结论在进程内 memo，`no-sample` 只属于回填尚未产生样本的那个进程，
   重启后必须由新进程用真实样本重新验证（`memory-lane.ts:288-315,339-355`）。

## Non-goals

- 不验证远程 embedding 在手机上的密钥路径（被 dsh-go bridge 的 `credentialRef` 缺口阻断，
  issue #1493）。
- 不验证 iOS。
- 不验证长会话（数百条记忆）下的回填吞吐，也不做性能基准。
- 不改产品代码；发现的缺陷只记录。

## Verification

票据校验由独立子代理完成，范围限定为票面、计划与既有证据文件，不开全仓扫描。
真机 gate 的每一步都落 JSON 回执与只读 DB 查询结果，报告逐条对应本票 Requirements。
