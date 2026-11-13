# DSH load-bearing claims

- ref=1: Requests derive from the current Session surface and are frozen before dispatch. packages/core/agent-loop/src/agent.ts:656-743 (buildRequest) @ fcc0ad46.
- ref=2: agent/request changes controls, not content or captured model selection; llm/stream forbids rewriting loop content. packages/core/agent-loop/src/agent.ts:612-652 (prepareRequest) @ fcc0ad46; packages/llm/llm/src/index.ts:63-75 (stream) @ fcc0ad46.
- ref=3: Durable replacement appends events with current ordered endpoints and complete source references; tool-result rewrite changes one result's content only. packages/core/session/src/surface.ts:301-365 (surfaceOpOf) @ fcc0ad46; packages/core/session/src/surface.ts:455-546 (assertToolResultRewrite) @ fcc0ad46.
- ref=4: In-memory append is not durability; flush awaits listeners and propagates persistence failure. packages/core/session/src/index.ts:806-837 (append) @ fcc0ad46; packages/core/session/src/index.ts:1341-1357 (flush) @ fcc0ad46.
- ref=13: DSH reconstruction fixtures assert structured request equality and immutable append-extension, not serialized provider-wire byte identity. packages/core/agent-loop/tests/request-reconstruction.spec.ts:68-112 (expectPrefixExtension) @ fcc0ad46; packages/core/agent-loop/tests/request-reconstruction.spec.ts:850-897 (THEOREM) @ fcc0ad46.
