# T25 acceptance report — Android local-vector end-to-end

Status: **PASS** on the requirements below; the exclusions in the last section are part of the
result, not a footnote.

## Identity of what was tested

| Item | Value |
|---|---|
| Plugin | `@elvisw/dsh-magic-context@0.18.0`, the **published** registry artifact |
| Tarball | 4,087,402 bytes, SHA-256 `0ab7f5168bda13cf38db83c9af68067a14f5f78c764757ad80d73d0ce852aa30` |
| `dist.integrity` (sha512/base64) | `AHUrlgbHdj1Bqf8xxaO/9W5cEaoOopiHy7hBmQfVFQ8hx0Qf46E3HD5SIH55Co4qsEOZgTX9/4gEOCv4JhayTw==` — recomputed locally, identical |
| `dist.shasum` | `73f39de5185622f74046be396cba1aedcc000a86` (SHA-1; recorded, not used as the SHA-256 claim) |
| Device | Xiaomi `25102RKBEC`, Android 17 (serial not recorded) |
| Host | dsh-go `1.1.0` (`versionCode 11150838`), DSH `0.2.2-rc.1`, Node `24.22.1`, engine LOCAL |
| Embedder | in-package MiniLM WASM, 384 dims, offline |
| Isolation | `dataDir` = `/root/.dsh/dsh-go/mc-t25-local-vector/data`, corpus `…/memories.db`, assets `…/models/` |

## Requirement → evidence

### 1. Isolation and recovery — PASS

Install receipt (`evidence/phone-install.json`): `status: installed`, `dataDir` and `corpusDb` both
inside the test-owned directory, `runtimeVerified: false` at that point.

The restore that closes **this** run is `evidence/phone-restore.json`:
`status: restored`, `pluginRemoved: true`, `originalPatchRestored: true`,
`restoredSha256 === originalSha256 === fb3ba638958c631944e9a3cffc4bebe38de35fc5379a5362d701d5bb2c618796`,
`checkpointCleared: true`. Those values are the script's own post-conditions, checked inside the
App's Linux environment where the profile actually lives; `adb shell` cannot see `/root/.dsh`, so no
independent shell check is offered, and none is claimed.

Note what that also means: **the corpus was deleted with the test state**, so the stored rows can no
longer be read back. That is why the labels are corroborated by records taken *before* the restore
(`evidence/phone-journal.json`, `evidence/phone-after-backfill.json`) and by
`evidence/retrieval-notes.md`, which explains the derivation. The FTS half of each label is still
re-derivable from the fixture text (Requirement 5); the stored-vector half is not.

The earlier cycle's restore receipt was used only to find the `checkpoint.json` bug — it is not
presented as evidence for this run.

Two defects in my own gate scripts were found and fixed by running them, not by re-reading them:

- `--restore` never cleared `checkpoint.json`, so the next install stopped on
  `ALREADY_PRESENT_STOP`. Fixed, then proved by the receipt above reporting `checkpointCleared: true`.
- `phone-t25-seed.cjs` called `writer.status()`, but `MemoryWriter.status` is a property
  (`src/core/memory-write.ts:299`). The seed failed before writing anything, so no partial state.

### 2. Published artifact — PASS

The install script recomputes both SHA-256 and sha512-base64 from the pushed tarball and refuses to
continue on mismatch (`CANDIDATE_MISMATCH`, `CANDIDATE_SHA512_MISMATCH`). The recorded sha512 equals
the registry `dist.integrity` string byte for byte.

### 3. Local model without network — PASS

`evidence/phone-install.json` records all three assets with `sha256Match: true`
(`model.onnx` 90,387,606 B, `tokenizer.json` 711,661 B, `tokenizer_config.json` 366 B). That
boolean is a device-side result: `phone-t25-install.cjs` copies each asset into `…/data/models/`,
re-reads the copy, recomputes its SHA-256 and throws `ASSET_MISMATCH_<name>` on any difference — so
the run could not have reached `status: installed` with a mismatched file. It does not record the hex
digest, though, so on its own a reviewer cannot compare against the pin.

`evidence/phone-artifacts.json` records the measured hex digests, but read it with the right
provenance: **those four files were hashed on the PC from the copies staged before the push, not read
back off the device.** The record states this in its `method` and `provenance` fields. So the file
establishes that the bytes sent to the phone matched the pinned constants. It does not establish what
arrived on the phone — that half rests on the install script's own re-read and its recorded byte
counts, described in the paragraph above. Neither half is a device-side hex listing, and this packet
contains no such listing.

