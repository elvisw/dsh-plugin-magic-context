# Reproduce — 0.17.0 release packet

Run from the repository root on Windows PowerShell. The release packet is
evidence for tag `v0.17.0` / commit `2cf1c72…`.

## 1. Pre-release gates

```powershell
npm ci
npm test 2>&1 | Tee-Object -FilePath _bmad-output/initiative-dsh-magic-context/acceptance-windows-dsh-2026-11-17-v0170-release/evidence/unit-test.txt
npm run typecheck 2>&1 | Tee-Object -FilePath _bmad-output/initiative-dsh-magic-context/acceptance-windows-dsh-2026-11-17-v0170-release/evidence/typecheck.txt
npm run check:i18n 2>&1 | Tee-Object -FilePath _bmad-output/initiative-dsh-magic-context/acceptance-windows-dsh-2026-11-17-v0170-release/evidence/i18n.txt
npm run build 2>&1 | Tee-Object -FilePath _bmad-output/initiative-dsh-magic-context/acceptance-windows-dsh-2026-11-17-v0170-release/evidence/build.txt
npm pack --dry-run
```

Expected: 83 files / 994 tests, typecheck/i18n/build exit 0, 69 tarball files.

## 2. Local pack and registry comparison

```powershell
New-Item -ItemType Directory -Force -Path C:\Users\elvis\AppData\Local\Temp\opencode\v0170-pack
npm pack --pack-destination C:\Users\elvis\AppData\Local\Temp\opencode\v0170-pack
New-Item -ItemType Directory -Force -Path C:\Users\elvis\AppData\Local\Temp\opencode\v0170-registry
curl.exe -sSL -o C:\Users\elvis\AppData\Local\Temp\opencode\v0170-registry\elvisw-dsh-magic-context-0.17.0.tgz https://registry.npmjs.org/@elvisw/dsh-magic-context/-/dsh-magic-context-0.17.0.tgz
python _bmad-output/initiative-dsh-magic-context/acceptance-windows-dsh-2026-11-17-v0170-release/compare_tarballs.py --local C:\Users\elvis\AppData\Local\Temp\opencode\v0170-pack\elvisw-dsh-magic-context-0.17.0.tgz --registry C:\Users\elvis\AppData\Local\Temp\opencode\v0170-registry\elvisw-dsh-magic-context-0.17.0.tgz --previous C:\Users\elvis\AppData\Local\Temp\opencode\v0160-pack\elvisw-dsh-magic-context-0.16.0.tgz --out _bmad-output/initiative-dsh-magic-context/acceptance-windows-dsh-2026-11-17-v0170-release/evidence/tarball-compare.json
```

Expected: `localSha256 == registrySha256 == 2264998c…642e`,
`byteIdentical: true`, `memberContentDiff: []`, and only the eight T22/release
members listed in `acceptance-report.md` changed from 0.16.0. If the 0.16.0
pack is not present, omit `--previous`; the registry identity assertions do not
depend on it.

## 3. Registry identity

```powershell
npm view @elvisw/dsh-magic-context@0.17.0 version dist.integrity dist.shasum gitHead dist.fileCount --prefer-online --json
npm view @elvisw/dsh-magic-context dist-tags --prefer-online --json
curl.exe -sSL -o _bmad-output/initiative-dsh-magic-context/acceptance-windows-dsh-2026-11-17-v0170-release/evidence/registry.json https://registry.npmjs.org/@elvisw/dsh-magic-context/0.17.0
curl.exe -sSL -o _bmad-output/initiative-dsh-magic-context/acceptance-windows-dsh-2026-11-17-v0170-release/evidence/attestation.json "https://registry.npmjs.org/-/npm/v1/attestations/@elvisw%2fdsh-magic-context@0.17.0"
```

Expected: `latest=0.17.0`, `dist.shasum=7c091893…fb9f`,
`dist.fileCount=69`, SLSA provenance URL present. The registry can lag the
publish completion by a few minutes; retry the packument before treating a 404
for the new version as a failure.

## 4. Registry install smoke

```powershell
python _bmad-output/initiative-dsh-magic-context/acceptance-windows-dsh-2026-11-17-v0170-release/run_registry_e2e.py
```

The script needs `DEEPSEEK_API_KEY` only for its one-request model smoke. It
prints the isolated root and must end with `modelSmoke: "V0170_REGISTRY_OK"`.
Copy `add-registry.txt`, `bootstrap.txt`, `dump-config.txt`,
`registry-e2e.json`, and `smoke.txt` from that root's `evidence/` into
`evidence/registry-host/`.

## 5. Evidence sealing

```powershell
python _bmad-output/initiative-dsh-magic-context/acceptance-windows-dsh-2026-11-17-v0170-release/scan_release_secrets.py
python _bmad-output/initiative-dsh-magic-context/acceptance-windows-dsh-2026-11-17-v0170-release/write_manifest.py
```

Expected: `hit: 0`, and a manifest covering every committed packet file except
`sha256-manifest.json` itself.
