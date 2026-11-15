# 0.12.2 combined host regression

Date: 2026-11-15
Ticket: `story-combined-host-regression-0.12.2.md` (id 10)
Verdict: **PASS WITH CAVEATS for the six declared chains**. The independent
read-only audit returned **PASS WITH CAVEATS** with no Critical; its five fixes
and five suggestions were applied in this revision (see §13). The registry
artifact, the recovery lifecycle, the post-Historian `tag`/`message` retrieval,
the real `ctx-flush` command path, the empty-embedding-space vector bootstrap
(the final session had five memories but no embeddings), and the config-only
`historian.reasoningEffort` dump were exercised on the same
installed plugin version. The report does not claim a clean first-writer run in
the final vector session, a TUI keystroke path, or runtime proof that the
configured effort reached the provider.

## 1. Artifact and isolation

| Item | Value |
|---|---|
| Package | `@elvisw/dsh-plugin-magic-context@0.12.2` |
| Registry tarball | `https://registry.npmjs.org/@elvisw/dsh-plugin-magic-context/-/dsh-plugin-magic-context-0.12.2.tgz` |
| Registry dist-tags | `latest: 0.12.2`, `bootstrap: 0.0.0-bootstrap.0` |
| `dist.integrity` | `sha512-1VW2Ev0tuMZsaPVnEyEbh6CfTKDyVeDJZoAyijxrolfqILuusltlldNuI6+ar4Rsgylc9nGwpQYz3htXIOj7NQ==` |
| `dist.shasum` | `2cf0581b3dc5de03143bc88a995d422bbc459c12` |
| Tarball SHA-256 | `d1ec72bc147cc22cee7a3c68b7d39a1636a8c7febed4c003f48b5e60e4470a60` |
| Tarball SHA-1 | `2cf0581b3dc5de03143bc88a995d422bbc459c12` (matches registry shasum) |
| `gitHead` | `1d1dc4fe2bc7d7cf9083b0cc50cf76298d5bf118` |
| Provenance | SLSA provenance v1 present in the preflight `npm view` (`evidence/preflight.json`, `npm_view.dist.attestations`) |
| Host | `@deepseek-ai/dsh@0.2.2-rc.1` with Node `v24.21.0` (`evidence/host-version.txt`) |
| Model route | `deepseek-official/deepseek-flash` |
| Install path | `dsh plugin add @elvisw/dsh-plugin-magic-context@0.12.2` |
| Profile dependency | `0.12.2` (recorded in `evidence/preflight.json`) |
| Isolated root | `%TEMP%\opencode\mc-t0-2026-11-13\tools\dsh-mc-combined-20261115-095709` |
| Plugin DB | `<root>\plugin-data\dsh-magic-context.db` |

The tarball was downloaded from the public registry with
`npm pack @elvisw/dsh-plugin-magic-context@0.12.2`; the registry specifier was
then installed into a fresh profile. The installed package's `lib` hashes match
the preflight artifact (all six sampled files, `evidence/artifact.json`), and
the installed plugin is loaded as `id: magic-context-dsh` in
`evidence/dump-effort.txt`.

Isolation was checked from the boot lines in `evidence/activity.log`: every
recorded `dbPath` points inside the isolated root, and no old experiment root
appears in the overlays or the activity log (`combined-analysis.json` →
`isolation`). The harness redirected `DSH_HOME`, `HOME`, `USERPROFILE`,
`XDG_DATA_HOME`, `XDG_CACHE_HOME`, `APPDATA`, `LOCALAPPDATA`, npm cache and pnpm
store to that root. This is an environment-redirection statement; no before/after
hash of the daily profile is claimed.

### Test-only acceleration (all in isolated overlays)

- `historianEnabled: true`, `registerCompactionEngine: false`,
  `maintenance.enabled: false` for the historian chain.
- `executeThreshold: 0`, `historianProtectedNodes: 1`, `historianMinNodes: 1`,
  `historianMinBudgetTokens: 500`, `historianTimeoutMs: 120000`.
