# T3 acceptance — post-Historian raw retrieval (#14)

Status: **host gate passed**, with the caveats listed below. This report covers the
T3 `message` locator and the T2 tag regression after a real Historian publish.
It does not claim T4 (`/ctx-flush`), T5 (retention), or V1.1 (`start`/`end`/`verbose`).

## 1. Scope and environment

- Isolated DSH `0.2.2-rc.1`, Node `v24.21.0`, real `deepseek-official/deepseek-flash`.
- Fresh isolated root `%TEMP%\opencode\dsh-mc-t3-20261114-161041`; no daily DSH
  profile, session store, or plugin database was used.
- T3 tarball `dsh-plugin-magic-context-0.11.2.tgz`, SHA-256
  `de0ed8a9d7c8d0528c6ce2e9258986b24203f889b873bcda66f210e845efea2d`.
- Installed `lib/dsh/tool-bridge.js` and `lib/dsh/seams.js` match the locally
  built files byte-for-byte (`7bd3d7…` and `ee7221…`); the installed lib exposes
  `message` and `toolResultAt`.
- Build revision `05871a2`; the product diff was committed before the build, so
  the tarball is the T3 product. `preflight.git_diff_sha256` is the empty-diff
  SHA-256 because the host harness was still untracked at prepare time; it does
  not cover those harness files. Product identity rests on the tarball SHA and
  the installed/built `tool-bridge.js` + `seams.js` hashes, not on that field.

### Accelerated test profile (disclosed)

`historianEnabled:true`, `executeThreshold:0`, `historianMinNodes:1`,
`historianProtectedNodes:1`, `historianMinBudgetTokens:500` (default 5000),
`historianTimeoutMs:120000`, host `tool-result-pruner` disabled,
`registerCompactionEngine:false`, `maintenance.enabled:false`, memory machine/user
lanes off, read-only, approval policy `never`. The 500-token historian trigger is
a test-only acceleration; production defaults were not changed. The overlay is
`evidence/overlays/historian.yml`; the plugin `boot` line in
`evidence/historian-budget-500.json` records the effective `500` for the wait
host (the earlier seed/grow boots used the default `5000`, which is why the
fixture was grown before the wait). `--dump-config` does not expose the plugin's
policy object, so the boot journal is the direct proof. The E1/E2 hosts
used a second overlay with `historianEnabled:false` and `executeThreshold:100`;
`publishCompartments` still runs, so the empty-unlanded precondition below is the
proof that no draft could be published, not the disabled flag.

## 2. Method

1. Seed a fresh session: read `fixture.txt`, drop its actual tag, read the
   synthetic historian fixture. The model made extra `ctx_reduce` calls; the
   target identity was resolved from the observer, not from the expected prompt.
   Because those calls reclaimed the large fixture output, one `t3-grow-clean`
   step read the synthetic fixture twice before the wait; this is disclosed
   rather than hidden, and the target tag/seq were still taken from the observer.
2. Wait with real Historian until a `[compacted §C1§]` publish event covers the
   landed placeholder (`sourceEventSeqs` contains the placeholder seq).
3. Settle with Historian off; verify from the plugin DB that the target
   compartment is landed and that **zero** unlanded compartments remain
   (`landed_event_seq IS NULL AND superseded=0 AND landed_reason IS NULL`).
4. E1: independent host, resume, call only `ctx_expand {tag:"<actual>"}`.
   E2: independent host, resume, call only `ctx_expand {message:"<original seq>"}`.
   Each run has its own pre/post DB snapshot. The pre snapshot is taken before
   the E1/E2 host launch, after the settle host; it can include earlier `pass`
   rows from the settle/pre-step lanes, but the compared invariants are
   compartments, publish/historian rows, pending drops, and the original call.
   The observer window starts at the
   `ctx_expand` `tool/result`; the DB post snapshot is taken at host exit, which
   is later than the possible second-step pre-step. That is stricter than a
   snapshot before the next pre-step for mutation checks: any publish or
   compartment write in that later window would still be caught, and the
   observer shows no `[compacted]` event after the expand result.
5. Parse observer `events` (not `surface`) for the original, placeholder, and
   publish events; record source file/line and JSON hashes across snapshots.
6. Compare the target `compartments` row fields, the full compartment hash, the
   `historian` and `compartment-published` journal counts, the original
   `tool/call`/`tool/result` counts, the fixture SHA, and the old tag/drop state.

## 3. Result

