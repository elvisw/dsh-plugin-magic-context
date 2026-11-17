# Release 0.16.0 — acceptance report

Status: **PASS** for the published artifact, registry publication, and the
registry-install smoke. This is a feature release for **T20 remote embedding**
and **T21 Settings UI redesign**. The release commit itself adds only version
and documentation changes on top of the T21-gated candidate; no new Web UI gate
was run at tag time.

## 1. Release identity

- Package: `@elvisw/dsh-magic-context@0.16.0`
- Release commit: `3ea88bff16ee6f4583782091c45274d98bad53c6`
  (`chore(release): 0.16.0`)
- Tag: annotated `v0.16.0`, pointing at the release commit
- Workflow: `Release` (`displayTitle: chore(release): 0.16.0`), head branch
  `v0.16.0`, run `44004632463`, conclusion `success`
- Registry `latest`: `0.16.0`; `bootstrap`: `0.0.0-bootstrap.0`
- `gitHead`: `3ea88bff16ee6f4583782091c45274d98bad53c6`
- Provenance: two attestations (npm publish v0.1 and SLSA provenance v1); the
  SLSA subject digest matches the published `dist.integrity`.

Evidence: `evidence/registry-view.json`, `evidence/release-run.json`,
`evidence/attestation.json`, `evidence/tag.txt`, `evidence/tag-commit.txt`.

## 2. Published artifact

- Registry tarball: 4,054,414 bytes, 68 files
  - SHA-1 / `dist.shasum`: `e3c687bb1e263cb97bfedd850dd783b00e52f5ca`
  - SHA-256: `ac058376c5d25f01f4d3c72bbd0d6dfc66f5e04e80884c5d1fee34e1ac33032a`
  - integrity: `sha512-gvRd8pnhVXKsiyhgEizADhl8KK4Y+yZbTKuEtKHE2tDfLvr8hjOrKwNgOOKH4PygA8u2vikkbB7CZ3iKFlGTWw==`
- The local `npm pack` candidate is byte-identical to the registry tarball:
  same SHA-1/SHA-256, bytes, and all 68 member contents.

Compared with the T21-gated candidate (SHA-256 `5454554b…`, 4,054,369 bytes),
the release tarball differs only in `README.md`, `README.zh-CN.md`, and
`package.json`; `lib/` is unchanged after LF normalization. The T21 45-step
Web gate therefore still covers the shipped library code.

Evidence: `evidence/npm-pack.txt`, `evidence/tarball-compare.json`,
`evidence/pack-compare-previous.json`.

## 3. Source gates

Run on the release tree:

- `npm test`: 80 files / 972 tests passed
- `npm run typecheck`: passed
- `npm run check:i18n`: passed; 296 client dictionary keys, 175 settings copy
  keys, no hard-coded Chinese outside the dictionaries
- `npm run build`: passed

The release workflow independently passed Typecheck, Test, Build, Check i18n,
artifact inspection, and Publish. Evidence: `evidence/unit-test.txt`,
`evidence/typecheck.txt`, `evidence/i18n.txt`, `evidence/build.txt`,
`evidence/release-run.json`.

## 4. Registry install smoke

A fresh isolated DSH headless profile under
`%TEMP%\opencode\mc-t0-2026-11-13\tools\dsh-mc-v0160-release-20261117-104458`
installed the published specifier
`@elvisw/dsh-magic-context@0.16.0`.

Observed:

- installed package name/version: `@elvisw/dsh-magic-context` / `0.16.0`
- `--dump-config` contains `@elvisw/dsh-magic-context` and row id
  `magic-context-dsh`
- one real-model request returned exactly `V0160_REGISTRY_OK`
- DSH profile/config/session state stayed under the isolated `DSH_HOME` /
  `HOME` / `USERPROFILE` / `XDG_*` / `APPDATA` / `LOCALAPPDATA` root. pnpm
  reused the user-level content-addressable store
  (`C:\Users\elvis\AppData\Local\pnpm\store\v11`), as recorded in
  `evidence/registry-host/add-registry.txt`; the daily `web` profile was not
  modified.

Evidence: `evidence/registry-host/registry-e2e.json`,
`evidence/registry-host/add-registry.txt`,
`evidence/registry-host/dump-config.txt`,
`evidence/registry-host/smoke.txt`, `evidence/host-state.json`.

## 5. Scope and boundaries

- `0.16.0` contains T20 remote OpenAI-compatible embedding and T21 Settings UI
  redesign. T21 removes the legacy `plugins.item` / `plugins.row.config` seats;
  hosts without `settings.section` have no configuration entry. This is
  recorded as a breaking change in `CHANGELOG.md`.
- No new Web UI gate was run at tag time. The release tree changes only version
  metadata and README content relative to the T21 candidate; `lib/` is
  unchanged.
- The registry smoke uses a fake/isolated profile and one real model request;
  it does not call a paid embedding vendor.
- No desktop-specific validation, dsh-go port, or daily `web` profile upgrade
  is claimed by this release.
- Secret scan of the committed packet: 0 hits.
