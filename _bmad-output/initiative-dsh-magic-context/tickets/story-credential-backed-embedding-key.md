---
id: 24
type: story
title: Credential-backed embedding key entry for desktop and Android
parent: initiative-dsh-magic-context
covers:
  - src/index.ts
  - src/dsh/config.ts
  - src/core/embedding-remote.ts
  - src/dsh/embedding-lane.ts
  - src/client/index.js
  - tests/embedding-remote.spec.ts
  - tests/embedding-lane.spec.ts
  - tests/client-pure.spec.ts
  - tests/config-schema.spec.ts
  - docs/dsh-plugin-settings-ui-contract.md
  - README.md
  - README.zh-CN.md
  - CHANGELOG.md
sources:
  - _bmad-output/initiative-dsh-magic-context/research-credential-backed-embedding-key-2026-11-18.md
  - _bmad-output/initiative-dsh-magic-context/acceptance-android-dsh-go-2026-11-17-t23/acceptance-report.md
companions:
  - _bmad-output/initiative-dsh-magic-context/tickets/story-credential-backed-embedding-key-plan.md
after: [23]
refined: true
hitl: true
risk: high
---

# Credential-backed embedding key entry for desktop and Android

## Description

让远程嵌入模型的 API Key 通过配置界面录入，由宿主凭据库保存，桌面 Web 与
Android dsh-go 1.1.0 共用同一份引用；配置、日志、遥测与证据都不含密钥值。
这不是再加一个 `.env` 说明，而是把 T20 的密钥入口从“用户自己写文件并重启”改为
宿主支持的凭据引用。

## Requirements

1. **配置与解析**
   **Given** 远程嵌入已配置，
   **When** 加载插件，
   **Then** 配置只携带引用名 `embedding.apiKeyEnv`（`role('credential-ref')`）与可选的
   `embedding.apiKey`（`role('secret')`，供宿主桥接使用）；运行时按
   `apiKey` → `credentials.resolve(apiKeyEnv)` → `process.env[apiKeyEnv]` 解析
   （`apiKeyEnv` 为空按未设置处理，沿用预设默认环境名，不是关闭认证的开关），
   缺失时不发请求，状态只报告“已配置/未配置”，绝不返回密钥值。

2. **桌面端录入**
   **Given** DSH Web 的设置页，
   **When** 用户在「向量检索」里保存、替换或清除 API Key，
   **Then** 页面通过 `ctx.remote.credentials.set/unset` 写入/删除引用的凭据，
   不使用 `scope.mutate` 把密钥写进 profile patch；保存后输入框清空，仅显示
   “已配置”与来源，清除后回到“未配置”；引用名在高级区可编辑，改名前要求先保存普通字段。

3. **Android 端录入**
   **Given** dsh-go 1.1.0 的插件配置页，
   **When** 用户打开「向量检索」的 API Key 字段，
   **Then** 宿主按 `role('secret')` 渲染只写掩码字段，并按同对象的
   `role('credential-ref')` 字段绑定到 `apiKeyEnv`；保存/清除走宿主凭据库，
   重进页面显示“已配置/未配置”，无需 `.env`、终端或重启。

4. **兼容与边界**
   **Given** 已有 `$DSH_HOME/.env` 或进程环境变量的用户，
   **When** 升级到本版本，
   **Then** 环境变量仍作为回退生效，不自动导入、不打印、不覆盖凭据库；
   没有凭据服务或没有 `remote.credentials` 时，桌面密钥输入显示不可用并保留环境回退，
   不得退化为把密钥写进配置。

5. **安全与测试**
   **Given** 一次保存与一次测试连接，
   **When** 检查 profile patch、插件配置、status/SSE、journal、错误消息、截图与证据，
   **Then** 都找不到哨兵密钥；单元测试覆盖解析优先级、凭据缺失、清除、
   `role` 元数据与前端只写状态；桌面与 Android 各做一次最小真实宿主验收，
   使用本地 fake provider 校验认证头，不调用真实供应商。

## Verify

Independent ticket validation passes. `npm test`, typecheck, `check:i18n` and build pass.
Source inspection: `embedding.apiKey` is `role('secret')`, `embedding.apiKeyEnv` is
`role('credential-ref')`; runtime resolves literal/credential/env in that order; status
returns only presence. Desktop card calls `remote.credentials.set/unset` and never sends
the secret through `configForms.mutate`; the input is write-only and clears after save.
Unit tests cover literal > credential > env, empty/missing credential, clear, malformed
ref, status redaction, and config schema roles. A fresh isolated DSH Web gate with a
fake OpenAI-compatible endpoint verifies: save key through the card without a config
mutation or provider request, test connection sends `Authorization: Bearer <sentinel>`
and probes 16 dimensions, clear stops auth and shows unconfigured, and the profile
patch/database/log contain no sentinel. Android uses the same `role('secret')` +
`credential-ref` schema and passes schema/unit checks, but no real-device gate was run
because no device was connected; Android is not claimed as verified. No real vendor
call, no `.env` edit by the agent, no host/Flutter change, no new provider, no database
schema, no release/publish.
Docs replace the `.env`-first instruction with the UI path and keep env fallback as an
advanced note.
