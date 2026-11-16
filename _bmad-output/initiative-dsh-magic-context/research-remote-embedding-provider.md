# Remote embedding provider and vector-space migration

Status: research spike (T19), revision 3. Contract approved for T20
implementation.

## 1. Decision

Support an opt-in, provider-neutral **OpenAI-compatible embedding API** for
project-memory semantic search, with SiliconFlow as the first preset. Keep the
local MiniLM provider as the default. Do not implement reranking, session-history
chunk embedding, multiple simultaneous providers or the dsh-go native settings
UI in this scope.

The important constraint is not HTTP. It is the vector space:

- local MiniLM is 384-dimensional (a current fact, not a universal default);
- vendor models use different widths; bge-m3 is commonly 1024-dimensional and
  Qwen3-Embedding models expose different widths and optional Matryoshka
  dimensions;
- vectors from different providers are not comparable, and a wrong-space row is
  silently invisible or harmful, not an error.

The design therefore makes the target space explicit, discovers model data at
runtime, and keeps the old space available for rollback.

## 2. Current adapter facts

| Fact | Source | Consequence |
|---|---|---|
| Local model is `Xenova/all-MiniLM-L6-v2`, fp32, 384 dims | `src/core/embedding-local.ts:44-50` | Existing vectors must remain in the exact same identity. |
| Local identity folds provider/model/endpoint/key-presence/runtime fingerprint | `src/core/embedding-local.ts:88-96` | Do not change this hash for local users. |
| Local embedder is opened when the memory search lane opens | `src/dsh/memory-lane.ts:254-260` | A provider factory is needed. |
| Shared-space gate requires equal dims and, when a sample exists, cosine parity >= 0.99 | `src/dsh/memory-lane.ts:281-339` | A remote query vector can never pass against local MiniLM vectors. |
| No-sample and empty-store paths are exceptions | `src/dsh/memory-lane.ts:304-309`, `:317-322` | Describe the gate as parity-with-sample, not absolute parity. |
| Dominant space is chosen by row count | `src/core/memory-search.ts:478-490` | Remote switch cannot rely on a dominant flip. |
| Backfill targets `dominantModelId ?? bootstrapModelId`; only `status = 'active'` rows are selected | `src/core/vector-lane.ts:190-224` (bootstrap `:200-208`, active filter `:210`) | A remote target needs an explicit target-space parameter and a searchable-set planner. |
| `memory_embeddings` is keyed by `(memory_id, model_id)` | `src/core/corpus-store.ts:107-112` | Old and new spaces coexist; no destructive migration is required. |
| Search reads `e.model_id = ?` and `m.status IN ('active','permanent')` | `src/core/memory-search.ts:342-347` | Coverage must be measured over the searchable set, not only active rows. |
| Query-time in-memory fill is on by default | `src/dsh/memory-lane.ts:426-431`, `src/core/memory-search.ts:369-387`; `src/dsh/config.ts:169-188` | Without a remote guard, every search could call the remote API and fill missing candidates in memory. |
| `memory.vectorBackfill` defaults to true | `src/dsh/config.ts:177-188` | Saving a remote provider would start spending quota unless the target is gated by an explicit rebuild state. |
| `memory` is deliberately not declared in the host Config schema | `src/index.ts:1131-1150` | Do not add `embedding` under a materialised `memory` object. |
| Safe top-level blocks declare each field with `.volatile()` | `src/index.ts:1166-1189` | `embedding` fields must be volatile or `settings.describe` will not project them. |
| Automatic hint search is FTS-only | `src/dsh/memory-lane.ts:477-499` | Remote embeddings improve explicit `ctx_memory search`, not every-turn hints. |
| Settings fields are declared in `FIELDS` | `src/client/index.js:322-394` | A new section needs field paths, labels, hints and zh/en keys. |
| Current card is flat fields plus one Save mutation; no model/probe/rebuild RPC | `docs/dsh-plugin-settings-ui-contract.md:111-122`, `:173-177` | Dynamic actions need a contract extension, not an assumption that today's form can express them. |

The current store may contain vectors from earlier local Magic Context runs.
Those are still the same local space when the existing identity and runtime
fingerprint match; do not re-embed them merely because this feature ships.

