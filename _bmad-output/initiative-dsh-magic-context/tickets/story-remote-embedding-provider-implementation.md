---
id: 20
type: story
title: "Remote embedding provider: OpenAI-compatible API and target-space migration"
parent: initiative-dsh-magic-context
covers: [src/core/embedding-local.ts, src/core/embedding-remote.ts, src/dsh/embedding-lane.ts, src/dsh/memory-lane.ts, src/dsh/status-command.ts, src/core/memory-search.ts, src/core/vector-lane.ts, src/core/vector-backfill.ts, src/core/memory-write.ts, src/dsh/config.ts, src/index.ts, src/client/index.js, docs/dsh-plugin-settings-ui-contract.md, README.md, README.zh-CN.md, CHANGELOG.md, tests/embedding-remote.spec.ts, tests/embedding-lane.spec.ts, tests/client-pure.spec.ts, tests/config-schema.spec.ts, tests/vector-lane.spec.ts, tests/vector-backfill.spec.ts, tests/memory-search.spec.ts, tests/embedding-wasm.spec.ts, tests/command-surface.spec.ts, tests/phase-map.spec.ts, scripts/phase-map.mjs, scripts/mc-i18n-check.mjs]
after: [19]
hitl: false
risk: high
refine: true
---

# Remote embedding provider: OpenAI-compatible API and target-space migration

Status: revision 1 — implementation story, derived from the T19 research spike.

## Goal

Implement the T19 contract for an opt-in remote embedding provider, with the
local MiniLM space remaining the default. A user can configure an
OpenAI-compatible endpoint, discover models dynamically, probe dimensions,
explicitly start a target-space rebuild, pause/rollback, and see status in
Magic Context Settings. Existing local vectors and settings must survive the
upgrade unchanged.

## Context

- T19 deliverable: `_bmad-output/initiative-dsh-magic-context/research-remote-embedding-provider.md`.
- Current vector lane is local-only: `src/core/embedding-local.ts`,
  `src/dsh/memory-lane.ts`, `src/core/memory-search.ts`,
  `src/core/vector-lane.ts`.
- `memory.embedBackfill` and `memory.vectorBackfill` default true; remote
  writes must be gated by an explicit persisted rebuild start.
- Settings fields are flat `FIELDS` and one revision-fenced Save; dynamic
  actions require plugin-owned routes and a card extension.
- Tests use a fake OpenAI-compatible server. A provider-level real SiliconFlow
  probe is allowed only when the user has set `SILICONFLOW_API_KEY`; a full UI
  rebuild against the real vendor remains follow-up.

## Required behavior

### 1. Configuration and identity

Add a top-level `embedding` block to `MagicContextDshConfig` and the exported
`Config` schema. All fields are volatile so Settings projects them.

```yaml
embedding:
  provider: local | openai-compatible | off   # default local
  preset: siliconflow | custom                # metadata only; no model IDs
  endpoint: string
  authHeader: authorization | api-key         # default authorization
  model: string
  apiKeyEnv: string
  dimensions: number | null                   # 0/null = probe
  queryInstruction: string
  documentPrefix: string
  timeoutMs: number                            # background, default 8000
  queryTimeoutMs: number                       # default 2500
  batchSize: number                            # default 16
```

Numbers are resolved through `liveNumber` with clamps: `timeoutMs` 1000–120000,
`queryTimeoutMs` 500–10000, `batchSize` 1–64. Malformed values fall back to the
defaults with a warning; they never throw at boot. Do not add `maxInputTokens`
without a remote tokenizer; character truncation belongs to a later ticket.

- `embedding` is user-level by contract; the profile is the only writer. Do not
  read endpoint/key values from any project-scoped source. The settings hint
  says so.
- Local identity stays byte-identical (`embedding-provider:…`). Remote identity
  uses the explicit namespace `embedding-remote:<hash>` over provider, model,
  normalized endpoint, API-key presence, dimensions and `documentPrefix`;
  `authHeader`, `queryInstruction` and model-list cache keys do not enter
  identity.
- `memory_embeddings.model_id` stores the namespaced identity, never the raw
  model name. A remote row can never be selected by a local query and vice
  versa.
- Local target selection is explicit: prefer `embeddingIdentityHash()`; when
  that space has no rows, fall back to the dominant **local** space only
  (never an `embedding-remote:` id). Remote row growth therefore cannot hijack
  a local query after rollback.
