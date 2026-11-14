# Independent package identity — acceptance report

- Date: 2026-11-14
- Ticket: `story-independent-package-identity-and-release.md`
- Scope: package identity, artifact, isolated DSH install/load, one real model smoke.
- Not in scope: npm bootstrap, Trusted Publisher binding, tag, registry publish (Phase 4–5, HITL).

## 1. Artifact

| Item | Value |
|---|---|
| Package name | `@elvisw/dsh-plugin-magic-context` |
| Version | `0.12.0` |
| Tarball | `elvisw-dsh-plugin-magic-context-0.12.0.tgz` |
| Tarball SHA-256 | `eac83d0951823030f7faccec88f81ef926057eeffc0c0b371cbd6af189766581` |
| Contents | 65 files, 4.0 MB packed / 15.3 MB unpacked |
| Built tree check | no bare upstream specifier in `lib/`, `cordis.patch.yml`, `package.json`; only historical/attribution text and tarball-prefix strings contain the old name |
| Extracted tarball check | `package.json` root name is the scoped name; `lib/client.js` registers the scoped id; no bare upstream specifier in runtime files |

The tarball was produced by `npm pack` from the local build. `npm pack --dry-run` reported the same name and filename.

## 2. Package identity changes

| Surface | Value |
|---|---|
| `package.json` name | `@elvisw/dsh-plugin-magic-context` |
| `cordis.patch.yml` row `name` | `@elvisw/dsh-plugin-magic-context` |
| Cordis loader row `id` | `magic-context-dsh` (unchanged) |
| Client module id / `PKG_NAME` | `@elvisw/dsh-plugin-magic-context` |
| Settings namespace | `magic-context-dsh` (unchanged) |
| Plugin data directory | `magic-context-dsh-poc` (unchanged) |
| Install script | `PKG=@elvisw/...`, `TGZ_PREFIX=elvisw-dsh-plugin-magic-context` (separate variables) |

## 3. Isolated host install

Root: `C:\Users\elvis\AppData\Local\Temp\opencode\dsh-mc-pkg-20261114-193841` (fresh, isolated `DSH_HOME`, sessions, caches, plugin data).

| Check | Result | Evidence |
|---|---|---|
| Fresh profile bootstrap | exit 0 | `evidence/bootstrap-profile.txt` |
| `dsh plugin add <tarball> --ignore-scripts` | exit 0 | `evidence/add-new.txt` |
| Profile dependency | `@elvisw/dsh-plugin-magic-context: file:.../elvisw-dsh-plugin-magic-context-0.12.0.tgz` | `evidence/preflight.json` |
| Profile bundle | `@elvisw/dsh-plugin-magic-context` | `evidence/preflight.json` |
| Old package installed | false | `evidence/preflight.json` |
| New package installed | true; installed `package.json` name is scoped | `evidence/preflight.json` |
| `--dump-config` | exit 0; contains `id: magic-context-dsh` and `name: '@elvisw/dsh-plugin-magic-context'`; contains no old package name | `evidence/dump-config.txt` |
| Boot log | `tools: dynamic-import`; plugin DB under the new root | `evidence/activity.log` |
| Model route | `deepseek-official` / `deepseek-flash` | `evidence/dump-config.txt` |

## 4. Real model smoke

```text
exit_code: 0
final_reason: {"kind":"completed"}
final_text: PACKAGE_IDENTITY_OK
session: session-16216c94-3e13-4050-9a30-16633a6cfb28
```

Evidence: `evidence/smoke.json`, `evidence/smoke.stdout.txt`, `evidence/smoke.stderr.txt`.

This proves the scoped package installed into an isolated profile boots through the real DSH loader and can complete a real model turn. It does not exercise the browser settings card (headless run); the client id is checked from the installed `lib/client.js` and the settings row id from `--dump-config`.

## 5. Regression checks

| Check | Result |
|---|---|
| `npm test` | 76 files / 838 tests passed |
| `npm run typecheck` | passed |
| `npm run build` | passed |
| `npm run check:i18n` | ALL PASS |
| `npm pack --dry-run` | scoped name, expected 65 files |
| `npm pack` + extract | scoped name, runtime grep clean |

## 6. What this does not prove

- No npm registry publish, no bootstrap version, no Trusted Publisher binding, no provenance. Those are Phase 4–5 and require explicit authorization plus npm 2FA/token.
- No browser UI run; the settings card was not opened.
- No T2–T5 behavioral regression suite was rerun; the code diff is package identity plus docs, and the full unit/integration suite passed.
- `npm run gate` was not used as the release gate; it may fail on absent daily databases. The four release checks above passed.

## 7. Isolation disclosure

All DSH paths used by the run are under the new root: `DSH_HOME`, `HOME`/`USERPROFILE`, `XDG_DATA_HOME`, `XDG_CACHE_HOME`, `APPDATA`, `LOCALAPPDATA`, and the plugin `dataDir`. The daily profile was not used. The first preparation attempt against a copied profile failed with `ERR_PNPM_UNEXPECTED_STORE` because `node_modules` still pointed at the old pnpm store; it was discarded and the final run used a fresh profile. No evidence from the failed attempt is used.