## 3. Upstream reference (v0.49.56)

Upstream is the behavioral reference, not a code drop-in:

- `CONFIGURATION.md:689-731` documents the `embedding` block: provider
  `local` / `openai-compatible` / `off`, `model`, `endpoint`, `api_key`,
  `query_instruction`, `document_prefix`. Upstream marks only the prefix fields
  as user-level (`:700-701`); this fork deliberately makes the whole `embedding`
  block user-level because a project-supplied endpoint or env name would be a
  credential-redirection risk.
- `packages/plugin/src/features/magic-context/memory/embedding-openai.ts:57-69`
  has index-aware `responseSlots`; all indices missing fall back to array order,
  while partial/duplicate/out-of-range indices are rejected.
- `embedding-openai.ts:141` uses a 30-second fetch timeout; `:604-607` rejects a
  served model that does not match the requested model; `:645` maps responses;
  `:725` surfaces timeout.
- `embedding-openai.ts:676-683` validates the returned width **only when an
  explicit `dimensions` override is set**. This fork should validate width on
  every batch, because the probe result is the target-space contract.
- `embedding-identity.ts:26-104` builds provider/model/endpoint/key-presence
  identity, includes `documentPrefix`/`dimensions` on the remote path, and keeps
  a local runtime fingerprint (`:15`, `:104`).
- `embedding-model-match.ts:53` tolerates vendor prefixes and variant suffixes
  when matching a served model; `:84` defines the Qwen3 query instruction.
- `embedding-probe.ts:50` uses a 10-second probe timeout; `:67` probes an
  endpoint; `:172` extracts the width from a response.
- `embedding-query-deadline.ts:4-36` defines an interactive query deadline
  (upstream uses 5s) separate from the background fetch timeout; this design's
  2.5s is a deliberate DSH latency choice.
- `embedding-provider.ts:5-30` defines `modelId`, input limits, `embed`,
  `embedBatch` and optional `embedItems`.

Reusable ideas: identity fencing, key-presence instead of key value, model
echo/substitution guard, dimension validation, request timeout, 429 cooldown,
SSRF protection, query/document prefixes, separate query deadline, and a
dimension probe.

Not in this ticket: upstream session-history chunk embeddings, remote rerank,
local dtype selection, arbitrary local models and dashboard forms.

## 4. SiliconFlow API contract

### Models

```http
GET https://api.siliconflow.cn/v1/models?sub_type=embedding
Authorization: Bearer <token>
```

Response:

```json
{
  "object": "list",
  "data": [
    { "id": "BAAI/bge-m3", "object": "model", "created": 0, "owned_by": "" }
  ]
}
```

**No dimensions, context length or capability flags are returned.** The client
must not infer them from `id`.

The docs also list `type=text|image|audio|video` and `sub_type=embedding`;
SiliconFlow uses `sub_type=embedding` as the first preset's model-list filter.
The list requires a valid key and can return 400, 401, 403, 404, 429, 503 or
504.

### Embeddings

```http
POST https://api.siliconflow.cn/v1/embeddings
Authorization: Bearer <token>
Content-Type: application/json

{ "model": "<selected id>", "input": ["..."] }
```

Response:

```json
{
  "object": "list",
  "model": "the served model",
  "data": [
    { "object": "embedding", "embedding": [0.1, 0.2], "index": 0 }
  ],
  "usage": { "prompt_tokens": 0, "completion_tokens": 0, "total_tokens": 0 }
}
```

`dimensions` is optional and only supported by the Qwen3 series according to the
current docs. bge-m3 uses its native width. The docs publish input limits and
supported widths, but those are platform data that may change; the runtime
contract must not hardcode them.

Live status: **blocked** — `SILICONFLOW_API_KEY` is not present in this
environment. No real call was made. This document does not claim a live pass.

### 4.1 Provider landscape

The feature supports a **protocol**, not a list of vendors. A provider is usable
when it exposes the standard OpenAI embeddings request/response shape:
`model`, `input`, optional `dimensions`, `data[].embedding`, `data[].index`.
A vendor-specific preset is only UI metadata: endpoint, optional model-list
descriptor, API-key variable name and docs link. It must not contain model IDs or
dimensions.