- The DeepSeek route overlay advertised a 32,768-token context window for the
  test profile; the historian run recorded `maxTokens: 8192`.
- Flush overlay: `executeThreshold: 100`, `ttlMs: 999999999`, historian off.
- Vector overlay: maintenance enabled at 60,000 ms, `vectorBackfill: true`,
  historian off.
- The `historian.yml` route sets `reasoningEffort: off` at the LLM adapter
  layer; the separate `effort.yml` sets the plugin's
  `historian.reasoningEffort: low` for the config-only dump. The actual
  historian start row does not contain a `reasoningEffort` field, so the run
  records effort as **omitted**, not as low. See §6.

## 2. Result table

| Chain | Result | Authoritative evidence |
|---|---|---|
| Artifact identity / install | PASS | `evidence/artifact.json`, `evidence/npm-view-full.txt`, `evidence/preflight.json` |
| Recovery lifecycle (T2 semantics) | PASS | `evidence/drivers/combined-recovery.driver.json`, `combined-analysis.json` |
| Old tag after expand | PASS | `evidence/drivers/combined-recovery-old-tag.driver.json` |
| Historian publish + E1 tag | PASS | `evidence/drivers/combined-e1-tag.driver.json`, `combined-state.json` |
| Historian publish + E2 message | PASS | `evidence/drivers/combined-e2-message.driver.json` |
| Manual flush / next request | PASS | `evidence/drivers/combined-flush-seed.driver.json`, `combined-flush.driver.json`, `flush-command.jsonl` |
| Vector / memory smoke | PASS with provenance caveat | `evidence/drivers/combined-vector.driver.json`, `evidence/vector-first-attempt-observer.json`, `combined-analysis.json` |
| Config-only reasoning effort | PASS for dump; runtime effort not observed | `evidence/dump-effort.txt`, `combined-analysis.json` |

## 3. Recovery lifecycle

The recovery host used one session and these five tool calls in order:

1. `read fixture.txt` → `§1§ <original read result>`
2. `ctx_reduce drop:"1"` → `§2§ Queued 1 tag for reclaim.`
3. `ctx_expand tag:"1"` → `§3§ §1§ <original read result>`
4. `ctx_reduce drop:"3"` → `§4§ Queued 1 tag for reclaim.`
5. `ctx_expand tag:"3"` → `§5§ §3§ §1§ <original read result>`

Observed facts:

- The original read payload (including its own `§1§ ` prefix) has SHA-256
  `5bf8df34f1b71f7380192dab8108568a6c645daa799206dc9716ce247a41a105`.
- Stripping the outer `§3§` marker and its one trailing space from the first
  expand result produces the byte-equal original payload; the same hash is
  recorded as `expandOldPayloadSha256`. Stripping the outer `§5§` marker and
  its one trailing space from the second expand result reproduces the first
  expand result exactly (`newPayloadMatchesOldExpand`).
- The placeholder `[dropped §1§]` is present in the observer; the old tag row
  remains `tag_number: 1 → call_00_ET_...` and `pending_drops` records tag 1
  `landed_event_seq=28`, tag 3 `landed_event_seq=42`. No new pending row is
  created by either expand.
- The resumed old-tag host returned
  `§6§ §1§ not queued: already dropped.` (`oldTagReduce.alreadyDropped: true`),
  and the pending rows stayed at the same two landed rows. This is the durable
  spend check, not just a live-surface check.
- The recovery host did not re-run the original tool and did not add a second
  `tool/result` for the original call. Its `tool_results` are the original read,
  the two receipts, and the two new expand results.

The recovery fixture nonce was `afd2773bb98d48eb018945d1b987a44f`; it appears in
the returned payload and in `combined-recovery.driver.json`.

## 4. Historian chain

The seed session is `session-b6619b8b-5a25-48f2-96e0-6a636789b452`. The real
Historian ran once after the seed, stored compartment `C1`, and a management
pass published it at `nodeSeq=57`:

- Original read `tool/result` seq: `20`
- Placeholder `[dropped §1§]` seq: `28`
- Published compartment: `C1`, `landed_event_seq=57`
- Publishing pass journal: id `109`, `decision:"execute"`, `published:[1]`
- Historian journal: 3 rows (start, done, stored); `compartment-published`: 1

E1 and E2 were separate host windows on the same persisted session:

| Fact | E1 (`tag:"1"`) | E2 (`message:"20"`) |
|---|---|---|
| Host input | only `{"tag":"1"}` | only `{"message":"20"}` |
| Result seq | 103 | 124 |
| Outer new tag | `§6§` | `§7§` |
| Payload after stripping outer tag | byte-equal original | byte-equal original |
| Payload SHA-256 | `5bf8df34…a105` | `5bf8df34…a105` |
| Compartment hash pre/post | unchanged | unchanged |
| Historian journal count pre/post | 3 → 3 | 3 → 3 |
| Old tag `pending_drops` | tag 1 landed 28 | tag 1 landed 28 |

The compartment hash in both E1 and E2 windows is
`7cd2f34a0af1d9ae40fa6898d09f29471f50cf34d388bd6db5d5e87ac9f7b2ca`.
The original callId
`call_00_2s74fK99RuBwhhjoB6Ea9597` appears once as `tool/call` and twice as
`tool/result` (the original read and the placeholder), not a third time from
either expand. The original seq 20 remains in the observer's `events` after
publish; `message:"20"` reads that shadowed event.

The Historian start row (`journal` id 101) records route
`deepseek-official/deepseek-flash`, `maxTokens: 8192`, timeout 120000 ms. It has
no `reasoningEffort` field; the effort omission is recorded here rather than
being inferred as low.

## 5. Manual flush

Seed session `session-79f046ad-ce89-4b17-99bd-a2428e6277ab` read the fixture and
queued tag 1 with `ctx_reduce`; it did not expand or re-reduce. The next host
used the named test-only `driver-flush.mjs` plugin (headless DSH does not dispatch
plugin slash commands) and called the real command registry:

```text
commands.find(agent, "ctx-flush") -> definition found
commands.execute(...)             -> execution kind "success"
text: "Magic Context: flush queued for 1 new drop(s) (new §1§):
       requested 1, already marked 0, processed 0, pendingNext 1 (upper bound).
       Changes take effect on the next message; the current request is unchanged."
```

Observed evidence:

- `command/run` seq 35 and `command/done` seq 36 share
  `cmd-ce6c6589-1`; `kind=success`.
- The next request's observer contains the placeholder at seq 43,
  `[dropped §1§]`; the original read result is seq 21 (its `tool/call` is
  seq 20) and is still present.
- `pending_drops`: tag 1 `landed_event_seq=43`, `flush_requested=0`.
- Flush session journal: `drop-landed=1`, `historian=0`,
  `compartment-published=0`, `emergency-reclaim=0`.
- The flush pass row (id 147) is
  `defer (below-threshold) ... "pressureStale": true`, so the same-turn force
  band did not reclaim a second batch.
- The resumed host's own agent step is a normal model step; it is not
  attributed to the command. No `acceptance_wait` or tool call was made in the
  flush host. `db-probes.json` records 4 `usage_records` for this session; the
  command path itself adds no assistant/LLM call.

Cross-session check: after the flush, the historian session's
`pending_drops`, `tags`, and `compartments` equal the E2 post snapshot
(`sameCompartments`, `sameTags`, `samePending` all true). The historian session
has no observer snapshot after E2, so the E2 surface snapshot remains the last
recorded surface: process `15920`, trigger `assistant/message` seq 128,
25 live seqs, SHA-256
`2ae32afd514c520db05deb9a0de5b96ed7d5594f52cfe8b0b10654d175627d5b`
(`combined-analysis.json` → `historian.surfaceAfterE2`). The flush did not
consume or mutate its tags.

## 6. Vector and memory smoke

The vector journal is in
`<root>\plugin-data\dsh-magic-context.db`, `kind='vector-lane'`:

