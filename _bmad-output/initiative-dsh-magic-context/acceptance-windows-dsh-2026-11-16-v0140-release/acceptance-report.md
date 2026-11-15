# Release 0.14.0 — acceptance report

Status: **PASS** for the release artifact, registry publication, and the scoped
Settings smoke. This is not a new full Settings-gate run; T13's 20-step Web gate
remains the feature-level evidence and was run against an earlier candidate.

## 1. Release identity

- Package: `@elvisw/dsh-magic-context@0.14.0`
- Release commit: `48c49485647e9fd63c6431816a5f96641272bcb3` (`chore(release): 0.14.0`)
- Tag: `v0.14.0` (annotated; points at the release commit)
- Workflow: Release run `43736756681`, conclusion `success`
- Registry `latest`: `0.14.0`; `bootstrap`: `0.0.0-bootstrap.0`
- Provenance: SLSA v1, `gitHead=48c4948`; registry attestation bundle has two
  predicates (`npm publish v0.1` and `SLSA provenance v1`), and its subject
  `sha512` digest decodes to the hex form of the published `dist.integrity`.
- Registry tarball: 4,016,594 bytes, 66 files
  - SHA-1 / `dist.shasum`: `230d8c0edfa7ace60293e8e589a0c529d18d2008`
  - SHA-256: `1a47c4561922a09a4dfc477112a54b5dbe64a8800f8c5fac1d0aae1d6261c183`
  - integrity: `sha512-fliA4uhDAsLA2OvUJi0PIRgZ8x+l6GXx7oPXt3zA/j3M2cbUcs2rFu4bmew/Q/61DWowA1aLq6Dq3ipyHU1b2Q==`

Evidence: `evidence/registry-view.json`, `evidence/release-run.json`,
`evidence/attestation.json`, `evidence/tag.txt`,
`evidence/tarball-compare.json`.

## 2. Local candidate vs registry artifact

The local `npm pack` candidate was 4,016,894 bytes with SHA-1
`63ab0cbe0532f20c4aeb4f976579ec010a9e3807` and SHA-256
`7ba1bb6f0dd1a2c42559e2750c181efda33915d5db40037a5e8815f4aec4e68d`.
It is **not byte-identical** to the registry tarball. All 66 member paths match;
the only differing members are:

- `README.md`
- `README.zh-CN.md`
- `lib/client.js`

For each, the difference is CRLF in the Windows working tree versus LF in the
Linux release checkout. After normalizing `\r\n` to `\n`, all three are
byte-identical. No package member has a semantic/content difference.

Evidence: `evidence/pack-compare.json` (local candidate vs repository, no
mismatch) and `evidence/tarball-compare.json` (local vs registry differences).

## 3. Local source gates

Run from the release commit's working tree:

- `npm test`: 77 files / **921 tests**, all pass
- `npm run typecheck`: pass
- `npm run check:i18n`: **ALL PASS** (156 dictionary keys, 72 settings keys)
- `npm run build`: pass
- `npm pack`: 66 files

Evidence: `evidence/unit-test.txt`, `evidence/typecheck.txt`,
`evidence/i18n.txt`, `evidence/build.txt`, `evidence/npm-pack.txt`.

## 4. Isolated 0.14.0 Web smoke

A fresh isolated DSH Web profile installed the local `0.14.0` candidate and
used a separate `dataDir`; no daily profile or data was touched.

- `dump-config` shows the scoped package, loader row `magic-context-dsh`, the
  isolated data directory, and the pinned DeepSeek route.
- Settings navigation shows **Magic Context** exactly once.
- The Settings card exposes `#mc-field-historian.reasoningEffort` with options
  `["", "off", "low", "high", "max", "__custom__"]`; the card body contains
  `Historian`.
- Browser console/page errors: **0**.

This smoke checks presence and wiring, not save/reload or permission
enforcement. Those were covered by T13's 20-step Web gate.

Evidence: `evidence/prepare.json`, `evidence/host-state.json`,
`evidence/settings-smoke.json`, `evidence/settings-page.png`.

## 5. Registry install smoke

A second fresh isolated headless profile installed the package **by registry
specifier**, not from the local tarball:

```text
dsh plugin --profile headless add @elvisw/dsh-magic-context@0.14.0 --ignore-scripts
```

- Installed name/version: `@elvisw/dsh-magic-context@0.14.0`
- `--dump-config` shows the scoped package and `magic-context-dsh`
- Real-model request returned `V0140_REGISTRY_OK`
- Installed `lib/index.js` and migration helper hashes match the registry
  tarball members exactly (`445a0200…` and `ffd1a2b4…`), recorded in
  `evidence/registry-host/registry-e2e.json`
- Registry tarball's `package/lib/client.js` contains `settings.section` and
  `effortPlanOps`

Evidence: `evidence/registry-host/`.

## 6. What this does not prove

- It does not re-run the full T13 20-step Settings matrix or its real Historian
  `/ctx-recomp` run.
- It does not test a daily-profile upgrade from `0.13.0` to `0.14.0`; the
  registry smoke installs into a fresh isolated profile.
- It does not test the TUI, macOS, or Linux desktop Web UI.
- It does not complete the upstream `v0.49.50 → v0.49.55` sweep; `PARITY.md`
  still records the `v0.49.30`-level evidence baseline.
- It does not prove that local Windows `npm pack` and the Linux release tarball
  are byte-identical; they differ only by CRLF normalization in the three
  files listed above.
