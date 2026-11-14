---
title: "Docs consistency: release guide and upstream baseline — implementation plan"
ticket: 7
status: in-progress
---

# Docs consistency: release guide and upstream baseline — implementation plan

## Progress

- 2026-11-14: Ticket created from the post-T6 backlog review. Scope is active operational docs only; no code, package version, tag, or publish.

## Steps

1. Correct `docs/independent-package-release.md`:
   - actual bootstrap path: interactive `npm publish --provenance=false --tag bootstrap` with web authentication/2FA;
   - temporary granular token only as a non-interactive fallback, revoked only if used;
   - current release references `0.12.1` / generic `v<version>`;
   - post-publish checks include `dist-tags` and `latest`.
2. Add the baseline note to `PARITY.md`:
   - `v0.49.30` remains the last line-by-line verified target;
   - `v0.49.55` is the decision baseline, delta unswept;
   - no runtime-parity claim.
3. Add historical-baseline notes to:
   - `docs/dsh-plugin-upgrade-followup.md`;
   - `docs/research-handoff-ctx-flush-2026-11-11.md`.
4. Leave `README.md` / `README.zh-CN.md` unchanged: their “verified to v0.49.30” is factual, and changing packaged docs would create another npm snapshot mismatch before the next release.
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
