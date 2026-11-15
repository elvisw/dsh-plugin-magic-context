# Reproduce — T15 package identity rename

All commands are run from the repository root. No daily profile is touched.

## 1. Build and pack

```powershell
npm run build
npm pack --pack-destination "$env:TEMP\opencode\t15-pack-gate"
node scripts/mc-pack-dist.mjs --no-build --out "$env:TEMP\opencode\t15-dist-gate"
```

`pack:dist` copies the hand-out helper into
`tools\migrate-profile-package-name.mjs`. The host script uses `T15_PACK` if
set; otherwise it reads the default `t15-pack-gate` path.

The local tarball used by the gate:

```text
$env:TEMP\opencode\t15-pack-gate\elvisw-dsh-magic-context-0.13.0.tgz
SHA-256 1c8ac596be020e72b6e0103c287bcd606721dccd5af5b118605d253e2049dfd6
```

## 2. Host gate

```powershell
$env:T15_PACK = "$env:TEMP\opencode\t15-pack-gate\elvisw-dsh-magic-context-0.13.0.tgz"
python _bmad-output\initiative-dsh-magic-context\acceptance-windows-dsh-2026-11-15-t15-package-rename\prepare_t15_host.py
```

The script:

1. creates a fresh isolated `DSH_HOME`/`HOME`/`USERPROFILE`/`XDG_*` root;
2. installs `@elvisw/dsh-plugin-magic-context@0.12.3` from npm;
3. writes a real profile patch row with a custom `dataDir` and
   `policy.executeThreshold: 42`;
4. replaces the package with the local 0.13.0 tarball;
5. runs `tools/migrate-profile-package-name.mjs --patch <profile patch>`;
6. refuses to pass unless the effective `--dump-config` still has the custom
   dataDir and threshold, the new package name, and no old name;
7. repeats for a fresh install, a home patch and an overlay patch;
8. adds the old package next to the new one in the fresh root and records the
   co-install dump;
9. checks the installer text for the helper prompt and the three removal
   commands (new, old fork, upstream).

Output: `t15-state.json` in this directory. Raw per-command logs are copied to
`evidence/upgrade-*` and `evidence/fresh-*`.

## 3. Data compatibility probe

```powershell
python _bmad-output\initiative-dsh-magic-context\acceptance-windows-dsh-2026-11-15-t15-package-rename\probe_t15_data.py
```

The probe reads two cached tarballs rather than downloading during the run:
the published 0.12.3 package and the local 0.13.0 gate tarball. If they are not
present, create them first:

```powershell
npm pack @elvisw/dsh-plugin-magic-context@0.12.3 --pack-destination "$env:TEMP\opencode\t15-old-pack"
```

Set `T15_OLD_PACK` / `T15_PACK` only if the tarballs are elsewhere. The script
verifies the old SHA-1 and new SHA-256 before extraction, and wipes/recreates
its fixed `%TEMP%\opencode\dsh-mc-t15-data-probe-*` root, so a rerun starts from
an empty data directory. It seeds one memory + journal row + pending drop with
the old package and verifies them with the new package in a separate process.
Expected: `data-probe-seed.json` shows memory id 1 and journal rows 1;
`data-probe-verify.json` shows package 0.13.0, schema 11, one memory with id 1,
category `CONFIG_VALUES`, importance 7 and `T15_DATA_SURVIVAL_4097`, one journal
row and pending drop `pending`; `t15-data-probe.json` has `ok: true` and records
the two tarball hashes plus the Node version.

## 4. Repo gates

```powershell
npm test
npm run typecheck
npm run check:i18n
git diff --check
```

Expected: 77 files / 902 tests, typecheck clean, i18n ALL PASS, `git diff --check`
exit 0 (a CRLF warning is possible).

## 5. Secret scan

Raw isolated roots (explicit paths, not a wildcard — `rg` does not expand `*` on
Windows):

```powershell
rg -n --hidden "sk-[A-Za-z0-9]{10,}|DEEPSEEK_API_KEY|Bearer " `
  "$env:TEMP\opencode\dsh-mc-t15-20261115-211430" `
  "$env:TEMP\opencode\dsh-mc-t15-fresh-20261115-211430"
```

Expected: exit 0 because each of the eight isolated config dumps contains two
`apiKeyEnv: DEEPSEEK_API_KEY` lines (16 matches total) as an environment-variable
**name**; there is no `sk-…` value, no `Bearer …` value, and no credential.

Committed-tree scan:

```powershell
rg -n --hidden -g '!_bmad-output/**' -g '!node_modules/**' -g '!lib/**' `
  -g '!vendor/**' -g '!.git/**' `
  "sk-[A-Za-z0-9]{10,}|DEEPSEEK_API_KEY|Bearer " .
```

Expected: exit 0 with two deliberate fixture strings in
`tests/org-domain.spec.ts`; no real credential. The exact commands and UTC
timestamps are stored in `evidence/secret-scan*.txt`.

## 6. Evidence manifest

`sha256-manifest.json` lists the evidence files in this acceptance directory
and their SHA-256. Recompute it after changing any evidence file; the manifest
deliberately does not include itself or the gitignored `experiment-root.json`.

## 7. Not reproduced

The data probe is a storage-module test, not a live DSH host or model session.
No `npm publish`, tag, Trusted Publisher, deprecation, release workflow, UI
Settings page or real model call is part of this gate. Those are T15 HITL
release steps or T13 scope.
