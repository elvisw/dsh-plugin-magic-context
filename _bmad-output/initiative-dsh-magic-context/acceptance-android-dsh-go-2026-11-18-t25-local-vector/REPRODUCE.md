# T25 — reproduce the Android local-vector gate

Every path below is on the phone unless marked `[PC]`. The commands run in the App's own Linux
terminal (`root@localhost`), not in `adb shell`.

## 0. Preconditions

- dsh-go `1.1.0`, engine backend **LOCAL**, DSH `0.2.2-rc.1`, Node `24.22.1`.
- The `web` profile has no `@elvisw/dsh-magic-context` dependency and no `magic-context-dsh` row
  before the run; the install script refuses otherwise.
- Free space for a 90 MB model plus a small corpus.

## 1. Published artifact

```sh
[PC] npm view @elvisw/dsh-magic-context@0.18.0 dist.integrity dist.shasum
# integrity = sha512/base64, shasum = SHA-1
```

Recorded values for this run:

| Field | Value |
|---|---|
| tarball bytes | 4,087,402 |
| SHA-256 | `0ab7f5168bda13cf38db83c9af68067a14f5f78c764757ad80d73d0ce852aa30` |
| `dist.integrity` | `AHUrlgbHdj1Bqf8xxaO/9W5cEaoOopiHy7hBmQfVFQ8hx0Qf46E3HD5SIH55Co4qsEOZgTX9/4gEOCv4JhayTw==` |
| `dist.shasum` (SHA-1) | `73f39de5185622f74046be396cba1aedcc000a86` |

`dist.shasum` is SHA-1. The SHA-256 above is computed locally from the downloaded tarball; the
sha512 is the one that can be compared byte-for-byte with `dist.integrity`.

## 2. Push the artifacts

```sh
[PC] adb -s <serial> shell mkdir -p /sdcard/Download/dsh-mc-t25
[PC] adb -s <serial> push <tarball>      /sdcard/Download/dsh-mc-t25/
[PC] adb -s <serial> push phone-t25-install.cjs /sdcard/Download/dsh-mc-t25/
[PC] adb -s <serial> push phone-t25-seed.cjs    /sdcard/Download/dsh-mc-t25/
[PC] adb -s <serial> push phone-t25-observe.cjs /sdcard/Download/dsh-mc-t25/
[PC] adb -s <serial> push phone-t25-journal.cjs /sdcard/Download/dsh-mc-t25/
[PC] adb -s <serial> push model.onnx tokenizer.json tokenizer_config.json /sdcard/Download/dsh-mc-t25/  # into dsh-mc-t25/models
```

Asset hashes pinned by `EMBEDDING_ASSETS` (all three were verified on the device):

| Asset | Bytes | SHA-256 |
|---|---|---|
| `model.onnx` | 90,387,606 | `759c3cd2b7fe7e93933ad23c4c9181b7396442a2ed746ec7c1d46192c469c46e` |
| `tokenizer.json` | 711,661 | `da0e79933b9ed51798a3ae27893d3c5fa4a201126cef75586296df9b4d2c62a0` |
| `tokenizer_config.json` | 366 | `9261e7d79b44c8195c1cada2b453e55b00aeb81e907a6664974b4d7776172ab3` |

## 3. Install into an isolated test config

```sh
node phone-t25-install.cjs
```

The script appends one test-owned block to `cordis.patch.yml`, pointing `dataDir` and
`memory.dbPath` at `$DSH_HOME/dsh-go/mc-t25-local-vector/data/`, setting `embedding.provider: local`,
`memory.vectorBackfill: true`, `memory.vectorBackfillLimit: 8`, `memory.embedBackfill: false` and
`maintenance.intervalMs: 60000` (exactly the floor). It copies the three assets into
`…/data/models/` and verifies each hash before continuing. It refuses if the plugin is already
installed, if the patch is not a simple list, or if a `magic-context-dsh` row already exists.

`embedBackfill: false` is required, not cosmetic: with it on, the search lane embeds FTS candidates
that have no stored vector and still labels them `hybrid` (`src/core/memory-search.ts:369-395`), so
the criterion could pass with zero backfilled rows.

Restart the engine, not a reset.

## 4. Seed three memories

```sh
node phone-t25-seed.cjs
```

