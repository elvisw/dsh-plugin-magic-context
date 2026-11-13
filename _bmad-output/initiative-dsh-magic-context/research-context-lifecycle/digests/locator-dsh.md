# DSH locator digest

Source: independent locator, immutable commit `fcc0ad46`. Search-only findings; no application or tests executed. Paths below are relative to the DSH repository.

## Q1 implementation locations

- `packages/core/agent/src/runtime-types.ts:350` (Events) @ fcc0ad46 — admission, control-only request interception, recovery and cancellation contracts.
- `packages/core/agent-loop/src/agent.ts:283` (ReactLoopAgent) @ fcc0ad46 — preStep; step at 435; derived/frozen buildRequest at 656.
- `packages/core/system-prompt/src/index.ts:683` (assemble) @ fcc0ad46 — assembly waterfall and mandatory context/tool constraints.
- `packages/core/agent-loop/src/runtime-context.ts:93` (SystemPromptProjection) @ fcc0ad46 — logged system prompt append/replacement and clearing.
- `packages/core/session/src/index.ts:806` (append) @ fcc0ad46 — validated immutable append; deriveMessages at 999; flush barrier at 1342.
- `packages/core/session/src/surface.ts:120` (deriveEventMessage) @ fcc0ad46 — ordered surface replacements and source attribution.
- `packages/llm/llm/src/index.ts:960` (prepareCall) @ fcc0ad46 — routed dispatch; stream middleware cannot rewrite frozen content.
- `packages/core/tools/src/pipeline.ts:200` (ToolExecutionPipeline) @ fcc0ad46 — tool execution and result hooks.
- `packages/core/tools/src/batch.ts:50` (executeToolBatch) @ fcc0ad46 — ordered settlement and cancellation draining.
- `packages/core/session/src/repair.ts:105` (ToolCallRecovery) @ fcc0ad46 — durable synthetic results for unanswered calls.
- `packages/core/agent-loop/src/index.ts:761` (resumeWith) @ fcc0ad46 — exclusive ownership and persisted crash repair before publication.
- `packages/session/session-persistence/src/index.ts:144` (SessionPersistence) @ fcc0ad46 — writer ownership and durability barriers.
- `packages/session/session-persistence-jsonl/src/storage.ts:549` (JsonlBackendTracker) @ fcc0ad46 — event/flush lifecycle.
- `packages/compaction/compaction-basic/src/region.ts:337` (validateSurfaceRegion) @ fcc0ad46 — positional boundaries and tool-pair balance.

## Q4 test locations

- `packages/core/agent-loop/tests/request-reconstruction.spec.ts:88` (request stability across the loop) @ fcc0ad46 — prefix extension/freezing; restart at 791; reconstruction at 850.
- `packages/core/agent-loop/tests/request-cache.e2e.ts:76` (log-derived request cache hits) @ fcc0ad46 — key-gated DeepSeek cached-token assertion.
- `packages/core/agent-loop/tests/resume.spec.ts:514` (AgentLoop factory create/resume) @ fcc0ad46 — durable repairs and replay-equivalent resume at 1119.
- `packages/compaction/compaction/tests/tool-pairing.spec.ts:65` (tool-pairing boundaries) @ fcc0ad46 — balanced boundaries, membership and orphan rejection.
- `packages/compaction/compaction-tool-result-pruner/tests/tool-result-pruner.spec.ts:185` (ToolResultPruner) @ fcc0ad46 — raw retention and metadata; replay equality at 269.
- `packages/session-query/session-query/tests/session-query.spec.ts:479` (session-query exact reads) @ fcc0ad46 — detached full log; shadowed/current classification at 994; bounded raw events at 1104.

## Limits

Presence of tests is not evidence they pass. No universal provider cache hit rate, serialized HTTP byte identity, generated-summary semantic fidelity, or integrated model-driven recovery is established. Negative searches for semantic compression/recall, cache-hit ratio, wire-byte and raw-recovery terms are bounded to the relevant queried implementation/test directories, not claims of repository-wide absence.
