# T16 — Compaction takeover scope, Web/Desktop warning

Status: implemented; copy/documentation only. No runtime behavior change.

## 1. What changed

Ticket 16 was originally drafted as an automatic `compaction-basic` profile-patch
writer. Independent validation rejected that design: on DSH Web and Desktop the
root `compaction-basic` row is already disabled by the web bundle, and each
agent preset mounts its own nested `compaction` group. A profile-patch top-level
row cannot reach a preset's `config.plugins`, and settings saves rewrite YAML
through the config editor, so the proposed writer and CRLF/live-refresh
guarantees were not implementable.

The ticket was re-scoped to a copy-only correction:

- The Settings hint now says the switch has **no effect on DSH Web or Desktop**;
  it is flat/headless-only and requires that composition's root
  `compaction-basic` row to be disabled.
- README.md / README.zh-CN.md no longer present the two-row YAML snippet as a
  universal takeover; the snippet is scoped to flat/headless profiles.
- The Settings UI contract has a `Compaction takeover scope` section.
- `cordis.patch.yml` header comments are scoped to flat/headless.
- Source comments in `src/index.ts` and `src/dsh/config.ts` no longer imply a
  universal takeover.
- CHANGELOG records the scope correction and links the upstream report.
- No profile-patch writer, no `ctx.loader.update`, no `compaction-basic` edit
  and no preset-aware takeover were added.

## 2. Upstream issue

The upstream `dsh-plugin-magic-context` 0.11.2 README shows the same two-row
recipe as a general takeover. It is flat-only and does not work on DSH
Web/Desktop. Reported as:

https://github.com/wk544863858/dsh-plugin-magic-context/issues/16

This fork's README, Settings UI contract and CHANGELOG link that issue.

## 3. Files

| File | Change |
|---|---|
| `src/client/index.js` | zh/en `registerCompactionEngine` hint only |
| `tests/client-pure.spec.ts` | dictionary assertion for flat/headless, root row, agent preset, Desktop/Web, and old-phrase ban |
| `README.md` | scope bullets, table row, configuration warning, flat/headless snippet, upstream issue |
| `README.zh-CN.md` | same scope corrections in Chinese |
| `docs/dsh-plugin-settings-ui-contract.md` | new §5 scope section, upstream issue, renumbered following sections |
| `cordis.patch.yml` | package header comment scoped to flat/headless |
| `src/index.ts` | comment-only scope qualification |
| `src/dsh/config.ts` | comment-only scope qualification |
| `CHANGELOG.md` | `[Unreleased] → Changed` note and upstream issue |
| `_bmad-output/.../tickets/*` | story, plan and ticket 16 metadata |

## 4. Host facts used

- `@deepseek-ai/dsh-web-app@0.2.2-rc.1/cordis.patch.yml:546-547` disables the
  root `compaction-basic` row; the same structure exists in 0.2.1-rc.1.
- `@deepseek-ai/dsh-web-app/presets/standard.patch.yml:69-81` mounts a nested
  `compaction` group with `isolate.compaction: true`.
- `cordis-plugin-include/lib/index.js:218-228` only recurses `group: true`
  rows, so a top-level profile patch cannot reach the preset engine.
- `dsh-config-editor/lib/index.js:90-122` parses and rewrites YAML; the
  byte-identical/CRLF claim across a settings save was not possible.
- The profile patch is not a standalone Include with its own `refresh()`; the
  live-refresh design did not exist.
- Upstream `src/index.ts` registers on the plugin root `ctx`, and upstream
  `tests/compaction-conflict.spec.ts` mounts the plugin directly in a flat test
  context, not in a Web/Desktop preset.
- Desktop uses the same Web app bundle: `dsh-web-app/cordis.patch.yml:37-51`
  and `:291-294` branch on `profileContext.name === 'desktop'`, and
  `dsh-web-app/package.json:50-53` exports the same preset patch files.

These facts were confirmed against the installed DSH 0.2.2-rc.1 and the T13
`dump-default.txt` evidence (`:274-277`, `:752-763`, `:917-928`, `:1002-1011`,
`:1179-1188`). The 0.2.1-rc.1 and Desktop-specific details come from the
installed host packages and are also recorded in upstream issue #16; those
packages are not part of this repository.

## 5. Verification

| Gate | Result |
|---|---|
| `npm test` | 77 files / 922 tests passed |
| `npm run typecheck` | passed |
| `npm run check:i18n` | ALL PASS |
| `npm run build` | passed; `lib/client.js` regenerated |
| `git diff --check` | no whitespace errors; only CRLF warnings |

Raw logs: `evidence/unit-test.txt`, `typecheck.txt`, `i18n.txt`, `build.txt`,
`diff-stat.txt`, `git-status.txt`, `diff-check.txt`, `scope-check.txt`,
`old-phrase-check.txt`, `upstream-issue-check.txt`.

`scope-check.txt` shows both READMEs, the contract and the client hint carry the
flat/headless + Web/Desktop wording. `old-phrase-check.txt` only contains the
test's negative assertions. `upstream-issue-check.txt` shows the upstream issue
link in README.md, README.zh-CN.md, the Settings UI contract and CHANGELOG.

No host gate was run: this ticket changes only copy, comments and docs. T13's
existing isolated Web gate already proves the Settings card renders; this ticket
does not claim the new hint was browser-verified. If a browser check is wanted,
only assert the hint text is visible in Settings → Magic Context.

## 6. Not covered

- No browser screenshot of the new hint. The pure dictionary test proves the
  string, and the card render path is unchanged.
- No automatic profile-patch management; that design was rejected.
- No preset-aware Web/Desktop takeover; it was explicitly dropped as a
  host-level design change. The relevant DSH feature request is
  [deepseek-ai/deepseek-harness#11127](https://github.com/deepseek-ai/deepseek-harness/discussions/11127);
  this fork added its concrete use case there on 2026-11-16.
- No release, version bump, tag, publish or daily-profile mutation.
- The local daily `web` profile still contains a top-level `compaction-basic`
  row and an older comment from before this correction; this ticket does not
  modify it. It is now documented as ineffective for Web.
