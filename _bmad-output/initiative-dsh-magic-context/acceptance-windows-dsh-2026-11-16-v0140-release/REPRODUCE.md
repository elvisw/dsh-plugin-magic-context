# Reproduce 0.14.0 release checks

Run from the repository root on Windows with the pinned local Node/DSH paths
used by the existing harness. Publishing is already complete; these commands
re-create the local checks. Do not re-run `npm publish`.

## 1. Source gates

```powershell
npm test
npm run typecheck
npm run check:i18n
npm run build
New-Item -ItemType Directory -Force "$env:TEMP\opencode\v0140-pack" | Out-Null
npm pack --pack-destination "$env:TEMP\opencode\v0140-pack"
```

Expected: 77 test files / 921 tests; typecheck and i18n pass; 66 tarball members.
The Windows local tarball has CRLF in `README.md`, `README.zh-CN.md`, and
`lib/client.js`; the Linux release tarball stores the same text with LF. Compare
content after normalizing CRLF; do not require byte identity with the registry
artifact.

## 2. Local isolated Web smoke

Set `V0140_PACK` to the tarball from step 1 if it is not the default path.

```powershell
python "_bmad-output\initiative-dsh-magic-context\acceptance-windows-dsh-2026-11-16-v0140-release\prepare_release_host.py"
python "_bmad-output\initiative-dsh-magic-context\acceptance-windows-dsh-2026-11-16-v0140-release\run_release_host.py"
node "_bmad-output\initiative-dsh-magic-context\acceptance-windows-dsh-2026-11-16-v0140-release\settings_smoke.cjs"
```

`prepare_release_host.py` creates a fresh profile under
`%TEMP%\opencode\dsh-mc-v0140-*`, installs the local tarball, writes an isolated
`dataDir`, and checks the dump-config. `run_release_host.py` starts the isolated
Web host and writes `evidence/server.json`. `settings_smoke.cjs` opens Settings,
clicks Magic Context, and asserts the effort selector and its options. Stop the
host process after the smoke (the PID is in `evidence/server.json`).

Expected: `settings-nav-visible` count 1; `settings-card-visible` with
`effortPresent: true`, options `["", "off", "low", "high", "max", "__custom__"]`,
and 0 browser errors.

## 3. Registry install smoke

```powershell
python "_bmad-output\initiative-dsh-magic-context\acceptance-windows-dsh-2026-11-16-v0140-release\run_registry_e2e.py"
```

This creates `%TEMP%\opencode\mc-t0-2026-11-13\tools\dsh-mc-v0140-release-*`,
installs `@elvisw/dsh-magic-context@0.14.0` by specifier, checks the installed
identity and dump-config, and sends one real-model request. The expected marker
is `V0140_REGISTRY_OK`. It does not modify the daily profile.

## 4. Registry metadata

```powershell
npm view @elvisw/dsh-magic-context@0.14.0 version dist-tags dist.attestations gitHead dist.tarball dist.shasum dist.integrity --prefer-online --json
gh run view 43736756681 --json conclusion,headSha,status,url,workflowName,createdAt
```

Expected: `version=0.14.0`, `dist-tags.latest=0.14.0`,
`gitHead=48c49485647e9fd63c6431816a5f96641272bcb3`, and a successful Release
run. Registry metadata can take a short propagation delay after the workflow
succeeds.

## 5. Evidence

- `evidence/unit-test.txt`, `typecheck.txt`, `i18n.txt`, `build.txt`,
  `npm-pack.txt`
- `evidence/prepare.json`, `host-state.json`, `settings-smoke.json`,
  `settings-page.png`
- `evidence/registry-host/` — registry install, dump, and model smoke logs
- `evidence/pack-compare.json`, `tarball-compare.json`, `registry-view.json`,
  `release-run.json`, `attestation.json`, `tag.txt`
- `sha256-manifest.json` — hashes of the committed evidence and reports
