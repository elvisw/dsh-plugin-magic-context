# P4 — `/ctx-flush` empty-queue feedback host gate

Date: 2026-11-15
Ticket: `story-ctx-flush-empty-feedback.md` (id 11)
Verdict: **PASS for the empty-queue receipt on a fresh isolated host.**

The command now reads the newest `drop-landed` journal row for the current
session with `stores.listJournal({ sessionId, kinds: ['drop-landed'], limit: 1 })`
and reports the landed count and UTC timestamp when the pending queue is empty.
This gate verifies that text through the real `commands.find` /
`commands.execute` path. It is a marker-only command; no surface mutation,
landing, or model call is part of the command.

## 1. Build and isolation

| Item | Value |
|---|---|
| Local package | `@elvisw/dsh-plugin-magic-context@0.12.2` |
| Tarball SHA-256 | `d0ea9d2799f4e20e8eea03edb3f8ecab8726a9f209bde9d50c938ef0973c9f23` |
| `git rev-parse HEAD` | `970f4540131706e2967d1f6fe69c7a15dd5076fc` |
| Working tree | P4 diff uncommitted; patch `evidence/p4-working-tree.patch` SHA-256 `fe68b78c8e59657fd22d3fc75220a50e484714b34451023771e53c5a7fafe581`; installed `flush-command.js` hash matches the local build |
| Installed lib hash | `895f96c421b4b4ca13b1b5809e15158d3316c1bd60e331eaf36c90c07f5b08af` |
| Host | `@deepseek-ai/dsh@0.2.2-rc.1`, Node `v24.21.0` |
| Model route | `deepseek-official/deepseek-flash` (from `activity.log`) |
| Isolated root | `%TEMP%\opencode\mc-t0-2026-11-13\tools\dsh-mc-p4-20261115-113543` |
| Profile | fresh `bootstrap-profile --profile headless`; local tarball installed with `dsh plugin --profile headless add ... --ignore-scripts` |
| Plugin DB | `<root>\plugin-data\dsh-magic-context.db` |

No T3, T4, or T10 profile was copied. The overlay uses the scoped package name
and points `dataDir`/observer `outDir` at the new root. Boot `activity.log`
records the DB path under the root.

## 2. Host sequence and result

One session, `session-d797635e-d797-48a8-8634-16cf6db5e3b3`:

1. **seed** — real model reads `fixture.txt`, gets `§1§` (tag 1, call
   `call_00_ET_TJaU7CUAYMYaJ6Dju9A61104`, original seq 20), calls `ctx_reduce`.
   `pending_drops` shows tag 1 `landed_event_seq=null`.
2. **flush** — new host process with the same session id; the test-only driver
   calls the real `/ctx-flush` (`cmd-bc4e2f09-1`, `command/run` seq 34,
   `command/done` seq 35). The result is queued; the next request lands it:
   placeholder seq 42, `pending_drops` tag 1 `landed_event_seq=42`,
   `flush_requested=0`.
3. **flush-empty** — a third host process with the same session id; the driver
   calls `/ctx-flush` again. There are no unlanded pending rows (the landed row
   remains in `pending_drops`), and the command returns:

```text
Magic Context: nothing to flush now; last drop landing: 1 drop(s) at 2026-11-15 03:36:10Z. That landing is already in effect; this call changed nothing.
```

The command execution is `cmd-45c847de-1` at `command/run` seq 51 /
`command/done` seq 52, `kind=success`.

### Command-window checks

| Check | Observed |
|---|---|
| `usage_records` for session, before → after command | `4 → 4` |
| `pending_drops` count, before → after command | `1 → 1` |
| `tags` count, before → after command | `2 → 2` |
| `drop-landed` journal rows, before → after command | `1 → 1` |
| `assistant/message` between command/run and command/done | none |
| Host request's own model step | one usage row added after the command (`usageRecords` 4 → 5 in the after-host snapshot); recorded separately |

The empty-queue command did not append a journal row, change a tag or a pending
row, or call the model. The text count/time comes from the existing
`drop-landed` row (journal id 13, `data.count=1`, `at` 1794713770749).

## 3. What this proves and does not prove

Proved:

- The empty-queue branch uses the real store query and reports this session's
  single landing with count and UTC date/time. The "newest of two rows" and
  cross-session filtering are established by unit tests, not by this one-row
  host fixture.
- The command is still a success no-op; it does not land, mutate the surface,
  or create a journal row. The observer's `surface` value is identical at
  `command/run` seq 51 and `command/done` seq 52 (SHA-256
  `2698700653b0269faaf0d8e35f4a096fe24de360185d354afdf8fdf274428efa`).
- The real command registry dispatches `ctx-flush` in a fresh profile.

Not proved:

- TUI slash-command keystroke dispatch; headless DSH uses the test-only
  `commands.execute` driver.
- Registry/npm publication of this P4 change; the host used a local tarball
  built from `970f454` plus the working-tree patch
  `evidence/p4-working-tree.patch` (SHA-256
  `fe68b78c8e59657fd22d3fc75220a50e484714b34451023771e53c5a7fafe581`).
- The exact text formatting under a non-English locale; the timestamp is UTC.
- Long-history behavior beyond the one-row query; the store query is filtered
  by `kinds` and `limit: 1`, so the fixed `Journal.tail` window is not involved.
- Daily-profile hash isolation; only environment redirection and the boot
  `dbPath` are recorded.

## 4. Discarded preparation root

An earlier preparation root `dsh-mc-p4-20261115-112657` was used while the
comment-only source cleanup was still being applied. Its command result was also
the expected empty-queue text, but it is not the signed evidence: after the
comment change the build was re-packed, a fresh root was prepared, and all
three hosts were rerun. Only root `...113543` is used in this report.

## 5. Evidence index

| File | Contents |
|---|---|
| `evidence/preflight.json` | root, tarball SHA-256, `gitHead`, installed/built lib hash, overlay paths |
| `evidence/p4-state.json` | seed session, tag/call/original seq, seed DB state |
| `evidence/p4-seed.driver.json` | real seed driver output (`read` + `ctx_reduce`) |
| `evidence/p4-flush.driver.json` | host-2 output |
| `evidence/p4-flush-command.jsonl` | real command definition/execution for host 2 |
| `evidence/p4-flush.json` | placeholder, command events, DB state after landing |
| `evidence/p4-flush-empty.driver.json` | host-3 output |
| `evidence/p4-flush-empty-command.jsonl` | final real command execution and before/after counts |
| `evidence/p4-flush-empty.json` | empty-queue text, command window, DB snapshots, observer events |
| `evidence/overlays/p4-seed.yml`, `evidence/overlays/p4-flush.yml` | exact test-only overlays |
| `evidence/activity.log` | boot `dbPath`, route and policy |
| `evidence/host-version.txt` | actual DSH package and Node version |
| `evidence/git-head.txt` | HEAD used for the local build |
| `evidence/p4-working-tree.patch` | uncommitted product diff used for the local build |
| `evidence/git-diff-check.txt` | `git diff --check` output (known CRLF warning only) |
| `evidence/overlay-isolation.json` | overlay old-root check and new-root assertions |
| `evidence/unit-test.txt`, `evidence/typecheck.txt`, `evidence/i18n.txt` | 76 files / 857 tests, typecheck, ALL PASS |
| `evidence/sha256-manifest.json` | SHA-256 of every evidence file except the manifest itself |

Raw observer JSONL stays under the isolated root and is not committed.
