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
- `PARITY.md` says its table was last fully re-verified to `v0.49.30`, while
  `0.11.2` separately followed `v0.49.30 → v0.49.50` (375 non-merge commits)
  for three background-lane defects. The current decision baseline is
  `v0.49.55`; `v0.49.50 → v0.49.55` is not swept, and the table must not be
  read as a full `v0.49.55` parity claim. The existing note must distinguish
  “table last verified” from “targeted follow-up reviewed”.

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

2. **Parity document separates full verification, targeted follow-up, and
   decision baseline.**
   - `PARITY.md` still records `v0.49.30` as the last **full table**
     verification; that is accurate and stays.
   - Record that `0.11.2` followed `v0.49.30 → v0.49.50` for the three
     background-lane defects (`CHANGELOG.md` 0.11.2) without re-walking every
     table row.
   - Record the decision baseline as `v0.49.55`, with
     `v0.49.50 → v0.49.55` unswept; the existing rows are not a full
     `v0.49.55` parity claim.
   - Do not claim runtime parity or rewrite the historical
     `docs/upstream-followup-2026-10-30.md` report.

3. **Baseline documents are labelled, not rewritten.**
   - `docs/dsh-plugin-upgrade-followup.md` is an active upgrade runbook, not a
     historical record. Add a note that its `v0.49.30` anchor is the last full
     table verification, `0.11.2` reviewed `v0.49.30 → v0.49.50` for the
     background lanes, and `v0.49.50 → v0.49.55` must be re-walked before using
     the runbook at `v0.49.55`.
   - Add a note to `docs/research-handoff-ctx-flush-2026-11-11.md` that the
     `dsh-plugin-magic-context@0.11.1` gap it describes is **closed** in
     `0.12.0` (implementation plus host acceptance), so the file is historical
     research only.
   - Do not edit files under `_bmad-output/.../acceptance-windows-*` or any
     historical evidence.

4. **Packaged docs are not churned for this ticket.**
   - Only `README.zh-CN.md:20` has the “已核到 v0.49.30” status line;
     `README.md` does not. That line is accurate as the last full table
     verification, but it does not name the decision baseline. Leave the
     packaged READMEs unchanged so the npm `0.12.1` snapshot still matches the
     repository; record that the next functional release can expand the line
     into the three-level baseline. This is an explicit scope decision, not a
     claim that the line is already complete.
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
- `PARITY.md` contains `v0.49.30` (full table last verified), `v0.49.50`
  (targeted follow-up), and `v0.49.55` (decision baseline), plus the note that
  `v0.49.50 → v0.49.55` is unswept.
- The upgrade runbook carries the three-level note and is not called
  historical; the research handoff note says the #15 gap is closed in `0.12.0`.
- `git diff --stat` shows only documentation and ticket 7 bookkeeping, and a
  packaged-file check shows `README.md`, `README.zh-CN.md`, `package.json`, and
  `lib/` are unchanged.
- An independent review confirms the notes do not overclaim a `v0.49.55` sweep
  and the release guide matches the evidence in
  `acceptance-windows-dsh-2026-11-14-package-identity/`.

## Boundaries

- Not a parity sweep; do not inspect upstream `v0.49.55` source.
- Not a release; do not bump, tag, or publish.
- Not a rewrite of historical research or acceptance records.
- Not the V1.1 `ctx_expand` `start`/`end`/`verbose` work.