```json
[
  "gate-closed (no dominant embedding space; bootstrapModelId=embedding-provider:adc36...)",
  "backfill-bootstrap (total=4)",
  "gate-closed (no dominant embedding space)",
  "backfill-bootstrap (total=4)",
  "backfill (+4; created=4, present=0, failed=0)",
  "parity-pass (parity=1)"
]
```

The repeated `gate-closed`/`backfill-bootstrap` pair spans two processes, not
one maintenance tick: `journal` ids 163/164 belong to the earlier `e894`
attempt, while ids 179/180 and the successful backfill 181 belong to `bccc`
after its 10:09:30 start. The ticket explicitly allows non-adjacent vector
rows. Final state: `memories=5`, `memory_embeddings=4`, one model space
`embedding-provider:adc36d64c8cb774f10f8348390e75fea`.

The embedding model was downloaded before the successful backfill:
`plugin-data/models/model.onnx`, 90,387,606 bytes, mtime
`2026-11-15T02:10:56Z`, SHA-256
`759c3cd2b7fe7e93933ad23c4c9181b7396442a2ed746ec7c1d46192c469c46e`
(`evidence/vector-model-download.json`; the model file itself is not committed).

The final vector host
`session-bccc5d17-b49f-40df-89c4-1473588fe67c` wrote the synthetic memory
(already known as memory 5), waited 120 s and 60 s, then searched:

```text
§4§ Found 4 results for "npm test before committing":
[1] [memory] score=0.91 id=5 category=PROJECT_RULES match=hybrid
```

Provenance caveat: the first vector attempt
`session-e894610c-b6ac-463c-b680-e2af29d1ec73` is the session that actually
created memory 5; it hit the empty-space `gate-closed` and its 100-second search
was still `match=fts`. The later bccc session performed the successful
`backfill-bootstrap` and hybrid search. The four embeddings are attributed to
bccc by process-boot/time inference; vector-lane journal rows do not carry a
`session_id` (`journal` ids 179–181). Both sessions used the same registry artifact and the same
isolated profile/root. The clean single-run first-writer evidence remains the
separate T8 report; this combined window proves coexistence and the eventual
hybrid query, not that bccc itself performed the first write. See
`evidence/vector-first-attempt-observer.json`.

## 7. Config surface and reasoning effort

`evidence/dump-effort.txt` shows:

```yaml
- id: magic-context-dsh
  name: '@elvisw/dsh-plugin-magic-context'
  config:
    historian:
      reasoningEffort: low
```

The historian publish chain in this run did not record an effort in its journal
start row, so this report does **not** claim that `low` reached the provider on
this route. It proves the config leaf round-trips through `--dump-config`; the
actual effort propagation is covered by T9's LLM-runtime tests, not by this
host gate.

## 8. What this proves

- The published `0.12.2` artifact, not a local pack, installs by registry
  specifier into a fresh isolated profile and loads as `magic-context-dsh`.
- T2 result-return expand still returns a new result, preserves the original
  payload, leaves the old placeholder untouched, and makes the old tag durably
  spent (`already dropped`).
- T3's post-Historian `tag` and `message` locators both read the original
  content after `C1` was published; the compartment row and historian journal
  do not change during either expand.
- T4's real command registry path works for `ctx-flush`; the marker lands on the
  next request, clears, and starts no Historian/recomp/compartment/extra
  reclaim.
- T8's empty-embedding-space vector bootstrap reaches `parity-pass` and a later search
  returns `match=hybrid` on the same installed artifact.
- The config-only `historian.reasoningEffort` dump works alongside the T3
  historian chain.

## 9. What this does not prove

- **TUI slash-command keystroke path.** The flush chain uses the disclosed
  test-only `driver-flush.mjs` and real `commands.execute`; it proves registry,
  dispatch and handler, not a TUI keypress.
- **Runtime effort delivery.** The config dump is proven; the provider call's
  effort is not observable in this run and is recorded as omitted.
