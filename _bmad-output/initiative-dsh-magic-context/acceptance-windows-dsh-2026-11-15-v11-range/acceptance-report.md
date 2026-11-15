# V1.1 `ctx_expand` range/verbose — isolated host acceptance

Date: 2026-11-15
Ticket: 12 (`V1.1: ctx_expand range and verbose`)
Package under test: `@elvisw/dsh-plugin-magic-context@0.12.3` (local build, not registry)
Host: `@deepseek-ai/dsh@0.2.2-rc.1`
Route used by the real Historian: `deepseek-official/deepseek-flash`
Isolated root: `C:\Users\elvis\AppData\Local\Temp\opencode\mc-t0-2026-11-13\tools\dsh-mc-v11-20261115-144933`
Session: `session-574e6453-7883-45db-90a0-0307ba3ba778`

## 1. Verdict

**PASS** for the V1.1 host gate: a real Historian published a compartment, and
the subsequent `ctx_expand` range, verbose and tag/message regression requests
all behaved as specified. Four separate host CLI invocations were used (R1
range, R2 verbose, R3 tag, R3 message); each had its own pre/post snapshot.
The invocation record contains exit codes, timings and session IDs, but no
per-stage PID field.

This is an isolated-host result for a local tarball. It does not claim registry
publication, TUI composer behavior, or every rejection branch (those are unit /
integration-covered).

## 2. Build identity and isolation

- Local tarball SHA-256:
  `beaed6e8b8785a78293fe916599341a810cff182cfc1fca39c25fd79beddc10b`
- Git HEAD: `a8da8cdfb78778cabb924ddbd2fcc3110d9ca659`
  plus the uncommitted V1.1 diff; its SHA-256 is recorded in
  `evidence/preflight.json` (`git_diff_sha256`). That hash is as of the build;
  later test-only/documentation edits do not change the installed `lib`.
  `evidence/provenance.json` records the freeze-time diff hash separately so a
  verifier can distinguish the build snapshot from the final tree.
- Installed `lib` files match the tarball byte-for-byte:
  `lib/index.js`, `lib/dsh/tool-bridge.js`, `lib/dsh/seams.js`.
- Installed `lib/dsh/tool-bridge.js` contains `renderRangeTranscript` and the
  `locator` field; the check is in `prepare_v11_host.py`.
- The profile was created from scratch and installed with
  `dsh plugin --profile headless add <local tarball> --ignore-scripts`.
  No prior experiment profile was copied, and no daily profile was used.
- Every overlay references this run's root and no old experiment root; the
  script asserts both.
- The client panel's range row (existing read category) is unit-covered in
  `tests/client-pure.spec.ts`; the host gate does not render the Web panel.

## 3. Precondition: real Historian publication

The seed read `fixture.txt`, reduced its tag, and read
`historian-fixture.txt`. A real Historian run then published compartment
`§C1§`:

- `target.compartmentId = 1`
- `target.publishSeq = 57`
- `target.sourceEventSeqs = [11,12,13,18,28,24,26,32,34]`
- target row `landed_event_seq = 57`, `superseded = 0`
- unlanded compartments: `[]`
- pass journal row `id = 53`, `decision = execute`,
  `published = [1]`, `historianStarted = true`,
  `pressure = 37.9`, `tokensBefore = 4487`, `tokensAfter = 2374`,
  `factsPromoted = 5`
- the target compartment hash was identical in every pre/post window:
  `542ce5d724c88340ce9fbfdaee6ae3eb569ccf22750aef44cfa45ff4e51c816f`

The publish itself is independently visible in the observer at seq 57
(`replace` over 11-34, text `[compacted §C1§]`). The model route
`deepseek-official/deepseek-flash` and its usage numbers are recorded in the
plugin's own journal row 48, not in a provider-side artifact; the report does
not treat that route as independently proven.

The original read result was `seq 20`, tag `1`; the placeholder was
`seq 28` (`[dropped §1§]`).

## 4. R1 — range transcript

Request observed in the driver (`v11-r1-range.driver.json`):

```json
{"start":"20","end":"28"}
```

Result event `seq 103` (call `seq 102`), text SHA-256
`39445e5b2621643202fbcd2ade8d115821e3be6d2bc1917678e54e8b97b3522e`:

```text
Events 20-28 (4 events, 5 skipped):

[20] tool/result read (call_00_o3Bw5fUYAkNZMXdN3E7Z0589)
§1§ <path>...\fixture.txt</path>
...
3: nonce=0c5a44e3e7a598b206c2a8b93ba9092d
(End of file - total 3 lines)
</content>

[24] assistant/message
The fixture result carries tag §1§. Reducing only that tag.
[24] tool call ctx_reduce (call_00_6rwckIxAZHcPLsFVant75690)
{"drop":"1"}

[26] tool/result ctx_reduce (call_00_6rwckIxAZHcPLsFVant75690)
§2§ Queued 1 tag for reclaim.

[28] tool/result read (call_00_o3Bw5fUYAkNZMXdN3E7Z0589)
[dropped §1§]
```

Proved:

