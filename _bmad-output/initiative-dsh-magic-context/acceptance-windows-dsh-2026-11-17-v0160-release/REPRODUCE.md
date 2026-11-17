# Reproduce the 0.16.0 release packet

Run from the repository root on Windows PowerShell. The release is already
published; do not re-tag or re-publish `0.16.0`.

## 1. Verify the release tree

```powershell
git checkout 3ea88bff16ee6f4583782091c45274d98bad53c6
node -p "require('./package.json').version"   # 0.16.0
```

## 2. Run the source gates

```powershell
$dir = "_bmad-output/initiative-dsh-magic-context/acceptance-windows-dsh-2026-11-17-v0160-release/evidence"
npm test 2>&1 | Tee-Object -FilePath "$dir\unit-test.txt"
npm run typecheck 2>&1 | Tee-Object -FilePath "$dir\typecheck.txt"
npm run check:i18n 2>&1 | Tee-Object -FilePath "$dir\i18n.txt"
npm run build 2>&1 | Tee-Object -FilePath "$dir\build.txt"
```

Expected: 80 test files / 972 tests, all four commands exit 0.

## 3. Pack and inspect

```powershell
$pack = "$env:TEMP\opencode\v0160-pack"
New-Item -ItemType Directory -Force -Path $pack | Out-Null
npm pack --pack-destination $pack
Get-FileHash "$pack\elvisw-dsh-magic-context-0.16.0.tgz" -Algorithm SHA256
```

Expected SHA-256:
`ac058376c5d25f01f4d3c72bbd0d6dfc66f5e04e80884c5d1fee34e1ac33032a`;
4,054,414 bytes; 68 files.

If the T21 candidate is still present at
`$env:TEMP\opencode\t21-pack\elvisw-dsh-magic-context-0.15.0.tgz`, compare the
release to it:

```powershell
python _bmad-output/initiative-dsh-magic-context/acceptance-windows-dsh-2026-11-17-v0160-release/compare_tarballs.py `
  --local "$pack\elvisw-dsh-magic-context-0.16.0.tgz" `
  --registry "$pack\elvisw-dsh-magic-context-0.16.0.tgz" `
  --previous "$env:TEMP\opencode\t21-pack\elvisw-dsh-magic-context-0.15.0.tgz" `
  --out "$dir\pack-compare-previous.json"
```

Expected changed members: `package/README.md`, `package/README.zh-CN.md`,
`package/package.json`; no `package/lib/` changes.

## 4. Compare the registry artifact

Registry propagation can take a few minutes; retry `npm view` on E404.

```powershell
npm view @elvisw/dsh-magic-context@0.16.0 version dist.tarball dist.integrity dist.shasum gitHead --json --prefer-online
$reg = "$env:TEMP\opencode\v0160-registry"
New-Item -ItemType Directory -Force -Path $reg | Out-Null
curl.exe -L -s -o "$reg\elvisw-dsh-magic-context-0.16.0.tgz" https://registry.npmjs.org/@elvisw/dsh-magic-context/-/dsh-magic-context-0.16.0.tgz
python _bmad-output/initiative-dsh-magic-context/acceptance-windows-dsh-2026-11-17-v0160-release/compare_tarballs.py `
  --local "$pack\elvisw-dsh-magic-context-0.16.0.tgz" `
  --registry "$reg\elvisw-dsh-magic-context-0.16.0.tgz" `
  --out "$dir\tarball-compare.json"
```

Expected: `byteIdentical: true`, `memberContentDiff: []`.

## 5. Registry install smoke

```powershell
python _bmad-output/initiative-dsh-magic-context/acceptance-windows-dsh-2026-11-17-v0160-release/run_registry_e2e.py
```

The script currently embeds the local DSH/Node paths and creates a fresh
`dsh-mc-v0160-release-*` root under
`%TEMP%\opencode\mc-t0-2026-11-13\tools`. Expected: installed
`@elvisw/dsh-magic-context@0.16.0`, `--dump-config` contains the package and row
id `magic-context-dsh`, and the model smoke returns `V0160_REGISTRY_OK`. Copy
its `evidence/*.txt` and `registry-e2e.json` into
`evidence/registry-host/`; do not copy the raw server log.

## 6. Scan and manifest

```powershell
python _bmad-output/initiative-dsh-magic-context/acceptance-windows-dsh-2026-11-17-v0160-release/scan_release_secrets.py
python _bmad-output/initiative-dsh-magic-context/acceptance-windows-dsh-2026-11-17-v0160-release/write_manifest.py
```

Expected: `hits: 0`; the manifest covers every committed file in this folder
except `sha256-manifest.json`.
