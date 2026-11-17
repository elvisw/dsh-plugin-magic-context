# Real-model `/ctx-wrapup` smoke — 0.17.0

Date: 2026-11-17
Status: **PASS**

## 1. Environment

| Item | Value |
|---|---|
| DSH | `0.2.2-rc.1` |
| Plugin | `@elvisw/dsh-magic-context@0.17.0` |
| Profile | isolated Web profile `wrapup` |
| Model | `deepseek-official/deepseek-flash` |
| Reasoning effort | `low` |
| Isolated root | `%TEMP%\opencode\dsh-mc-wrapup-20261117-1700` |
| Session | `session-3db800a2-ea06-4c05-a0aa-18080790b223` |

The isolated profile used a copy of the published 0.17.0 package from the daily
`web` profile; no local build was substituted. `lib/client.js` was not involved
in the test.

## 2. User path

1. Opened the isolated DSH Web UI.
2. Created a fresh session and sent three short real-model prompts; each
   returned a normal assistant reply.
3. Sent `/ctx-wrapup 2`.
4. UI returned the command receipt:

```text
Magic Context: wrapup queued (keep 2, retain ~4 eligible entries, compact 5
entries). It runs on the next pre-step; the current request is unchanged.
The historian spends tokens then.
```

5. Sent one more prompt to trigger the next pre-step.
6. The trigger prompt completed normally; no UI error toast and no browser
   console errors.

Screenshots:

- `screenshots/before-wrapup.png`
- `screenshots/after-wrapup-command.png`
- `screenshots/after-wrapup-trigger.png`

## 3. Database evidence

`evidence/wrapup-journal.json` contains the journal rows after the command.

- Journal 21: historian manual run started, **5 nodes**, **569 tokens**,
  `trigger: "manual"`, route `deepseek-official/deepseek-flash`,
  `reasoningEffort: "low"`.
- Journal 22: historian digest ready, importance 3, 4 facts, 1 event,
  `attempts: 1`, `durationMs: 3919`.
- Journal 24: compartment §C1§ stored, covered seq `8..18`.
- Journal 25: wrapup stored §C1§, `retainedEligible: 4`,
  `compactedEntries: 5`.
- Journal 26: compartment §C1§ published, replaced 5 nodes on the wire,
  reclaimed 569 estimated tokens.
- Journal 27: 4 facts promoted into project memory.
- Journal 28: baseline HARD rebuild after publish.
- Journal 30: pass row `execute (wrapup-pending)`, `published: [1]`,
  `historianStarted: false`, wrapup `{compartmentId: 1, trigger: "manual",
  retainedEligible: 4, compactedEntries: 5}`.

The marker was cleared after completion:

```json
{
  "key": "wrapup_request:session-3db800a2-ea06-4c05-a0aa-18080790b223",
  "value": ""
}
```

The compartment is durable:

```json
{
  "compartment_id": 1,
  "covered_start_seq": 8,
  "covered_end_seq": 18,
  "covered_seqs": [8, 9, 10, 11, 18],
  "landed_event_seq": 46,
  "landed_reason": null,
  "superseded": 0
}
```

Only one manual historian run appears. The forced pass did **not** start an
automatic historian (`historianStarted: false`), and the trigger prompt itself
completed without an error.

## 4. Scope and limitations

- This proves the published package registers the slash command and executes
  the real pre-step -> historian -> publish -> baseline path with a real model.
- The test session was short; it does not exercise the default 20-entry keep,
  pause/resume, abort, terminal rejection, or baseline-failure retry. Those
  branches remain covered by the T22 unit/integration suite.
- The test used an isolated Web profile and a disposable session. It did not
  modify the daily `web` profile's sessions or history.
- No product code, package, or release artifact changed after 0.17.0.
