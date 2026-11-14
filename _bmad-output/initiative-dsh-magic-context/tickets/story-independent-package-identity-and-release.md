---
id: 6
type: story
title: "Independent package identity and release"
parent: initiative-dsh-magic-context
after: [5]
refined: true
hitl: true
risk: high
---

# Independent package identity and release

## Summary

Move the fork off the upstream-owned npm package `dsh-plugin-magic-context` to an independent identity, then publish the first release from `elvisw/dsh-plugin-magic-context`. The default name is **`@elvisw/dsh-plugin-magic-context`**; if the publisher does not own that npm scope, stop and return the name decision to the user instead of silently picking another one.

This ticket changes package identity and release plumbing. It does **not** rename the Cordis loader row id (`magic-context-dsh`), the settings namespace, the plugin data directory (`magic-context-dsh-poc`), or the internal plugin export name (`magic-context-dsh-poc`). Existing local data must remain readable.

## Why now

- npm `dsh-plugin-magic-context` is owned by maintainer `wk544863858`.
- This repository is `elvisw/dsh-plugin-magic-context`; the publisher has no confirmed ownership of the upstream package, and the npm CLI is not logged in.
- The upstream issues have not received a response, so the fork is maintained independently (decision 2026-11-13) and needs its own installable package.
- `0.12.0` is already prepared in this repo but is not published.

## Requirements

1. **New package identity is consistent.**
   - `package.json` `name` is `@elvisw/dsh-plugin-magic-context`; `homepage`, `bugs.url`, and `repository.url` point at `elvisw/dsh-plugin-magic-context`; `author`/`contributors` do not present the fork as the upstream author (preserve upstream credit in `NOTICE`).
   - `package-lock.json` carries the same root name/version.
   - `cordis.patch.yml` row `name` uses the new package specifier; row `id` stays `magic-context-dsh`.
   - `src/client/index.js` uses the new package name for both the client module id and `PKG_NAME`; the settings namespace stays `magic-context-dsh`.
   - `tools/install-magic-context.bat` keeps **two variables**: `PKG=@elvisw/dsh-plugin-magic-context` for `dsh plugin add/remove`, and `TGZ_PREFIX=elvisw-dsh-plugin-magic-context` for locating `<prefix>-*.tgz` (npm sanitizes `@scope/name`). Do not use `%PKG%` as a filesystem glob.
   - Runtime code and build output contain no hard-coded upstream package specifier.

2. **User-facing install and project links are updated.**
   - `README.md` / `README.zh-CN.md`: title may keep the product name, but install/remove/clone commands, badges, patch examples, and raw image URLs must be internally consistent with the new repository and package.
   - `CONTRIBUTING.md` and `SECURITY.md`: clone and advisory links point at `elvisw/dsh-plugin-magic-context`.
   - `.github/ISSUE_TEMPLATE/{config,bug_report,feature_request}.yml`: security/README/CONTRIBUTING links point at the fork.
   - `CODE_OF_CONDUCT.md`: enforcement/contact links point at the fork where they reference the repository.
   - `CHANGELOG.md` compare/tag links use `elvisw/dsh-plugin-magic-context`.
   - `PARITY.md`: adapter package name reflects the new identity.
   - Current operational docs that tell a reader what to install or which package name to use (`docs/dsh-plugin-upgrade-followup.md`, `docs/dsh-plugin-config-ui-contract.md`, `docs/dsh-plugin-ui-telemetry-contract.md`) are updated where they are instructions; historical measurements/quotes may keep the old name with a dated note. Do not mass-rewrite `_bmad-output/` evidence.
   - Add `docs/independent-package-release.md` explaining: old package must be removed before adding the new one (same loader row id), data directory is unchanged, and the new package is not the upstream `dsh-plugin-magic-context`.

3. **Release plumbing works for the new name, including the first-publish bootstrap.**
   - `.github/workflows/release.yml` remains name-agnostic and passes its tag/version/registry guards for the new package.
   - The publisher has an npm account that owns `@elvisw` (or returns to the user to choose an available name).
   - **Bootstrap the package before Trusted Publishing can be bound.** `npm trust` requires the package to exist, so the first publish is a throwaway `0.0.0-bootstrap.0` published with a temporary granular token, `--provenance=false` (local token publishes cannot produce provenance), and `--tag bootstrap` (not `latest`), then the token is revoked. This is a one-time bootstrap, not the release version.
   - The npm account has 2FA enabled before binding. After the bootstrap version exists, `npm trust github @elvisw/dsh-plugin-magic-context --file release.yml --repo elvisw/dsh-plugin-magic-context --allow-publish` is run, and `npm trust list` is checked for the repo/workflow and publish permission.
   - `v0.12.0` is pushed only after `main` is green and the artifact inspection passes. The tag must publish through OIDC; a manual `npm publish 0.12.0` is forbidden because it would consume the version without provenance and trip the release workflow’s “already published” guard.
   - The upstream `dsh-plugin-magic-context` package is never re-published or modified.

