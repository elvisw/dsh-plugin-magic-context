# Reproduce the 0.12.3 release and registry smoke

## 1. Release

```powershell
npm version 0.12.3 --no-git-tag-version
# update CHANGELOG, PARITY, docs
npm test
npm run typecheck
npm run check:i18n
npm run build
npm pack --pack-destination $env:TEMP\opencode\release-0123
git add package.json package-lock.json CHANGELOG.md PARITY.md docs/independent-package-release.md
git commit -m "chore(release): 0.12.3"
git tag -a v0.12.3 -m "v0.12.3"
git push origin main
git push origin v0.12.3
```

The tag triggers `.github/workflows/release.yml`; the workflow verifies tag,
branch and registry state, typechecks, tests, builds, checks i18n, inspects the
artifact and publishes with OIDC provenance.

## 2. Registry artifact

```powershell
npm view @elvisw/dsh-plugin-magic-context@0.12.3 version dist-tags dist.attestations gitHead dist.tarball dist.shasum dist.integrity --prefer-online --json
npm pack @elvisw/dsh-plugin-magic-context@0.12.3 --pack-destination $env:TEMP\opencode\registry-0123
Get-FileHash $env:TEMP\opencode\release-0123\elvisw-dsh-plugin-magic-context-0.12.3.tgz -Algorithm SHA256
Get-FileHash $env:TEMP\opencode\registry-0123\elvisw-dsh-plugin-magic-context-0.12.3.tgz -Algorithm SHA256
```

## 3. Fresh registry install smoke

```powershell
uv run --no-cache python _bmad-output/initiative-dsh-magic-context/acceptance-windows-dsh-2026-11-15-v0123-release/scripts/run_registry_e2e.py
```

The script creates a fresh isolated root, bootstraps a headless profile, installs
`@elvisw/dsh-plugin-magic-context@0.12.3` by registry specifier, checks
`--dump-config`, and runs one real-model prompt expecting `REGISTRY_0123_OK`.
It does not touch the daily profile.

## 4. Real-user check

The remaining human path is the checklist in `acceptance-report.md` §3.2:
upgrade the daily profile, open the settings card, run `ctx_reduce`/`ctx_expand`,
invoke `/ctx-flush` from the composer (both queued and already-landed cases),
and restart to confirm sessions, tags, memories and settings persist. Record
the DSH version, plugin version, command text and any TUI-specific difference.
