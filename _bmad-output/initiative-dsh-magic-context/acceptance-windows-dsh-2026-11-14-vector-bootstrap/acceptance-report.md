# Vector first-writer host acceptance — 2026-11-14

## Scope

Acceptance for the empty-corpus vector deadlock: an empty `memory_embeddings`
table must let the first maintenance backfill create the embedding space, and
the same process must switch the shared-space gate to `parity-pass` without a
restart.

Host: isolated DSH `0.2.2-rc.1` profile; plugin tarball built from this working
tree (`@elvisw/dsh-plugin-magic-context@0.12.1`,
`tarball_sha256=7ce3c456681fb602cd54d738a7dededb7ca18c4c7292d08959a70a19544c12b1`);
model route `deepseek-official/deepseek-flash` (the route recorded by `evidence/dump-config.txt:59-60`); maintenance interval
60 s; historian and compaction engine disabled; memory corpus and plugin DB
under the isolated root only.

## Result

| Check | Evidence | Result |
|---|---|---|
| Empty store starts with no embedding space | journal id 14 `gate-closed` carrying `bootstrapModelId` (that branch means no dominant space; `gate-closed` also covers dims mismatch); the post-run table is `memory_embeddings: 1` | pass for the first tick; no pre-run DB snapshot was captured in the final root (attempt 2's `evidence/attempt2/vector-db.json` is the retained zero-row snapshot) |
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

- Attempt 1 (`evidence/attempt1/`): the plugin started and wrote one memory, but
  the test-only driver could not resolve `@deepseek-ai/dsh-tools` from the
  experiment root; the resulting search stayed `match=fts`, so the first-writer
  path was not exercised. The driver was moved into the isolated profile.
- Attempt 2 (`evidence/attempt2/`): the fixture was archived before the
  maintenance tick could run the backfill (the copied DB shows `status:
  archived`; the retained memory DB records `archive_reason=verify-wrong`), so
  the table still had 0 embeddings and no `backfill-bootstrap`; this attempt did
  not execute the first-writer path. The final run used a plausible
  `PROJECT_RULES` fixture and did reach `backfill-bootstrap` → `backfill` →
  `parity-pass`.
- This gate proves the empty-store first-writer path and same-process parity
  switch with a real host and real embedding model. It does not prove a
  multi-process race between two first writers, nor semantic quality of the
  local MiniLM model. `final_text=VECTOR_HOST_OK` is a scripted token, not an
  independent verdict; the DB rows and journal are the authority.
- The harness redirects `DSH_HOME`/`HOME`/`APPDATA` and uses an isolated
  `dataDir` (`prepare_vector_host.py:38-62`, `evidence/dump-config.txt:399-411`);
  the evidence contains no daily profile path. A before/after comparison of the
  daily profile was not captured, so this is an absence-of-evidence statement,
  not a proof that no unrelated process wrote elsewhere.
- Evidence is copied from the isolated root, including the attempt 1 and 2
  directories; those attempts are provenance, not passes.
- The installed tarball (`7ce3c456…12b1`) was built from this working tree at
  `@elvisw/dsh-plugin-magic-context@0.12.1`; no source-commit or build-log
  provenance was captured with it. The vector-journal and code paths quoted
  above are the evidence for the behavior, not the tarball hash alone.
