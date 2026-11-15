# Reproduce the 0.12.2 combined host regression

This is the runbook for the evidence in `acceptance-report.md`. It assumes the
same Windows machine and the already-installed isolated DSH toolchain used by
the earlier T2/T3/T4/T8 gates. It is not a daily-profile setup guide.

## Artifact

```powershell
npm view @elvisw/dsh-plugin-magic-context@0.12.2 version dist.integrity dist-tags gitHead dist.shasum --prefer-online --json
npm pack @elvisw/dsh-plugin-magic-context@0.12.2 --pack-destination <fresh-pack-dir>
```

The delivered run used:

- `latest = 0.12.2`
- `dist.shasum = 2cf0581b3dc5de03143bc88a995d422bbc459c12`
- `dist.integrity = sha512-1VW2Ev0tuMZsaPVnEyEbh6CfTKDyVeDJZoAyijxrolfqILuusltlldNuI6+ar4Rsgylc9nGwpQYz3htXIOj7NQ==`
- `gitHead = 1d1dc4fe2bc7d7cf9083b0cc50cf76298d5bf118`
- tarball SHA-256 `d1ec72bc147cc22cee7a3c68b7d39a1636a8c7febed4c003f48b5e60e4470a60`

Do not substitute a local pack or working-tree build for the registry specifier.

## Fresh isolated root

From the repository:

```powershell
uv run --no-cache python _bmad-output/initiative-dsh-magic-context/acceptance-windows-dsh-2026-11-15-combined-0.12.2/prepare_combined_host.py
```

The script creates a new root under
`%TEMP%\opencode\mc-t0-2026-11-13\tools\dsh-mc-combined-<timestamp>` with its own
`dsh-home`, `workspace`, `plugin-data`, `overlays`, `evidence` and `downloads`.
It installs the registry specifier into a fresh `headless` profile, records the
installed hashes, creates the test-only observer/driver files, and writes
`experiment-root.json`.

Before continuing, inspect `evidence/preflight.json`:

- `add_exit`, `dump_exit`, `effort_dump_exit` are `0`;
- `profile_specifier` is `0.12.2`;
- `installed_hashes` match the registry artifact;
- every overlay's `dataDir` and `outDir` is inside the new root.

The delivered run's root is
`%TEMP%\opencode\mc-t0-2026-11-13\tools\dsh-mc-combined-20261115-095709`. Its
`plugin-data/activity.log` boot lines are all inside that root; no previous
experiment root appears in the overlays.

## Host stages

Run each stage separately so a failed stage does not overwrite the previous
state. The scripts use a real DSH process and the real model route
`deepseek-official/deepseek-flash`.

```powershell
$run = "_bmad-output\initiative-dsh-magic-context\acceptance-windows-dsh-2026-11-15-combined-0.12.2\run_combined_scenarios.py"

uv run --no-cache python $run --only recovery
uv run --no-cache python $run --only recovery-old-tag
uv run --no-cache python $run --only seed
uv run --no-cache python $run --only wait
uv run --no-cache python $run --only settle
uv run --no-cache python $run --only e1
uv run --no-cache python $run --only e2
uv run --no-cache python $run --only flush-seed
uv run --no-cache python $run --only flush
uv run --no-cache python $run --only vector
```

What each stage does:

| Stage | Session | Purpose |
|---|---|---|
| `recovery` | new | read → reduce → expand old → reduce new → expand new |
| `recovery-old-tag` | recovery | re-reduce the expanded old tag; expect `already dropped` |
| `seed` | new historian session | read + reduce + read historian fixture |
| `wait` | historian | bounded `acceptance_wait` until a real compartment publishes |
| `settle` | historian | one quiet host so in-flight historian work settles |
| `e1` | historian | only `ctx_expand tag:<actual tag>` |
| `e2` | historian | only `ctx_expand message:<original seq>` |
| `flush-seed` | new flush session | read + reduce, no expand |
| `flush` | flush | test-only driver calls real `commands.execute`; next request |
| `vector` | new vector session | memory write, waits, `ctx_memory search` |

The trajectory in the delivered root is not a single uninterrupted sweep:
the first seed/wait chain (`session-4712...`) did not publish and was left in
place; the first recovery attempt (`session-cd1b...`) hit `not dropped yet` and
left two unlanded pending rows; the first vector attempt (`session-e894...`)
created memory 5 and the empty-space bootstrap, while the later vector session
(`session-bccc...`) confirmed hybrid search. The report's §10 discloses all
three. A clean reproduction should expect either a first-attempt pass or a
disclosed discarded set; do not silently delete the extra sessions.

## Recompute the evidence

```powershell
uv run --no-cache python _bmad-output/initiative-dsh-magic-context/acceptance-windows-dsh-2026-11-15-combined-0.12.2/analyze_combined_evidence.py
uv run --no-cache python _bmad-output/initiative-dsh-magic-context/acceptance-windows-dsh-2026-11-15-combined-0.12.2/extract_combined_observer.py
```

The analyzer writes `combined-analysis.json` and prints the key booleans. It
does not edit the plugin DB or run a model.

## Repository checks

```powershell
npm test
npm run typecheck
npm run check:i18n
git diff --check
```

The delivered `unit-test.txt` records 76 files / 849 tests; `typecheck.txt` and
`i18n.txt` are the corresponding successful outputs.

## Evidence boundary

- Headless DSH does not dispatch plugin slash commands. The flush stage uses the
  named test-only `driver-flush.mjs`; it calls the real command registry and
  handler, not a TUI keystroke.
- The test-only observer writes `session.snapshotEvents()`; `surface` is only the
  live seq list, so shadowed `tool/result` events are read from `events`. See
  `combined-observer-extract.json`.
- `historian.reasoningEffort: low` is a config-only overlay. The actual
  historian journal has no effort field in this run; runtime delivery is not
  claimed.
- The vector chain spans the disclosed e894 first attempt and the bccc
  confirmation. The clean first-writer evidence is the separate T8 report.
- The committed evidence is a compact extract; full raw observer JSONL files
  stay under the isolated root's `evidence/session-observer` and are not
  committed.