- API keys are read from `process.env[apiKeyEnv]` at call time; never store,
  return, journal, log or display the value. A configured variable name whose
  value is absent means provider unavailable: no request is sent and no empty
  `Authorization`/`api-key` header is ever produced. An empty `apiKeyEnv`
  intentionally means “no auth” for local Ollama/LM Studio.
- Project-scoped values must not set `embedding.endpoint`/`apiKeyEnv`; if a
  non-profile source is detected, ignore it with a sanitized warning and do not
  send a request.
- Unknown modes fall back to local with a warning; malformed numbers use
  documented defaults. `off` disables embeddings; search is FTS-only.

### 2. OpenAI-compatible provider

Implement `src/core/embedding-remote.ts` with:

- `listModels(config)` using the preset model-list descriptor (SiliconFlow:
  `GET {endpoint}/models?sub_type=embedding`; custom: `GET {endpoint}/models`;
  manual fallback). Parse `data[].id`; cache in memory 15 minutes keyed by
  endpoint + preset + authHeader + path + an in-memory API-key fingerprint
  (sha256 prefix, never persisted/logged), so one key rotation invalidates the
  list without writing the key anywhere.
- `probeEmbeddingEndpoint(config)` using `POST {endpoint}/embeddings` with one
  short input; require success, non-empty `data[0].embedding`, model echo when
  present, finite positive width. Cache
  `{endpoint, preset, authHeader, model, dimensionsOverride, keyPresent, dims,
  probedAt}` in `<dataDir>/embedding-cache.json` with atomic write. The key
  includes the dimensions override and key presence, so changing either forces
  a new probe and cannot be accepted by `start` with a stale width.
  - An explicit `dimensions` override is always sent. A 400, or a response
    whose width differs, records `dimensions-unsupported`, clears the cache
    entry and leaves the target unselected (do not retry every batch).
  - If a normal batch returns a different width than the cached probe, clear
    the cache, re-probe once, and retry that batch once; a second mismatch is
    `dimensions-changed` and leaves the target unselected.
- `embedBatch(config, texts, purpose, signal)` with:
  - `Authorization: Bearer` or `api-key` header according to `authHeader`;
  - optional `dimensions` override always sent when configured;
  - query instruction for `purpose: 'query'`, document prefix for `'passage'`;
  - index-aware mapping (all missing → array order; partial/duplicate/out of
    range → reject whole batch);
  - served-model tolerance (vendor prefix/variant suffix allowed, different
    model rejected);
  - always-on width guard, even without a dimensions override;
  - separate query deadline and background timeout; 429 `Retry-After` with
    bounded cooldown (query returns immediately); redirects refused for list,
    probe and embed; endpoint must be http(s), without userinfo or query
    string; SSRF block for metadata/link-local/unspecified and IPv4-mapped
    forms, loopback/private LAN allowed; resolved DNS addresses are checked
    against the same rules; HTTP (not HTTPS) on a non-local endpoint produces
    a UI warning;
  - sanitized errors with stable codes; never request text or key in errors;
  - 5xx bounded retry with a short cooldown; empty or non-JSON bodies reject
    the whole batch; query path does not wait through a cooldown;
  - input-too-long isolation: when a 400 is classifiable as an over-length
    input, retry rows individually and return an empty vector for the bad row
    so the rest of the batch lands; never retry the same failing batch forever.
- No vendor SDK, no provider-specific adapter, no hardcoded model IDs or
  dimensions.

### 3. Search and backfill integration

In `memory-lane.ts`:

- Choose the provider from live config: local wrapper, remote provider, or off.
- Local path preserves the current shared-space parity gate and backfill, but
  its query/target model id is the explicit local identity (legacy dominant
  only when the local identity has no rows and the dominant id is not remote).
- Remote path uses the namespaced remote identity as the query/target model id;
  it never compares a remote query vector with local stored vectors.
- Remote query embedding is enabled only when a persisted, armed rebuild state
  exists for the current target and coverage has at least one target row. In
  `remote-configured-not-started`, `remote-target-missing`, `remote-error` and
  `remote-off`, query is FTS-only and makes **no automatic embeddings request**
  (an explicit user probe is the only allowed request). On failure return null
  and run FTS-only without failing the tool.
- Remote search must **not** pass `embedTexts` to `memory-search`; missing
  target rows remain FTS-only during rebuild.