| Provider | Standard OpenAI shape | Access notes | Chinese / multilingual | Decision |
|---|---|---|---|---|
| SiliconFlow | yes | `GET /models?sub_type=embedding`; Bearer key | strong Chinese | **first preset** |
| Alibaba DashScope / Bailian | yes, compatibility mode | base `https://dashscope.aliyuncs.com/compatible-mode/v1`; model-list capability is not assumed, manual entry is acceptable | strong Chinese, many languages | **second preset candidate** |
| DeepInfra | yes | base `https://api.deepinfra.com/v1/openai`; Bearer key | good | generic compatible; optional cheap preset |
| Together AI | yes | base `https://api.together.xyz/v1` | moderate | generic compatible |
| Jina AI | yes, compatibility endpoint | `https://api.jina.ai/v1`; task/prefix fields are optional extras, not required by the base contract | strong multilingual | generic compatible |
| Voyage AI | yes | `https://api.voyageai.com/v1` | strong retrieval quality | generic compatible |
| OpenAI | yes | `https://api.openai.com/v1` | moderate | generic compatible; baseline |
| Nebius / Mistral / Fireworks | mostly yes | vendor base URL | varies | generic compatible only; no preset |
| Ollama / LM Studio | yes | local or LAN base URL; no key | model-dependent | generic compatible; privacy option |
| Cloudflare Workers AI | yes, OpenAI-compatible base | `https://api.cloudflare.com/client/v4/accounts/{account_id}/ai/v1`; Bearer API token; account-scoped URL | bge-m3 / Qwen3 among others | generic compatible; no preset initially |
| Google Gemini | yes, OpenAI-compatible base | `https://generativelanguage.googleapis.com/v1beta/openai/`; Gemini key | strong multilingual | generic compatible; no preset initially |
| OpenRouter | yes | base `https://openrouter.ai/api/v1`; embeddings models at `/api/v1/embeddings/models` | model-dependent | generic compatible; no preset initially |
| Cohere | compatibility endpoint exists | `https://api.cohere.ai/compatibility/v1`; basic `model`/`input` works, but the compatibility layer lists `dimensions`, `user` and Cohere-specific `input_type` as unsupported | strong multilingual | **not selectable in MVP**: task hints/dimensions cannot be expressed through the base fields; not a protocol adapter |
| Azure OpenAI | yes, v1 API | `{endpoint}/openai/v1/embeddings`; API-key auth uses `api-key`, Entra/OAuth uses `Authorization` | moderate | generic compatible with either `authHeader`; no preset initially |
| AWS Bedrock | **no** — native InvokeModel API | AWS auth and native body | strong | **not supported**; native protocol, no adapter planned |

Costs and free tiers change frequently; this document deliberately does not
embed price constants. The implementation and docs must link to the vendor's
current pricing/model page. Public price pages are listed in section 14.

Two support tiers:

1. **Protocol support (one implementation).** `openai-compatible` with
   configurable endpoint, auth header, model, key env, optional
   dimensions/prefixes. This covers every standard-shape provider above,
   including SiliconFlow, DashScope, DeepInfra, Together, Jina, Voyage, OpenAI,
   Nebius, Mistral, Fireworks, Ollama/LM Studio, Cloudflare, Gemini, OpenRouter
   and Azure with the appropriate base/auth setting.
2. **UI presets (metadata only).** SiliconFlow first; DashScope second because
   of Chinese-language value; DeepInfra optional for cost. A preset supplies an
   endpoint, an optional models-query descriptor and a key-variable name. It
   never supplies model IDs or dimensions.

Decision: do not implement protocol adapters or vendor SDKs. AWS Bedrock's
native API is **not supported**. Cohere's compatibility endpoint is reachable
for basic `model`/`input`, but its unavailable `dimensions`/`user`/`input_type`
fields mean the MVP cannot express its task hints, so it is **not selectable**
in this scope. Do not implement a provider matrix with model IDs, a price
comparator, multi-provider simultaneous search or automatic provider switching.
Do add "Custom OpenAI-compatible" as the universal escape hatch.

## 5. Configuration and identity

### Placement

Use a **top-level `embedding` block**, not `memory.embedding`.