Writes three ASCII rows under the synthetic identity `git:t25-fixture` through
`openMemoryWriter().writeMemory()` — the same writer `ctx_memory action=write` uses
(`src/dsh/tool-bridge.ts:1233`). The identity is synthetic on purpose: `action=search` suppresses
rows the injected recall block already renders (`src/core/memory-search.ts:414-417`), before
scoring, so seeding under the session's own identity would make the search return zero hits for
reasons unrelated to vectors. `git:<name>` is a first-class identity form
(`src/dsh/tool-bridge.ts:1079-1089`).

Expect `{"status":"ok","ids":[1,2,3],…}`.

## 5. Backfill

Wait for one maintenance tick (60 s), then:

```sh
node phone-t25-observe.cjs after-backfill
```

Expect `memories: 3`, `embeddings: 3`, and one space with `model_id` beginning
`embedding-provider:` and `bytes: 1536` (384 float32 components).

## 6. Search — the actual proof

In a chat session, have the agent call the tool and paste the raw text:

```
ctx_memory(action=search, project="git:t25-fixture", query="upload retry pipeline")
```

Require at least one `[memory] … match=hybrid` line. A result that is only `match=fts` proves FTS
works and proves nothing about the vector lane.

Do **not** expect a `semanticMatches` field: the tool returns only the rendered text and the hit
count (`src/dsh/tool-bridge.ts:1206`), and the counter is dropped at `src/dsh/memory-lane.ts:520`.
The vector claim rests on the 1536-byte stored BLOB plus `embedBackfill: false`.

## 7. Restart and re-verify

Restart the engine, run the same search, then:

```sh
node phone-t25-journal.cjs
```

Expect a NEW `shared-space gate: parity-pass` row whose timestamp is later than the `backfill` row.
The `no-sample` row from the first process is expected and is not the proof: the gate result is
memoised per process (`src/dsh/memory-lane.ts:283,295`), and the first process mounted an empty
corpus.

To re-derive the lane labels after the corpus is gone (it is deleted by `--restore`):

```sh
[PC] node evidence/probe-fts-rows.cjs
```

Expect `{"hybrid":[1,2],"semantic":[3],"fts":[]}` and a `sanitize` attempt
`"upload" "retry" "pipeline" -> ids [1,2]`. This runs the same bundled SQLite FTS5 module with the
same `porter unicode61` tokenizer and the same query builders on the fixture text the seed wrote, so
it is a genuine re-derivation rather than a restatement.

Optional, and only while step 9 has not yet removed the pushed files: `node phone-t25-artifacts.cjs` on
the device would re-hash the four files still under `/sdcard/Download/dsh-mc-t25` and print a
device-side hex listing. **This was not done for the committed evidence.** The files were deleted by
step 9 before the packet was written, so the committed `evidence/phone-artifacts.json` is a PC-side
hash of the pre-push staging copies instead; see its `method`/`provenance` fields.

## 8. Collect evidence

```sh
[PC] adb -s <serial> pull /sdcard/Download/dsh-mc-t25/phone-install.json          evidence/phone-install.json
[PC] adb -s <serial> pull /sdcard/Download/dsh-mc-t25/phone-after-backfill.json   evidence/phone-after-backfill.json
[PC] adb -s <serial> pull /sdcard/Download/dsh-mc-t25/phone-journal.json          evidence/phone-journal.json
```

Normalise line endings to LF before hashing:

```sh
[PC] python -c "import pathlib,sys;[p.write_bytes(p.read_bytes().replace(b'\r\n',b'\n')) for p in pathlib.Path('evidence').glob('*.json')]"
```

## 9. Restore

```sh
node phone-t25-install.cjs --restore
```

Expect `status: restored`, `pluginRemoved: true`, `originalPatchRestored: true`,
`restoredSha256 === originalSha256`, and `checkpointCleared: true`. The checkpoint is removed only
after the profile is proven restored; a failed restore leaves it in place so the command can be
re-run. Restart the engine afterwards.

Then remove the pushed files:

```sh
rm -rf /sdcard/Download/dsh-mc-t25
```

## Known limits

Not covered by this gate: remote embedding credentials on Android (blocked by dsh-go bridge issue
#1493), iOS, long-history throughput, real vendor traffic, Chinese keyword retrieval, and the
desktop/Web surface.
