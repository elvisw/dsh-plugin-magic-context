# Magic Context locator digest

Source: independent locator, immutable release commit `33fb6ac9`. Search-only findings; no application or tests executed. Paths are relative to the MC repository.

## Q2 implementation locations

- `packages/plugin/src/features/magic-context/tagger.ts:328` (createTagger) @ 33fb6ac9 — stable persisted assignments and tool ownership.
- `packages/plugin/src/tools/ctx-reduce/tools.ts:228` (createCtxReduceTool) @ 33fb6ac9 — pending-operation checks and queued drop requests.
- `packages/plugin/src/hooks/magic-context/transform-postprocess-phase.ts:2754` (runPostTransformPhase) @ 33fb6ac9 — rebuild permission and defer stability.
- `packages/plugin/src/hooks/magic-context/apply-operations.ts:488` (applyPendingOperations) @ 33fb6ac9 — durable drop decisions before message mutation.
- `packages/plugin/src/features/magic-context/storage-native-replay.ts:136` (getNativeReplayState) @ 33fb6ac9 — durable validated native replay.
- `packages/plugin/src/hooks/magic-context/lkg-persist.ts:357` (loadPersistedLkgSlot) @ 33fb6ac9 — restart hydration checks.
- `packages/plugin/src/hooks/magic-context/lkg-replay.ts:638` (replayLkg) @ 33fb6ac9 — frozen prefix plus pristine tail and refusal conditions.
- `packages/plugin/src/tools/ctx-expand/render.ts:358` (renderItemByTag) @ 33fb6ac9 — original owner lookup and raw tool-pair recovery.
- `packages/plugin/src/tools/ctx-expand/tools.ts:95` (createCtxExpandTool) @ 33fb6ac9 — Rust tag namespace refusal.
- `packages/plugin/src/hooks/magic-context/rust-mode-transform.ts:2881` (serveRawFallback) @ 33fb6ac9 — bounded/validated raw fallback admission.

## Q3 shared source and host boundaries

- `package.json:3` (packageManager) @ 33fb6ac9 — Bun workspace build/test orchestration.
- `Cargo.toml:5` (workspace) @ 33fb6ac9 — Rust crates and subc dependencies.
- `LICENSE:1` (MIT License) @ 33fb6ac9 — attribution and redistribution terms.
- `packages/plugin/package.json:40` (scripts) @ 33fb6ac9 — Node-targeted ESM, workers, OpenCode and optional embedding dependencies.
- `packages/pi-plugin/package.json:32` (scripts) @ 33fb6ac9 — shared workers and host-specific build configuration.
- `packages/pi-plugin/tsconfig.json:18` (paths) @ 33fb6ac9 — core alias points to plugin source, not a public standalone core SDK.
- `packages/plugin/src/index.ts:133` (server) @ 33fb6ac9 — OpenCode initialization and message hook registration.
- `packages/pi-plugin/src/index.ts:1169` (default) @ 33fb6ac9 — Pi config/storage and hook initialization.
- `packages/pi-plugin/src/transcript-pi.ts:171` (createPiTranscript) @ 33fb6ac9 — host transcript abstraction.
- `packages/plugin/src/shared/sqlite.ts:113` (detectSqliteRuntime) @ 33fb6ac9 — Node/Bun SQLite abstraction.

## Q4 test locations

- `packages/e2e-tests/tests/cache-stability.test.ts:67` (system prompt stays stable across defer passes) @ 33fb6ac9 — system and serialized-prefix equality.
- `packages/pi-plugin/src/queued-drop-batch.test.ts:68` (SIGKILL before first wire mutation) @ 33fb6ac9 — crash-safe drop decisions across three adapters.
- `packages/plugin/src/hooks/magic-context/tag-messages-collision.test.ts:252` (FIFO pairing) @ 33fb6ac9 — reused call IDs and stable recovery identity.
- `packages/pi-plugin/src/transcript-pi-tool-pairing.test.ts:27` (preserves toolCall.id) @ 33fb6ac9 — sentinel/tool identity.
- `packages/plugin/src/features/magic-context/storage-native-replay.test.ts:433` (replays exact tool bytes and reasoning ids after reopening) @ 33fb6ac9 — persisted native replay.
- `packages/plugin/src/hooks/magic-context/lkg-transform-replay.test.ts:117` (captures only the prefix through an early anchor) @ 33fb6ac9 — prefix/tail replay and mismatch refusals.
- `packages/plugin/src/hooks/magic-context/restart-history-omission.test.ts:145` (does NOT drop a compartment published just before a restart) @ 33fb6ac9 — first-defer summary/raw retention.
- `packages/plugin/src/tools/ctx-expand/tag.test.ts:26` (recovers text, one tool, and the right dropped sibling) @ 33fb6ac9 — exact raw recovery.
- `packages/plugin/src/tools/ctx-expand/rust-mode-tag.test.ts:24` (refuses the lookup) @ 33fb6ac9 — cross-engine namespace safety.
- `packages/pi-plugin/src/tools/ctx-expand.test.ts:249` (Pi tag recovery pairs the raw invocation and result) @ 33fb6ac9 — exact paired recovery without siblings.

## Limits

No standalone tracked packages/core, packages/shared or packages/pi tree was found. No exact package dependency named @magic-context/core was found in the two plugin manifests; its source alias is present. No tests were executed. Location comments and test titles require analyzer and verifier checks before becoming behavioral conclusions.
