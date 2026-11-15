---
ticket: 11
title: "P4: /ctx-flush empty-queue feedback — plan"
status: built
---

# P4: `/ctx-flush` empty-queue feedback — plan

## 1. Implementation

### 1.1 Single read-only store query

Do **not** add a journal dependency to `planFlushCommand`. `AdapterStores`
already exposes the filtered query we need:

```ts
stores.listJournal({
  sessionId,
  kinds: ['drop-landed'],
  limit: 1,
})
```

`listJournal` is newest-first with `id DESC` and a `kinds` filter
(`src/core/stores.ts`), so `limit: 1` is the exact newest `drop-landed` row for
the current session. This avoids the fixed 50-row `Journal.tail` window and
works even when `liveJournal.tail` has not buffered a write yet.

Call it only inside the empty-pending branch. Put **both** the call and the
date formatting in one inner `try/catch`; the outer `planFlushCommand` catch
must not turn a feedback lookup or `RangeError` into `kind: 'error'`.

### 1.2 Receipt text

Count is authoritative from `data.count` when it is a finite number. If
`data.count` is missing, omit the count but still report the date; do **not**
use `data.tags.length` as a fallback because journal redaction truncates arrays
above 20 entries. The no-count text is:

```text
Magic Context: nothing to flush now; last drop landing at 2026-11-15 10:08:59Z. That landing is already in effect; this call changed nothing.
```

Timestamp is a full UTC date/time, e.g.
`2026-11-15 10:08:59Z` (`new Date(at).toISOString()` with the `T` replaced by a
space and fractional seconds removed).

Empty-queue text when a row exists with a count:

```text
Magic Context: nothing to flush now; last drop landing: 2 drop(s) at 2026-11-15 10:08:59Z. That landing is already in effect; this call changed nothing.
```

When no row exists or the query/format throws, keep the existing text:

```text
Magic Context: nothing to flush (no pending drops).
```

The queued path keeps its existing caveat
"Changes take effect on the next message; the current request is unchanged."
and must not call `listJournal`.

Reading historical rows through the store is intentional even when the journal
was disabled at boot; the empty-queue feedback must not pretend no landing
happened. The command still writes no row.

### 1.3 No wiring change

`registerCtxFlushCommand` keeps its `{ stores }` dependency. `src/index.ts`
does not change. The command description and both README `/ctx-flush` rows are
updated to mention the empty-queue detail.

## 2. Tests

Extend `tests/ctx-flush.spec.ts`:

- Append a `drop-landed` row directly with `stores.appendJournal` for `s1` at
  `NOW`; empty pending queue -> success, count, full UTC date/time, and
  already-in-effect wording.
- Append two rows for `s1`; assert the newest one is reported.
- Append an older `s1` row and a newer `s2` row; `s1` reports its own older row
  (session filtering before `limit: 1`).
- Append a row for `s2` only; `s1` keeps the old text.
- Append a row with no `data.count`; assert the date is reported without a
  count.
- No row -> old text and success.
- Proxy `listJournal` to throw; and append a row with invalid `at` to force a
  date `RangeError` -> old text and success, not error.
- Queued path proxy records `listJournal` calls; assert none.
- After the command, `stores.journalBounds().rows` and the `drop-landed` count
  are unchanged.
- Registration test with a commands stub asserts the handler is registered and
  returns the receipt text.
- Keep all existing queued, already-marked, storage-failure, closed-store,
  no-session, re-queue, restart, landing, and already-placeholder cases.

## 3. Verification

1. `npm test -- tests/ctx-flush.spec.ts`
2. `npm test`
3. `npm run typecheck`
4. `npm run check:i18n`
5. `npm run build`
6. `git diff --check`
7. Fresh isolated host gate per §4.

## 4. Host gate

Write a new `prepare_p4_host.py` under
`_bmad-output/initiative-dsh-magic-context/acceptance-windows-dsh-2026-11-15-p4-flush-feedback/`.
Do not copy T3/T4/T10 profiles or reuse their roots.

1. Create a fresh root; redirect `DSH_HOME`, `HOME`, `USERPROFILE`,
   `XDG_DATA_HOME`, `XDG_CACHE_HOME`, `APPDATA`, `LOCALAPPDATA`, npm store/cache
   and PATH into it.
2. Bootstrap a fresh `headless` profile with the DSH CLI, install the locally
   packed tarball with `dsh plugin --profile headless add <file.tgz>
   --ignore-scripts`, then write a fresh observer and test-only command driver.
   Assert the overlay has no old root and the installed `lib` hash equals the
   local build. Record the tarball SHA-256 and `git rev-parse HEAD` in the
   manifest.
3. Host 1 (`seed`): use the T4-style real-model prompt: read the fixture once,
   call `ctx_reduce` for the fixture result, and record the session id, actual
   tag, call id and original seq. Host 1's usage is recorded separately.
4. Host 2 (`flush`): new process with the same `--session-id` and a no-tool
   prompt. The test-only driver calls the real `/ctx-flush` once via
   `commands.find`/`commands.execute`; the next request lands it. Record command
   JSONL and DB state.
5. Host 3 (`flush-empty`): a new process with the same `--session-id` and a
   no-tool prompt. The driver calls `/ctx-flush` again. Snapshot `usage_records`,
   `pending_drops`, `tags` and `journal` immediately before the command and
   after `command/done`, not around the whole host request; assert the command
   window has no new usage row, no new `drop-landed` row, unchanged
   `pending_drops`/`tags`, and the result has the last count/date/time and
   already-in-effect wording with `kind: 'success'`.
6. Store compact evidence only: driver JSON, command JSONL, DB probe, config
   dump, SHA-256 manifest; raw observer JSONL stays under the isolated root.

If the host cannot be prepared or invoked, mark the ticket blocked with the
exact error; unit tests do not satisfy the host gate.

## 5. Review gates

1. This ticket must pass a second independent validation after these changes.
2. Independent diff review after implementation.
3. Independent host-report audit if a host gate is produced.
4. `npm test` / typecheck / i18n / build / diff check evidence before `built`.
5. Commit only after review; mark `done` only after host gate or a properly
   recorded blocked state.

## 6. Out of scope

- Immediate landing or a `--force` flag.
- A new command or a new journal kind.
- Registry publication or version bump.
- V1.1 `ctx_expand` range/verbose.
