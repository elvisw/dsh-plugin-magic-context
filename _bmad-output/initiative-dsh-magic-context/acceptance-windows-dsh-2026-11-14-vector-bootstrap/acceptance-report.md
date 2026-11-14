# Vector first-writer host acceptance — 2026-11-14

## Scope

Acceptance for the empty-corpus vector deadlock: an empty `memory_embeddings`
table must let the first maintenance backfill create the embedding space, and
the same process must switch the shared-space gate to `parity-pass` without a
restart.

Host: isolated DSH `0.2.2-rc.1` profile; plugin tarball built from this working
tree (`@elvisw/dsh-plugin-magic-context@0.12.1`,
`tarball_sha256=7ce3c456681fb602cd54d738a7dededb7ca18c4c7292d08959a70a19544c12b1`);
model route `commandcode/deepseek/deepseek-v4.1-flash`; maintenance interval
60 s; historian and compaction engine disabled; memory corpus and plugin DB
under the isolated root only.

## Result

| Check | Evidence | Result |
|---|---|---|
| Empty store starts with no embedding space | `vector-db.json` `memory_embeddings: 0`; `vector-journal` id 14 `gate-closed` with `bootstrapModelId` | pass (expected pre-fix state) |
| First maintenance tick creates the space | journal id 15 `backfill-bootstrap`, `total: 1` | pass |
| One vector is stored in that space | journal id 16 `backfill`, `created: 1`; `memory_embeddings: 1`; `spaces[0].rows: 1` | pass |
| Same process re-resolves parity | journal id 17 `parity-pass`, `parity: 1` | pass |
| Query uses the new space | `ctx_memory search` result `match=hybrid`, `score=0.91` | pass |
| No model download failure | `model_cache` has `model.onnx` (90,387,606 bytes), tokenizer files | pass |

Host process: `session-49f90695-9672-4f6c-835c-1716b23ce6ab`, exit `0`,
`final_text=VECTOR_HOST_OK`, three tool calls (`ctx_memory` write, `vector_wait`,
`ctx_memory` search). `vector_wait` is a test-only bounded sleep tool; it never
reads or mutates history.

## What changed

- `src/core/vector-lane.ts`: `planBackfill` accepts `bootstrapModelId`; with no
  dominant space it enumerates active memories and names the first writer.
- `src/core/vector-backfill.ts`: parity is still mandatory when a space exists;
  the only exception is an empty store with a bootstrap model, which journals
  `backfill-bootstrap` before writing.
- `src/dsh/memory-lane.ts`: the gate exposes `bootstrapModelId` only when the
  store has no space at all, and clears the memoized shared-space promise after
  the first successful bootstrap so the same process re-resolves parity.

## Attempts and boundaries

- Attempt 1 failed before any plugin logic: the test driver at the experiment
  root could not resolve `@deepseek-ai/dsh-tools`; it was moved into the
  isolated profile so the host package resolves normally.
- Attempt 2 passed the first-writer path but the verifier archived the fixture
  memory (`citrus fruit…` judged `wrong`), leaving no active candidate. The
  final run used a plausible, verifier-stable `PROJECT_RULES` fixture.
- This gate proves the empty-store first-writer path and same-process parity
  switch with a real host and real embedding model. It does not prove a
  multi-process race between two first writers, nor semantic quality of the
  local MiniLM model.
- No daily profile, session store or plugin database was touched. Evidence is
  copied from the isolated root; the root pointer files for attempts 1 and 2
  are retained only as provenance.