- **All failure paths and multi-tag aliases.** `tags` multi-value, `cross-session
  tag`, `not dropped yet`, `raw source unavailable`, and no-session remain
  unit/integration coverage from T2/T3.
- **A clean first-writer in the final vector session.** The bootstrap happened in
  the earlier in-root attempt `e894`; bccc confirms hybrid search. T8 remains the
  clean first-writer evidence.
- **Force-band behavior.** This combined ticket deliberately did not run the T4
  force-band variant; normal defer is the required combined case.
- **Full upstream parity, T0 baseline, P4, V1.1.** Not in scope.
- **Daily profile isolation by hash.** Only environment redirection and the
  boot `dbPath` are recorded; no daily profile hash was taken.
- **Per-chain installed-lib rehash.** `combined-analysis.artifact.hashStable`
  compares preflight and final installed hashes, not a snapshot after every
  host chain; a mid-run lib mutation between hosts would not be caught by this
  field alone.
- **Recovery-session post-flush snapshot.** The cross-session SQL check covers
  the historian session; the recovery session `e7c...` was not re-queried after
  the flush. The historian session also has no observer snapshot after E2.

## 10. Discarded attempts and in-root state

The final root contains three earlier in-root sessions that are **not** part of
the reported chains:

| Session | What it was | State left behind |
|---|---|---|
| `session-4712e872-7645-4700-b64d-9bb96355f572` | first seed/wait chain; did not publish a target | tag 1 landed at 28, tags 2–8 active; its `combined-wait-2..5` driver files are leftovers |
| `session-cd1b5fdc-634b-433f-aaee-e16bcc59d8dc` | first recovery attempt; it hit `not dropped yet` before landing | tags 1 and 3 have unlanded `pending_drops` rows (`landed_event_seq=null`) |
| `session-e894610c-b6ac-463c-b680-e2af29d1ec73` | first vector attempt; created memory 5 and hit the empty-space `gate-closed` | no pending drops; memory 5 persists, but e894 itself wrote no embeddings. The four embeddings are attributed to `bccc` by process/time inference, not by a session id in the vector rows |

The final chains use `session-e7c...` (recovery), `session-b661...` (historian),
`session-79f...` (flush) and `session-bccc...` (vector). The earlier rows remain
in the shared plugin DB and are disclosed rather than presented as a clean
single-attempt run. The final vector query uses memory 5 created by e894. None
of the discarded sessions touches the daily profile.

The isolated root retains the full raw observer files at
`<root>\evidence\session-observer\*.jsonl`; they are intentionally not committed
because of size. The committed `combined-observer-extract.json` contains the
compact events for the four final sessions, and
`vector-first-attempt-observer.json` contains the compact e894 events. The
`combined-analysis.evidence[]` array records the raw files' SHA-256 values:

| Raw observer file | SHA-256 |
|---|---|
| `session-e7c842dc-b193-4c7e-ae4b-b7bbdd5decec.jsonl` | `c3cf55f7ca91f744aeb103afc7d9dc43dea86675c98bdba2b7d6e1d39a69ed90` |
| `session-b6619b8b-5a25-48f2-96e0-6a636789b452.jsonl` | `4a6854f002f89eeceebeb156788236e7531f1f42f48b2f2d099cebf7bd2b2f49` |
| `session-79f046ad-ce89-4b17-99bd-a2428e6277ab.jsonl` | `dbc7b72e6f3c3ccf9da4a5d8924fe471087a84ef74c1ea14053e7a8bf7d6cc4a` |
| `session-bccc5d17-b49f-40df-89c4-1473588fe67c.jsonl` | `50e51aee372f220f1424456eb13134e001f49fc93cf20c42dd7ef4cb5d723242` |
| `session-e894610c-b6ac-463c-b680-e2af29d1ec73.jsonl` | `af9eede0a0a344599097a21b4c2f2b1fe63761c900de6091497f8eb194e85fc3` |
| `session-4712e872-7645-4700-b64d-9bb96355f572.jsonl` | `bcf0fc797c2ae88501c8e94ae8a67317560ac4f691c35fd9e60c1e7a3b24c0f2` |
| `session-cd1b5fdc-634b-433f-aaee-e16bcc59d8dc.jsonl` | `f5149ce7072b000e46175b8bdf9feccc29ff547be71cfac69a55c1c24ed12c43` |
| `engine-owners.jsonl` | `2e7d9b9df467bad093e539e323303bbf1315f7aba1b96265864ba3c774504d86` |

