# T21 — reproduce the isolated Settings gate

All paths below are Windows PowerShell. Run from the repository root. The gate
uses only `%TEMP%\opencode` and a fresh DSH profile; never point it at the daily
profile.

## 1. Build and pack the candidate

```powershell
npm run build
New-Item -ItemType Directory -Force "$env:TEMP\opencode\t21-pack" | Out-Null
Remove-Item "$env:TEMP\opencode\t21-pack\*.tgz" -Force -ErrorAction SilentlyContinue
npm pack --pack-destination "$env:TEMP\opencode\t21-pack"
Get-FileHash "$env:TEMP\opencode\t21-pack\elvisw-dsh-magic-context-0.15.0.tgz" -Algorithm SHA256
```

The expected identity for this report is in `acceptance-report.md` §1.

## 2. Prepare and start the isolated host

`prepare_t21_host.py` bootstraps a throw-away `t21` profile from the default Web
profile, installs the tarball with `--ignore-scripts`, writes a profile patch
with empty remote endpoint/model, and dumps the overlay config. `run_t21_host.py`
starts a local fake OpenAI-compatible server and the real DSH Web host.

```powershell
python _bmad-output\initiative-dsh-magic-context\acceptance-windows-dsh-2026-11-17-settings-redesign\run_t21_host.py
```

The script writes `%TEMP%\opencode\dsh-mc-t21-*\evidence\server.json` (contains a
live token; never copy it into the repository) and a redacted
`server-redacted.json`. It prints the redacted URL.

## 3. Run the browser gate

With the host still running:

```powershell
node _bmad-output\initiative-dsh-magic-context\acceptance-windows-dsh-2026-11-17-settings-redesign\t21_ui_gate.cjs
```

The gate mutates only the isolated profile. Expected result: `steps: 45`,
`failures: 0`, `errors: 0`, and `evidence/ui-gate.json`.

The gate seeds three memories after asserting that Start is disabled at zero
searchable memories, then drives the first-time dirty Load/Test, probe, start,
pause/resume, rollback and language/narrow checks.

## 4. Copy the safe evidence

Copy from the printed isolated root:

- `evidence/prepare.json`, `evidence/ui-gate.json`, `evidence/server-redacted.json`,
  `evidence/server-log.txt`, `evidence/seed-corpus.json`,
  `evidence/fake-server-state.json`
- from the fake endpoint root printed by the launcher:
  `embedding-requests.jsonl` (copied as `evidence/embedding-requests.jsonl`)
- `screenshots/01-summary-zh.png` … `06-narrow-en.png`

into this folder's `evidence/` and `screenshots/`. Never copy `server.json` or
the raw `server.log`.

## 5. Scan and manifest

```powershell
python _bmad-output\initiative-dsh-magic-context\acceptance-windows-dsh-2026-11-17-settings-redesign\scan_t21_secrets.py
python _bmad-output\initiative-dsh-magic-context\acceptance-windows-dsh-2026-11-17-settings-redesign\write_manifest.py
```

Expected: `hits: 0`; manifest entries equal every committed file in this folder
except `sha256-manifest.json` and the ignored `experiment-root.json`.
