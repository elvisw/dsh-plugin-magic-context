# Reproduce 0.15.0 release checks

Run from the repository root on Windows with the pinned local Node/DSH paths
used by the existing harness. Publishing is already complete; these commands
re-create the local checks. Do not re-run `npm publish`.

## 1. Source gates

```powershell
npm test
npm run typecheck
npm run check:i18n
npm run build
```

Expected: 78 test files / 939 tests; typecheck and i18n pass (193 dictionary
keys); build succeeds.

## 2. Local package and registry artifact

```powershell
New-Item -ItemType Directory -Force "$env:TEMP\opencode\v0150-pack-final" | Out-Null
npm pack --pack-destination "$env:TEMP\opencode\v0150-pack-final"
```

Expected: 66 files; local SHA-1 `99c0fa7d6b13a828484e7725ae8459201007b60d`,
SHA-256 `cf0965b3c791c462e49c5b5cd3be31a141f4644fc43c8e619622b7c7d4e965eb`,
4,027,461 bytes. Run `npm run build` before `npm pack`: the tarball ships
`lib/client.js`, not `src/client/index.js`. A clean checkout is LF because
`.gitattributes` sets `eol=lf`. If an editor rewrote `README.md`,
`README.zh-CN.md`, or `src/client/index.js` to CRLF, `npm pack` differs only
in line endings; the recorded byte identity was produced with LF sources.

Download and compare the registry tarball:

```powershell
New-Item -ItemType Directory -Force "$env:TEMP\opencode\v0150-registry" | Out-Null
curl.exe -sL "https://registry.npmjs.org/@elvisw/dsh-magic-context/-/dsh-magic-context-0.15.0.tgz" `
  -o "$env:TEMP\opencode\v0150-registry\elvisw-dsh-magic-context-0.15.0.tgz"
```

Expected: byte-identical to the local tarball; 66 member content hashes match.

Regenerate both comparisons:

```powershell
python "_bmad-output\initiative-dsh-magic-context\acceptance-windows-dsh-2026-11-16-v0150-release\compare_tarballs.py" `
  --local "$env:TEMP\opencode\v0150-pack-final\elvisw-dsh-magic-context-0.15.0.tgz" `
  --registry "$env:TEMP\opencode\v0150-registry\elvisw-dsh-magic-context-0.15.0.tgz" `
  --previous "$env:TEMP\opencode\t18-pack\elvisw-dsh-magic-context-0.14.0.tgz" `
  --out "$env:TEMP\opencode\v0150-tarball-compare.json"
```

Expected: `byteIdentical: true`, `memberContentDiff: []`, and
`libNormalizedChanged: []`. The T18 Web gate used the earlier `0.14.0`
candidate (SHA-256 `2058d50a…40c13`); after LF normalization only
`README.md`, `README.zh-CN.md`, and `package.json` differ.

## 3. Registry metadata and workflow

```powershell
npm view @elvisw/dsh-magic-context@0.15.0 version dist-tags dist.attestations `
  gitHead dist.tarball dist.shasum dist.integrity --prefer-online --json
gh run view 43837243523 --json workflowName,displayTitle,headBranch,conclusion,headSha,status,url,createdAt
```

Expected: `version=0.15.0`, `dist-tags.latest=0.15.0`, `dist-tags.bootstrap=
0.0.0-bootstrap.0`, `gitHead=599968811e4e644681f1ce61085621351c991027`,
`workflowName=Release`, `headBranch=v0.15.0`, and
`displayTitle=chore(release): 0.15.0`. Registry metadata can take a short
propagation delay after the workflow succeeds.

## 4. Registry install smoke

```powershell
python "_bmad-output\initiative-dsh-magic-context\acceptance-windows-dsh-2026-11-16-v0150-release\run_registry_e2e.py"
```

This creates
`%TEMP%\opencode\mc-t0-2026-11-13\tools\dsh-mc-v0150-release-*`, installs
`@elvisw/dsh-magic-context@0.15.0` by specifier, checks the installed identity
and dump-config, and sends one real-model request. Expected marker:
`V0150_REGISTRY_OK`. DSH profile/config/session state stays under the isolated
root; pnpm reuses the user-level content-addressable store
(`C:\Users\elvis\AppData\Local\pnpm\store\v11`). It does not modify the daily
profile.

## 5. Secret scan and manifest

```powershell
python "_bmad-output\initiative-dsh-magic-context\acceptance-windows-dsh-2026-11-16-v0150-release\scan_release_secrets.py"
python "_bmad-output\initiative-dsh-magic-context\acceptance-windows-dsh-2026-11-16-v0150-release\write_manifest.py"
```

Expected: `files scanned: 26`; `hits: 0`. `scan_release_secrets.py` skips
`sha256-manifest.json` by design. `write_manifest.py` reports 26 entries for
27 files because it also excludes `sha256-manifest.json` itself, so the
scan/manifest pair is stable regardless of whether the manifest already
exists.

## 6. Evidence

- `evidence/unit-test.txt`, `typecheck.txt`, `i18n.txt`, `build.txt`,
  `npm-pack.txt`, `npm-pack-dry-run.txt`
- `evidence/registry-e2e-run.txt`, `evidence/host-state.json`,
  `evidence/registry-host/`
- `evidence/registry-view.json`, `release-run.json`, `attestation.json`,
  `tag.txt`
- `evidence/tarball-compare.json`, `pack-compare.json`
- `compare_tarballs.py` — regenerates both comparisons
- `sha256-manifest.json` — hashes of the committed evidence, reports, and
  scripts
