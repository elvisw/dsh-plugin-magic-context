---
title: "Tag retention alignment"
ticket: 5
status: built
---

# Tag retention alignment — implementation plan

## Goal

Remove the fork's automatic 30-day tag-registry prune and its configuration surface. Tag rows are no longer deleted by age. Keep only explicit test-side deletion for the #14 fixture; add no message/session deletion path, no compaction-state change, and no schema migration.

## Code changes

1. `src/index.ts`
   - Delete the mount-time `pruneTags` block and its `liveNumber(config.tags?...` read.
   - Delete `tags` from the `Config` schema.
   - Delete `tagsRetentionDays` from the boot switch snapshot.
   - Add a legacy-config warning: only when `(config as { tags?: { retentionDays?: unknown } }).tags?.retentionDays !== undefined`; use a module-level once-per-process latch; call the exported predicate helper.
2. `src/dsh/config.ts`
   - Delete the `tags?: { retentionDays?: number }` member.
   - Add `legacyTagsRetentionWarning(config: MagicContextDshConfig): string | undefined` returning `undefined` for absent/empty `tags`, a message only for `tags.retentionDays`.
3. `src/core/stores.ts`
   - Delete `AdapterStores.pruneTags` and its `DELETE FROM tags WHERE created_at < ?` implementation.
4. `tests/ctx-expand-result.spec.ts`
   - Replace the `pruneTags` fixture with a targeted `DELETE FROM tags WHERE session_id = ? AND target_kind = 'tool-result' AND target_id = ?` using the existing `DatabaseSync` helper style; close the connection.
5. `tests/tags-retention.spec.ts`
   - Delete the file. Remove its entry from `scripts/phase-map.mjs`.
6. `tests/phase1.spec.ts`
   - Add one mount regression:
     - seed `session-a` tag 1 and `session-b` tag 1 with `created_at` 40 days old in an isolated `dataDir`;
     - `boot` once, assert both rows still present;
     - `await ctx.fiber.dispose()`, then `boot` a **new** `Context` with a fresh adapter and the same `dataDir`;
     - assert both rows/number unchanged;
     - after the second mount, `allocateTag` a new target in each session and assert `2` / `2`;
     - clean up the temp dir.
7. `tests/config-schema.spec.ts`
   - Assert `Config({}).tags` is `undefined`.
   - Assert `Config({ tags: { retentionDays: 7 } } as unknown as MagicContextDshConfig)` preserves the unknown key and does not throw.
   - Assert `legacyTagsRetentionWarning({})` and `{ tags: {} }` are `undefined`; `{ tags: { retentionDays: 7 } }` returns a warning string.

## Docs

- `README.md` / `README.zh-CN.md`: remove `tags.retentionDays`; note no age-based deletion and no current automatic message/session deletion path.
- `docs/memory-mechanisms-inventory-2026-10-09.md`: correct the `tags` row.
- `CHANGELOG.md`: add `Unreleased` entry (no version bump).
- `story-14-post-historian-raw-retrieval-plan.md`: mark `pruneTags` instructions superseded / redirect to targeted SQL fixture.

## Verification

- `npm test -- tests/phase1.spec.ts tests/config-schema.spec.ts tests/ctx-expand-result.spec.ts`
- `npm run typecheck`
- `npm test`
- `npm run check:i18n`
- `git diff --check`
- `git grep pruneTags` should return nothing in `src/` and only the #14 test's targeted SQL helper comment should remain, if any.
- `git grep tagsRetentionDays` should return nothing in `src/`; historical 0.11.x evidence is out of scope and untouched.

## Risks

- **Same-Context double mount is not a remount.** The test must dispose the first fiber and use a new `Context`; otherwise duplicate registrations can fail for unrelated reasons.
- **Legacy warning latch.** A module-level latch is per process; do not write a test that assumes a fresh module or reset it. Test the pure predicate instead.
- **No deletion-path claim.** Docs must not say tags already disappear with message/session deletion; no such path exists in this repo.
- **#14 fixture.** Use a targeted delete (session + target), never `DELETE FROM tags` without a predicate.
