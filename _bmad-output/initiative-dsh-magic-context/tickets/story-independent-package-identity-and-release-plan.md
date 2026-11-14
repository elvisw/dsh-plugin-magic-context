---
title: "Independent package identity and release — implementation plan"
ticket: 6
status: ready-for-dev
---

# Independent package identity and release — implementation plan

## Goal

Ship the fork as `@elvisw/dsh-plugin-magic-context@0.12.0` without changing the loader row id (`magic-context-dsh`), settings namespace, plugin data directory, or T2–T5 behavior. The existing `dsh-plugin-magic-context` package is not modified.

## Phase 1 — Identity sweep (no model)

1. Update `package.json`:
   - `name` → `@elvisw/dsh-plugin-magic-context`
   - `homepage`, `bugs.url`, `repository.url` → `elvisw/dsh-plugin-magic-context`
   - `author` / `contributors`: fork maintainer as author; keep upstream credit in `NOTICE` / README
   - verify `publishConfig.provenance` stays `true` for the OIDC release
2. Update `package-lock.json` root name (via `npm install --package-lock-only` or targeted edit).
3. Update `cordis.patch.yml` row `name`; leave `id: magic-context-dsh`.
4. Update `src/client/index.js` `id` and `PKG_NAME`; leave settings namespace.
5. Update `tools/install-magic-context.bat`:
   - `PKG=@elvisw/dsh-plugin-magic-context`
   - `TGZ_PREFIX=elvisw-dsh-plugin-magic-context`
   - use `%PKG%` only for `dsh plugin add/remove`, `%TGZ_PREFIX%` only for tarball glob.
6. Update current user-facing references:
   - `README.md`, `README.zh-CN.md` install/remove/clone/patch snippets, badges, raw image URLs
   - `CONTRIBUTING.md`, `SECURITY.md`, `CODE_OF_CONDUCT.md`
   - `.github/ISSUE_TEMPLATE/{config,bug_report,feature_request}.yml`
   - `CHANGELOG.md` compare links
   - `PARITY.md`
   - current operational docs only where they instruct package installs (`docs/dsh-plugin-upgrade-followup.md`, `docs/dsh-plugin-config-ui-contract.md`, `docs/dsh-plugin-ui-telemetry-contract.md`)
7. Add `docs/independent-package-release.md`: migration from old package, unchanged data dir, same loader row id, first-publish bootstrap, trusted-publisher binding, tag release.

## Phase 2 — Artifact verification (no model)

1. `npm run build`
2. `npm pack --dry-run`:
   - name `@elvisw/dsh-plugin-magic-context`
   - filename `elvisw-dsh-plugin-magic-context-0.12.0.tgz`
   - expected file list; no missing `lib/` assets
3. Grep the built tree (not `git grep`) for `dsh-plugin-magic-context`; only historical comments/docs may contain it. Runtime files must be clean.
4. `npm pack` to a temp directory; extract and repeat the grep inside the tarball.
5. Record local unpacked SHA-256 manifest for later comparison.

## Phase 3 — Isolated DSH install (real model)

1. Fresh temp root: DSH home, sessions, plugin data, profile.
2. Install the tarball by path with `dsh plugin --profile <isolated> add <absolute-tgz>`.
3. Verify:
   - installed package name is `@elvisw/dsh-plugin-magic-context`
   - loader row name is the new package; row id is `magic-context-dsh`
   - settings namespace still resolves
   - no old package in the profile
4. Run one real smoke prompt with `deepseek-official/deepseek-flash` (or the current documented route) and record sentinel/model route.
5. Confirm daily profile and daily plugin data were not touched.

## Phase 4 — Bootstrap and trust (HITL, authorized)

1. Confirm npm login identity owns `@elvisw`; confirm account-level 2FA.
2. Create a temporary granular token with publish permission for `@elvisw`; store it only in the shell environment.
3. `npm publish --provenance=false --tag bootstrap` from a tree whose version is `0.0.0-bootstrap.0` (temporary version edit, not committed).
4. Revoke the token.
5. `npm trust github @elvisw/dsh-plugin-magic-context --file release.yml --repo elvisw/dsh-plugin-magic-context --allow-publish`.
6. `npm trust list` verifies repo/workflow + publish permission.

## Phase 5 — Release (HITL, authorized)

1. Restore `0.12.0` in `package.json`/lock (if the bootstrap edit was local).
2. Ensure `main` is clean and green: `npm test`, `npm run typecheck`, `npm run build`, `npm run check:i18n`.
3. Commit the identity changes; push `main`.
4. Create and push `v0.12.0` only after explicit authorization.
5. Wait for `.github/workflows/release.yml`; verify publish + provenance.
6. Verify registry:
   - `npm view @elvisw/dsh-plugin-magic-context@0.12.0 version dist.integrity`
   - extract published tarball and compare unpacked hashes with local manifest
   - `npm trust list` shows the release binding
7. Confirm upstream `dsh-plugin-magic-context` unchanged.

## Verification matrix

| Check | Method | Required |
|---|---|---|
| Identity consistent | grep built tree + tarball | yes |
| Tarball filename | `npm pack --dry-run` | yes |
| Loader row id / settings namespace | isolated host boot + settings lookup | yes |
| Real load | isolated DSH + real model smoke | yes |
| Old package absent | profile package list | yes |
| Daily profile untouched | path audit | yes |
| Trusted publisher | `npm trust list` | after bootstrap |
| Published artifact | registry view + unpacked hashes + provenance | after release |
| Regression | test/typecheck/build/i18n | yes |

## HITL gates

- Before the bootstrap publish (requires npm token/2FA).
- Before `v0.12.0` tag push (requires explicit authorization).
- If npm identity does not own `@elvisw`: stop and ask for the actual identity/name; do not silently rename.

## Out of scope

- Loader row id, settings namespace, data directory, plugin export name.
- Upstream PR or changes to `wk544863858/dsh-plugin-magic-context`.
- T2–T5 behavior changes.
- Rewriting historical `_bmad-output/` evidence.
