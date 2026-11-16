---
ticket: 20
title: "Remote embedding provider implementation — plan"
status: done
---

# Plan — Remote embedding provider implementation

Ticket: 20
Story: `tickets/story-remote-embedding-provider-implementation.md`
Research: `research-remote-embedding-provider.md` (T19)

## 1. Scope lock

Allowed:

- `src/core/embedding-remote.ts` (new)
- `src/dsh/embedding-lane.ts` (new)
- `src/core/embedding-local.ts`, `src/dsh/memory-lane.ts`,
  `src/dsh/status-command.ts`, `src/core/memory-search.ts`,
  `src/core/vector-lane.ts`, `src/core/vector-backfill.ts`,
  `src/core/memory-write.ts`
- `src/dsh/config.ts`, `src/index.ts`, `src/client/index.js`
- `tests/embedding-remote.spec.ts`, `tests/embedding-lane.spec.ts`,
  `tests/client-pure.spec.ts`, `tests/config-schema.spec.ts`,
  `tests/vector-lane.spec.ts`, `tests/vector-backfill.spec.ts`,
  `tests/memory-search.spec.ts`, `tests/embedding-wasm.spec.ts`,
  `tests/command-surface.spec.ts`, `tests/phase-map.spec.ts`
- `scripts/phase-map.mjs`, `scripts/mc-i18n-check.mjs`
- `docs/dsh-plugin-settings-ui-contract.md`, README/README.zh-CN,
  `CHANGELOG.md`
- one acceptance directory with a fake-server Web gate

Forbidden: package/release/tag/publish changes, daily
profile mutation, dsh-go port, hardcoded production model IDs or dimensions,
non-OpenAI-compatible vendor adapters.

## 2. Implementation sequence

1. **Provider core.** Add config types and `embedding-remote.ts`: endpoint
   normalization/guards, namespaced identity hash, model list, probe/cache,
   batch embed, response mapping, deadlines, input-too-long isolation,
   sanitized failures.
2. **Embedding lane.** Add `embedding-lane.ts` to resolve live config, own the
   local/remote provider, caches and rebuild state, expose
   status/models/probe/start/pause/resume/disarm, and provide query/backfill
   adapters. Disarm clears rebuild state only; it never writes config.
3. **Memory integration.** Replace the hard-wired local embedder in
   `memory-lane.ts` with the lane. Local target is the explicit local identity
   (legacy local dominant only), remote target is the namespaced identity.
   Remote search disables `embedTexts` and query before start; remote backfill
   is gated by `running`/`complete`; `planBackfill` gains target + permanent
   options; remote coverage uses active + permanent.
4. **Server route.** Register `/mc-embedding` from the existing `webServer`
   injection in `index.ts`; JSON-only, guarded, no secrets; status includes
   state/progress/coverage and last sanitized error.
5. **Client.** Add select fields, flat fields, action panel, dynamic model
   select, dirty-state disable, status, zh/en copy, key-presence-only display.
   Preserve existing Save/staging and the Plugins-page fallback.
6. **Tests.** Pure provider/fake-server tests, lane state-machine tests,
   route guards, client copy/action tests, config/clamping, status line,
   i18n/typecheck/build.
7. **Host gate.** Fake OpenAI-compatible endpoint, isolated Web profile,
   load/probe/no-automatic-request-before-start/start/partial (small
   `vectorBackfillLimit`)/pause/resume/complete+new memory/rollback via Save;
   screenshots/JSON evidence; secret scan. Label it local simulation.
8. **Docs.** Settings contract (including replacing the old no-RPC boundary),
   README both languages, CHANGELOG, `/ctx-status`.
9. **Review.** Independent diff review + report audit, fix Critical/Fix,
   rerun gates, submit. Use `deepseek-v4.1-flash` for code review subagents
   where available.

## 3. Key invariants

- Local identity byte-identical (`embedding-provider:…`); existing local
  vectors untouched.
- Remote identity is namespaced `embedding-remote:<hash>` and is the
  `memory_embeddings.model_id`.
- Local target selection never picks a remote id; remote growth cannot change
  a local query after rollback.
- Saving remote config never writes vectors and never sends an automatic
  embeddings request (explicit probe allowed). Only an armed `start` with a
  matching persisted target enables query/writes.
- `rollback` calls state-only `disarm` then saves provider=local; a later
  Save of the same remote target is `remote-configured-not-started`.
- `remote-paused` is not `remote-configured-not-started`.
- `complete` still performs target maintenance for new/updated rows.
- Remote search never uses local query vectors and never calls `embedTexts`.
- Remote coverage = active + permanent searchable rows; local
  `measureVectorLane` remains active-only.
- API key value never enters config, DB, journal, telemetry, logs, responses or
  evidence.
- No production model IDs/dimensions in source or tests (fixtures only).
- No real SiliconFlow claim without a key.

## 4. Test matrix

| Area | Cases |
|---|---|
| Identity | local unchanged; remote namespace; fields; authHeader/queryInstruction excluded; key rotation; model_id hash; local/remote isolation |
| Models | success, 401/403/404/429/503, empty, malformed, manual fallback, cache key/TTL/key fingerprint |
| Probe | native dims, explicit dims, mismatch, 400 unsupported, cache key with override/key presence, cache invalidation/re-probe once, empty, non-JSON, timeout, echo mismatch |
| Embed | index all-missing, partial/duplicate reject, model substitution, width guard, prefixes, 5xx bounded retry, empty/non-JSON reject, input-too-long row isolation |
| Security | auth header, missing key/no empty Bearer, redirect refusal, SSRF/DNS/userinfo/HTTP guard, route origin/method/content-type/body cap, redacted errors |
| Lane | not-started no writes/no automatic request, missing key, start writes, partial, pause/resume, complete maintenance, local rows retained, rollback+disarm then same target not started, local incomplete rollback, FTS on failure, no `embedTexts` remote |
| Coverage | active + permanent, expired excluded, partial/ready, local active-only unchanged |
| Client | select kind, field copy, action routes, dirty-state disable, key presence only, zh/en, no hardcoded Chinese |
| Host | fake endpoint, save/load/probe/no-automatic-request/start/partial/pause/resume/complete/rollback via Save, secret scan |

## 5. Validation

1. Independent ticket validation passes before editing code.
2. Implement in the sequence above.
3. Run targeted tests after each layer, then full gates.
4. Run independent diff review; fix Critical/Fix; run a fix re-check.
5. Run independent report audit; fix Critical/Fix; run a final confirmation.
6. Do not mark done until both reviews pass.

## 6. Follow-up (not this ticket)

- dsh-go native settings UI and remote provider port.
- Real SiliconFlow probe once a key is available (provider-level probe is
  recorded; a full UI rebuild against the real vendor is still follow-up).
- Optional remote-vector GC after rollback.
- Remote tokenizer / max-input-token truncation.
