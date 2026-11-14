---
title: "Docs consistency: release guide and upstream baseline — implementation plan"
ticket: 7
status: done
---

# Docs consistency: release guide and upstream baseline — implementation plan

## Progress

- 2026-11-14: Ticket created from the post-T6 backlog review. Scope is active operational docs only; no code, package version, tag, or publish.
- 2026-11-14: Edits applied. Ticket validation caught a false premise: `0.11.2` already followed `v0.49.30 → v0.49.50` for the three background-lane defects, so the docs now distinguish full-table verification (`v0.49.30`), targeted follow-up (`v0.49.50`), and decision baseline (`v0.49.55`, `v0.49.50 → v0.49.55` unswept). Also corrected the README scope to `README.zh-CN.md` only and strengthened the #15 handoff note.
- 2026-11-14: Verified `git diff --check`, exact stale-release-example grep (no matches), three-level baseline grep, and that only docs/ticket files changed. Packaged `README*`, `package.json`, and `lib/` are unchanged. Commits `435a67c`, `e004286`, `7e23a2f`.
- 2026-11-14: Quick review returned NEEDS CHANGES. Fixed the false `--tag bootstrap`/`latest` guarantee (the actual bootstrap left both tags on `0.0.0-bootstrap.0`), restored `package-lock.json` to step 6, attributed the T4 host gate to the local `0.11.2` build and the `0.12.0` ship, fixed the recovery-contract link, made the ticket verification `rg` command shell-safe, and marked ticket 6's token wording superseded.

## Steps

1. Correct `docs/independent-package-release.md`:
   - actual bootstrap path: interactive `npm publish --provenance=false --tag bootstrap` with web authentication/2FA;
   - temporary granular token only as a non-interactive fallback, revoked only if used;
   - current release references `0.12.1` / generic `v<version>`;
   - post-publish checks include `dist-tags` and `latest`.
2. Add the baseline note to `PARITY.md`:
   - `v0.49.30` remains the last full table verification;
   - `0.11.2` followed `v0.49.30 → v0.49.50` for three background-lane
     defects, without a full table re-walk;
   - `v0.49.55` is the decision baseline and `v0.49.50 → v0.49.55` is unswept;
   - no full `v0.49.55` runtime-parity claim.
3. Add baseline notes to:
   - `docs/dsh-plugin-upgrade-followup.md` (active runbook; not “historical”);
   - `docs/research-handoff-ctx-flush-2026-11-11.md` (state that the #15 gap
     is closed: the T4 host gate passed on the local `0.11.2` build and the
     code shipped in `0.12.0`, with the T4 report's limits).
4. Leave the packaged READMEs unchanged: only `README.zh-CN.md:20` has the
   “已核到 v0.49.30” line, and it is accurate as the last full table
   verification; changing packaged docs would create another npm snapshot
   mismatch before the next release. This is an explicit scope decision.
5. Verify:
   - `git diff --check`;
   - grep for the old unconditional token-revocation sentence and old current-version examples (`恢复仓库内的 0.12.0`, `publish 0.12.0`, `@0.12.0 version`) in the release guide;
   - `PARITY.md` contains both versions and the no-sweep note;
   - `git diff --stat` only docs;
   - packaged files unchanged (`README*`, `package.json`, `lib/`).
6. Independent Quick review of the docs diff; fix any Critical/Fix, then commit.

## Boundaries

- No upstream v0.49.55 source sweep; only record the existing decision and the absence of a sweep.
- No changes to historical acceptance evidence under `_bmad-output/.../acceptance-windows-*`.
- No version bump, tag, or npm publish.
- No V1.1 `ctx_expand` range/verbose work.