Reason: `memory` is not declared in the host Config because declaring it would
materialise the block and open the shared store (`src/index.ts:1131-1150`).
`embedding` can be declared without that side effect, provided each field is
`.volatile()` like `maintenance`/`historian` (`src/index.ts:1166-1189`). The
server should ignore it when memory is disabled and the UI should say so.

`embedding` is a **user-level** block. Project-tier configuration must not set
`endpoint`, `apiKeyEnv` or any other embedding field: allowing a project to point
an arbitrary environment variable at an arbitrary URL would turn the env var into
a credential exfiltration primitive. Upstream marks only the prefix fields as
user-level (`CONFIGURATION.md:700-701`); this fork deliberately extends that rule
to the whole `embedding` block and rejects project values with a sanitized
warning.

Proposed shape:

```yaml
embedding:
  provider: openai-compatible   # local | openai-compatible | off
  preset: siliconflow           # UI hint only; not a model list
  endpoint: https://api.siliconflow.cn/v1
  authHeader: authorization     # authorization | api-key
  model: ""                     # selected from /models or typed manually
  apiKeyEnv: SILICONFLOW_API_KEY
  dimensions: null              # optional override; probe when unset
  queryInstruction: ""          # optional; empty by default
  documentPrefix: ""            # optional; changes stored vectors
  timeoutMs: 8000               # background request timeout
  queryTimeoutMs: 2500          # interactive search deadline
  batchSize: 16
  maxInputTokens: null          # optional; platform data is not hardcoded
```

Defaults for existing users are `provider: local`; no config migration and no
re-embedding. `embedding` is user-level only. `authHeader: api-key` is a generic
header choice for Azure-style endpoints, not a vendor adapter.

### Provider interface

```ts
interface EmbeddingProvider {
  readonly identity: string
  readonly model: string
  readonly dims: number | null   // null until probe succeeds
  readonly maxInputTokens: number | null
  embed(
    texts: readonly string[],
    options?: { purpose?: 'query' | 'passage'; signal?: AbortSignal },
  ): Promise<readonly (Float32Array | null)[]>
  probe(): Promise<{ servedModel: string; dims: number; latencyMs: number }>
}
```

`local` wraps `openLocalEmbedder`; `off` returns no vectors;
`openai-compatible` implements the HTTP contract. `embed` must not be called
while `dims === null` or the identity is not ready.

### Identity

Remote identity input:

```text
provider=openai-compatible
model
endpoint (trimmed, trailing slash removed)
apiKeyPresent (boolean only)
dimensions (probed or explicit)
documentPrefix
maxInputTokens (only when it causes client-side truncation)
```

Do **not** include the API key value, `authHeader` (it selects a transport
header, not a vector space), query instruction (it affects only query vectors,
not stored vectors), or a mutable display name. Include
`documentPrefix` when non-empty because it changes stored vectors. Include
`maxInputTokens` when client-side truncation is enabled, because truncation
changes stored vectors. Local identity remains byte-identical to
`embeddingIdentityHash()`.

**Storage key:** `memory_embeddings.model_id` stores the provider **identity
hash**, never the raw API model name. The raw model name is for display, probe
and diagnostics only. This preserves the existing `(memory_id, model_id)` fence
and avoids writing `BAAI/bge-m3` as if it were a space identifier.

API key resolution:

- `apiKeyEnv` names an environment variable.
- The server reads the value at call time; it never returns it to the client or
  writes it to config/journal/telemetry.
- Missing variable = provider unavailable, never an empty Bearer header.
- The UI displays only `present` / `absent`, never the value.
- A plaintext `apiKey` field is not part of the UI contract; advanced users can
  use an external process environment.
- Because `embedding` is user-level, a project cannot redirect the variable or
  endpoint.

## 6. Dynamic model and dimension discovery

### Model list

- On Settings open or explicit "load models", call the preset's model-list
  descriptor, for example `GET {endpoint}/models?sub_type=embedding` for
  SiliconFlow, or `{endpoint}/models` for a generic endpoint.
- Show `data[].id`; do not show a built-in model table.
- Cache the list for 15 minutes keyed by normalized endpoint + preset + key
  presence + model-list path. Different keys may see different models; key
  rotation invalidates the cache. Do not hash or store the key.
