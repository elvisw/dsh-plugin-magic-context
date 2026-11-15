---
id: 11
type: story
title: "P4: /ctx-flush empty-queue feedback"
parent: initiative-dsh-magic-context
after: [10]
refined: true
hitl: false
---

# P4: `/ctx-flush` empty-queue feedback

## Context

The 0.12.2 combined host regression showed the normal `/ctx-flush` path, but a
user report (session note #4, P4) found a confusing empty-queue result: after a
drop has already landed automatically or through a previous flush, calling
`/ctx-flush` again only says "nothing to flush". It does not say that a landing
already happened, how many drops landed, or when. The command is a marker-only
command and does not itself land anything, so "nothing to flush" is technically
correct but not informative.

Upstream `cortexkit/magic-context@v0.49.55` also returns only
`No pending operations to flush.` when its queue is empty; this ticket does not
change the pending-drop semantics or copy an upstream feature. It adds a
read-only receipt detail for the same empty-queue outcome.

## Requirements

1. When `planFlushCommand` sees no pending drops, it reads the newest
   `drop-landed` journal entry for the current session with the existing
   read-only store query:
   `stores.listJournal({ sessionId, kinds: ['drop-landed'], limit: 1 })`.
2. The receipt text includes the landed count and a full UTC date/time when
   available. The empty-queue wording must say the landing is already in
   effect; do not reuse the queued path's "changes take effect on the next
   message" sentence for a landing that already happened.
3. The lookup is scoped to the current session. A `drop-landed` row for another
   session must not be reported.
4. If the store query has no `drop-landed` row or throws, the command keeps the
   existing no-op text and returns `success`; it must not fail because feedback
   is unavailable. The query **and date formatting** must be inside the
   empty-queue branch's inner `try/catch`, not rely on the outer
   `planFlushCommand` error wrapper.
5. The command must not append a journal row, mutate the surface, mark a drop,
   clear a marker, or call a model. It remains read-only apart from the existing
   `requestFlush` marker write on the queued path. Reading historical
   `drop-landed` rows through `AdapterStores.listJournal` is intentional even
   when the journal was disabled at boot; no new row is written either way.
6. The normal queued path, already-marked path, storage-failure path, closed
   store, and no-session behavior are unchanged. The queued path must not query
   the journal.
7. No `registerCtxFlushCommand` dependency is added: `AdapterStores` already
   carries `listJournal`. No `src/index.ts` wiring change is required.
8. Document the empty-queue feedback in both READMEs' existing `/ctx-flush`
   section and the command description; do not add a new public API or a new
   journal kind.

## Boundaries

- Do not change when or how drops land; no `pre-step` or `drop-landing` change.
- Do not add a new journal kind, schema migration, or durable state.
- Do not read `activity.log`; use `AdapterStores.listJournal` with the
  `drop-landed` kind and `limit: 1`.
- Do not report a landing from another session or a global aggregate.
- The host gate uses a local build, not a released registry artifact; record the
  tarball SHA-256, `git rev-parse HEAD`, and the installed `lib` hash.
- The host gate must not touch the daily DSH profile or real user sessions.
- P4 provenance is the user report captured in session note #4
  (`P4 backlog: /ctx-flush has no "already landed" feedback`), which is
  session history rather than a committed file; the story must say so rather
  than imply a repository path.

## Files

- `src/dsh/flush-command.ts` — empty-queue store query, count/date formatting,
  and already-in-effect wording.
- `tests/ctx-flush.spec.ts` — journal-row-present, newest-row, wrong-session,
  absent, throwing-query, queued-path-no-query, no-new-row, and registration
  cases.
- `README.md` / `README.zh-CN.md` — update the existing `/ctx-flush` row/table
  with the empty-queue feedback; keep the two languages in sync.

## Acceptance

### Unit and integration

- With a `drop-landed` row for `s1` at a fixed timestamp and no pending drops,
  `planFlushCommand` returns `kind: 'success'`, reports `data.count`, the full
  UTC date/time, and says the landing is already in effect.
- With two `drop-landed` rows, the newest one is reported; `limit: 1` and
  newest-first ordering are asserted.
- A row for `s2` is ignored when the current session is `s1`; an older `s1`
  row still wins over a newer `s2` row, proving session filtering happens before
  `limit: 1`.
- With no row or a throwing `listJournal`, the receipt keeps the old
  "nothing to flush" text and returns `success`, not `error`.
- A row without `data.count` still reports the full date/time and omits the
  count; it does not fall back to the redacted `tags` length.
- The queued path does not call `stores.listJournal` (spy/proxy assertion).
- The command does not add a journal row; assert with
  `stores.journalBounds().rows` or a `drop-landed` count, not `tail().length`.
- A registration test with a commands stub proves the handler is registered and
  returns the receipt text; there is no journal wiring to test because the store
  query is used.
- Existing `tests/ctx-flush.spec.ts` queued, already-marked, storage-failure,
  closed-store, no-session, re-queue, restart, and already-placeholder cases
  still pass.
- `npm test`, `npm run typecheck`, `npm run check:i18n`, and `npm run build`
  pass; `git diff --check` is clean.

### Host gate

- Write a new `prepare_p4_host.py`; do not copy a completed T3/T4/T10 profile or
  reuse an old root. Create a fresh `dsh-home`, bootstrap a headless profile,
  install the locally packed tarball, write a fresh observer, and redirect
  `DSH_HOME`/`HOME`/`USERPROFILE`/XDG/`APPDATA`/`LOCALAPPDATA`/npm store/cache.
  Assert the overlay contains no old root and the installed lib hash equals the
  local build; record the tarball SHA-256 and `git rev-parse HEAD`.
- Host 1 (`seed`) uses the T4-style real-model seed prompt with a fresh session:
  it reads the fixture and calls `ctx_reduce` so one drop is pending; record the
  actual tag, call id and original seq. This host's usage is recorded separately
  and is not part of the command window.
- Host 2 (`flush`) starts a new process with the same `--session-id` and a
  no-tool prompt. The test-only driver calls the real `commands.find` /
  `commands.execute` on `agent/created`; the next request in that host lands the
  marked drop. Record the command JSONL and DB state.
- Host 3 (`flush-empty`) is another new process with the same session id and a
  no-tool prompt. The driver executes `/ctx-flush` again on the empty queue.
  Snapshot `usage_records`, `pending_drops`, `tags` and `journal` immediately
  around the `commands.execute` call, not around the whole host request; the
  host's own model step is recorded separately.
- Assert the host-3 result is `kind: 'success'`, has the last landed
  count/date/time and the already-in-effect wording, and the command window has
  no new usage row, no new `drop-landed` row, and unchanged `pending_drops`/
  `tags`. Store the compact driver JSON, command JSONL, DB probe, config dump
  and SHA-256 manifest; keep raw observer JSONL outside the repo.
- If the isolated host cannot be prepared or the command cannot be invoked,
  mark the ticket blocked with the exact failure; do not substitute unit tests
  for the host gate.

## Out of scope

- Changing `/ctx-flush` from marker-only to immediate landing.
- Adding a `/ctx-flush --force` option or a new command.
- Upstream parity work outside the empty-queue receipt.
- Releasing a new npm version; that needs a separate explicit authorization.
