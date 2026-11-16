# Telemetry v2 host gate — reproduce

The gate is intentionally a **single isolated Web-host run**, not the T13 matrix. Use a fresh root
each time; do not point it at the daily profile.

## Prerequisites

- Windows, Node `24.21.0` at the path in `prepare_t18_host.py`, DSH `0.2.2-rc.1` at
  `%TEMP%\opencode\mc-t0-2026-11-13\tools\dsh`.
- `DEEPSEEK_API_KEY` in the environment. The script records only `deepseek_key_present`; it never
  prints or persists the value.
- Playwright `1.63.0` and Chromium at
  `%LOCALAPPDATA%\ms-playwright\chromium-1254\chrome-win64\chrome.exe`.
- The repository at `C:\Users\elvis\Documents\dev\plugin\dsh-plugin-magic-context` (or edit the
  fixed paths in the scripts).

## 1. Build and pack

```powershell
Set-Location C:\Users\elvis\Documents\dev\plugin\dsh-plugin-magic-context
New-Item -ItemType Directory -Force "$env:TEMP\opencode\t18-pack" | Out-Null
npm run build
npm pack --pack-destination "$env:TEMP\opencode\t18-pack"
```

The recorded tarball is `elvisw-dsh-magic-context-0.14.0.tgz` with SHA-256
`2058d50a29c8ae249f8e05aacd539204f81127444fd5a5d33794d7d849140c13` and 66 files. `prepare_t18_host.py`
accepts `T18_PACK` if a different tarball is used; otherwise it uses the path above.

## 2. Prepare the isolated profile

```powershell
python _bmad-output\initiative-dsh-magic-context\acceptance-windows-dsh-2026-11-16-telemetry-v2\prepare_t18_host.py
```

This creates a new `%TEMP%\opencode\dsh-mc-t18-<stamp>` root with isolated `DSH_HOME`, `HOME`,
`USERPROFILE`, `XDG_*`, `APPDATA`, `LOCALAPPDATA`, npm caches, a `t18` Web profile, an isolated plugin
data directory, and the real DeepSeek adapter route. It writes `experiment-root.json`,
`evidence/prepare.json`, and the profile patch/overlay.

## 3. Start the isolated Web host

```powershell
python _bmad-output\initiative-dsh-magic-context\acceptance-windows-dsh-2026-11-16-telemetry-v2\run_t18_host.py
```

`run_t18_host.py` invokes the pinned DSH CLI directly, not a `dsh web` subcommand:

```powershell
& "C:\Users\elvis\AppData\Local\Author Software\nvm\installs\v24.21.0\node.exe" `
  "$env:TEMP\opencode\mc-t0-2026-11-13\tools\dsh\node_modules\@deepseek-ai\dsh\lib\bin.js" `
  --profile t18 --patch "<root>\overlays\t18.yml" --no-open --port <free>
```

It writes the raw `evidence/server.json` and `evidence/server.log` in the isolated root, plus two
redacted files: `evidence/server-log.txt` and `evidence/server-redacted.json`. The raw `server.json`
still holds the live URL for the gate and must stay in `%TEMP%`. Copy only `server-log.txt` and
`server-redacted.json` into the committed `evidence/` directory; the committed file is named
`evidence/server-redacted.json`.

## 4. Run the browser gate

```powershell
node _bmad-output\initiative-dsh-magic-context\acceptance-windows-dsh-2026-11-16-telemetry-v2\t18_ui_gate.cjs
```

The script reads `experiment-root.json`, opens the host with the isolated session, switches the host
language to Chinese, sends one real prompt (`Reply with exactly OK and nothing else.`), waits 12
seconds for the pressure reading, opens the pill and asserts:

- three host segments and their values (`2.8k`, `8.8k`, `618`) plus the message sub-list
  (`Conversation 574`, `Other 44`);
- Historian / Memory / Queue / Maintenance / Hygiene sections, including the measured zero values
  and the `—` missing-value markers;
- zh/en re-render;
- `aria-expanded`, a real Tab / Shift+Tab focus trap, Escape and outside-click focus return with
  the panel closed, bar `aria-label`, footer `/ctx-status`;
- no console/page errors and no `/mc-telemetry` response with status >= 400.

It writes `evidence/ui-gate.json`, `evidence/summary.json` and three screenshots under the isolated
root's `screenshots/` directory; copy `01-session.png`, `02-panel-zh.png` and `03-panel-en.png` into
`evidence/` for the committed artifact. On success it exits 0 with `"pass": true`.

## 5. Scan secrets and rebuild the manifest

Run both commands from the repository root; they use paths relative to the acceptance directory.

```powershell
python _bmad-output\initiative-dsh-magic-context\acceptance-windows-dsh-2026-11-16-telemetry-v2\scan_t18_secrets.py
python _bmad-output\initiative-dsh-magic-context\acceptance-windows-dsh-2026-11-16-telemetry-v2\write_manifest.py
```

`scan_t18_secrets.py` scans the committed `evidence/` files plus the three root documents and prints
`files scanned: 17` and `hits: 0`; `write_manifest.py` rewrites `sha256-manifest.json` with 18 entries.
The scan deliberately reads only committed names, not the raw temporary `server.json`.

## 6. Re-run gates and note a failure

```powershell
npm test
npm run typecheck
npm run check:i18n
npm run build
```

If the gate fails, inspect `evidence/ui-gate.json` and `screenshots/99-failure.png`; do not reuse the
same root for a claimed pass. Start from step 2 with a fresh root. The committed evidence was produced
from root `dsh-mc-t18-20261116-162514`; later reruns create different roots and must not overwrite the
committed shots without updating the report and manifest.

## 7. Scope reminders

- No daily profile and no daily data directory are touched.
- The gate does not publish a Historian compartment, inject a memory, trigger a residual warning, or
  wait 120 seconds for stale; those are unit-test-only in this ticket.
- It does not install to the Desktop profile, change host source, bump the package, tag, or publish.