| File | bytes | SHA-256 (PC-side, pre-push copy) | matches pin |
|---|---|---|---|
| `model.onnx` | 90,387,606 | `759c3cd2…469c46e` | yes |
| `tokenizer.json` | 711,661 | `da0e7993…d2c62a0` | yes |
| `tokenizer_config.json` | 366 | `9261e7d7…6172ab3` | yes |
| tarball | 4,087,402 | `0ab7f516…852aa30` | yes, and sha512 = `dist.integrity` |

`allOk: true`. Read it as one half of the claim: the PC-side hashes show the source matched the pins.
The other half is the install script's device-side re-read described above — `status: installed` could
not have been reached with a mismatched copy.

The backfill produced 384-dim vectors, which is only possible if the real ONNX model ran. The
observer dump (`evidence/phone-after-backfill.json`, boot rows 2–8) shows no asset-download line, but
those rows are truncated mid-JSON at 400 characters, so they cannot be inspected for one either way.
Nothing in this packet claims the phone never touched the network; the hash match plus the 384-dim
width is what the claim rests on.

### 4. Backfill by the maintenance tick — PASS

`evidence/phone-after-backfill.json`:

```
embeddingSpaces: [{ model_id: "embedding-provider:adc36d64c8cb774f10f8348390e75fea", rows: 3, bytes: 1536 }]
embeddings: ids 1,2,3 — each 1536 bytes
```

Journal (`evidence/phone-journal.json`):

```
[10] shared-space gate: no-sample          {"modelId":"embedding-provider:adc36d64…"}
[26] backfill: +3 vector(s) in the dominant space
     {"outcome":"backfill","created":3,"present":0,"skipped":0,"failed":0,"total":3,"batch":3}
```

1536 = 384 × 4, so each row is one fp32 vector of the expected width.

### 5. Retrieval through the mixed lane — PASS

Raw tool receipt, quoted by the operator from the phone UI. **Provenance caveat:** no script
captured this text, so it is operator testimony rather than machine-collected evidence. It is
corroborated independently by the adapter's own journal rows below, which the model cannot write and
which record the same identity, query and hit count, and by a deterministic re-derivation of the
labels from the recorded fixture text (see the last subsection).

```
Found 3 results for "upload retry pipeline":

[1] [memory] score=0.76 id=2 category=CONSTRAINTS match=hybrid
t25 fixture beta: the upload retry budget must never exceed three attempts in the pipeline

[2] [memory] score=0.58 id=1 category=ARCHITECTURE match=hybrid
t25 fixture alpha: the deploy pipeline retries a failed upload three times before giving up

[3] [memory] score=0.30 id=3 category=CONFIG_VALUES match=semantic
t25 fixture gamma: the deploy pipeline timeout is set to thirty seconds
```

Corroborated by the adapter's own journal, which the model cannot write:

```
[36] ctx_memory search: search: 3 result(s)
     {"tool":"ctx_memory","action":"search","identity":"git:t25-fixture",
      "explicitProject":"git:t25-fixture","query":"upload retry pipeline","hits":3,"ms":42,"ok":true}
[47] … hits:3, ms:51
[68] … hits:3, ms:780   (the call made after the restart)
```

Row 3 being `match=semantic` and not `hybrid` is expected and useful: its text contains neither
"upload" nor "retry", so FTS cannot match it and only the vector lane can bring it back. That is
the semantic channel proving itself independently of the keyword channel.

`memory.embedBackfill` was `false` for this run (`evidence/phone-install.json`), so a `hybrid` label
cannot come from the in-memory fill lane — the vector had to be a stored row.

**Label re-derivation (`evidence/out-fts-rows.txt`).** Because the corpus was deleted by the
restore, the labels were recomputed from the recorded fixture text using the same SQLite FTS5
module, the same `tokenize='porter unicode61'` and the same two query builders
(`src/core/memory-search.ts:118-134,318-333`):

```
{"hybrid":[1,2],"semantic":[3],"fts":[]}
sanitize: "upload" "retry" "pipeline"  ->  ids [1,2]
```

Read this for exactly what it is: **only the FTS half was recomputed.** The probe hard-codes
`vectorPresent: true` for all three rows, taking that half from `evidence/phone-after-backfill.json`
(three rows, each 1536 bytes, one `embedding-provider:` model id). The two halves together yield the
same partition the tool reported. The zero-length `fts` array is the load-bearing part — if the
vector lane had not been involved, row 3 would have been absent from the results entirely rather
than ranked lowest.

### 6. Holds after a restart — PASS

```
[67] shared-space gate: parity-pass
     {"outcome":"parity-pass","modelId":"embedding-provider:adc36d64c8cb774f10f8348390e75fea","parity":1}
[68] ctx_memory search: 3 result(s)   ms:780
```

