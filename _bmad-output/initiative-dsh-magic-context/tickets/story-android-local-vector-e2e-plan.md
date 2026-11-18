---
title: Android local-vector end-to-end acceptance
type: acceptance
ticket: "25"
created: 2026-11-18
status: built
baseline_revision: c5a1e618342fe2bd55268ebddc6095385ed0d18c
route: acceptance
route_source: auto
risk: medium
review: none
review_source: pinned
lenses_ran: []
review_loop_iteration: 0
context:
  - _bmad-output/initiative-dsh-magic-context/acceptance-windows-dsh-2026-11-18-t24-credential-key/android/phone-local-embed.json
  - _bmad-output/initiative-dsh-magic-context/acceptance-android-dsh-go-2026-11-17-t23/acceptance-report.md
---

<frozen-after-approval reason="human-owned intent — awaiting approval">

## Intent

Prove the **whole** local-vector path on a real Android phone: memory write → maintenance-tick
backfill with the in-package MiniLM WASM embedder → `ctx_memory action=search` returning a
semantic-bearing match. The T23/T24 probes only proved the embedder primitive in isolation.

Produces evidence and a report. No product code change, no release.

## Boundaries & Constraints

Always: use the published `@elvisw/dsh-magic-context@0.18.0` tarball (record its SHA-256);
install into an isolated `dataDir`/`memories.db` with a test-owned `cordis.patch.yml` block;
pre-seed the three model assets so the phone does not need HuggingFace; keep the engine's
own model route untouched; restore the profile to its original bytes at the end; record
redacted evidence only.

Never: modify product source; change the release version; call a paid vendor; write secrets
to config; leave the phone in the test configuration; claim an Android E2E from unit tests or
from the earlier primitive probe.

## Facts this plan relies on

| Fact | Source |
|---|---|
| Local identity is `embedding-provider:<md5>` over provider/model/endpoint/key/runtime | `src/core/embedding-local.ts:88-96` |
| Assets are hash-pinned: sha256 is the authority, `minBytes` is a cheap sanity floor used on both the warm and the cold path | `src/core/embedding-local.ts:73-77,198-222`, `:202`, `:211`, `:213` |
| Embedder is created lazily through `openEmbeddingLane.localEmbedder()` | `src/dsh/embedding-lane.ts:514-522` |
| Backfill needs a writable writer + a shared space; bootstrap allowed only when no space exists | `src/dsh/memory-lane.ts:378-456`, `:288-362` |
| First maintenance tick fires 60 s after mount, then every `intervalMs`, floored at 60 s | `src/dsh/maintenance-wiring.ts:274,295-300` |
| Backfill is on by default; one tick writes at most `vectorBackfillLimit` (default 24) | `src/dsh/maintenance-wiring.ts:41-43,229-239` |
| `hybrid` requires the memory to be both an FTS match and to carry a vector | `src/core/memory-search.ts:421-427` |
| Stored BLOB width must equal the query vector width, else the row is skipped | `src/core/memory-search.ts:352` |
| **A stored row is not required for `hybrid`**: with `memory.embedBackfill` on (default), the in-memory fill lane embeds FTS candidates that have no stored vector and the merge still labels them `hybrid`. The gate must run with `memory.embedBackfill: false` or the criterion cannot distinguish backfill from in-memory fill | `src/core/memory-search.ts:369-387`, `:388-395`, `:421-427`; `src/dsh/memory-lane.ts:503-508` |
| `ctx_memory search` suppresses every row the injected memory block already renders — the check runs before scoring, so it removes semantic candidates too | `src/core/memory-search.ts:398-403`, `src/dsh/tool-bridge.ts:1187-1192`, `src/dsh/pre-step.ts:471-484` |
| Recall renders at most `policy.memoryLimit` rows (default 40) | `src/dsh/pre-step.ts:439-440`, `src/index.ts:1440` |
| The model cache is `<dirname(corpusDb)>/models` — for a corpus at `<dataDir>/memories.db` the assets must sit in `<dataDir>/models/` | `src/dsh/embedding-lane.ts:517-520`, `src/core/embedding-local.ts:306-308` |
| The FTS index tokenises `porter unicode61`, so seeded content must be ASCII words to produce FTS matches; Chinese text would give `ftsMatches = 0` and make `hybrid` unreachable | `src/core/corpus-store.ts:93-94` |

## I/O & Edge-Case Matrix

