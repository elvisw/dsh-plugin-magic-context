# Daily-profile E2E — 2026-11-15

Session: `session-b4699af0-7cb4-4b64-97eb-72bcc3d028fb`
Package: `@elvisw/dsh-plugin-magic-context@0.12.3`
Host: DSH Web on `@deepseek-ai/dsh@0.2.2-rc.1`
Model: `commandcode/deepseek/deepseek-v4.1-flash`
Profile: the user's daily `web` profile, data dir
`C:\Users\elvis\.local\share\cortexkit\magic-context-dsh-poc`

This run deliberately used the real web composer and the daily profile. It did
not use an isolated harness, did not copy a profile, and did not modify the
plugin database outside the normal plugin path.

## 1. Verdict

**Core daily E2E: PASS.**

The tag lifecycle, `/ctx-flush`, empty-queue feedback, memory, settings
persistence, and restart persistence all behaved as designed. The one remaining
gap from the first pass — expanding a landed tag after restart — was closed by
`ctx_expand tag:"1"` at `seq 246`.

Not covered by this run:

- Historian publication / post-publish `ctx_expand tag|message`;
- `ctx_expand message:"<seq>"`;
- an actual Historian model call using `historian.reasoningEffort: low`.

Those remain covered only by the isolated T3/T10 host gates or require a
separate long-context Historian test. They are not claimed here.

## 2. Evidence

Machine-readable evidence:
`evidence/daily-e2e.json`

Session log:
`C:\Users\elvis\.dsh\sessions\--C-Users-elvis-Documents-deepseek-harness-default-workspace--\session-b4699af0-7cb4-4b64-97eb-72bcc3d028fb\session.v4.jsonl.zstd`

Plugin database:
`C:\Users\elvis\.local\share\cortexkit\magic-context-dsh-poc\dsh-magic-context.db`

Memory database:
`C:\Users\elvis\.local\share\cortexkit\magic-context-dsh-poc\memories.db`

Profile config:
`C:\Users\elvis\.dsh\profiles\web\cordis.patch.yml`

## 3. Results

### 3.1 Command surface

- `/ctx-status` and `/ctx-flush` executed through the real web composer.
- Each command produced `command/run` and `command/done` with a success result.
- Command results are log-only; they created no assistant turn and no usage row.
- The first two `/ctx-status` invocations happened on the blank start page,
  before the first user message. They executed successfully in the log but the
  start page has no conversation transcript, so their command cards were not
  visible. This is a DSH Web start-page behavior, not a plugin refusal. After
  the first normal message, subsequent commands render normally.

### 3.2 Single-tag lifecycle

| Step | Evidence | Result |
|---|---|---|
| Read fixture | `seq 34`, tag `1` | `MC_E2E_20261115_133938` |
| Reduce tag 1 | journal id 206 | `Queued 1 tag for reclaim.` |
| First `/ctx-flush` | `seq 46` | `requested 1, already marked 0, processed 0, pendingNext 1` |
| Second `/ctx-flush` | `seq 48` | `requested 0, already marked 1` |
| Landing | `seq 52`, surface replace `34 → 52` | `[dropped §1§]` |
| Expand tag 1 | `seq 68` | new result `§3§ §1§ <fixture>` |
| Old tag re-reduce | `seq 81` | `§1§ not queued: already dropped.` |

Byte equality: `seq 68` after stripping the outer `§3§ ` equals `seq 34`
exactly.

```text
original seq 34 SHA-256 = 0f856cd847fa0bc3b832d7fd445224d4616dcbcbf85907bf32af9747244b68b7
expanded seq 68 stripped SHA-256 = 0f856cd847fa0bc3b832d7fd445224d4616dcbcbf85907bf32af9747244b68b7
```

The old `[dropped §1§]` remained at `seq 52`; no pending row was added and
`dropState` stayed `landed`.

### 3.3 Pending guard and new-tag lifecycle

- Tag `3` was the tag of the first expand result (`seq 68`).
- `ctx_reduce tag:"3"` queued it (`seq 94`).
- Before landing, `ctx_expand tag:"3"` returned
  `§6§ §3§ not restored: not dropped yet.` (`seq 99`).
- After `/ctx-flush` and the follow-up message, `seq 110` replaced `seq 68`
  with `[dropped §3§]`.
