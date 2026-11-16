---
id: 19
type: spike
title: "Remote embedding provider and vector-space migration"
parent: initiative-dsh-magic-context
covers: [src/core/embedding-local.ts, src/dsh/memory-lane.ts, src/core/memory-search.ts, src/core/vector-lane.ts, src/dsh/config.ts, src/index.ts, src/client/index.js, docs/dsh-plugin-settings-ui-contract.md]
after: [18]
refined: false
hitl: false
risk: high
---

# Remote embedding provider and vector-space migration

Status: revision 2 — research spike. No implementation authorization.

## Goal

Decide whether and how the DSH adapter should support a remote
OpenAI-compatible embedding provider for project-memory semantic search, and
record the contract before implementation. The immediate user need is a
SiliconFlow endpoint with dynamically discovered embedding models (for example
bge-m3 or Qwen3-Embedding), but the design must remain provider-neutral and work
on DSH Web, DSH Desktop, and later the dsh-go runtime.

This is not an "add an API-key field" ticket. The existing vector space is local
MiniLM (384 dimensions); every remote model is a different vector space, and
mixing spaces corrupts recall silently. The deliverable therefore has to settle
model discovery, dimension discovery, provider identity, migration, rollback,
failure behavior and UI semantics.

## Context

### Current adapter

- Local provider and identity: `src/core/embedding-local.ts:44` (model),
  `:88` (`embeddingIdentityHash`), `:145` (`LocalEmbedder`), `:230`
  (`openLocalEmbedder`). The identity is pinned to the local runtime
  fingerprint and is part of the current vector-space contract.
- Memory search opens the local embedder when the search lane opens:
  `src/dsh/memory-lane.ts:254-260`.
- The shared-space gate compares a freshly embedded sample against a stored
  vector and requires cosine parity at `src/dsh/memory-lane.ts:281-339`
  (empty-store bootstrap at `:304-309`, no-sample path at `:317-322`,
  dimension check at `:310`, parity threshold at `:331`).
- Backfill targets `dominantModelId ?? bootstrapModelId` and selects only
  `status = 'active'` rows: `src/dsh/memory-lane.ts:356-388` and
  `src/core/vector-lane.ts:190-224` (`:210` for the active filter).
- Search reads only rows in the requested model id and includes
  `active`/`permanent`: `src/core/memory-search.ts:342-347`.
  Dominant-space discovery is at `:478-490`.
- Query-time in-memory fill is on by default: `src/dsh/memory-lane.ts:426-431`,
  `src/core/memory-search.ts:369-387`, `src/dsh/config.ts:169-188`. Without a
  remote guard, each search can call the remote API and fill missing candidates.
- `memory.vectorBackfill` defaults to true (`src/dsh/config.ts:177-188`), so an
  explicit rebuild gate is required before a remote target may be written.
- `memory_embeddings` is keyed by `(memory_id, model_id)`
  (`src/core/corpus-store.ts:107`), so old and new spaces can coexist.
- `memory` is deliberately not declared in the host `Config` schema because
  declaring it would materialise the block and open the shared store
  (`src/index.ts:1131-1150`). A new embedding config must not repeat that
  side effect.
- The automatic search hint is FTS-only (`src/dsh/memory-lane.ts:477-499`);
  semantic search today is the explicit `ctx_memory search` path. Remote
  embedding does not automatically make every-turn hints semantic.

### Upstream reference

Upstream `cortexkit/magic-context` v0.49.56:

- `CONFIGURATION.md:689-731` documents the `embedding` block: `provider` =
  `local` / `openai-compatible` / `off`, plus `model`, `endpoint`, `api_key`,
  `query_instruction`, `document_prefix`. Upstream marks only the prefix fields
  user-level (`:700-701`); this fork makes the whole block user-level because a
  project-supplied endpoint/env name would be a credential-redirection risk.
- `packages/plugin/src/features/magic-context/memory/embedding-openai.ts:57-69,
  141, 645, 725`: index-aware response mapping (all-missing index uses array
  order), 30s timeout, response mapping and timeout handling. `:604-607`
  rejects a substituted served model; `:676-683` validates width only when an
  explicit `dimensions` override is set.
- `embedding-identity.ts:15, 26-104`: provider/model/endpoint/key-presence
  identity, including remote `dimensions`/`documentPrefix` and the local runtime
  fingerprint.
- `embedding-model-match.ts:53, 84`: tolerant model-name matching and the Qwen3
  query instruction.
- `embedding-probe.ts:50, 67, 172`: 10s probe timeout, probe entry point and
  dimension extraction.
- `embedding-query-deadline.ts:4-36`: interactive query deadline separate from
  the background fetch timeout.
- Upstream also embeds session-history chunks, supports reranking and local
  dtype selection. Those are separate features and are out of scope here.

Upstream does not use a models endpoint to populate its UI; this fork can do
better by discovering models dynamically instead of copying a static list.