| Scenario | Expected behaviour |
|---|---|
| Assets absent, phone offline | embedder fails, lane logs `embed-failed`, search degrades to `fts`; gate must treat this as blocked, not pass |
| Assets present and hash-matching | no download attempt; first embed ≈ 0.9 s (T24 measurement) |
| No local space yet | gate logs `gate-closed`, then backfill bootstraps a space and writes rows |
| Seeded rows all rendered by the injected memory block | `ctx_memory search` suppresses every row the block renders *before* scoring, so the search returns 0 hits and proves nothing. Seed under an explicit identity the session does not use (`project: "git:t25-fixture"`) and search with the same `project` argument, so recall never renders those rows |
| Search returns `suppressedVisible > 0` | Expected when the block renders a row; the tool payload does not carry the counter, so read it from the journal or a read-only core query |
| Seeded identity differs from the session's | Backfill still covers it: `planBackfill` selects every active memory in the corpus, not just the session's project |
| Space exists, parity fails | `parity-fail`, search stays `fts`; gate records it as a failure of the local lane, not a pass |
| Query matches only FTS terms | `match=fts` is expected and proves FTS only; the lane is proven by a stored 1536-byte BLOB, not by the label alone |
| Query matches an FTS term of a vectorised row, `embedBackfill: false` | `match=hybrid`, and the vector came from `memory_embeddings` |
| `embedBackfill` left on (default) | `hybrid` is reachable with ZERO stored rows — this configuration must not be used for the gate |
| Row archived/expired between write and search | excluded by `status IN ('active','permanent')`; not a failure |
| Engine restart | rows and parity survive; a second backfill pass must not duplicate rows (PK on `memory_id, model_id`) |
| Restore run twice | second run must fail closed (`ALREADY_PRESENT_STOP`, this script's own code, raised when a checkpoint already exists), not silently rewrite the profile |
| Patch entry semantics | a `cordis.patch.yml` row's `config` is a **whole-entry replacement, not a deep merge** (`docs/dsh-plugin-config-ui-contract.md:263`). This run never rewrites an existing `magic-context-dsh` row: the install script refuses with `EXISTING_ROW_OR_UNSUPPORTED_PATCH_STOP` when one is present, so the user's own `memory.*`/`embedding.*` settings cannot be silently dropped. The original bytes and hash are snapshotted so `--restore` proves byte-identical recovery |

## Phases

- [ ] Phase 1 — Preconditions: `adb devices` shows the device; the tarball's SHA-256 and its
      sha512-base64 both recomputed and matched against `dist.integrity` from
      `npm view @elvisw/dsh-magic-context@0.18.0` (`dist.shasum` is SHA-1 and is recorded, not
      used as the SHA-256 claim); push tarball, install script, observe script and the three
      model assets.
- [ ] Phase 2 — Install: run `phone-t25-install.cjs` on the phone with a test-owned config block
      (`memory.vectorBackfill: true`, `memory.embedBackfill: false`, `memory.vectorBackfillLimit: 8`,
      `maintenance.intervalMs: 60000` — exactly on the 60 s floor — `embedding.provider: local`),
      restart the engine, confirm the receipt and that no plugin dependency existed before.
- [ ] Phase 3 — Seed: insert three ASCII memories through `ctx_memory action=write` in a test
      session, passing `project: "git:t25-fixture"` so they live under an identity the session's
      own recall block never renders (otherwise the A2 suppression would hide them from the very
      search this ticket uses as proof). Record the returned ids.
- [ ] Phase 4 — Backfill: wait for the maintenance tick, then read the corpus read-only and
      assert row count, `model_id`, BLOB width 1536; capture the `vector-lane` journal rows.
- [ ] Phase 5 — Retrieval: `ctx_memory action=search` with `project: "git:t25-fixture"` and a query
      whose tokens hit both the FTS index and the vectorised rows; require at least one
      `match=hybrid` or `match=semantic`. With `embedBackfill: false` the vector can only have come
      from `memory_embeddings`. A query that only tokenises into FTS matches proves nothing about
      the vector lane.
- [ ] Phase 6 — Restart: restart the engine, re-run the same search, re-read the corpus; no duplicate
      `(memory_id, model_id)` rows, no `parity-fail`.
- [ ] Phase 7 — Restore and report: `--restore`, verify original patch bytes, record evidence,
      write `acceptance-report.md` and `REPRODUCE.md`.
- [ ] Phase 6 — Restart: restart the engine, re-run the same search, re-read the corpus; no duplicate
      `(memory_id, model_id)` rows, no `parity-fail`.
- [ ] Phase 7 — Restore and report: `--restore`, verify original patch bytes, record evidence,
      write `acceptance-report.md` and `REPRODUCE.md`.

## Verification

Evidence must be machine-readable JSON plus a read-only SQLite dump; the report maps each row
of the I/O matrix and each ticket requirement to a named evidence file. Screenshots only for the
search result, since the terminal receipt is text.

Deliberate limits of this evidence:

- A `match=fts` result never counts as proof of the vector lane; it only shows FTS still works.
- The primitive probe from T24 (`phone-local-embed.json`) is **not** evidence for this ticket: it
  imported `lib/core/embedding-local.js` directly with a hand-made `cacheDir`.
- If the phone cannot reach HuggingFace and the assets were not pushed, the lane degrades to FTS and
  the gate must report blocked, not pass.

</frozen-after-approval>
