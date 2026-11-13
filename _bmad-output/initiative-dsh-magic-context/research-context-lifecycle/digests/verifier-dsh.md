# Independent verification — DSH

Verifier: fresh deepseek-v4.1-flash subagent. Source: immutable `fcc0ad46`; no application/test execution.

- **ref1 verified:** buildRequest derives messages at line728, freezes them and their array at729-734, freezes the request at735-743, before stream dispatch. packages/core/agent-loop/src/agent.ts:656-743 (buildRequest) @ fcc0ad46.
- **ref2 verified:** prepareRequest consumes only controls/config and rejects changed captured selection. LlmCallConfig has no messages; the llm/stream contract expressly forbids rewriting loop-built content. packages/core/agent-loop/src/agent.ts:612-652 (prepareRequest) @ fcc0ad46; packages/llm/llm/src/index.ts:63-75 (stream) @ fcc0ad46.
- **ref3 verified:** replacements are new appended events with current surface endpoints and earlier, unique complete source coverage. A tool-result replacement changes only one current result's content; narrower semantic anchors avoid unrelated system-head logic. packages/core/session/src/surface.ts:301-365 (surfaceOpOf) @ fcc0ad46; packages/core/session/src/surface.ts:415-435 (replacementRange) @ fcc0ad46; packages/core/session/src/surface.ts:455-485 (assertToolResultRewrite) @ fcc0ad46.
- **ref4 verified:** synchronous append validates/freezes and inserts in memory; flush awaits all registered durability listeners before propagating the first failure. packages/core/session/src/index.ts:806-837 (append) @ fcc0ad46; packages/core/session/src/index.ts:1341-1357 (flush) @ fcc0ad46.
