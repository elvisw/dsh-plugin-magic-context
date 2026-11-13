# Independent verification — tests

Fresh deepseek-v4.1-flash verifier; immutable MC `33fb6ac9` and DSH `fcc0ad46`; no application/test execution.

- **ref12 verified:** cache fixtures use mocks and normalized JSON with cache_control removed; checks start from request index1. These are not measured cache hits. MC packages/e2e-tests/tests/cache-stability.test.ts:37-157 (stripCacheControl) @ 33fb6ac9.
- **ref13 verified:** DSH fixture assertions compare structured messages/controls and request/array freezing, not provider-wire serialized bytes. DSH packages/core/agent-loop/tests/request-reconstruction.spec.ts:68-112 (expectPrefixExtension) @ fcc0ad46; packages/core/agent-loop/tests/request-reconstruction.spec.ts:850-897 (THEOREM) @ fcc0ad46. Reviewer suggested nearby alternative start/end lines; the ledger retains mechanically confirmed anchors containing the test declaration.
- **ref14 verified:** queued-drop child traps the first mutation and is killed at that selected boundary; independent LKG fence tests explicitly skip Windows. The queued-drop test itself is not Windows-skipped. MC packages/pi-plugin/src/queued-drop-batch.test.ts:68-150 (SIGKILL) @ 33fb6ac9; packages/plugin/src/hooks/magic-context/lkg-fence-opencode-sigkill.test.ts:7-120 (SIGKILL) @ 33fb6ac9.
- **ref15 verified:** raw-provider fixtures distinguish tag4 from ordinal4 and exclude wrong sibling output; no source destruction, corruption or restart is exercised. MC packages/plugin/src/tools/ctx-expand/tag.test.ts:26-96 (recovers text) @ 33fb6ac9.

No claim disputed, overturned or left unverified. A verified claim about a test assertion is not evidence that the test ran or passed on this machine.
