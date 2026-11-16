# Telemetry v2 host gate — acceptance report

Date: 2026-11-16
Ticket: T18 — Telemetry v2: host composition, sections and localized popover
Status: **PASS** for the recorded isolated Web-host run; no package or release action was taken.

## 1. What was verified

The packed build `@elvisw/dsh-magic-context@0.14.0` was installed into a fresh, isolated DSH Web
profile and exercised with one real model turn. The telemetry pill opened a localized popover that
rendered the host's three token segments, the server-side message split, and the v2 sections:

- System 2.8k, Tool definitions 8.8k, Messages 618; headline 11.8k / 1M, pressure 1.12% / 100%.
- Message composition: Conversation 574, Other 44. The `Memories` and `Profile` sub-rows are
  omitted in this run because no recall data exists; the separate Memory section shows `—` for
  its missing values rather than a fabricated `0`.
- Historian `idle · 0 compartments · 0 digested · last published —`; Memory `0 total · — injected
  · — last injection · — profile last injection`; Queue `empty`; Maintenance `never run`;
  Hygiene `0 tagged · 0 dropped · 0 reclaimable`.
- Switching the host language between Chinese and English re-rendered the new copy.
- The bar exposes a text equivalent through `role="img"` and `aria-label`.
- The pill exposes `aria-expanded`; opening traps focus, Escape and an outside click both return
  focus to the pill; the footer exposes `/ctx-status`.

`ui-gate.json` records all assertions as `true`; browser console and page-error collection is empty.

## 2. Exact artifacts

| Item | Value |
| --- | --- |
| Host | DSH `0.2.2-rc.1`, Node `24.21.0` |
| Isolated root | `%TEMP%\opencode\dsh-mc-t18-20261116-162514` |
| Profile | `t18` |
| Session | `session-dfe13628-a1e7-403f-9b8d-a0596e1724ee` |
| Local tarball | `%TEMP%\opencode\t18-pack\elvisw-dsh-magic-context-0.14.0.tgz` |
| Tarball SHA-256 | `2058d50a29c8ae249f8e05aacd539204f81127444fd5a5d33794d7d849140c13` |
| Tarball bytes / files | 4,026,819 / 66 |
| Playwright | 1.63.0 |
| Chromium | `%LOCALAPPDATA%\ms-playwright\chromium-1254\chrome-win64\chrome.exe` |
| Real route | `deepseek-official` (T13-proven real model route; key presence only recorded) |

The host URL token is redacted from committed evidence. No daily profile, daily data directory, host
source, package metadata, or release channel was changed.

## 3. Evidence

- `evidence/prepare.json` — isolated profile creation, plugin install, effective configuration
  checks.
- `evidence/server-redacted.json` / `evidence/server-log.txt` — host process and boot log, token
  redacted; the raw live-URL file stays only in the temporary root.
- `evidence/summary.json` — the session-scoped telemetry payload consumed by the opened panel.
- `evidence/ui-gate.json` — every gate assertion, including `aria-expanded`, focus trap,
  Escape/outside focus return, bar `aria-label`, zh/en switch, captured summary and zero console
  errors.
- `evidence/01-session.png`, `02-panel-zh.png`, `03-panel-en.png` — 1280×900 screenshots.
- `evidence/unit-test.txt`, `typecheck.txt`, `i18n.txt`, `build.txt` — final tree gates.
- `evidence/secret-scan.txt` — reproducible 17-file scan, 0 hits.
- `evidence/host-version.json` / `host-version.txt` — exact host, Node, Playwright and tarball identity.

## 4. Verification commands

Final tree gates (all executed after the last code change):

- `npm test` — 78 test files, 939 tests passed.
- `npm run typecheck` — passed.
- `npm run check:i18n` — ALL PASS (193 keys, no hardcoded Chinese outside the dictionary).
- `npm run build` — passed.

The host gate installed the local packed tarball, started the isolated Web host, sent exactly
`Reply with exactly OK and nothing else.`, waited for the pressure reading, and ran the Playwright
gate during iteration; the recorded final run is the one whose `ui-gate.json` is committed.

## 5. Boundaries and non-claims

- **No Historian publish, memory write, residual warning, or 120-second stale transition was produced
  in this host run.** Historian counts are zero because no compartment was published; the Memory
  section shows `—` because no recall occurred; `residualTokens` is 0. These states are covered only by unit
  tests, not by this gate.
- This is one isolated Web profile and one real model turn, not a T13-sized interaction matrix.
  Desktop/TUI rendering, dsh-go, remote embeddings and a second language persisted across restart
  are out of scope. The healthy-transport-without-`health` status path is covered by the view-model
  test only; this host run always had a `health` object.
- The host URL token is intentionally omitted/redacted; the gate scripts read it from the isolated
  server file and never print it.
- The `summary.json` captured here is a single session snapshot; it is not a general performance or
  token-accounting benchmark. The 100% bar is normalized over `system + tools + messages`, while the
  headline pressure stays the host's `lastTokens / contextWindow`; the two numbers are not expected
  to be identical.
- No package version bump, npm publish, tag, deprecation, or daily-profile install was performed.

## 6. Result

`pass: true` with all thirteen assertions true and `errors: []`. The recorded screenshots show the Chinese
and English popover states and the pill. T18 can proceed to independent review/close-out; this report
does not by itself authorize a release.
