# T4 host acceptance — `/ctx-flush` (#15)

Date: 2026-11-14
Verdict: **host gate passed** for the command marker and next-request landing; the force-band staleness variant also passed. This report does **not** claim a TUI keystroke test, the command-surface-disabled UI, or T5 retention.

## 1. Build and isolation

| Item | Value |
|---|---|
| Host | `@deepseek-ai/dsh@0.2.2-rc.1` (isolated profile copied from the completed T3 root) |
| Plugin | locally built `dsh-plugin-magic-context@0.11.2`, installed from `dsh-plugin-magic-context-0.11.2.tgz` |
| Tarball SHA-256 | `91d45e81fe5834a8b537a36605b808b2b9686d735448f9bbce5bbb2145ee3ec1` |
| Git HEAD at pack time | `d69a7dfb7dfdd12bf36c2501130fe850dd43dd33` |
| Tracked diff SHA-256 (as of preflight) | `594dad1510a7e4f139aa3e9e53130a3eae4a50d6e4ac309e4806af1c18a15ea2` |
| `git status --porcelain` SHA-256 (as of preflight) | `6e9543600e1ae6a48808b1c11838cb13a765028ee1756f4871fe33df3d4e30ad` (the new T4 harness files are untracked; `git diff` alone does not cover them; the values predate the later report/evidence-only edits in this directory) |
| Root | `%TEMP%\opencode\dsh-mc-t4-20261114-174313` |
| Model route | `deepseek-official/deepseek-flash` (observed context window 1,048,576) |
| Daily profile / sessions / plugin DB | not intentionally used: all DSH home/profile/XDG/APPDATA paths were redirected to the temp root; no before/after hash of the daily profile is claimed |

`preflight.json` compares the installed `flush-command.js`, `drop-landing.js`, `stores.js`, and `pre-step.js` byte-for-byte with the local build; all four match. The installed lib contains `ctx-flush` and `landPendingDrops`.

## 2. Normal scenario: command marker, then placeholder

Seed host: one fixture read, one `ctx_reduce`; no expand. The seed overlay deliberately uses `executeThreshold=100` and `ttlMs=999999999`, so the pending drop does **not** auto-land before the command.

Flush host: resumes the same session; the test-only driver waits for `agent/created`, then calls the **real** DSH command registry:

```text
commands.find(agent, "ctx-flush")             -> definition found
commands.execute(agent, "/ctx-flush", [], signal)
  -> execution.result.kind = "success"
  -> text: "flush queued for 1 new drop(s) (new §1§): requested 1, already marked 0, processed 0, pendingNext 1 (upper bound)"
```

Observed host evidence:

| Fact | Evidence |
|---|---|
| `command/run` | seq 34, name `ctx-flush`, `commandId` `cmd-3bd229fa-1` |
| `command/done` | seq 35, kind `success`, same `commandId` |
| Next request saw the placeholder | model final text `T4_FLUSH_OK` + `[dropped §1§]`; the prompt explicitly asked for that echo, so this is corroboration, not the authoritative proof |
| Placeholder event (authoritative) | seq 42, `[dropped §1§]`; original read seq 20 still present and unchanged |
| Pending row | tag 1, `landed_event_seq=42`, `flush_requested=0` |
| Other work | `drop-landed` 1; `historian` 0; `compartment-published` 0; `emergency-reclaim` 0 |
| Model calls | 4 `usage_records` for this session (3 seed steps + 1 flush response, `t4-usage.json`); the command itself adds no assistant/LLM call and the flush host made no tool call |

All pass rows in this scenario are `defer`; the placeholder therefore landed **outside** the execute band.

## 3. Force-band staleness variant

A second session repeats the seed, then the flush host uses `executeThreshold=0`, `forceThreshold=0`, `ttlMs=0`. The flush lane lands the drop; the same preStep then enters the execute band. The pass row records:

```json
{
  "decision": "execute",
  "reason": "execute-threshold",
  "pressureStale": true,
  "landed": [],
  "published": [],
  "forceDropped": 0,
  "baseline": "unchanged",
  "historianStarted": false
}
```

This is the D3.5 guard: the pressure reading predates the flush (`pressureStale: true`), so the force branch is skipped even though this synthetic profile would otherwise enter execute with `forceThreshold=0`. The raw DB also records the force-band evaluation itself as `emergency-reclaim` with `reason=stale-reading`, `tier=skipped-stale-reading`, `dropped=0` (`evidence/t4-emergency-reclaim.json`). The fixture has only the protected read result, so `forceDropped: 0` is consistent with the guard but is not by itself a test of a large unprotected pool; the direct signals are that skipped evaluation plus `pressureStale: true`. It also shows the execute pass did not re-land the already-landed drop, did not publish a compartment, and did not start the Historian.

| Fact | Evidence |
|---|---|
| Command | `cmd-a6f39246-1`, success, same receipt |
| Command lifecycle | seq 34 / 35 |
| Placeholder | seq 42, `[dropped §1§]` |
| Next request | `T4_FLUSH_OK` + `[dropped §1§]` (prompt-conditioned echo; seq 42 is authoritative) |
| Pending row | `landed_event_seq=42`, `flush_requested=0` |
| Force result | `forceDropped=0`, `published=[]`, `historianStarted=false` |
| Force evaluation | `emergency-reclaim` `reason=stale-reading`, `tier=skipped-stale-reading`, `dropped=0` |

## 4. What this proves