- If the endpoint does not support the models API, allow manual model entry.
- If the list request fails, keep the previously selected model and show a
  sanitized error; do not clear the user's config.

### Dimension probe

Because the models API has no dimensions:

1. After a model is selected (or on "test connection"), send one short input to
   `POST {endpoint}/embeddings` with the selected model.
2. Require HTTP success, a `model` echo (when present), a non-empty
   `data[0].embedding`, and a finite positive length.
3. Match a served model with the upstream tolerant matcher
   (`embeddingModelsMatch`: vendor prefixes and variant suffixes are allowed);
   reject a genuinely different model.
4. Cache `{endpoint, model, dims, probedAt}` in
   `<dataDir>/embedding-cache.json` (atomic write). No SQLite schema change.
   Key the cache by endpoint + model + key presence.
5. If an explicit `dimensions` override exists, always send it. If the endpoint
   returns 400 for the parameter, or returns a different width, record
   `dimensions-unsupported`, clear the probe cache and leave the target
   unselected. Do not retry every batch.
6. Without an override, use the probed native width. On every batch, reject the
   whole batch if any vector has a different width. If the width changed after a
   successful probe, clear the cache, re-probe once, then fail with a stable
   error rather than storing mixed widths.
7. A probe failure leaves the target space unselected and semantic search on
   FTS; no remote rows are written.
8. Missing `index` on every item is accepted in array order, matching upstream
   `responseSlots` (`embedding-openai.ts:57-69`); partial, duplicate or
   out-of-range indices reject the whole batch.

No model IDs or dimensions are compiled into the source. Docs may show examples
such as bge-m3 or Qwen3; tests must use fixture IDs that clearly are fixtures
(for example `fixture-embed-a`, 16 dimensions).

`maxInputTokens`: when set, it is an explicit client-side truncation policy and
participates in identity. When unset, no truncation is applied; the endpoint's
own limit governs. A server `400 input too long` is recorded as
`input-too-long`; the row is skipped, not retried forever.

## 7. Space migration

The target space is the configured provider identity, not the current dominant
row count.

| State | Meaning | Search | Writes |
|---|---|---|---|
| `local` | Existing local space; no API quota | Local vector + FTS | Local backfill only |
| `remote-unprobed` | Remote selected but no model/probe/dims | FTS | None |
| `remote-configured-not-started` | Probe passed, user has not pressed start | FTS; no target rows yet | **None**; maintenance must skip the remote target |
| `remote-target-missing` | Rebuild started; target has no rows | FTS | Target backfill |
| `remote-migrating` | Some searchable rows have target vectors | Partial target semantic + FTS | Target backfill |
| `remote-paused` | User paused a started rebuild; some target rows may exist | Partial target semantic + FTS | None until resumed |
| `remote-ready` | All searchable rows have target vectors | Target semantic + FTS | Target maintenance |
| `remote-off` | Provider off | FTS | None |
| `remote-error` | Auth/network/429/dimension failure | FTS | No writes until recovered or reconfigured |
| `rollback-local` | User selects local again | Existing local space + FTS | Local backfill |

Rules:

- **Explicit rebuild.** Saving a remote provider does not start spending API
  quota. `remote-configured-not-started` is a real state; the existing
  `memory.vectorBackfill` default must not bypass it. The user presses "start
  rebuild"; the start is persisted per target identity (for example
  `<dataDir>/embedding-rebuild.json` with `{targetIdentity, startedAt, state}`).
  Maintenance sees the persisted start before writing remote vectors. A later
  opt-in auto-start can be added, default off.
- **Pause is distinct from not-started.** A paused rebuild keeps its target
  identity and any target rows already written, reports `remote-paused`, stops
  writes, and resumes from the same target. It must not be collapsed into
  `remote-configured-not-started`, because that state promises no target rows.
- **Query-time fill is disabled for remote.** The current
  `memory.embedBackfill` path (`src/dsh/memory-lane.ts:426-431`,
  `src/core/memory-search.ts:369-387`) embeds missing candidates in memory on
  every search. For remote providers the implementation must not pass
  `embedTexts`: otherwise each search can spend quota and missing rows are not
  FTS-only. Remote search embeds only the query; candidate rows without a target
  vector remain FTS-only until the rebuild writes them.
