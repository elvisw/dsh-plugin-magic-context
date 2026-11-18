# T25 — what each label can and cannot prove

This note exists because the strongest-looking evidence in this gate is also the weakest to
verify: the `match=` labels came back as operator-pasted text, and the corpus that produced them was
removed when the test profile was restored.

## Provenance of each artefact

| Artefact | How it was produced | Can a reviewer trust it? |
|---|---|---|
| `evidence/phone-install.json` | written by `phone-t25-install.cjs` on the device | yes — script output, not prose |
| `evidence/phone-seed.json` | written by `phone-t25-seed.cjs` after three writes | yes — records `ok:true, id:1..3` |
| `evidence/phone-after-backfill.json` | written by `phone-t25-observe.cjs` from a read-only SQLite query | yes |
| `evidence/phone-journal.json` | written by `phone-t25-journal.cjs` from a read-only SQLite query | yes |
| `evidence/phone-restore.json` | written by `phone-t25-install.cjs --restore` | yes |
| the `Found 3 results … match=hybrid` block | **pasted by the operator from the phone UI** | testimony; corroborated, see below |

## Why the pasted receipt alone would not be enough

No script captured the rendered tool text, so on its own it is a human report. Two independent
records carry the same claim:

1. **The adapter's journal.** `tool-bridge.ts:1064` writes a `tool-call` row on every invocation.
   `evidence/phone-journal.json` holds three of them with `tool: ctx_memory`, `action: search`,
   `identity: git:t25-fixture`, `query: upload retry pipeline`, `hits: 3`, `ok: true` — at
   `ms: 42`, `51`, `780`. The model does not write these rows; the plugin does.

2. **The corpus itself.** The label is a function of two facts: whether the row is an FTS match for
   the query, and whether it has a stored vector under the query's model id
   (`src/core/memory-search.ts:421-430`):

   | FTS hit | stored vector | label |
   |---|---|---|
   | yes | yes | `hybrid` |
   | no | yes | `semantic` |
   | yes | no | `fts` |
   | no | no | not returned |

   The stored-vector half is recorded: `phone-after-backfill.json` lists three rows each 1536 bytes
   under one `embedding-provider:` model id, so all three rows are vector-present.

   The FTS half was recomputed after the corpus was deleted (`evidence/out-fts-rows.txt`), using the
   same bundled SQLite, the same `tokenize='porter unicode61'`, the same two query builders, and the
   exact fixture text the seed wrote. Result:

   ```
   {"hybrid":[1,2],"semantic":[3],"fts":[]}
   sanitize: "upload" "retry" "pipeline"  ->  ids [1,2]
   ```

   That is the same partition the tool reported, derived without the tool. Row 3 misses FTS because
   its text contains neither "upload" nor "retry", which is also why it ranks last.

## Why `memory.embedBackfill: false` is the load-bearing setting

`src/core/memory-search.ts:369-395` will embed FTS candidates that have no stored vector, in memory,
and the merge at `:421-427` still labels them `hybrid`. With the default `true`, the gate would pass
with zero backfilled rows. `evidence/phone-install.json` records `embedBackfill: false`, and the
journal's `backfill` row records `created: 3`, so the vectors the search used were stored rows.

## Why the fixtures are near-duplicates on purpose

Rows 1 and 2 say the same thing in different words. That is deliberate: a semantic lane is only
interesting when two rows are paraphrases. Three unrelated sentences would score high on keyword
overlap and prove nothing about vectors.

The apparent contradiction the agent flagged (「重试 3 次」 vs 「最多 3 次尝试」) is a property of the
fixture text, not a finding about the plugin. The fixture is not meant to be read as a real
constraint.

## Why `project: "git:t25-fixture"` is legitimate

`src/dsh/tool-bridge.ts:1079-1089` accepts an explicit `project` verbatim when it starts with `git:`
or `dir:`; only a plain path is resolved. `WriteMemoryInput.identity` is documented as `git:<sha>` /
`dir:<hash>`, so a synthetic `git:t25-fixture` is a first-class identity, not a malformed path that
happened to work.

It is synthetic because `ctx_memory action=search` suppresses rows the injected recall block already
renders (`src/core/memory-search.ts:414-417`), before scoring. Seeding under the session's own
identity would make the recall block render all three rows and the search return zero hits — a
failure that has nothing to do with vectors.

## Score arithmetic, for checking the label

`src/core/memory-search.ts:34-36,421-430`:

- `hybrid` = `0.7 × cosine + 0.3 × reciprocal-rank`
- `semantic` = `cosine × 0.8`
- `fts` = `reciprocal-rank × 0.8`

A top-ranked `hybrid` of 0.76 satisfies `0.7c + 0.3r = 0.76` with `r = 1`; `r` is a normalized
reciprocal-rank term, so `r = 1` is the best possible rank and is what a top hit gets. That leaves
`c = 0.657`, not `0.8`. The 0.8 figure only appears if the FTS term were zero, which by definition
would not be a hybrid hit. So the score is consistent with `hybrid` at a plausible cosine, and the
label plus the two independent records above are what carry the claim — not the arithmetic.