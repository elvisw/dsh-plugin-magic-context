---
id: 7
type: story
title: "Docs consistency: release guide and upstream baseline"
parent: initiative-dsh-magic-context
after: [6]
refined: true
hitl: false
risk: low
---

# Docs consistency: release guide and upstream baseline

## Summary

Align the active operational documentation with the releases and decisions that
already happened, without changing code, package version, npm artifacts, or
historical acceptance evidence.

The two concrete drifts are:

- `docs/independent-package-release.md` still describes the bootstrap as a
  temporary-token publish that must be followed by token revocation, and uses
  `0.12.0` as the current release. The actual bootstrap used npm web
  authentication/2FA and created no token; the current release is `0.12.1`.
- `PARITY.md` says the comparison was last re-verified to `v0.49.30`, while the
  project decision baseline is `v0.49.55`. The `v0.49.30 → v0.49.55` delta has
  not been swept line by line, so the document must not imply that it has.

## Why now

The package is published and the release report is closed. Leaving the release
guide and the parity target ambiguous makes the next maintainer repeat work or
misstate the supported upstream baseline. This is a documentation correction,
not a new feature.

## Requirements

1. **Release guide matches the actual bootstrap and current release.**
   - In `docs/independent-package-release.md`, describe the interactive
     `npm publish` path (web authentication/2FA) as the path actually used.
   - Keep a temporary granular token only as a fallback for a non-interactive
     environment; revocation is conditional on that fallback being used.
   - Replace current-version examples pinned to `0.12.0` with the current
     `0.12.1` or a generic `v<version>` form; do not rewrite historical
     changelog entries.
   - The post-publish check must include `dist-tags` and the `latest` version.

2. **Parity document separates verified target from decision baseline.**
   - `PARITY.md` still records `v0.49.30` as the last line-by-line verified
     target; that is accurate and stays.
   - Add an explicit note and table row that the decision baseline is
     `v0.49.55`, and that the delta between the two has not been swept; the
     existing rows are not a `v0.49.55` parity claim.
   - Do not claim runtime parity or rewrite the historical
     `docs/upstream-followup-2026-10-30.md` report.

3. **Historical baseline documents are labelled, not rewritten.**
   - Add a short note to `docs/dsh-plugin-upgrade-followup.md` that its
     `v0.49.30` runbook is historical and the current decision baseline is
     `v0.49.55`, unswept.
   - Add a short note to `docs/research-handoff-ctx-flush-2026-11-11.md` that
     its `dsh-plugin-magic-context@0.11.1` baseline predates the `0.12.0`
     flush/recovery changes.
   - Do not edit files under `_bmad-output/.../acceptance-windows-*` or any
     historical evidence.

4. **Packaged docs are not churned for this ticket.**
   - `README.md` / `README.zh-CN.md` say “verified to v0.49.30”, which remains
     factually the last line-by-line verification. Leave the packaged README
     files unchanged so the npm `0.12.1` snapshot still matches the repository;
     the next functional release can add the baseline clarification.
   - No `package.json` version bump, no build, no npm publish, and no new tag.

5. **No behavior or data change.**
   - No source, tests, schema, `package.json`, `package-lock.json`, or tarball
     change.
   - No DSH host run or model call.

## Verification

- `git diff --check` is clean.
- `rg -n "立即吊销临时 token|恢复仓库内的 `0\\.12\\.0`|publish `0\\.12\\.0`|@0\\.12\\.0 version" docs/independent-package-release.md`
  returns no matches. The guide may still mention `0.12.0` once as the start of
  the package line; that is historical context, not a current-version example.
- The guide contains the conditional fallback (“只有在无法交互...才...吊销”), the
  interactive web-auth sentence, `@0.12.1`, and `dist-tags.latest`.
- `PARITY.md` contains both `v0.49.30` (last verified) and `v0.49.55`
  (decision baseline), plus the no-sweep note.
- The two historical documents carry the new notes and keep their original
  dates/revisions.
- `git diff --stat` shows only documentation files, and a packaged-file check
  shows `README.md`, `README.zh-CN.md`, `package.json`, and `lib/` are unchanged.
- An independent review confirms the notes do not overclaim a `v0.49.55` sweep
  and the release guide matches the evidence in
  `acceptance-windows-dsh-2026-11-14-package-identity/`.

## Boundaries

- Not a parity sweep; do not inspect upstream `v0.49.55` source.
- Not a release; do not bump, tag, or publish.
- Not a rewrite of historical research or acceptance records.
- Not the V1.1 `ctx_expand` `start`/`end`/`verbose` work.