- the range is inclusive on both ends;
- the raw original is returned from persisted history even though the
  compartment now shadows it;
- the standalone `tool/call` event is not emitted; the assistant tool-call
  block appears once;
- `[dropped §1§]` is literal;
- the five skipped events are the excluded/non-readable events, not seq gaps:
  seq 21 `step/end`, 22 `step/start`, 23
  `session-log-deepseek/delivery-accepted`, 25 `tool/call`, and 27
  `step/end`;
- the result was tagged `§6§`, so `tagDelta = 1`;
- `pending_drops` did not change; the placeholder/covered event bytes were
  identical before and after; `compartments`, `baselineCount`, `historian`
  and `compartment-published` journal counts did not change;
- no extra tool call occurred after the result, only the host's ordinary
  `step/end`, `step/start`, delivery and `assistant/message` events.

## 5. R2 — verbose transcript

Request:

```json
{"start":"20","end":"28","verbose":true}
```

Result event `seq 124` (call `seq 123`), text SHA-256
`6692564bbc62022d27f06a7d24520ea4448db6e3fc9f394d02e8413f98caeb4e`:

```text
Events 20-28 (verbose; 4 events, 5 skipped). Recover a full dropped tool result with tag or message.

[20] tool/result read (call_00_o3Bw5fUYAkNZMXdN3E7Z0589)
  • [text] §1§ <path>...\fixture.txt</path> <type>file</type> <content> 1: V11_RANGE_FIXTURE 2: The acceptance n

[24] assistant/message
  • [text] The fixture result carries tag §1§. Reducing only that tag.
  • [tool-call] ctx_reduce (call_00_6rwckIxAZHcPLsFVant75690) {"drop":"1"}

[26] tool/result ctx_reduce (call_00_6rwckIxAZHcPLsFVant75690)
  • [text] §2§ Queued 1 tag for reclaim.

[28] tool/result read (call_00_o3Bw5fUYAkNZMXdN3E7Z0589)
  • [text] [dropped §1§]
```

Proved:

- the verbose header and per-part previews are produced;
- the fixture preview is truncated before the nonce (the model's reply could
  not echo it, as expected);
- `tagDelta = 1`; pending, compartment, baseline, historian and publish
  journal counts were unchanged; watched event bytes were unchanged.

## 6. R3 — tag and message regression

Each in its own host CLI invocation, with its own pre/post snapshot:

| Request | Call seq | Result seq | Tag delta | Nonce |
|---|---:|---:|---:|---|
| `{"tag":"1"}` | 144 | 145 | 1 | yes |
| `{"message":"20"}` | 165 | 166 | 1 | yes |

Both returned the original `§1§ ... nonce=...` content as a new tool result and
did not rewrite the placeholder. Pending rows, compartments, baseline and
historian/publish journal counts were unchanged; watched event bytes were
unchanged.

## 7. What this does not prove

- The range rejection matrix (bad bound shapes, mixed locators, filler rules,
  no-readable-events, non-safe integers, empty `message`) is unit-covered in
  `tests/ctx-expand-result.spec.ts`, not re-run through the host.
- The live-surface success sentence, budget truncation of a single oversized
  event, the lack of an event-count cap, and exact `start=end` raw rendering
  are unit-covered.
- The 15k budget was not hit by this small fixture, so the host evidence does
  not exercise truncation.
- Cross-session/foreign seq rejection is unit-covered.
- Only one compartment was published; multi-compartment ranges and ranges
  spanning several publishes were not exercised.
- The TUI composer path is not covered; the driver calls the real `ctx_expand`
  tool through the host agent, not a Web keypress.
- The tarball is a local build, not the registry artifact. Its hash and git diff
  are recorded so the run can be reproduced.

## 8. Evidence index

- `evidence/preflight.json` — root, tarball SHA, HEAD, diff SHA, installed hashes
- `evidence/v11-state.json` — full per-window state (pre/post DB snapshots)
- `evidence/v11-analysis.json` — compact summary and sha256 of each result
- `evidence/v11-observer-extract.json` — compact observer view of target seqs
- `evidence/v11-r1-range.driver.json`
- `evidence/v11-r2-verbose.driver.json`
- `evidence/v11-r3-tag.driver.json`
- `evidence/v11-r3-message.driver.json`
- `evidence/v11-seed.driver.json`, `evidence/v11-wait-1.driver.json`,
  `evidence/v11-settle.driver.json`
- `evidence/base.yml`, `evidence/historian.yml`, `evidence/settle.yml`
- `evidence/dump-historian.txt`, `evidence/dump-settle.txt`,
  `evidence/host-version.txt`
- `evidence/unit-test.txt` (76 files / 872 tests),
  `evidence/typecheck.txt`, `evidence/i18n.txt` (ALL PASS)
- `evidence/sha256-manifest.json` — hashes of committed evidence files

The raw observer JSONL (7,714,010 bytes,
SHA-256 `3b4612e2e6a0e931df92ef55c140e779ae4543a7fee8e2701f7cc1994dcc46c2`)
stays in the isolated root; only the compact extract is committed.