## 11. Evidence index

| File | Contents |
|---|---|
| `evidence/artifact.json` | registry, integrity, hashes, installed lib hashes |
| `evidence/preflight.json` | install/dump exit codes, profile specifier, installed hashes |
| `evidence/installed-package.json`, `evidence/profile-package.json` | installed package metadata and profile dependency |
| `evidence/npm-view-full.txt` | registry `npm view` output |
| `evidence/host-version.txt` | actual `@deepseek-ai/dsh@0.2.2-rc.1` package and Node version |
| `evidence/vector-model-download.json` | embedding model size, mtime and SHA-256 (model file not committed) |
| `evidence/npm-pack.txt`, `evidence/add-registry.txt` | registry pack and install transcript |
| `evidence/combined-state.json` | structured state for all final chains |
| `evidence/combined-analysis.json` | recomputed hashes, windows, DB snapshots, isolation |
| `evidence/db-probes.json` | direct SQLite probes for the four final sessions, discarded sessions and vector journal |
| `evidence/combined-observer-extract.json` | compact events for final sessions |
| `evidence/vector-first-attempt-observer.json` | compact e894 events |
| `evidence/drivers/*.driver.json` | real host driver outputs, including discarded wait files |
| `evidence/overlays/*.yml` | exact test-only overlays |
| `evidence/dump-effort.txt`, `evidence/dump-historian.txt` | config dumps |
| `evidence/flush-command.jsonl` | command registry/execution record |
| `evidence/driver-flush.mjs` | test-only driver that calls the real command registry |
| `evidence/activity.log` | boot lines and `dbPath` isolation |
| `evidence/unit-test.txt`, `evidence/typecheck.txt`, `evidence/i18n.txt` | 76 files / 849 tests, typecheck, ALL PASS |
| `evidence/sha256-manifest.json` | SHA-256 of every committed evidence file |

## 12. Verification commands

```powershell
npm view @elvisw/dsh-plugin-magic-context@0.12.2 version dist.integrity dist-tags gitHead dist.shasum --prefer-online --json
npm test
npm run typecheck
npm run check:i18n
```

Host runs: `prepare_combined_host.py` followed by the `run_combined_scenarios.py`
stages; see `REPRODUCE.md`. The `unit-test.txt`, `typecheck.txt` and `i18n.txt`
were produced in the repository at the release commit; host evidence was
produced elsewhere and copied here.

## 13. Independent audit

A separate read-only reviewer, which did not implement or run the harness,
recomputed the artifact hashes, recovery payloads, compartment hash, flush
state, vector journal and isolation claims against the raw root. Verdict:
**PASS WITH CAVEATS; no Critical**.

Applied fixes:

1. Flush section now distinguishes the original `tool/call` seq 20 from the
   original `tool/result` seq 21 (`combined-state.json → flush.identity`).
2. Vector journal 163/164 (`e894`) and 179/180/181 (`bccc`) are described as
   cross-process rows, not one maintenance tick.
3. The four embeddings are attributed to `bccc` by process/time inference; the
   vector journal has no `session_id`.
4. The 90,387,606-byte embedding model download is recorded in
   `evidence/vector-model-download.json` with its SHA-256.
5. Raw observer SHA-256 values are listed in §10; the large files stay under
   the isolated root and are not committed.

Suggestions applied: the per-chain lib-rehash limitation and missing
recovery-session snapshot are now explicit in §10; the host version is recorded
in `evidence/host-version.txt`; the vector wording is “empty embedding space”;
and the hash section names the outer marker plus one trailing space.
