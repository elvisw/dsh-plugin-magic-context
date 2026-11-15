# Reproduce — T15 release `0.13.0`

All commands run from the repository root. No daily profile is modified.

## 1. Verify the published artifact

```powershell
$e = "_bmad-output\initiative-dsh-magic-context\acceptance-windows-dsh-2026-11-15-t15-release\evidence"
$tmp = "$env:TEMP\opencode\t15-registry-check"
New-Item -ItemType Directory -Force $tmp | Out-Null
curl.exe -sSL "https://registry.npmjs.org/@elvisw/dsh-magic-context/-/dsh-magic-context-0.13.0.tgz" -o "$tmp\registry.tgz"
python -c "import hashlib,pathlib; p=pathlib.Path(r'$tmp\registry.tgz'); print(p.stat().st_size); print(hashlib.sha256(p.read_bytes()).hexdigest()); print(hashlib.sha1(p.read_bytes()).hexdigest())"
```

Expected: `4007255`, SHA-256
`1c8ac596be020e72b6e0103c287bcd606721dccd5af5b118605d253e2049dfd6`,
SHA-1 `f64dd86cc65f455566a4b06b10b0a7b598ce961f`.

`evidence/artifact-compare.json` records the same values and the byte-equality
with `%TEMP%\opencode\t15-pack-gate\elvisw-dsh-magic-context-0.13.0.tgz`.

## 2. Registry install smoke

Requires `DEEPSEEK_API_KEY` in the environment. The script creates its own
isolated root and never reads or writes the daily profile.

```powershell
python _bmad-output\initiative-dsh-magic-context\acceptance-windows-dsh-2026-11-15-t15-release\run_registry_e2e.py
```

Expected result: installed name `@elvisw/dsh-magic-context`, version `0.13.0`,
`dump-config` mentions both the scoped package and row id `magic-context-dsh`,
and the model returns `T15_REGISTRY_OK`. Raw logs and the compact
`registry-e2e.json` are written under that root's `evidence/`; the committed
copy in the acceptance directory is a snapshot and is not overwritten by a
rerun. The script pins the same local Node/DSH paths used by the earlier gates;
on a different machine, update `NODE_EXE`/`DSH_BIN` first.

## 3. Registry / provenance checks

```powershell
npm view @elvisw/dsh-magic-context@0.13.0 version dist-tags dist.attestations gitHead dist.tarball dist.shasum --json
npm trust list @elvisw/dsh-magic-context  # requires a one-time password
curl.exe -sS "https://registry.npmjs.org/-/npm/v1/attestations/@elvisw%2fdsh-magic-context@0.13.0"
```

Expected: `latest` is `0.13.0`; `bootstrap` remains `0.0.0-bootstrap.0`;
`dist.attestations.provenance.predicateType` is `https://slsa.dev/provenance/v1`;
`gitHead` is `f61e42beea88e10dd0bb2e1a51fc86a71dd2730f`.

## 4. Release workflow

```powershell
gh run view 43719644203 --json conclusion,headSha,status,url
git cat-file -p refs/tags/v0.13.0
```

Expected: run conclusion `success`, head SHA `f61e42b`, annotated tag
`v0.13.0` whose object is `f61e42b`.

## 5. Deprecate the old package

All published versions were deprecated interactively (the first attempt only
covered `0.12.3`, then the all-version form covered the rest):

```powershell
npm deprecate @elvisw/dsh-plugin-magic-context "Renamed to @elvisw/dsh-magic-context. Install the new package; see https://github.com/elvisw/dsh-plugin-magic-context"
```

Never unpublish the old package. Verify with
`curl.exe -sS "https://registry.npmjs.org/@elvisw%2fdsh-plugin-magic-context"`;
`evidence/deprecate-old.txt` records every version and its exact deprecation
message, and `evidence/old-package-metadata.json` is the full registry document.

## 6. Evidence manifest

`sha256-manifest.json` lists every evidence file plus the report and this file,
excluding itself. Recompute it after changing any of them. The two tarballs are
not committed; only their hashes are recorded.