4. **Artifact and host install are verified.**
   - `npm pack --dry-run` shows the new package name and expected file list; a built-tree grep (not dry-run) confirms `lib/` and `cordis.patch.yml` contain no upstream package specifier.
   - An isolated DSH profile installs the packed artifact (temp root, no daily profile), loads the plugin, and completes one real model smoke call.
   - The loader boots the new package name; the settings card still resolves namespace `magic-context-dsh`.
   - The old package is not present in the isolated profile.

5. **Published package is verified, not assumed.**
   - `npm view @elvisw/dsh-plugin-magic-context@0.12.0 version dist.integrity` resolves; `dist.integrity` is recorded but not used as the local-artifact equality test.
   - The published tarball’s unpacked file hashes match the locally packed artifact.
   - `npm trust list @elvisw/dsh-plugin-magic-context` shows the GitHub trusted publisher entry.
   - The release workflow run succeeds and produces provenance.

6. **Boundaries.**
   - Do not rename the loader row id, settings namespace, data directory, or plugin export name.
   - Do not add new recovery features or alter T2–T5 behavior.
   - Do not open an upstream PR or push to `wk544863858/dsh-plugin-magic-context` as part of this ticket.
   - Do not publish until the user explicitly authorizes the tag/publish step.

## Acceptance criteria

- A clean build from this repo has `name: "@elvisw/dsh-plugin-magic-context"` in `package.json`, `package-lock.json`, `cordis.patch.yml`, and `lib/client.js`; the built tree (not `git grep`, because `lib/` is ignored) is grepped for the upstream package specifier and returns nothing in `lib/`, `cordis.patch.yml`, and install commands.
- `npm pack --dry-run` reports the new package name and the expected files, and the tarball filename is `elvisw-dsh-plugin-magic-context-0.12.0.tgz`; no upstream package name appears in the extracted tarball’s runtime files.
- In a fresh isolated DSH profile, `dsh plugin add <tarball>` installs the new package, the host boots it, and a real model smoke call returns the expected sentinel; the daily profile is untouched.
- After the authorized publish: `npm view @elvisw/dsh-plugin-magic-context@0.12.0` resolves; the registry tarball and the locally packed tarball have identical unpacked file hashes (not only a gzip-level integrity string); provenance exists; `npm trust list` shows the release workflow with publish permission.
- `npm test`, `npm run typecheck`, `npm run build`, and `npm run check:i18n` pass. `npm run gate` is **not** the release gate: if it is run, only `acceptance`, `memory audit`, and `records check` may fail on absent daily databases, and that must be reported separately, not treated as a code failure.
- The upstream package `dsh-plugin-magic-context` remains unchanged.

## Verification plan

1. **Identity sweep (no model):** `git grep` for the old name, update only current runtime/user-facing files, leave historical evidence and old acceptance reports untouched.
2. **Package inspection (no model):** `npm run build`, `npm pack --dry-run`, inspect `package.json` and runtime files inside the tarball.
3. **Isolated host install (real model):** temp DSH home/profile, install the tarball by path, verify boot/loader/settings namespace, run one smoke prompt. Record the model route and sentinel.
4. **Bootstrap (authorized):** log in/confirm scope and 2FA; publish `0.0.0-bootstrap.0` with a temporary granular token, `--provenance=false`, and `--tag bootstrap`; revoke the token.
5. **Bind trusted publisher (authorized):** `npm trust github @elvisw/dsh-plugin-magic-context --file release.yml --repo elvisw/dsh-plugin-magic-context --allow-publish`; verify with `npm trust list` that the repo/workflow and publish permission are present.
6. **Release (authorized):** push `v0.12.0` only after `main` is green; wait for Release; verify registry, unpacked hashes, and provenance.
7. **Regression:** run full test/typecheck/build/i18n and compare artifact identity before/after.

## Risks

| Risk | Level | Handling |
|---|---|---|
| npm account does not own `@elvisw` scope | high | Stop before renaming; ask the user for the actual npm identity or an available unscoped name. |
| First publish cannot use OIDC because the package does not exist | high | Publish `0.0.0-bootstrap.0` with a temporary token, `--provenance=false`, and `--tag bootstrap`; revoke the token; never publish `0.12.0` manually. |
| Trusted Publisher bound to the wrong repo/workflow | high | `npm trust list` before tagging; fix in npm UI, not by adding a long-lived token. |
| Old and new packages both installed | medium | Same loader row id; document “remove old package first”, verify isolated profile has only the new one. |
| README images still point at upstream repo | low | Point them at the fork or keep them only if the fork serves them; verify raw URLs. |
| `npm run gate` failure mistaken for release blocker | medium | Release workflow runs typecheck/test/build/i18n; report the daily-DB acceptance failures separately. |
| Accidental publish on tag before authorization | high | Do not create or push the tag until the user explicitly authorizes it. |

## References

- `package.json`, `package-lock.json`, `cordis.patch.yml`
- `src/client/index.js` (`id`, `PKG_NAME`)
- `tools/install-magic-context.bat`
- `README.md`, `README.zh-CN.md`, `CONTRIBUTING.md`, `SECURITY.md`, `PARITY.md`
- `.github/workflows/release.yml`
- `CHANGELOG.md` (`0.12.0`)
- `_bmad-output/initiative-dsh-magic-context/tickets/story-tag-retention-alignment.md` (predecessor)
