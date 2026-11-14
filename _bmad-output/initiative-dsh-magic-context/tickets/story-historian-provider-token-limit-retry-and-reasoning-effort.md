---
id: 9
type: story
title: "Historian provider token-limit retry and reasoning effort"
parent: initiative-dsh-magic-context
after: [8]
refined: true
hitl: false
risk: medium
---

# Historian provider token-limit retry and reasoning effort

## Summary

Two linked historian defects observed on `commandcode/deepseek/deepseek-v4.1-flash`
with `reasoningEffort: max`:

1. The provider rejects an empty completion with `OUTPUT_TOKEN_LIMIT` **before**
   yielding a `finish` chunk. `collectText()` only recognizes a `finish` chunk
   with `reason.kind === 'max-tokens'`, so the rejection is classified as
   `stream-error`; the retry guard never runs and every call uses the first
   attempt's cap.
2. The settings card exposes the historian route and token caps but no reasoning
   effort, so the most effective mitigation (lowering effort on a model whose
   reasoning consumes the whole output budget) requires hand-editing the profile.

## Requirements

1. **Recognize the provider-level output-token limit.**
   - An error with `code === 'OUTPUT_TOKEN_LIMIT'` thrown by the LLM seam during
     a historian attempt, **or carried on the host's terminal
     `finish.reason.failure.code` chunk**, is normalized into the existing
     truncation path (`HistorianTruncatedError`).
   - The next attempt uses `attemptOutputCap()`'s doubled cap (8192 → 16384 by
     default) and the existing "keep it shorter" repair prompt.
   - Other provider failures (`stream-error`, auth, rate limit) are not retried.
   - The journal keeps one terminal row per run and shows the real attempt count
     and caps.

2. **Expose reasoning effort.**
   - `historian.reasoningEffort` is an optional string leaf in the Config schema,
     default empty, volatile.
   - Empty/whitespace means "omit the field and let the host use the model's
     default"; a non-empty value is passed verbatim to `ctx.llm.stream`.
   - The leaf applies to the out-of-band historian, `/compact`, and
     `/ctx-recomp` through the shared generation route.
   - The settings card renders a free-text field (the host model catalog does not
     expose reasoning-effort metadata to this bundle); the hint names the
     provider-specific nature and the blank default.
   - The value is journaled on the historian start/done rows when present.

3. **Preserve existing behavior.**
   - No change to the default route pair semantics (`provider`/`model` empty =
     follow the session).
   - No new model call beyond the designed retry.
   - No schema migration and no direct `lib/` edit.

## Verification

- Unit:
  - `scriptLlm` throws an error carrying `code: 'OUTPUT_TOKEN_LIMIT'`, then a
    valid digest; assert caps `[8192, 16384]`, the repair prompt, and a `done`
    row with `attempts: 2`.
  - A real `LlmRuntime` + test adapter throws `LlmError('...', 'OUTPUT_TOKEN_LIMIT')`
    (the runtime converts it to `finish.reason.failure.code`), then returns a
    digest; assert two adapter requests and the second cap at 16384.
  - A configured effort reaches `fake.calls[0].request.reasoningEffort` and the
    start row.
  - Config schema materializes the empty leaf and accepts a pinned value.
- `npm run typecheck`, `npm test`, `npm run check:i18n`, `npm run build`.
- Host gate (isolated profile) is desirable but not required to close this
  ticket: the retry path can be proven with the real `LlmRuntime` + a test-only
  adapter; if that cannot be made deterministic, record the unit/integration
  boundary explicitly instead of claiming real-provider proof.

## Boundaries

- Not a general retry policy for every provider error.
- Not an automatic effort selector: the valid ids are adapter-owned and the
  bundle cannot invent one.
- Not the `drop-landed`/`memoryStats` observability fixes from the same report.
- Not a release.

## References

- Report: `C:\Users\elvis\Documents\deepseek-harness\default-workspace\magic-context-issues.md` (P1)
- Provider behavior: `@mars-sea/dsh-commandcode-provider` `emptyCompletionError`
  (`OUTPUT_TOKEN_LIMIT`, thrown before the finish chunk)
- `src/dsh/historian.ts` (`collectText`, `collectAttempt`, `attemptOutputCap`)
- `src/dsh/config.ts`, `src/index.ts` Config schema, `src/client/index.js` FIELDS
