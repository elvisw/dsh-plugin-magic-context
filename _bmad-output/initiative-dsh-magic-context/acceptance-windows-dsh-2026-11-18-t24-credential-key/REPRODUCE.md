# Reproduce T24 desktop credential gate

Run from the repository root on Windows with the same Node/npm used for the
build. The commands below do not touch the daily `web` profile: the host script
sets an isolated `DSH_HOME`, `HOME`, `USERPROFILE`, `APPDATA`, `LOCALAPPDATA`,
XDG directories, npm cache, plugin data directory and profile (`t24`).

## 1. Build and pack

```powershell
npm test
npm run typecheck
npm run check:i18n
npm run build
npm pack --pack-destination "$env:TEMP\opencode\t24-pack"
```

The pack directory must contain exactly the candidate tarball. `prepare_t24_host.py`
selects the newest `*.tgz` from that directory and records its SHA-256 and byte
count in `evidence/prepare.json`.

## 2. Start the isolated host

```powershell
python _bmad-output/initiative-dsh-magic-context/acceptance-windows-dsh-2026-11-18-t24-credential-key/run_t24_host.py
```

This starts:

- a local authenticated fake OpenAI-compatible embedding server on a free port;
- an isolated DSH Web host with the candidate installed;
- `experiment-root.json`, which points at the run root and is excluded from the
  manifest (it is a local pointer, not evidence);
- `evidence/server-redacted.json`, `server-log.txt` and `server.json` under the
  run root.

It prints the redacted host state and leaves the host running.

## 3. Run the browser gate

```powershell
node _bmad-output/initiative-dsh-magic-context/acceptance-windows-dsh-2026-11-18-t24-credential-key/t24_ui_gate.cjs
```

Expected: `RESULT {"failures":0,"errors":0,"steps":30}`. The gate writes
`ui-gate.json` and five screenshots under the run root.

## 4. Collect and normalize

```powershell
python _bmad-output/initiative-dsh-magic-context/acceptance-windows-dsh-2026-11-18-t24-credential-key/collect_t24.py
python _bmad-output/initiative-dsh-magic-context/acceptance-windows-dsh-2026-11-18-t24-credential-key/normalize_t24_evidence.py
python _bmad-output/initiative-dsh-magic-context/acceptance-windows-dsh-2026-11-18-t24-credential-key/scan_t24_secrets.py
python _bmad-output/initiative-dsh-magic-context/acceptance-windows-dsh-2026-11-18-t24-credential-key/write_manifest.py
```

`collect_t24.py` copies the redacted evidence into this folder. The normalized
text files are LF; the scan must report `hits: 0`; the manifest must list every
tracked file except `sha256-manifest.json` and `experiment-root.json`.

## 5. Stop the host

Use the PIDs printed by `run_t24_host.py` (`pid` and `fake_pid`) and terminate
both, or close the host's terminal. Do not leave the fake server listening.

## Expected identity of this run

- root: `%TEMP%\opencode\dsh-mc-t24-20261118-143932`
- tarball: `e3c7b7b4dced12feb41f2d99620154e38f166e4198a7ca2727f37a1f1790b2c3`
- bytes: 4,086,969; files: 71
- gate: 30 steps, 0 failures, 0 errors
- tests: 85 files / 1,051 tests