- `ctx_expand tag:"3"` then returned
  `§7§ §3§ §1§ <fixture>` (`seq 124`), equal to the stored `seq 68` content
  after stripping the outer `§7§ `.

### 3.4 Batch pending, empty-queue feedback

- Read `mc-e2e-1.txt`, `mc-e2e-2.txt`, `mc-e2e-3.txt`; tags `8/9/10`.
- One `ctx_reduce` request with `drop: "8, 9, 10"` returned
  `Queued 3 tags for reclaim.` (`seq 146`).
- `/ctx-flush` at `seq 153`:
  `requested 3, already marked 0, processed 0, pendingNext 3`.
- `/ctx-flush` at `seq 155`:
  `requested 0, already marked 3, processed 0, pendingNext 3`.
- Follow-up message landed the three tags at `seq 159/160/161`.
- `/ctx-status` at `seq 168` reported `11 tagged, 5 dropped as placeholders`.
- The next `/ctx-flush` at `seq 171` returned the P4 empty-queue feedback:

```text
Magic Context: nothing to flush now; last drop landing: 3 drop(s) at 2026-11-15 05:57:47Z. That landing is already in effect; this call changed nothing.
```

The database confirms five landed rows for tags `1, 3, 8, 9, 10` and
`flush_requested = 0` on all of them.

### 3.5 Memory

- `ctx_memory write` created memory `2` (`CONFIG_VALUES`), `seq 180`.
- `ctx_memory list` found it, `seq 185`.
- After restart, `ctx_memory search` returned:

```text
[1] [memory] score=0.65 id=2 category=CONFIG_VALUES match=hybrid
```

This is a hybrid hit, not FTS-only. `memories.db` has the corresponding
`memory_embeddings` row for memory `2`.
- `ctx_memory archive id=2 reason="E2E cleanup"` completed at `seq 230`; the
  row is archived and the test memory is not left active.

### 3.6 Restart and settings

- `session/end-seed` at `seq 191`; command ids switch from `cmd-a73d687e-*`
  to `cmd-f5346422-*`, proving a new host process resumed the same session.
- `activity.log` boot at `06:02:25Z` resolves the Historian route with
  `reasoningEffort: "low"`; the earlier boot at `05:24:48Z` had
  `"default"`. The config file also contains
  `historian.reasoningEffort: low`.
- After restart, `/ctx-status` (`seq 193`) reported `16 tagged, 5 dropped`.
- Final restart expand (`seq 246`) returned a new result:

```text
§17§ §1§ <fixture>
```

Stripping the outer `§17§ ` yields `seq 34` byte-for-byte; the old
`[dropped §1§]` at `seq 52` is unchanged; `pending_drops` still has exactly the
same five landed rows and no new pending row; `tags` gained only tag `17`
for the expand call; journal id 249 says `ctx_expand: restored 1, refused 0`.

### 3.7 Schema

`meta.schema_version = 11`. No migration or store failure was observed.

## 4. Not covered

1. **Historian publication.** `compartments` stayed empty and every
   `/ctx-status` reported `historian: 0 compartment(s)`. Context pressure was
   about 2%, below the execute band, so no publication happened. The pass at
   journal id 248 reported `historianStarted: true` but produced no historian
   journal row and no compartment; this is not evidence of a publish.
2. **Post-publish `ctx_expand tag|message`.** Needs a real published
   compartment; T3/T10 cover the isolated host path.
3. **`ctx_expand message:"<seq>"`.** Not used in this daily run.
4. **Historian `reasoningEffort: low` at runtime.** The boot log proves the
   setting is persisted and resolved into the route; no Historian model call
   occurred, so the provider-side effect is not proven here.

## 5. Reproduction notes

- Start the session with a normal message; the DSH Web start page does not
  render command cards even when a slash command executes.
- Use a fresh nonce and capture the actual tag printed on the tool result; do
  not hard-code tag numbers.
- `/ctx-flush` only marks pending drops. A following normal message is needed
  for landing.
- After restart, use the explicit numeric tag (for example `tag:"1"`), not a
  phrase like “the previous step's old tag”.
- Inspect the session log and plugin DB read-only; do not query or mutate the
  daily store while the host is writing beyond normal SQLite WAL reads.