### SiliconFlow API contract

Verified against the public docs on 2026-11-16:

- `GET https://api.siliconflow.cn/v1/models?sub_type=embedding`
  - `Authorization: Bearer <token>`
  - response `{ "object": "list", "data": [{ "id", "object", "created",
    "owned_by" }] }`
  - **No dimensions, context length, or capability flags.** The client must not
    infer them from the model name.
- `POST https://api.siliconflow.cn/v1/embeddings`
  - body `{ model, input, dimensions? }`
  - response `{ object, model, data: [{ object, embedding, index }], usage }`
  - `dimensions` is only supported by the Qwen3 series; bge-m3 uses its native
    width.
  - model lists, input limits and pricing are platform data and may change.

The live probe is blocked in this environment because `SILICONFLOW_API_KEY` is
absent. That is a recorded limitation, not a pass. The contract must be
validated with a fake OpenAI-compatible server and later with a real key in an
isolated host.

## Required decisions

1. Config shape: top-level `embedding` versus `memory.embedding`.
2. Provider abstraction and local/remote/off selection.
3. Dynamic model discovery, manual fallback, cache and refresh.
4. Dimension discovery, cache, validation and optional override.
5. Provider identity fields and local-identity preservation.
6. Target-space selection and migration state machine.
7. Partial semantic search versus FTS-only during rebuild.
8. Remote failure behavior and the "never read local vectors" rule.
9. API-key environment handling and secret-safe diagnostics.
10. Settings UX, status, rebuild/rollback and zh/en copy.
11. dsh-go server/UI boundary.
12. Acceptance tests and the smallest useful host gate.
13. Explicit rebuild gate versus the default-on `memory.vectorBackfill`.
14. Query-time in-memory fill behavior for remote providers.
15. `memory_embeddings.model_id` as identity hash versus raw model name.
16. User-level-only embedding config and the settings-contract extension for
    dynamic model/probe/rebuild actions.

## Deliverable

`_bmad-output/initiative-dsh-magic-context/research-remote-embedding-provider.md`

It must contain source-level evidence, the configuration/UI contract, the
migration state matrix, the failure table, the acceptance plan and explicit
non-goals.

## In scope

- Research, source reading and requirements only.
- A provider-neutral OpenAI-compatible contract with SiliconFlow as the first
  preset, plus a provider landscape that separates standard-shape protocol
  support from metadata presets. No protocol adapters are planned.
- Dynamic model discovery and dimension probing.
- Vector-space migration and rollback semantics.
- Settings information architecture and failure copy.
- A future dsh-go boundary, without implementing the port.

## Out of scope

- Editing `src/`, `tests/`, `scripts/`, `docs/`, README, CHANGELOG, package
  metadata, release files or the daily profile.
- Implementing the provider, changing schema, running a host gate or publishing.
- Reranking, session-history chunk embedding, multi-provider fusion, arbitrary
  local Hugging Face models, `local_dtype` switching or automatic model-quality
  comparison.
- Claiming a successful real SiliconFlow call without a key.

## Acceptance

- Independent ticket validation passes.
- The document cites current adapter and upstream v0.49.56 source with
  file:line evidence.
- It records the models API response and explicitly says dimensions are absent.
- It surveys alternative OpenAI-compatible providers and states that one
  protocol implementation covers standard-shape endpoints. Cloudflare, Gemini
  and OpenRouter work through their OpenAI-compatible base URLs; Azure supports
  either the `api-key` or `Authorization` header; Cohere's compatibility layer
  supports basic `model`/`input` but lacks `dimensions`/`user`/`input_type`, so
  it is not selectable in the MVP; AWS Bedrock is the only native-protocol
  exclusion. No vendor-specific protocol adapters or SDKs are planned.
- It specifies dynamic model discovery with manual fallback and no hardcoded
  model IDs or dimensions. Test fixtures use fixture dimensions, never a
  production model's width.
- It defines dimension probing, cache, validation, optional override and the
  `dimensions-unsupported` outcome.
- It defines the provider identity, `memory_embeddings.model_id` as the identity
  hash, target-space migration state machine including
  `remote-configured-not-started` and `remote-paused`, explicit rebuild gating,
  query-time fill
  disabled for remote, coverage over active + permanent rows, partial
  semantic/FTS behavior, old-space retention and rollback, and the rule that
  remote failure never reads local vectors.
- It covers user-level-only embedding config (no project endpoint/env
  redirection), API-key env handling, query/document prefixes, model
  substitution, dimensions, timeout, query deadline, 429, SSRF and secret-safe
  diagnostics.
- It defines the Settings flow, acknowledges the current flat-field/no-RPC
  contract gap, specifies the required plugin-owned model/probe/rebuild routes,
  and defines zh/en copy expectations.
- It defines the dsh-go boundary and an acceptance plan using a fake
  OpenAI-compatible server.
- `git diff` shows no runtime, test, package, release or profile changes.
