# Reproduce the P4 `/ctx-flush` empty-queue gate

The gate uses a fresh isolated DSH root and a local tarball. Do not substitute
the daily profile or a prior T3/T4/T10 root.

## 1. Build and pack

From the repository:

```powershell
npm test
npm run typecheck
npm run check:i18n
npm run build
npm pack --pack-destination $env:TEMP\opencode\p4-host-pack
```

## 2. Prepare the fresh root

```powershell
uv run --no-cache python _bmad-output/initiative-dsh-magic-context/acceptance-windows-dsh-2026-11-15-p4-flush-feedback/prepare_p4_host.py
```

The script bootstraps a new headless profile, installs the tarball, writes a
fresh observer and command driver, and creates `experiment-root.json`.

## 3. Run the three hosts

```powershell
uv run --no-cache python _bmad-output/initiative-dsh-magic-context/acceptance-windows-dsh-2026-11-15-p4-flush-feedback/run_p4_scenarios.py --only seed
uv run --no-cache python _bmad-output/initiative-dsh-magic-context/acceptance-windows-dsh-2026-11-15-p4-flush-feedback/run_p4_scenarios.py --only flush
uv run --no-cache python _bmad-output/initiative-dsh-magic-context/acceptance-windows-dsh-2026-11-15-p4-flush-feedback/run_p4_scenarios.py --only flush-empty
```

The seed host uses the real model to read the fixture and call `ctx_reduce`.
The flush host resumes the session and invokes the real command registry.
The empty host is a new process and invokes `/ctx-flush` again on the empty
queue. The command driver is test-only; headless DSH does not dispatch plugin
slash-command keystrokes.

## 4. What to check

- Host 2: `pending_drops` tag 1 has a non-null `landed_event_seq` and the
  surface contains `[dropped §1§]`.
- Host 3: command text contains
  `last drop landing: 1 drop(s) at ...Z` and `already in effect`.
- Host 3 command window: `usage_records`, `pending_drops`, `tags`, and
  `drop-landed` counts are unchanged; no `assistant/message` event sits between
  `command/run` and `command/done`.
- The host's own model step adds a usage row after the command; that is not
  attributed to the command.

Raw observer JSONL remains under the isolated root's `evidence/session-observer`
and is not committed. The `evidence/sha256-manifest.json` covers every evidence
file except the manifest itself; the acceptance directory becomes tracked when
this ticket is committed. `evidence/p4-working-tree.patch` records the
uncommitted product diff used to build the local tarball, and
`evidence/git-diff-check.txt` records the diff check (the only output is the
known `tickets.toml` CRLF warning).
