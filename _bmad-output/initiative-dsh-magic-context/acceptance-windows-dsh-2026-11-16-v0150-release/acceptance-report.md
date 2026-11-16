# Release 0.15.0 — acceptance report

Status: **PASS** for the published release artifact, registry publication, and
the registry-install smoke. **0.15.0 is the feature release for T18 telemetry
v2**; the tag itself adds only version/docs on top of the T18-gated 0.14.0
candidate, so no new Web UI gate was run at tag time.

## 1. Release identity

- Package: `@elvisw/dsh-magic-context@0.15.0`
- Release commit: `599968811e4e644681f1ce61085621351c991027`
  (`chore(release): 0.15.0`)
- Tag: annotated `v0.15.0`, pointing at the release commit
- Workflow: `Release` (`displayTitle: chore(release): 0.15.0`), head branch
  `v0.15.0`, run `43837243523`, conclusion `success`
- Registry `latest`: `0.15.0`; `bootstrap`: `0.0.0-bootstrap.0`
- `gitHead`: `599968811e4e644681f1ce61085621351c991027`
- Provenance: SLSA v1, workflow `refs/tags/v0.15.0`, repository
  `elvisw/dsh-plugin-magic-context`, workflow path
  `.github/workflows/release.yml`; the attestation subject `sha512` digest
  decodes to the published `dist.integrity`.

Evidence: `evidence/registry-view.json`, `evidence/release-run.json`,
`evidence/attestation.json`, `evidence/tag.txt`.

## 2. Published artifact

- Registry tarball: 4,027,461 bytes, 66 files
  - SHA-1 / `dist.shasum`: `99c0fa7d6b13a828484e7725ae8459201007b60d`
  - SHA-256: `cf0965b3c791c462e49c5b5cd3be31a141f4644fc43c8e619622b7c7d4e965eb`
  - integrity: `sha512-KbaSs7fKIBUzYOtChS8Na2aPCNJ1q2na+v399tenfOHuffFaMkwLnRaZH/yVpKEWjzdt15GgaX8lHg2zur0Www==`
- The local `npm pack` candidate from the final worktree is byte-identical:
  same 4,027,461 bytes, same SHA-1/SHA-256, 66 files. All 66 member content
  hashes match.
- Secret scan of the release packet: 0 hits.

The earlier T18-gated candidate (`0.14.0` tarball,
SHA-256 `2058d50a…40c13`) differs from this release in
`README.md`, `README.zh-CN.md`, `package.json`, and the line endings of
`lib/client.js`. After LF normalization, only the two README files and
`package.json` differ; `lib/` has no content change. The T18 Web gate therefore
still covers the shipped library code.

Evidence: `evidence/npm-pack.txt`, `evidence/tarball-compare.json`,
`evidence/pack-compare.json`.

## 3. Source gates

Run on the release tree (Windows working tree, LF sources):

- `npm test`: 78 files / 939 tests passed
- `npm run typecheck`: passed
- `npm run check:i18n`: passed, 193 client dictionary keys, no hard-coded
  Chinese outside the dictionaries
- `npm run build`: passed

The release workflow independently passed Typecheck, Test, Build, Check i18n,
artifact inspection, and Publish. Evidence: `evidence/unit-test.txt`,
`evidence/typecheck.txt`, `evidence/i18n.txt`, `evidence/build.txt`,
`evidence/release-run.json`.

## 4. Registry install smoke

A fresh isolated DSH headless profile under
`%TEMP%\opencode\mc-t0-2026-11-13\tools\dsh-mc-v0150-release-20261116-171435`
installed the published specifier
`@elvisw/dsh-magic-context@0.15.0`.

Observed:

- installed package name/version: `@elvisw/dsh-magic-context` / `0.15.0`
- `--dump-config` contains `@elvisw/dsh-magic-context` and row id
  `magic-context-dsh`
- one real-model request returned exactly `V0150_REGISTRY_OK`
- DSH profile/config/session state stayed under the isolated `DSH_HOME` /
  `HOME` / `USERPROFILE` / `XDG_*` / `APPDATA` / `LOCALAPPDATA` root. pnpm
  reused the user-level content-addressable store
  (`C:\Users\elvis\AppData\Local\pnpm\store\v11`), as recorded in
  `evidence/registry-host/add-registry.txt`; the daily `web` profile was not
  modified

Host: DSH `0.2.2-rc.1`, Node `24.21.0`, profile `headless`.
Evidence: `evidence/registry-e2e-run.txt`, `evidence/host-state.json`,
`evidence/registry-host/`.

## 5. Functional evidence reuse

The 0.15.0 code is the T18 implementation. T18's final isolated DSH Web gate
ran against the 0.14.0 candidate with root
`%TEMP%\opencode\dsh-mc-t18-20261116-162514`:

- 13 UI assertions true, 0 browser errors
- 939 unit tests
- 66-file tarball, SHA-256 `2058d50a…40c13`

`package/lib` in the published 0.15.0 artifact is content-identical to that
gated candidate (line endings aside). The T18 UI ran against the `0.14.0`
package; the `0.15.0` package carries `0.15.0`, but no 0.15.0 browser run
observed the version string. The T18 assertions do not pin it. This report
does not re-run the browser gate for the tag.

## 6. Boundaries

- 0.15.0 ships the T18 telemetry v2 UI; this is not a docs-only release.
- No new Web UI interaction matrix was run at the 0.15.0 tag; the T18 gate
  remains the feature-level UI evidence.
- The registry-install smoke ran headless, not in the Web UI, and used one real
  model turn.
- Desktop DSH was not separately exercised.
- The Daily `web` profile was not upgraded or otherwise modified by this
  release gate.
- This release did not change the old package's deprecated status; the old
  `@elvisw/dsh-plugin-magic-context` versions remain deprecated but published.

## 7. Evidence

- `evidence/unit-test.txt`, `typecheck.txt`, `i18n.txt`, `build.txt`
- `evidence/npm-pack.txt`, `npm-pack-dry-run.txt`
- `evidence/registry-e2e-run.txt`, `evidence/host-state.json`
- `evidence/registry-host/` — install, bootstrap, dump-config, and model smoke
- `evidence/registry-view.json`, `release-run.json`, `attestation.json`,
  `tag.txt`
- `evidence/tarball-compare.json`, `pack-compare.json`
- `compare_tarballs.py` — regenerates both comparisons
- `sha256-manifest.json` — hashes of committed evidence, reports, and scripts