- **Coverage is the searchable set.** Search reads `status IN
  ('active','permanent')` (`src/core/memory-search.ts:342-347`), while the
  current backfill plan selects only `status = 'active'`
  (`src/core/vector-lane.ts:210`). The remote target planner must cover both
  active and permanent rows, or explicitly document permanent rows as permanent
  FTS-only. This document chooses **cover both**: `remote-ready` means every
  searchable row has a target vector. Tests must include a permanent row.
- Old spaces are never deleted automatically. Rollback is immediate when the
  old space is complete; otherwise it resumes local backfill. Remote vectors may
  be retained for a later switch; optional GC is a later ticket.
- Never mix a local query vector with remote stored vectors, or vice versa.
- Partial semantic search is allowed: rows with target vectors score
  semantically, missing rows remain reachable through FTS. This avoids a
  multi-hour semantic blackout while keeping the space pure.
- One bounded worker; respect `batchSize`; 429 waits and resumes; a failed row
  is skipped and retried next tick, never stored as a wrong-width vector.
- Keep `ctx_memory search` fail-open: remote failure returns no query vector and
  FTS-only results; it never fails the tool call or reads local vectors.
- Reuse the first-writer bootstrap idea (`planBackfill` `dominantModelId ??
  bootstrapModelId`, `src/core/vector-lane.ts:200-208`) for an empty store, but
  only after the user starts the remote rebuild and only for the target
  identity.

This requires changing the current `dominantEmbeddingModel`/`planBackfill`
contract to accept a target model id, and adding a provider-aware gate. The
local path keeps the existing empirical parity check; the remote path trusts the
identity plus probe/model-echo/dimension guards, because local parity is
meaningless across spaces.

## 8. Failure handling and security

| Failure | Behavior |
|---|---|
| Missing API key env | Provider unavailable; Settings says which variable is absent; FTS only. |
| 401 / 403 | Do not retry in a loop; status `auth-failed`; FTS only. |
| 404 model | Keep model id, show `model-not-found`; allow reload list/manual fix. |
| 429 | Read `Retry-After`; exponential backoff; query path does not wait; background resumes. |
| 5xx / 503 | Bounded retry; open a short cooldown; FTS meanwhile. |
| Background timeout | Abort request; backfill retries next tick. |
| Query deadline | Abort after `queryTimeoutMs` (2-3s); search returns FTS-only rather than blocking the tool call. |
| Empty/non-JSON body | Reject whole batch; no writes. |
| `data[].index` partial/duplicate/out of range | Reject whole batch; all missing is accepted in array order per upstream `responseSlots`. |
| Served model differs from requested | Reject whole batch; model-substitution guard with upstream tolerant matching. |
| Returned dims differ | Reject whole batch; never store mixed widths; clear probe cache and re-probe once. |
| `400 input too long` | Record `input-too-long`; skip the row; do not retry forever. |
| Redirect | Refuse redirects; do not forward Bearer/memory content. |
| SSRF target | Refuse cloud metadata/link-local; allow loopback/private LAN for LM Studio/Ollama. |
| Secret in error body | Redact; log status/model/error class only, never request text. |
| Remote remains in error | `remote-error` stays until the user fixes config or the probe succeeds again; a permanent dimension change requires re-probe/model change, not a blind retry. |

All remote failures are journaled with a stable outcome code and a sanitized
detail. The UI must show the class, not the raw provider body.

## 9. Settings and UI

The current settings card is a flat `FIELDS` set committed by one
revision-fenced Save mutation; the contract explicitly has no model-catalog RPC
(`docs/dsh-plugin-settings-ui-contract.md:111-122`, `:173-177`). The feature
therefore cannot be expressed by adding fields alone: the implementation ticket
must extend the contract with plugin-owned read/action routes and a control that
can show a dynamic model list, probe result, rebuild progress and status.

Proposed `设置 → Magic Context → 向量检索` section:

```text
Provider: 本地 / OpenAI-compatible / 关闭
Preset: SiliconFlow / 阿里云百炼 / DeepInfra / 自定义
Endpoint: https://api.siliconflow.cn/v1
Auth header: Bearer / api-key
API key environment variable: SILICONFLOW_API_KEY   [present|absent]
[加载模型]  Model: [dynamic select or manual input]
[测试连接]  -> served model, dimensions, latency
Dimensions: [auto-detected] [optional override]
Query instruction: [optional]  Document prefix: [optional]
Status: current space / target space / coverage / last error
[开始重建向量] [回滚到本地]
```

Contract extension (provisional; implementation ticket must update
`docs/dsh-plugin-settings-ui-contract.md`):

- read route for model list and current status;
- action route for probe, start rebuild, pause/rollback; revision-fenced like
  Save;
- a status/progress payload with processed/total, target space and failures;
- no secret value in any response; only env-var name and presence.

Copy requirements:

- zh/en labels and hints for every field.
- A visible warning: enabling a remote provider sends memory text to that
  endpoint; use a trusted or local endpoint.
- Do not display the key; show only the env-var name and presence.
- Disable or explain the section when `memory` is disabled.
- Empty states: `未探测`, `未开始`, `无模型`, `认证失败`, `限流`, `维度不符`.
- Rebuild progress: processed / total, target space, failures; no invented
  percentage without a source.
- Accessibility: native labels, status text not color-only, keyboard operable.

A status line should also be available in `/ctx-status` (space, model, dims,
coverage); the telemetry panel is not required for this feature.

## 10. dsh-go boundary

The server-side provider, identity, probe, cache and migration are host-neutral
Node code. On dsh-go they can reduce mobile CPU/RAM by avoiding local ONNX, but
the mobile runtime still needs:

- network permission and a key supplied through environment/config;
- the same models/probe flow or a cached model+dims;
- FTS fallback when offline;
- a native `dshGo` settings surface later. The plugin-owned model/probe/rebuild
  routes are new server contract; the native UI consumes them, so "no server
  contract change" would be inaccurate.

The Web/Desktop settings UI is implemented first. The dsh-go native UI is a
separate port, not part of this ticket; see
`_bmad-output/initiative-dsh-magic-context/research-dsh-go-port-2026-11-16.md`.

## 11. Acceptance plan for the implementation ticket

### Unit and fake-server

- Models list: success, 401, 403, 429, 503, empty, malformed, manual fallback;
  cache key includes endpoint/preset/key presence/path.
- Probe: dimensions from response, explicit dimensions, mismatch, empty,
  non-JSON, timeout, model echo mismatch; `dimensions-unsupported` on 400.
- Identity: local identity unchanged; remote includes endpoint/model/dims/
  key presence/document prefix/maxInputTokens; API key rotation does
  not change identity; `model_id` stores the identity hash, not the raw name.
- Space: no target rows -> FTS; partial target -> target semantic + FTS; no
  local vectors read when remote is selected; rollback keeps local rows.
- Rebuild gate: remote configured but not started -> no writes on a maintenance
  tick; after start -> writes; pause stops; restart resumes.
- Query-time fill: remote search does not call `embedTexts`; missing rows are
  FTS-only; query deadline aborts at the configured value.
- Backfill: target model parameter, active + permanent rows, bounded batch, 429
  resume, one bad row skipped, no wrong-width store, input-too-long skip.
- Security: SSRF block/allow, redirect refusal, redacted errors, no key in
  logs/config/DB, project-tier embedding values rejected.
- Response mapping: all-missing `index` accepted in order; partial/duplicate/
  out-of-range rejected; served-model tolerance.

### Isolated DSH host

- Fresh isolated DSH Web profile with a fake OpenAI-compatible endpoint.
- Load models, select a fixture model (`fixture-embed-a`, fixture 16 dims), run
  a search, see target-space hits and FTS fallback before migration.
- Save the provider and confirm a maintenance tick writes nothing before the
  explicit start.
- Start rebuild; verify progress; verify old local rows remain; rollback to
  local; verify local search resumes.
- Confirm no request body containing memory text leaks into logs and no key is
  persisted.

A real SiliconFlow probe is a separate blocked check until
`SILICONFLOW_API_KEY` is available; it must not be reported as passed.

## 12. Non-goals