- Remote backfill writes while the persisted state is `running` **or**
  `complete` (target maintenance). Saving config alone, or `paused`, must not
  write. After a `complete` pass, a newly missing row is still maintained; if
  coverage falls below the searchable total, status returns to
  `remote-migrating`.
- Coverage and `remote-ready` use the searchable set `active` + `permanent`
  (not expired); `planBackfill` gains target and permanent-row options while
  the local `measureVectorLane` default remains active-only.
- Persist rebuild state in `<dataDir>/embedding-rebuild.json` with
  `{version, targetIdentity, state: 'running'|'paused'|'complete', armedAt,
  startedAt, updatedAt, processed, total, failures}`. Writes are atomic;
  malformed state reads as absent with a warning; a target change invalidates
  it. Pause is distinct from not-started; resume continues the same target.
  State transitions are serialized in the lane so a route and a maintenance
  tick cannot interleave.
- **Rollback and disarm.** The client's rollback flow calls
  `POST /mc-embedding/rebuild?action=disarm` (clears rebuild state only; it
  never writes config), then stages `embedding.provider = local` and uses Save.
  The generic Save path also calls `disarm` before committing any plan that
  sets `embedding.provider = local`, so a manual field edit cannot leave an
  armed state behind.
  The lane also auto-disarms whenever it observes the provider as `local`, and
  `GET /status` reports the discarded state. Therefore saving the same remote
  target again after rollback is `remote-configured-not-started`: no query and
  no writes until a new `start`. Add the regression test
  `remote start → disarm/rollback local → Save same remote without start →
  no write and no automatic embeddings request`.
- Status derives exactly one of these states from provider + cache + state +
  coverage, in this precedence order:
  `remote-off` (provider off) > `local`/`rollback-local` (provider local; the
  latter only when the previous remote state was disarmed) > `remote-error`
  (last failure) > `remote-unprobed` (no model/cache) >
  `remote-configured-not-started` (no armed state) > `remote-paused` >
  `remote-target-missing` (armed, zero target rows) > `remote-migrating`
  (partial) > `remote-ready` (all searchable rows covered). Each transition
  has a unit test; unknown progress is `—`, measured zero is `0`.
- `start` requires the current saved config to be remote, with a model and a
  cached/probed dimension matching that model; otherwise it returns
  `probe-required`/`model-required`. The client disables actions while the form
  is dirty and says Save first.
- Old local rows are not bulk-deleted by migration or rollback. Existing
  content-update semantics still delete that memory's embeddings
  (`src/core/memory-write.ts:905-916`); that is not a migration delete.
- Keep `ctx_memory search` fail-open and the automatic hint lane FTS-only.
- One bounded worker per lane; start may trigger one bounded first pass (the
  test host uses `memory.vectorBackfillLimit` to force partial states).

### 4. Settings actions and routes

Add a plugin-owned `/mc-embedding` route under the existing `webServer` injection:

- `GET /mc-embedding/status` — provider, model, dims, state, target,
  processed/total/failures/coverage, last sanitized error code, key presence,
  HTTP warning.
- `GET /mc-embedding/models` — model ids for the current config; manual
  fallback when unsupported.
- `POST /mc-embedding/probe` — probe and cache the current saved model;
  returns model, dims, latency.
- `POST /mc-embedding/rebuild` — `?action=start|pause|resume|disarm`; start persists
  the target and may trigger one bounded pass; pause stops writes; resume
  continues. There is **no rollback config route**: rollback calls the
  state-only `disarm` action, stages `embedding.provider = local`, and goes
  through the existing revision-fenced Save. A web route must never write
  profile config directly. If the local space is complete, local search
  resumes immediately; if not, local partial semantic/FTS plus local backfill
  resumes.

Guard every route: method allowlist (405 otherwise), `cache-control: no-store`,
JSON content type for POST, no request body (or a 1 KB cap), and same-origin
check when `Origin` is present (its host must equal `Host`). Return JSON with a
stable error code; never secrets or request text. GET `status`/`models` are
read-only; POST actions are the only cost-bearing operations.

In `src/client/index.js`:

- Add select fields for provider/preset/authHeader (a new `select` field kind),
  plus flat fields for endpoint, model, apiKeyEnv, dimensions,
  queryInstruction, documentPrefix, timeoutMs, queryTimeoutMs, batchSize.