- A real DSH command registry resolves `ctx-flush` and executes the real handler on a resumed agent; the real `command/run`/`command/done` pair is present.
- The command writes only the durable marker; it does not edit the current request.
- The next preStep lands the exact marked tag through the shared landing helper; the next request observes the placeholder at event seq 42 (the model's echo is corroboration only).
- The normal run lands while the pressure decision is `defer`; the force run records `pressureStale: true` and a skipped `emergency-reclaim` evaluation (`tier=skipped-stale-reading`, `dropped=0`).
- No Historian, recomp, summary, compartment publish, or baseline rebuild is involved in either run. A force-band reclaim was evaluated and skipped, not absent. Each reported run touches only its own target session; the two reported sessions are the normal and force variants, not cross-session traffic.
- The DB marker is cleared after landing.

## 5. What this does not prove

- **UI keystroke path.** Headless DSH sends a task as a user message and does not dispatch plugin slash commands from its composer. The gate uses a named test-only plugin (`driver-flush.mjs`) that invokes the real `commands.execute`; it proves registry/dispatch/handler, but not a TUI keypress. A web/TUI composition remains the only way to prove the literal `/ctx-flush` typing path.
- **Command-surface disabled.** `registerStatusCommand: false` registers no command; there is no runtime handler to return a diagnostic. This remains a registration test, not a host scenario.
- **No-session / closed-store / storage-failure / race receipts.** Unit tests cover these; the host gate does not.
- **Skip with no live node.** Unit only; the host fixture always has a live paired read result.
- **Partial replacement followed by a failing durable write.** Unit uses `onReplaced` before the throw and the `preStepListener` test asserts the stale flag plus `replacedTags`; the host gate only exercises the successful path.
- **A landed row cannot be resurrected.** Unit only (`does not carry a marker onto a re-queued landed row`); the host run shows the marker cleared, not re-queue behavior.
- **Wire repair exception.** If the marked tag is a stranded result, the execute-band wire repair can replace the placeholder; not tested here because the fixture read is paired.
- **T5 retention / message-session deletion.** Out of scope.

## 6. Disclosures

- Roots `dsh-mc-t4-20261114-171842` and `dsh-mc-t4-20261114-172621` were built before the final receipt/partial-landing fixes and are **superseded**; only the final root `dsh-mc-t4-20261114-174313` is reported. The superseded pointer is kept as `experiment-root-superseded-172621.json`.
- The final root also contains two abandoned seed attempts from earlier runs: `session-d6483c61-18c1-459e-9bad-b60d9a65b2d3` (its pending tag landed at 42 during a superseded normal flush) and `session-9bb5467f-e956-44c8-8ef9-74a7ed5b9aeb` (tag 1 is still pending; no flush was run for it). Neither is used in the reported normal/force pair (`372c4a1b…`, `9516b1fe…`), but their usage and observer files are present in the final root and count in the global usage table.
- The force variant uses synthetic `executeThreshold=0`, `forceThreshold=0`, `ttlMs=0`; this is a test profile, not production policy. The normal variant uses `executeThreshold=100` and a huge TTL to keep the drop pending until the command. All three overlays are copied under `evidence/overlays/` (`seed.yml`, `flush.yml`, `flush-exec.yml`).
- Historian, compaction engine, maintenance, and memory lanes are disabled in both overlays; session-title LLM is disabled.
- `driver-flush.mjs` is test-only and writes the actual `commands.find`/`commands.execute` result. It is not shipped in the plugin tarball.
- The command receipt's `pendingNext` is an upper bound (still-pending rows at read time), not a promise that every row will land on the next preStep.
- The normal run's pass rows show `pressureStale: true` on the defer row as well; that is the flush lane's marker, not a compartment change.
- `db.usage.usage_records` inside each analysis JSON is the **global** table count at that point and includes superseded attempts (normal analysis: 11; force analysis: 15); the per-session truth is 4 + 4 in `t4-usage.json`.
- `t4-normal-flush-command.jsonl` is append-only across the superseded normal attempt and the reported one; the analysis filters by target session and only uses the reported session's record.

## 7. Evidence index

- `evidence/preflight.json` — build identity, hashes, tarball, `git status`/diff.
- `evidence/t4-normal-seed*.json` / `t4-normal-flush*.json` — seed/flush driver records, stdout/stderr.
- `evidence/t4-force-seed*.json` / `t4-force-flush*.json` — force variant.
- `evidence/t4-normal-analysis.json`, `t4-force-analysis.json` — observer events, command events, DB rows, pass rows.
- `evidence/t4-analysis-summary.json` — recomputed assertions.
- `evidence/t4-emergency-reclaim.json` — the skipped force-band evaluation (`stale-reading`).
- `evidence/t4-usage.json` — per-session usage rows for the reported pair (4 + 4; the final-root global table count is 15 and includes the abandoned attempts).
- `evidence/session-observer/*.jsonl` — raw host event snapshots for the reported sessions; the directory also contains the abandoned attempts named above.
- `evidence/overlays/seed.yml`, `flush.yml`, `flush-exec.yml` — the three profiles, including `forceThreshold=0`.
- Scripts: `prepare_t4_host.py`, `run_t4_scenarios.py`, `analyze_t4_evidence.py`, `probe_t4_db.py`, `probe_t4_emergency.py`, `driver-flush.mjs`.

## 8. Unit verification

`tests/ctx-flush.spec.ts` has 13 cases: marker, current-session isolation, empty/no-session/closed, restart, landed-row reset, race/no-op and follow-up-read failure receipts, marked-only landing, unmarked pending, skipped nodes, already-placeholder, replacement before a failing durable write, and two `preStepListener` cases (normal lane and failed durable write with stale pressure + `replacedTags`). The full suite is **77 files / 838 tests**, typecheck passes, and i18n is `ALL PASS`; the evidence files are refreshed in the final pass (`evidence/unit-test.txt`, `evidence/typecheck.txt`, `evidence/i18n.txt`).