- Reranking.
- Session-history chunk embedding.
- Multiple simultaneous embedding spaces for one project.
- Automatic quality comparison between models.
- Arbitrary local Hugging Face model download or dtype switching.
- Auto-starting a paid rebuild without explicit user action.
- Vendor protocol adapters (including AWS Bedrock native API), vendor SDKs or a
  model-ID/price matrix.
- dsh-go native settings implementation.

## 13. Resolved decisions and open questions

Resolved:

- Support the OpenAI-compatible protocol, not per-vendor SDKs.
- SiliconFlow is the first preset; DashScope is the second candidate; other
  compatible vendors use the custom endpoint.
- No protocol adapters will be built. Standard-shape providers use the generic
  endpoint; AWS Bedrock is unsupported; Cohere is not selectable in the MVP
  because its compatibility layer lacks `dimensions`/`user`/`input_type`, so
  task hints cannot be expressed. Cloudflare/Gemini/OpenRouter work through
  their OpenAI-compatible base URLs; Azure accepts either `api-key` or
  `Authorization` via `authHeader`.
- Presets carry endpoint/model-list/key metadata only, never model IDs/dims.
- Top-level, user-level `embedding` block with `.volatile()` fields.
- Local default and byte-identical local identity.
- Dynamic model list, no hardcoded model IDs or dimensions.
- Dimension probe plus cache/validation; all-missing index follows upstream
  array order.
- Target-space migration, explicit rebuild gate, old-space retention, partial
  semantic + FTS.
- Query-time in-memory fill disabled when remote is selected.
- Remote failure never reads local vectors.
- API key by environment variable only.
- Explicit rebuild action.

Open for the implementation ticket:

- Model-list cache TTL (proposed 15 minutes).
- Whether the settings card exposes `maxInputTokens` at all (proposed optional,
  hidden under advanced).
- Whether `queryInstruction`/`documentPrefix` are plain text or a small
  template picker (proposed plain text first; no model-name inference).
- Whether a rollback also removes remote vectors (proposed keep by default,
  optional maintenance GC later).
- The exact isolated-host fixture model IDs and dimensions (fixtures only, not
  production defaults).
- Exact names of the plugin-owned model/probe/rebuild routes.

## 14. Source map

Current:

- `src/core/embedding-local.ts:44-50`, `:88-96`, `:145-151`, `:230-302`
- `src/dsh/memory-lane.ts:254-260`, `:281-339` (bootstrap `:304-309`,
  no-sample `:317-322`), `:356-388`, `:426-431`, `:477-499`
- `src/core/memory-search.ts:342-347`, `:369-387`, `:478-490`
- `src/core/vector-lane.ts:190-224` (bootstrap `:200-208`, active filter `:210`)
- `src/core/corpus-store.ts:107-112`
- `src/dsh/config.ts:169-188`
- `src/index.ts:1131-1150`, `:1166-1189`
- `src/client/index.js:322-394`
- `docs/dsh-plugin-settings-ui-contract.md:111-122`, `:173-177`

Upstream v0.49.56:

- `CONFIGURATION.md:689-731`
- `packages/plugin/src/features/magic-context/memory/embedding-openai.ts:57-69`,
  `:141`, `:252`, `:604-607`, `:645`, `:676-683`, `:725`
- `.../embedding-identity.ts:15`, `:26-104` (dimensions `:50`, prefix `:95`,
  runtime fingerprint `:104`)
- `.../embedding-model-match.ts:53`, `:84`
- `.../embedding-probe.ts:50`, `:67`, `:172`
- `.../embedding-query-deadline.ts:4-36`
- `.../embedding-provider.ts:5-30`

SiliconFlow:

- https://api-docs.siliconflow.cn/docs/api/models-get
- https://api-docs.siliconflow.cn/docs/api/embeddings-post

Provider documentation and pricing (verify at implementation time; no prices are
contract constants):

- https://help.aliyun.com/zh/model-studio/
- https://openrouter.ai/docs/api-reference/embeddings
- https://developers.cloudflare.com/workers-ai/configuration/open-ai-compatibility/
- https://ai.google.dev/gemini-api/docs/openai
- https://docs.cohere.com/docs/compatibility-api
- https://learn.microsoft.com/azure/ai-foundry/openai/how-to/embeddings
