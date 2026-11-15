# T15 release — `@elvisw/dsh-magic-context@0.13.0`

Date: 2026-11-15
Ticket: `initiative-dsh-magic-context/15`
Release commit: `f61e42beea88e10dd0bb2e1a51fc86a71dd2730f`
Tag: `v0.13.0` (annotated, points to `f61e42b`)
Workflow: `release.yml` run `43719644203` — success

## 1. Release result

| Item | Value |
| --- | --- |
| Package | `@elvisw/dsh-magic-context` |
| Version | `0.13.0` |
| `dist-tags.latest` | `0.13.0` |
| `dist-tags.bootstrap` | `0.0.0-bootstrap.0` |
| Tarball | `elvisw-dsh-magic-context-0.13.0.tgz` |
| Size | 4,007,255 bytes |
| Files | 66 |
| SHA-256 | `1c8ac596be020e72b6e0103c287bcd606721dccd5af5b118605d253e2049dfd6` |
| SHA-1 / `dist.shasum` | `f64dd86cc65f455566a4b06b10b0a7b598ce961f` |
| Integrity | `sha512-+wyCgXTD78S6oGQj+yKkXNAVHmcidw85WA8JcNXnozEbj/fuACB/qLVvRa/mKKD5omKIln3dAbJnLaUP3kV7Ww==` |
| `gitHead` | `f61e42beea88e10dd0bb2e1a51fc86a71dd2730f` |
| Provenance | SLSA provenance v1 (plus npm publish attestation) |

The registry tarball and the local release tarball are byte-identical
(`evidence/artifact-compare.json`): same SHA-256, same SHA-1, same 4,007,255
bytes, 66 files. The packed `package.json` identifies the package as
`@elvisw/dsh-magic-context@0.13.0`.

The registry also contains an npm-created `0.0.0-stage` placeholder (2 files,
347 bytes unpacked, uploaded at 2026-11-15T13:29:42Z). It has no dist-tag and is
not installed by the documented specifier; it was left untouched rather than
unpublished. The bootstrap version `0.0.0-bootstrap.0` remains under the
`bootstrap` dist-tag.

Every published version of the old package
`@elvisw/dsh-plugin-magic-context` is now deprecated with the rename message:
`0.0.0-stage`, `0.0.0-bootstrap.0`, `0.12.0`, `0.12.1`, `0.12.2`, `0.12.3`
(`evidence/deprecate-old.txt`, `evidence/old-package-metadata.json`). The old
package was not unpublished; its `latest` remains `0.12.3` and resolves only
with the deprecation warning.

## 2. Bootstrap and Trusted Publisher

1. The repository was authenticated as `elvisw`, and the package name returned
   404 before bootstrap.
2. The version was temporarily set to `0.0.0-bootstrap.0` without a Git tag.
   `npm publish --provenance=false --tag bootstrap --access public` was run from
   the user's terminal because the registry required a web-auth one-time
   password. Published shasum: `ebacacc331a1511c43dcfd8b271c502418e4bbe4`.
3. `package.json` and `package-lock.json` were restored from Git to `0.13.0`
   immediately after the bootstrap publish; the bootstrap version was never
   committed.
4. Trusted Publisher was created for
   `elvisw/dsh-plugin-magic-context`, workflow file `release.yml`, with
   `publish` permission. The setup output reported id
   `3cae2201-83f0-4aa7-b2e9-f3d03166a677` and permissions
   `publish, stage publish`. A later `npm trust list` invocation required a
   one-time password, so the durable evidence for the binding is the successful
   OIDC publish below, not a saved trust-list output.
5. The annotated tag `v0.13.0` was pushed. The release workflow passed its
   version/tag/main/not-already-published guards, ran typecheck/tests/build/i18n,
   and published through OIDC. The GitHub run is successful and points at
   `f61e42b`.

The registry publication used npm's OIDC Trusted Publishing path; no long-lived
npm token was stored in the repository.

## 3. Registry install smoke

A fresh isolated headless profile was created under
`%TEMP%\opencode\mc-t0-2026-11-13\tools\dsh-mc-t15-release-20261115-213833`
with isolated `DSH_HOME`, `HOME`, `USERPROFILE`, `XDG_*`, `APPDATA` and
`LOCALAPPDATA`.

`dsh plugin --profile headless add @elvisw/dsh-magic-context@0.13.0
--ignore-scripts` installed the registry artifact (`add-registry.txt`). The
installed package reports:

- name `@elvisw/dsh-magic-context`
- version `0.13.0`
- `tools/migrate-profile-package-name.mjs` SHA-256 `ffd1a2b4…`
- `lib/index.js` SHA-256 `445a0200…`

`--dump-config` with a fresh overlay shows the new package name and row id
`magic-context-dsh` (`dump-config.txt`). A real-model request returned exactly
`T15_REGISTRY_OK` (`smoke.txt`), with model listing from the DeepSeek provider.

## 4. What this proves

- The published registry artifact is the same bytes as the reviewed local
  release tarball.
- The package can be installed by its public specifier into a clean DSH profile.
- The installed package loads with the new package identity while preserving the
  loader row id.
- The registry release has a successful GitHub workflow and SLSA provenance.
- The `latest` dist-tag points at `0.13.0`.

## 5. What this does not prove

- The daily profile was not modified or upgraded by this release gate.
- The TUI/Web slash-command and settings-card interaction was not exercised in
  this release smoke; the package-rename host gate covers configuration
  migration, and T13 will cover the new Settings UI.
- The old package remains published (not unpublished); only the deprecation
  warning redirects users to the new package.
- The `0.0.0-stage` npm placeholder was not removed.
- This is not a full upstream parity or combined 0.12.x host regression.

## 6. Evidence index

- `evidence/artifact-compare.json` — registry/local hashes and file count
- `evidence/registry-metadata.json` — registry document including dist-tags
- `evidence/attestations.json` — publish + SLSA attestations
- `evidence/release-workflow.json` — GitHub run identity and result
- `evidence/git-tag.txt` — annotated tag object
- `evidence/npm-view-0.13.0.json`, `evidence/npm-view-bootstrap.json`
- `evidence/deprecate-old.txt`, `evidence/old-package-metadata.json`
- `evidence/add-registry.txt`, `evidence/dump-config.txt`, `evidence/smoke.txt`
- `evidence/registry-e2e.json` — machine-readable install-smoke result