- Add a compact action panel above/after the form: status line, model list
  select + refresh, test connection, start/pause/resume.
- Buttons call the routes; field edits still use the existing Save path.
  Disable action buttons while `dirty` or not writable and show
  “save first”.
- Model list selection stages `embedding.model` (not a direct write).
- Show only key presence, never the value; warn that memory text is sent to
  the endpoint and that plain HTTP is not private.
- Show an explanatory disabled state when `memory.enabled` is false.
- Show `无模型` when the list is empty, and keep manual model entry usable.
- Status/action controls have native labels, keyboard operation and non-color
  status text; progress uses `—` for unknown and `0` only for a measured zero.
- Complete zh/en dictionary keys; no hardcoded Chinese outside zh; dynamic
  action states and error-code-to-copy mapping (not raw provider bodies).
- Keep the existing Plugins-page fallback and the top-level Settings section.

### 5. Documentation, status and evidence

- Update `docs/dsh-plugin-settings-ui-contract.md`: new fields, select kind,
  plugin-owned model/probe/rebuild routes, revision-fenced rollback via Save,
  and replace the old “no model-catalog RPC / no schema change” boundary text.
- Update README/README.zh-CN with a short remote-embedding setup section, the
  privacy/cost warning, and links to vendor current model/pricing pages (no
  embedded prices). Do not add production model IDs or dimensions.
- Update `CHANGELOG.md`.
- Add `/ctx-status` space/model/dims/coverage line (`src/dsh/status-command.ts`).
- Journal every remote failure with a stable outcome code and sanitized detail.
- Record a fake-server host gate: fresh isolated Web profile, save endpoint,
  load models, probe fixture dims, verify no remote writes and no **automatic**
  query/backfill embeddings request before start (the explicit probe is
  allowed), start rebuild with a small `vectorBackfillLimit` to
  force partial, partial semantic/FTS, pause/resume, complete maintenance for
  a new memory, rollback via Save to local, and verify local search does not
  read remote rows.
- Fake-server steps are labelled local-simulation and are not counted as real
  model acceptance. Do not claim a real SiliconFlow pass;
  `SILICONFLOW_API_KEY` remains absent.

## Out of scope

- dsh-go native UI.
- Reranking, session-history chunk embedding, multi-provider fusion.
- Provider-specific SDKs/adapters, Cohere task hints, Bedrock native API.
- Release, tag, package identity changes, daily-profile mutation.
- Hardcoded model lists or production dimensions.

## Acceptance

- `npm test`, `npm run typecheck`, `npm run check:i18n`, `npm run build` pass.
- Unit tests cover config/identity, local identity unchanged, remote namespaced
  identity hash, model-list cache/key fingerprint, probe/cache/override and
  `dimensions-unsupported`, response mapping (all-missing index,
  partial/duplicate rejection), model substitution, width guard, query
  deadline, 429, 5xx bounded retry, empty/non-JSON rejection, SSRF/DNS/
  userinfo/HTTP, route guards, secret redaction, missing key/no empty auth,
  input-too-long row isolation, complete-state maintenance, and no hardcoded
  production model IDs/dims (checked by a source scan with a fixture-only
  allowlist).
- Lane tests cover: remote configured but not started → no writes and no
  automatic embeddings request (explicit probe allowed); missing key → no
  request and no empty auth header; start → target writes; partial via small
  `vectorBackfillLimit`; pause/resume; complete + new memory writes; local
  rows retained; local query never uses remote rows after remote growth;
  remote query failure → FTS; remote search does not call `embedTexts`;
  coverage includes active + permanent; rollback/disarm then Save the same
  remote target → not started, no query/writes; rollback with incomplete local
  space → local partial/FTS + local backfill; status precedence table.
- Client tests cover the new select kind, field copy, action routes, dirty-state
  disable, zh/en parity, key presence only, and no hardcoded Chinese outside
  zh.
- One isolated DSH Web gate with a fake OpenAI-compatible endpoint verifies the
  user path and no secret leakage; a separate provider-level SiliconFlow probe
  is recorded when the key is present. Fake-server steps are labelled local
  simulation and never claim a real vendor UI pass.
- `git status --porcelain` is checked against the ticket allowlist, so
  untracked package/release/profile/dsh-go files cannot hide. No package,
  release, profile or dsh-go change is present.
