---
ticket: 19
title: "Remote embedding provider and vector-space migration — plan"
status: done
---

# Plan — Remote embedding provider and vector-space migration

Ticket: 19
Story: `tickets/spike-remote-embedding-provider-and-vector-space-migration.md`
Deliverable: `research-remote-embedding-provider.md`

This is a research/requirements spike. It changes no runtime, test, package,
release or profile file.

## 1. Scope lock

Allowed outputs:

- the ticket leaf and this plan;
- `research-remote-embedding-provider.md`;
- a short initiative/ticket status update.

Forbidden outputs:

- edits under `src/`, `tests/`, `scripts/`, `docs/`, `README*`, `CHANGELOG.md`,
  `package.json`, `package-lock.json`, `.github/` or `cordis.patch.yml`;
- installs, host gates, browser runs, version bumps, tags or publishes;
- calling a real SiliconFlow endpoint without an explicit key and authorization.

## 2. Research steps

1. Read the current local embedder, identity, shared-space gate, search and
   backfill paths; record the exact vector-space assumptions.
2. Read the upstream v0.49.56 embedding provider and identity sources; separate
   reusable ideas from features this adapter does not have.
3. Read the DSH `Config`/settings contract and client field model; decide where a
   new embedding block can live without materialising `memory`.
4. Verify the SiliconFlow models and embeddings API contracts from their public
   docs; record the models response, the absent dimension field and the
   embeddings response. Check whether `SILICONFLOW_API_KEY` is present; if not,
   record the live probe as blocked.
5. Survey other embedding providers and classify each as standard-shape
   compatible (with base URL/auth caveats), metadata-preset candidate, or
   outside the base contract. Cloudflare/Gemini/OpenRouter use their
   OpenAI-compatible bases; Azure accepts either `api-key` or `Authorization`;
   Cohere's compatibility layer supports basic `model`/`input` but lacks
   `dimensions`/`user`/`input_type`, so it is outside the MVP. AWS Bedrock's
   native API is unsupported. No protocol adapters or vendor SDKs are planned. Pricing and free-tier claims
   are recorded as unstable vendor data, not code constants.
6. Define dynamic model discovery, manual fallback, model-list cache and
   dimension probing/cache/validation.
7. Define provider identity and the target-space migration state machine.
8. Define failure behavior, settings UX, copy, rollback and the dsh-go boundary.
9. Write the research document with a requirements matrix and acceptance plan.
10. Run independent validation, fix all Critical/Fix items, and only then mark
    the ticket done.

## 3. Document outline

1. Problem and why local-only is insufficient.
2. Current adapter facts and constraints.
3. Upstream v0.49.56 reference.
4. SiliconFlow API contract and limitations; provider landscape and support
   tiers.
5. Config/provider/identity decisions.
6. Dynamic model and dimension discovery.
7. Vector-space migration and rollback.
8. Failure handling and security.
9. Settings/UI contract and localization.
10. dsh-go boundary.
11. Acceptance plan for the implementation ticket.
12. Non-goals and open decisions.

## 4. Key findings to preserve

- The models API returns IDs and basic metadata only; dimensions require a probe.
- The local MiniLM identity must remain byte-identical for existing users.
- The current search chooses the dominant space, backfill writes only that
  space, and `memory.vectorBackfill` defaults true; remote support needs an
  explicit target space plus `remote-configured-not-started` and
  `remote-paused` gates.
- Query-time in-memory fill is on by default (`embedBackfill`,
  `memory-search.ts:369-387`); remote must not route that seam to the API, or
  every search spends quota and missing rows are not FTS-only.
- `memory_embeddings` already supports multiple spaces by `(memory_id, model_id)`;
  old local vectors can be retained for rollback. Store the identity hash in
  `model_id`, not the raw model name.
- Remote failure must fall back to FTS, not local vectors.
- `memory` cannot be declared in the host `Config` just to host embedding
  fields; use a top-level, user-level `embedding` block with `.volatile()`
  fields.
- Partial semantic search is safe only within the target space; rows without a
  target vector stay FTS-only during rebuild, and coverage is measured over
  active + permanent rows.
- The current settings card is flat fields plus one Save mutation and has no
  model/probe/rebuild RPC; the implementation ticket must extend the contract.
- A real SiliconFlow probe is blocked without `SILICONFLOW_API_KEY`; use a fake
  OpenAI-compatible server for the contract and record the limitation.
- Only standard OpenAI-shape endpoints are supported. Cloudflare/Gemini/
  OpenRouter use OpenAI-compatible bases; Azure accepts either `api-key` or
  `Authorization`; Cohere's compatibility layer supports basic `model`/`input`
  but lacks `dimensions`/`user`/`input_type`, so it is outside the MVP. AWS
  Bedrock's native API is unsupported. No protocol adapters or SDKs are planned.

## 5. Validation

1. Run an independent read-only ticket validation against the story, plan and
   research document.
2. Address every Critical/Fix in the same files.
3. Re-run validation until READY TO START.
4. Mark the spike done after the document passes; do not implement.

Validation must confirm:

- current and upstream citations are real and correctly scoped;
- the models API is not misrepresented as providing dimensions;
- provider facts are accurate (OpenRouter/Cloudflare/Gemini/Cohere/Azure shapes,
  Bedrock's native API) and no protocol adapters are proposed;
- no hardcoded model IDs or production dimensions remain in the contract or
  acceptance fixtures;
- local identity preservation and target-space migration are both explicit;
- the explicit rebuild gate overrides the default-on `vectorBackfill`;
  `remote-paused` is distinct from `remote-configured-not-started`; and
  query-time in-memory fill is disabled for remote;
- `memory_embeddings.model_id` is the identity hash, not the raw model name;
- remote failure never reads local vectors;
- embedding config is user-level and project values cannot redirect the key;
- the settings-contract gap (no model/probe/rebuild RPC) is stated with the
  required extension;
- the settings flow is usable and the API key never enters config/logs;
- the dsh-go boundary is stated but not implemented;
- no runtime/package/release/profile files changed.

## 6. Follow-up (not this ticket)

A later implementation story will add the provider, config/UI, migration,
tests and one isolated DSH host gate. The dsh-go native settings UI remains a
later port, using the same server-side contract.
