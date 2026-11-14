---
ticket: 9
status: built
---

# Plan — historian provider token-limit retry and reasoning effort

## Implementation

1. `src/dsh/historian.ts`
   - Add `HistorianRoute` (`provider`, `model`, optional `reasoningEffort`) and
     reuse it in deps/input/route types.
   - Add `reasoningEffort` to `HistorianStreamOptions`; pass it from the
     resolved route into every `collectAttempt`.
   - Journal `reasoningEffort` on start/done when present.
   - Add `isOutputLimitFailure()` and normalize a provider
     `OUTPUT_TOKEN_LIMIT` thrown during iteration into
     `HistorianTruncatedError(options.maxTokens, 0)` inside `collectAttempt`.
   - Also inspect `finish.reason.failure.code` in `collectText`: the host turns
     an adapter throw into a terminal error chunk, so the code does not survive
     on the thrown `Error`; without this branch the real path is still
     `stream-error`.
2. Route plumbing
   - `src/index.ts`: read `historian.reasoningEffort`, append it to
     `historianRouteOf()`.
   - `src/dsh/pre-step.ts`: append it to the live generation route.
   - `src/dsh/management-pass.ts`, `compaction-engine.ts`, `recomp.ts`: accept
     `HistorianRoute`.
3. Config and UI
   - `src/dsh/config.ts`: add `reasoningEffort?: string`.
   - `src/index.ts`: `reasoningEffort: z.string().default('').volatile()`.
   - `src/client/index.js`: add a `kind: 'text'` field; make the generic control
     use `numeric: spec.kind === 'number'`; plan text leaves as `set`/`unset`.
4. Docs: README, README.zh-CN, CHANGELOG Unreleased.

## Verification

- `tests/historian-chunking.spec.ts`: OUTPUT_TOKEN_LIMIT retry and effort
  passthrough.
- `tests/config-schema.spec.ts`: default/empty and pinned effort.
- `npm run typecheck`, `npm test`, `npm run check:i18n`, `npm run build`.

## Notes

- `attemptCaps: [8192, 8192, 8192]` in the report is three planned calls
  (two chunks + merge), each attempt 0 — not a ceiling bug. The retry never
  started because the provider threw before `finish`. The test asserts the
  corrected retry shape.
- The free-text UI is deliberate: the host model catalog exposes only model
  id/name to the bundle, not effort ids.
