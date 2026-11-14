---
id: 5
type: story
title: "Tag retention alignment"
parent: initiative-dsh-magic-context
after: [2]
refined: true
hitl: false
risk: medium
---

# Tag retention alignment

## Description

Removes the fork's mount-time 30-day tag-registry prune and the corresponding `tags.retentionDays` configuration, so tags are no longer deleted by age. This ticket does **not** add DSH message/session deletion, change `compacted` state, or claim that deletion/compaction paths already exist; those remain the contract target. It also does not implement any other excluded retention feature.

## Requirements

1. **No automatic tag prune on mount.** The adapter's mount path must not call `stores.pruneTags(...)` or any age-based `DELETE FROM tags`. An existing tag row older than 30 days survives plugin mount unchanged.

2. **Remove the retention configuration surface.**
   - Remove `tags` from the exported `Config` schema (`src/index.ts`) and from `MagicContextDshConfig` (`src/dsh/config.ts`); `Config({}).tags` is `undefined`.
   - Remove `tagsRetentionDays` from the boot switch snapshot; no telemetry field may imply an active tag TTL.
   - A legacy profile that still contains `tags.retentionDays` must not fail to load and must not change behavior. Because schemastery preserves undeclared keys, `Config({ tags: { retentionDays: 7 } }).tags.retentionDays` remains `7`; it is data, not a setting.
   - The mount path logs a warning **only when `tags.retentionDays` is present** and **at most once per process** (module-level latch), naming the field as deprecated/ignored. An empty `tags: {}` does not warn. The warning must not imply the profile was rewritten; the docs tell users to delete the block. This is a note, not a compatibility promise.
   - Put the predicate in an exported pure helper (`legacyTagsRetentionWarning(config)`) so it is testable without capturing the host logger; `apply` owns the process-level latch. Tests cast the legacy input (`as unknown as MagicContextDshConfig`) because `tags` is intentionally no longer in the type.
   - `journal.retentionDays` is out of scope and must keep working exactly as today.

3. **Remove the time-based deletion primitive.**
   - Remove `AdapterStores.pruneTags(before)` and its implementation. No age-based `DELETE FROM tags` API remains in the adapter.
   - Replace the #14 deleted-tag fixture (`tests/ctx-expand-result.spec.ts`) with a test-only direct `DELETE FROM tags` against the isolated SQLite file, using the existing `DatabaseSync` helper style. Do not add a new production API for test deletion.
   - `tests/tags-retention.spec.ts` is removed; its mount-time retention assertions are replaced by the mount survival test in `tests/phase1.spec.ts`, and `scripts/phase-map.mjs` drops the old file entry.

4. **Tag allocation stays monotonic.** Removing the prune must not touch `tag_counters`; two sessions seeded with one old tag each still allocate the next number (2/2) after two independent mounts, and the old targets keep their original numbers.

5. **Docs and migration note.**
   - Update `README.md` / `README.zh-CN.md` observability tables: remove `tags.retentionDays`; state precisely that tags are **no longer deleted by age** and that DSH currently has **no automatic message/session deletion path**; message/session deletion and compaction-state retention remain the contract target, not current behavior. Do not claim tags disappear on message/session deletion today.
   - Update `docs/memory-mechanisms-inventory-2026-10-09.md` line for `tags` so it no longer claims a 30-day prune.
   - Add an `Unreleased` Changed/Fixed entry to `CHANGELOG.md`: automatic 30-day tag pruning removed; legacy `tags.retentionDays` is ignored with a warning; users should delete the block from their profile.
   - Mark the stale `pruneTags` instructions in `_bmad-output/initiative-dsh-magic-context/tickets/story-14-post-historian-raw-retrieval-plan.md` as superseded (or redirect them to the direct test-only SQL fixture) so no future implementer follows a removed API.
   - No schema migration and no `SCHEMA_VERSION` change.

6. **No host/model gate required.** This is a mount/storage behavior with no wire or model behavior. Verify with an integration test that boots the real plugin twice against an isolated `dataDir` seeded with an old tag row, plus a config-schema test and the existing manual-deletion test. Do not run a real model or change production profiles.

## Acceptance criteria

- **Old row survives mount:** seed a tag row with `created_at` 40+ days old, boot `mcDshPlugin` with that `dataDir`, and assert `getTag(...)` still returns the same number and `listTags(...)` still contains it.
- **Second independent mount is a no-op:** dispose the first fiber (`await ctx.fiber.dispose()`) and boot a **new** `Context` with a new plugin fiber against the same `dataDir`; do not call `ctx.plugin` twice on one live Context (cordis creates a second fiber and duplicates registrations). The old row and number are unchanged after both mounts. Assert DB state only; do not use a log-absence assertion.
- **No TTL surface:** `Config({}).tags` is `undefined`; `Config({ tags: { retentionDays: 7 } } as unknown as MagicContextDshConfig)` does not throw and preserves `tags.retentionDays === 7`; boot `switches` has no `tagsRetentionDays` key. `legacyTagsRetentionWarning` returns undefined for `{}` and `{ tags: {} }`, and a non-empty warning for `{ tags: { retentionDays: 7 } }`; the once-per-process latch is a module-level guard in `apply` (no host-log capture test required).
- **No time-based API remains:** `AdapterStores` has no `pruneTags`; the only deleted-tag fixture is the #14 test's targeted `DELETE FROM tags WHERE session_id=? AND target_kind=? AND target_id=?`, and no production path can delete tags by age.
- **Monotonic allocation:** seed two sessions with old rows (`session-a` has tag 1, `session-b` has tag 1); after two mounts, `allocateTag('session-a', new target)` returns `2` and `allocateTag('session-b', new target)` returns `2`, while both old targets still return their original numbers. This proves `tag_counters` was untouched, not merely that allocation increments.
- **Journal retention unaffected:** existing `journal.retentionDays` tests still pass.

## Boundaries

- Must not add message/session deletion, `deleteTagsByMessageId`, `deleteToolTagsByOwner`, or compaction-state changes.
- Must not change `pruneJournal` or `journal.retentionDays`.
- Must not change tag numbering, prefix, allocation, drop lifecycle, `ctx_expand`, `ctx_reduce`, `/ctx-flush`, Historian, thresholds, or protected windows.
- Must not add a schema migration; no `SCHEMA_VERSION` bump.
- Must not change old 0.11.x evidence or acceptance reports.
- No release/version bump in this ticket.

## References

- Parent: `_bmad-output/initiative-dsh-magic-context/initiative-dsh-magic-context.md`
- Contract Q5: `_bmad-output/initiative-dsh-magic-context/tickets/recovery-contract.md` (`Q5`, D5 retention baseline)
- Removed mount call (historical): `src/index.ts` (`tagsRetentionDays`, `stores.pruneTags`)
- Removed config (historical): `src/dsh/config.ts` (`tags.retentionDays`)
- Existing tests: `tests/tags-retention.spec.ts`, `tests/ctx-expand-result.spec.ts` (manual deletion fixture), `tests/config-schema.spec.ts`
- Original behavior snapshot: `docs/memory-mechanisms-inventory-2026-10-09.md`
