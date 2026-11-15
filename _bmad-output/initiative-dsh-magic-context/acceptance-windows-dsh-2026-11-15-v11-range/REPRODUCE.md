# Reproduce — V1.1 range/verbose host gate

Prerequisites:

- Node 24.21.0 at
  `C:\Users\elvis\AppData\Local\Author Software\nvm\installs\v24.21.0\node.exe`
- Isolated DSH `0.2.2-rc.1` at
  `C:\Users\elvis\AppData\Local\Temp\opencode\mc-t0-2026-11-13\tools\dsh`
- `DEEPSEEK_API_KEY` set in the environment; do not write it to disk.

## 1. Build and pack the local tarball

From the repository root:

```powershell
npm run build
New-Item -ItemType Directory -Force "$env:TEMP\opencode\v11-host-pack" | Out-Null
npm pack --pack-destination "$env:TEMP\opencode\v11-host-pack"
```

## 2. Prepare the isolated profile

```powershell
uv run --no-cache python _bmad-output/initiative-dsh-magic-context/acceptance-windows-dsh-2026-11-15-v11-range/prepare_v11_host.py
```

This creates a fresh root under
`%TEMP%\opencode\mc-t0-2026-11-13\tools\dsh-mc-v11-<timestamp>`, bootstraps a
fresh headless profile, installs the local tarball, writes the overlays, and
asserts the installed lib matches the tarball. It refuses to overwrite an
existing `experiment-root.json`.

## 3. Drive the stages

Each stage is a separate host process, resuming the same session:

```powershell
uv run --no-cache python _bmad-output/initiative-dsh-magic-context/acceptance-windows-dsh-2026-11-15-v11-range/run_v11_scenarios.py --only seed
uv run --no-cache python _bmad-output/initiative-dsh-magic-context/acceptance-windows-dsh-2026-11-15-v11-range/run_v11_scenarios.py --only wait
uv run --no-cache python _bmad-output/initiative-dsh-magic-context/acceptance-windows-dsh-2026-11-15-v11-range/run_v11_scenarios.py --only settle
uv run --no-cache python _bmad-output/initiative-dsh-magic-context/acceptance-windows-dsh-2026-11-15-v11-range/run_v11_scenarios.py --only r1
uv run --no-cache python _bmad-output/initiative-dsh-magic-context/acceptance-windows-dsh-2026-11-15-v11-range/run_v11_scenarios.py --only r2
uv run --no-cache python _bmad-output/initiative-dsh-magic-context/acceptance-windows-dsh-2026-11-15-v11-range/run_v11_scenarios.py --only r3-tag
uv run --no-cache python _bmad-output/initiative-dsh-magic-context/acceptance-windows-dsh-2026-11-15-v11-range/run_v11_scenarios.py --only r3-message
```

The seed reads the fixture and reduces its tag; the wait stage polls with
`acceptance_wait` until the real Historian publishes a compartment; settle
stops the Historian; the four request stages each assert a clean pre/post
window. `--only` stages are resumable from `evidence/v11-state.json`.

## 4. Regenerate compact evidence

```powershell
uv run --no-cache python _bmad-output/initiative-dsh-magic-context/acceptance-windows-dsh-2026-11-15-v11-range/analyze_v11_evidence.py
```

This writes `evidence/v11-analysis.json` and
`evidence/v11-observer-extract.json` and asserts the four inputs, tag deltas,
unchanged watched bytes and nonce presence.

## 5. Verification commands

```powershell
npm test
npm run typecheck
npm run check:i18n
```

Expected: `76` test files / `872` tests, typecheck clean, i18n `ALL PASS`.

## Notes

- The profile is fresh; no old profile or prior root is copied.
- The local tarball hash, git HEAD and uncommitted diff hash are in
  `evidence/preflight.json`. Rebuilding from a different tree changes them.
- The raw observer file is intentionally not committed; only its hash and a
  compact extract are in `evidence/`.