| Item | Result |
|---|---|
| Target | tag `1`, original event seq `24`, placeholder seq `34`, publish event seq `383`, compartment `C1`, `landed_event_seq=383` |
| Publish evidence | exactly one `[compacted §C1§]` event whose `sourceEventSeqs` contains `34`; `pass` journal id `304` has `published:[1]` and `historianStarted:true` |
| Precondition | `unlanded` = 0 before E1; target row landed at `383` |
| E1 `tag:"1"` | host exit `0`, `completed`; result seq `429`; outer tag stripped → byte-identical to original seq `24` |
| E2 `message:"24"` | host exit `0`, `completed`; result seq `450`; outer tag stripped → byte-identical to original seq `24` |
| Locator shape | E1 input only `{"tag":"1"}`; E2 input only `{"message":"24"}`; no `tags`/`tag` in E2 |
| Compartment | selected-field hash unchanged (`db_state` fields: tier/facts/events/importance/covered/baseline/landed/superseded; `session_id`/`created_at` are not in the hash); specified fields unchanged; no new compartment row |
| Publish/journal | no new `compartment-published` event; `historian` journal count 6→6; `usage_records` grows only from the agent’s own steps; the extra `pass` rows are agent pass lanes, not Historian runs |
| Re-execution | original call has one `tool/call`, two `tool/result` (original + placeholder), no new result in either window |
| Old tag | `landed_event_seq=34`, exactly one pending row for tag `1`, no new pending row |
| Source integrity | original, placeholder, publish event JSON hashes stable across observer snapshots; fixture disk SHA unchanged |
| Isolation | boot `dbPath` points inside the T3 root; `dataDir`/`outDir` and driver paths resolved to the new root |

The analyzer is `analyze_t3_evidence.py`; its full machine-readable result is
`evidence/t3-analysis.json`.

## 4. What this does and does not prove

- **Proved (host):** with a real Historian publish covering the landed
  placeholder, the old tag and the original DSH log-event seq both return the
  original as a new tool result, byte-identically, without re-running the tool,
  rewriting the compartment, or creating a second publish. The stored delivered
  text itself starts with the original `§1§` prefix; “byte-identical” means after
  removing only the new outer `§N§ ` tag, that stored text (including its own
  prefix) is unchanged, not that the tag prefix is stripped from the payload.
- **Proved (host):** `message` resolves a DSH log seq through the same
  call-level drop gate and returns the original; E2 used only `{"message":"24"}`.
- **Unit/integration only (not host):** `message` mutual exclusion with
  tag/tags, placeholder-seq input, emergency drops, active/pending, deleted tag
  rows, missing source, invalid syntax, and all-or-nothing failure shapes. The
  host did not submit a tag+message conflict or those failure cases.
- **Not proved:** `/ctx-flush`, retention, `start`/`end`/`verbose`, cross-session
  lookup, or arbitrary history browsing. The final host used one synthetic
  fixture, one model route, and one target session (`e078…`). An earlier attempt
  (`d3d6…`) also reached publish `160` and E1/E2 `284/305` and passed its own
  analysis, but was superseded by `e078…` because the earlier seed had a failed
  `historian-fixture.txt` read and extra model drift; the earlier attempt’s raw
  state/analysis remains only in the isolated root and is not part of this
  bundle. The final seed also made extra `ctx_reduce` calls (disclosed above);
  they did not change the target identity but mean the session is not a minimal
  two-tool transcript.
- **Boundary:** `message` is not a general history browser. It accepts a seq for
  an already dropped item only; `[compacted §C…§]` is not a `tool/result` and is
  refused. Once the raw event is gone, no summary text is substituted.

## 5. Evidence index

- `evidence/preflight.json` — build, tarball, both lib hashes, root, nonce.
- `evidence/t3-analysis.json` — checks, target identity, E1/E2, window comparisons.
- `evidence/t3-state.json` — raw pre/post DB rows and the E1/E2 window objects
  used to produce the analysis.
- `evidence/t3-seed.driver.json`, `t3-wait-1.driver.json`, `t3-settle.driver.json`,
  `t3-e1-tag.driver.json`, `t3-e2-message.driver.json`, `t3-grow-clean.driver.json`
  — host tool calls/results. No `t3-wait-2/3/4` are in the final bundle; those
  files were from the superseded attempt and were removed.
- `evidence/overlays/historian.yml`, `evidence/overlays/settle.yml` — the exact
  test-profile acceleration used by the seed/wait and E1/E2 hosts.
- `evidence/historian-budget-500.json` — plugin `boot` journal lines proving the
  effective `historianMinBudgetTokens=500` in the wait host.
- `evidence/t3-observer-extract.json` — compact observer extract: every snapshot's
  metadata plus the original, placeholder, publish, and E1/E2 event JSON; the raw
  ~91 MB observer file stays outside the repository at the isolated root.
- `evidence/unit-test.txt`, `evidence/typecheck.txt` — the unit/typecheck evidence
  for the unit-only claims above.
- `prepare_t3_host.py`, `run_t3_scenarios.py`, `analyze_t3_evidence.py`,
  `extract_t3_observer.py` — reproducible harness. The scripts hard-code the
  isolated T2/T3 roots and use `isolated_env`; they do not implement a runtime
  guard against a daily profile. The root/pointer and the `boot dbPath` check are
  the isolation evidence.
