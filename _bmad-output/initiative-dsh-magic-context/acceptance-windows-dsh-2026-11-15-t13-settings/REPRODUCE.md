# Reproduce T13 — Settings page and reasoning-effort picker

This gate is isolated. It never uses the daily DSH profile or its data directory.
`prepare_t13_host.py` creates a fresh root under
`%TEMP%\opencode\dsh-mc-t13-<timestamp>` and records it in `experiment-root.json`.
The recorded final run is `dsh-mc-t13-20261115-223649`.

## Prerequisites

- Node 24+ (the recorded run used the DSH-installed Node 24.21.0 for the host and
  Node 26.13.1 for Playwright).
- `DEEPSEEK_API_KEY` in the environment. The scripts record only its presence,
  never its value.
- Playwright 1.63.0 with Microsoft Edge (`channel: 'msedge'`).
- The local DSH checkout used by the harness:
  `%TEMP%\opencode\mc-t0-2026-11-13\tools\dsh`.

## 1. Build and pack the candidate

```powershell
npm test
npm run typecheck
npm run check:i18n
npm run build
npm pack --pack-destination "$env:TEMP\opencode\t13-final-pack"
```

Expected: 77 test files / **921 tests**, all gates pass, 66 files.
The final pack SHA-256 is
`c801ac1ff378d40aaafe1b16aa57737de40cb966dc1c564b5f909d0e132586bb`.

## 2. Prepare the isolated Web host

```powershell
python prepare_t13_host.py
python run_t13_host.py
```

`prepare_t13_host.py` installs the tarball into a fresh `t13` profile and writes
`plugin-data`, `overlays/t13.yml`, and `evidence/prepare.json`.
`run_t13_host.py` starts the real Web host with `--no-open` and records an
authenticated URL in `evidence/server.json`. The URL contains a token; do not
commit it.

If upgrading an existing gate root instead of creating a new one, install the final
pack with:

```powershell
dsh plugin --profile t13 add "$env:TEMP\opencode\t13-final-pack\elvisw-dsh-magic-context-0.13.0.tgz" --ignore-scripts
```

`evidence/upgrade-pack.txt` records that replacement.

## 3. Run the browser gate

```powershell
node t13_ui_gate.cjs
```

The script writes `evidence/ui-gate.json` and screenshots under `screenshots/`.
Expected: 20 steps, 10 settings mutations, `errors: []`.

The gate covers:

- Settings → Magic Context as a scoped sibling of Built-in plugins;
- Settings → Built-in plugins contains no Magic Context effort form;
- the legacy Plugins-page card still renders;
- zh/en labels;
- `Default / off / low / high / max / Custom…` for
  `deepseek-official/deepseek-flash` (no `medium`);
- save/reload of `low`;
- `Custom…` reachable after Default/Reset, with no false unknown-id hint for a
  known stored value;
- unknown `turbo-test` save/reload;
- `Custom…` after an unsaved staged Default (staged-clear dead-end regression; Save stays disabled);
- unknown-save-without-edit on both `turbo-test` and `low`, including the
  `/api/settings/mutate` request body (`writesEffort: false`);
- model change preserving the effort;
- Default reset;
- final `low` for the runtime smoke.

The gate begins by forcing the UI language to Chinese; it switches to English for
the `en-card` step and leaves English set.

## 4. Runtime Historian smoke

The runtime phase restarts the host with the profile patch only. The
`reasoningEffort: low` leaf comes from the Settings page; the trigger knobs
(`policy.executeThreshold: 0`, `historianMinNodes: 0`,
`historianProtectedNodes: 0`, `historianMinBudgetTokens: 0`) are written by the
restart script and recorded in `evidence/runtime-trigger-config.txt`. The recorded
manual run (15:30Z) predates the final UI gate (15:46Z); the runtime `low` leaf came
from an earlier Settings save, not from the gate's `low-for-smoke` step, and the gate's
`executeThreshold: 98` was overwritten by the final restart at 15:48Z:

```powershell
python restart_t13_host.py
```

The recorded runtime rows 52–57 were produced by the manual recomp lane on candidate
`a4b6…` (4,015,038 bytes), before the final UI-only `c801…` pack; the a4b6 pack was
not retained, so this is not a direct member comparison. `tarball-final-compare.json`
records that the earlier `c2a7… → c801…` chain differs only in
`package/lib/client.js`, and a4b6 is the UI-only intermediate pack. The manual lane
is cheaper and deterministic than another 270k-character prompt:

```powershell
node t13_runtime_recomp.cjs
```

It sends `/ctx-recomp last:1` to the existing `This is a runtime smoke` session.
`t13_runtime_smoke5.cjs` / `t13_runtime_smoke6.cjs` are the earlier automatic-lane
provenance; they are not needed for the final manual run.

The LLM adapter row has no `thinking`/`reasoningEffort` config, so its default
effort is `high` (`@deepseek-ai/dsh-llm-deepseek/lib/index.js:1720`).

Expected journal rows (see `evidence/journal-runtime.json`):

```text
52  historian start  trigger "manual", reasoningEffort "low", 13 nodes, 76362 tokens, 2 chunks
56  historian done   trigger "manual", reasoningEffort "low", attempts 3, duration 15826 ms,
                    usage 76,054 total tokens, finishReason "stop"
57  compartment-recomp  §C1§ re-digested 13 nodes, importance 2 → 3
```

Rows 30–36 are the earlier automatic run on the previous candidate; the two
tarballs differ only in `lib/client.js`.

## 5. Evidence bundle

The raw isolation root is intentionally outside the repository. The committed
files are the compact evidence snapshot:

- `evidence/ui-gate.json`
- `evidence/journal-runtime.json`
- `evidence/runtime-summary.json`
- `evidence/runtime-trigger-config.txt`
- `evidence/dump-default.txt`
- `evidence/dump-profile-only.txt`
- `evidence/tarball-final-compare.json`
- `evidence/unit-test.txt`, `typecheck.txt`, `i18n.txt`, `build.txt`
- `evidence/screenshots/`
- `prepare-used.json`, `host.json`, `provenance.json`
- `evidence/secret-scan.txt`

`sha256-manifest.json` lists the committed evidence and report files. Recompute
it after any edit; the manifest itself is excluded from its own list.

## 6. Secret scan

```powershell
python _bmad-output/initiative-dsh-magic-context/acceptance-windows-dsh-2026-11-15-t13-settings/scan_t13_secrets.py
```

Expected output: `hits: 0`. The scan checks `sk-…`, `Bearer …`, assigned credential
names and `token=` query values. The raw `server-profile-only.json` (which contains
a live token) is deliberately not copied into the acceptance directory.

## Notes

- `restart_t13_host.py` refuses to start if the profile patch no longer contains
  `reasoningEffort: low`; it writes the trigger knobs before the profile-only
  restart.
- The daily profile and `magic-context-dsh-poc` data directory are never touched.
- The `Default` resolved-config probe temporarily removes `reasoningEffort: low`
  from the isolated profile patch, runs `dsh --profile t13 --dump-config`, and
  restores the leaf immediately.