`parity: 1` is the recorded value of `Number(cosineSimilarity(...).toFixed(6))` for a re-embedded
sample against its stored vector (`src/dsh/memory-lane.ts:348,353-355`). It means the cosine
similarity rounded to six decimals is exactly 1, which clears the `>= 0.99` gate. Cosine is
scale-invariant, so this is **not** a byte-identity claim — that is not what is measured.

The duplicate check is structural rather than sampled: `memory_embeddings` is declared with
`PRIMARY KEY(memory_id, model_id)` (`src/core/corpus-store.ts:107-111`), so a duplicate row cannot
exist. The space report is `rows: 3` with three distinct `memory_id` values — but note it comes from
`evidence/phone-after-backfill.json`, which was taken **before** the restart (766,628 ms before the
`parity-pass` row), so it describes the pre-restart store. `evidence/phone-after-search.json`
(`at` 13:50:00.438Z) is also pre-restart: its journal selection stops at id 40, before `parity-pass`
at id 67. **No post-restart corpus read exists in this packet.** What the restart proves is the
gate outcome and a successful search after it, not a re-measured row count.

The `no-sample` at `[10]` is not a failure and not stale: the gate result is memoised per process
(`src/dsh/memory-lane.ts:283,295`), and the first process had no sample because the corpus was empty
when it mounted. `parity-pass` therefore has to come from a later process. There is no `boot` row
between `backfill` (id 26) and `parity-pass` (id 67) because `phone-t25-journal.cjs` selects only
`kind IN ('tool-call','vector-lane')` — it never queries boot rows, so their absence is a property of
the probe, not of the store. The ordering evidence is the 904,658 ms gap between the two rows and the
fact that `[68]` was made after the operator reported the restart; the 780 ms latency is recorded as
an observation, not as an explanation.

## What is not verifiable from this packet

- Any post-restart corpus query. `phone-after-backfill.json` and `phone-after-search.json` were both
  taken before the restart; no post-restart read of `memories` or `memory_embeddings` exists here.
- The rendered tool text, which was operator testimony, corroborated by the journal and by the FTS
  re-derivation described in Requirement 5.
- The exact contents of the pre-restart profile patch, which is described only by its SHA-256.
- Device-side hex digests of the pushed artifacts. The pushed copies were deleted by step 9 before the
  packet was written, and the install script records only booleans plus byte counts. The hex digests in
  `evidence/phone-artifacts.json` are PC-side measurements of the pre-push staging copies.

`phone-t25-artifacts.cjs` was written for the device's App terminal and is kept in the packet for
reproduction, **but it was never run on the device.** The pushed copies were deleted at the end of the
run (`rm -rf /sdcard/Download/dsh-mc-t25`, step 9 of `REPRODUCE.md`), so the committed
`evidence/phone-artifacts.json` cannot come from them — it is the PC-side hash of the pre-push staging
copies, as its `method` and `provenance` fields say.

## Defects found in the product

None. The product behaved as specified on each attempt. The two failures in this run were both in my
own harness scripts (checkpoint cleanup, and a property read as a method).

About "three calls returned identical results": the journal records `hits: 3` for all three, but only
the operator-pasted text carries the per-row labels, and that was pasted for the calls shown above.
What the journal proves is that each call returned three hits under the same identity and query; it
does not prove the rendered text was byte-identical between calls, and this report does not claim
that.

## Deliberately not covered

- **Remote embedding credentials on Android.** Blocked upstream: dsh-go 1.1.0's bridge does not
  return `credentialRef`, so the native secret field is disabled
  ([ccch1mneyyy/dsh-Go#1493](https://github.com/ccch1mneyyy/dsh-Go/issues/1493)). Nothing here claims
  the credential path works on the phone.
- **iOS.** No public build exists.
- **Long-history throughput.** The corpus is three rows; no timing or scaling claim is made beyond
  recording the observed 42/51/780 ms search latencies.
- **Real vendor traffic.** The embedder is local and offline by design in this run.
- **Chinese keyword retrieval.** Not exercised here, but measured separately and known-weak:
  `porter unicode61` does not segment CJK (`src/core/corpus-store.ts:93-94`). The probes kept in
  `evidence/` show it: `out-fts-vocab.txt` records the query "部署" tokenising to nothing while a whole
  Chinese sentence becomes a single token, and `out-zh-embeddings.txt` records the real MiniLM
  cosines for Chinese paraphrases (0.73/0.73/0.86) against unrelated text (0.54/0.62) and a
  cross-language pair (0.02). These are supporting measurements for a separate decision, not part of
  this gate's pass criteria.
- **Full Web/desktop parity.** This run only used the Android surface.

## How to reproduce

`REPRODUCE.md` in this directory lists the exact commands, the asset hashes and the restore path.
