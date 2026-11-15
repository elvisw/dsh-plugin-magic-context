---
id: 15
type: story
title: "Magic Context package identity rename"
parent: initiative-dsh-magic-context
after: [12]
refined: false
hitl: true
risk: high
---

# Magic Context package identity rename

Status: revision 4 — independent validation returned READY TO START; optional path/allowlist/layout cleanups applied below.

## Goal

Rename the npm package from `@elvisw/dsh-plugin-magic-context` to
**`@elvisw/dsh-magic-context`**, with the display name **Magic Context for
DeepSeek Harness — elvisw fork**, while keeping the existing loader row id,
settings namespace and data directory unchanged so existing users keep their
settings, memories and journals. The loader keys the profile patch by both
`id` and `name`, so the upgrade also needs a one-time profile-patch migration
that changes the `name` under `id: magic-context-dsh`; otherwise the old
config row is skipped.

## Why

- The current package still reads as `dsh-plugin-magic-context`, the upstream
  package name. Exact installs are unique because of the `@elvisw` scope, but
  search results, README titles and npm pages still look like the upstream
  project.
- The fork has diverged through many behavior changes (result-return
  `ctx_expand`, post-Historian `message`, `/ctx-flush`, tag retention removal,
  schema v11, settings page). It needs an install identity that is visibly a
  separate fork.
- Only `0.12.x` has been published; the user base is small. Renaming now is
  much cheaper than after data directories and docs accumulate.
- The name must still contain `magic-context` because this is a DSH port of
  Magic Context. The distinction is the scope plus dropping the `plugin`
  segment, not inventing an unrelated brand.

## Decisions

### D1 — Package and display name

- npm package: `@elvisw/dsh-magic-context`.
- Display: `Magic Context for DeepSeek Harness — elvisw fork`.
- README first line and npm description state that this is an independent
  fork, with a link to upstream `wk544863858/dsh-plugin-magic-context`.
- The repo URL may stay `elvisw/dsh-plugin-magic-context` for now; no GitHub
  repository rename in this ticket. Documentation links still resolve.

### D2 — Internal identity stays stable, with a one-time patch migration

Keep, for compatibility and to avoid data migration:

- loader row id: `magic-context-dsh`;
- settings namespace: `magic-context-dsh`;
- plugin data directory: `~/.local/share/cortexkit/magic-context-dsh-poc`;
- exported runtime name / schema / storage format.

Changing any of those is a separate migration ticket. In particular, the new
package must not silently create a second settings namespace or data
directory.

The profile's `cordis.patch.yml` matches a patch row by **both** `id` and
`name`. The old row is:

```yaml
- id: magic-context-dsh
  name: '@elvisw/dsh-plugin-magic-context'
  config: ...
```

`dsh plugin add/remove` does not rewrite that `name`. If it stays old, the new
package skips the row and loses all configured values (including a custom
`dataDir`). The same can happen to a `$DSH_HOME/cordis.patch.yml` home patch
or a `--patch` overlay. Provide a one-time helper `tools/migrate-profile-package-name.mjs` that
requires an explicit `--patch <path>` (no implicit profile guess) and follows
this state table, evaluated in this order after reading the file:

| State | Action |
| --- | --- |
| file missing/unreadable | non-zero |
| unparseable/flow-style/anchor/alias/multi-doc YAML or no safe line match | non-zero, refuse |
| `insert` row for the target id | non-zero, refuse (not a config override) |
| a row with the new package name under a different id | non-zero, conflicting identity |
| more than one `id: magic-context-dsh` row | non-zero, ambiguous |
| no `id: magic-context-dsh` row (and no different-id new-name row) | exit 0, "nothing to migrate" |
| exactly one target row with an old name (old fork or upstream `dsh-plugin-magic-context`) | rewrite only that `name` line |
| exactly one target row with the new name | exit 0, "already migrated" |
| exactly one target row with no `name` | exit 0, preserve it |
| exactly one target row with an empty/null `name:` | non-zero, refuse |
| exactly one target row with an unknown non-empty name | non-zero, refuse |

The order is intentional: a different-id row that claims the new package
name is a conflict even when the target id is absent; it must not fall into
the "nothing to migrate" branch. Rows considered for rewrite are limited to
`id: magic-context-dsh`; unrelated ids are left untouched except for the
different-id new-name conflict above. The helper:

- preserves every other line/field (including `config`, `dataDir`,
  `disabled`, comments and CRLF), writes a timestamped backup only when it
  changes something, uses a Windows-safe timestamp and atomic replace, and is
  idempotent (second run hits the "already migrated" row);
- is zero-dependency and conservative: if it cannot prove a safe block-style
  scalar, it refuses rather than guessing;
- is user-invoked; do not silently edit the daily profile from the installer.

The helper must be delivered to users in **both** the npm tarball and the
Hand-out bundle: add it to `package.json` `files` **and** copy it in
`scripts/mc-pack-dist.mjs`. Hand-out layout: `install-magic-context.bat` at
the hand-out root, helper at `<hand-out>\tools\migrate-profile-package-name.mjs`.
README/upgrade docs give exact commands; the installer prints templates such
as (`%DSH_HOME%` defaults to `%USERPROFILE%\.dsh` when unset):

```bat
node "%DSH_HOME%\profiles\<profile>\node_modules\@elvisw\dsh-magic-context\tools\migrate-profile-package-name.mjs" --patch "%DSH_HOME%\profiles\<profile>\cordis.patch.yml"
node "<hand-out>\tools\migrate-profile-package-name.mjs" --patch "%DSH_HOME%\cordis.patch.yml"
node "<hand-out>\tools\migrate-profile-package-name.mjs" --patch "<overlay>\cordis.patch.yml"
```

Existing users must run it before opening Settings or switching the Plugins
page, otherwise the host may append a new row and hide the old config.

### D3 — Version and first publish (HITL)

- New package version: **`0.13.0`** (identity rename; no runtime behavior
  change).
- First publish of the new package name cannot use Trusted Publishing because
  the package does not exist yet. Use the T6 bootstrap path:
  1. `npm version 0.0.0-bootstrap.0 --no-git-tag-version`;
  2. publish manually with web auth/OTP, `--provenance=false --tag bootstrap
     --access public`;
  3. restore `package.json` and `package-lock.json` to `0.13.0`;
  4. bind Trusted Publisher to `release.yml` and this repository with
     `--allow-publish`;
  5. tag `v0.13.0`; the workflow publishes `0.13.0` through OIDC.
- Bootstrap, Trusted Publisher binding, the `v0.13.0` tag and deprecation are
  public actions. Each requires explicit user authorization; `hitl` is true
  for this ticket.
- Check bootstrap with `npm view @elvisw/dsh-magic-context dist-tags` and
  `npm view @elvisw/dsh-magic-context@0.0.0-bootstrap.0 version`; the first
  publish may leave `latest` on the bootstrap version. Only after the formal
  release assert `dist-tags.latest === '0.13.0'`.
- Do not manually publish `0.13.0`; the tag/version guard must remain the
  only release path.

### D4 — Old package deprecation

After the new package is live, verified and the old `0.12.3` install path is
documented as superseded:

```bash
npm deprecate @elvisw/dsh-plugin-magic-context "Renamed to @elvisw/dsh-magic-context; install the new package."
```

Do not unpublish the old package. Its versions remain installable for
reproduction, but new users are pointed to the new identity.

### D5 — Install examples and co-install semantics

The existing README `--profile desktop` examples are invalid for the npm CLI
(DSH reserves `desktop` for the Desktop app's own profile). This ticket
updates package-name examples to the **web** profile (and states the Desktop
app uses its bundled command runtime). T14 still owns the broader host-claim
audit and documentation index.

The loader does **not** reject duplicate row ids: it keeps one row (typically
the later one) and the settings editor may hide duplicate-id rows. So
co-installing the old package, the upstream package and the new package is
unsupported and can make settings disappear. Documentation must say "remove
the old/upstream package first"; do not claim the install is refused. The
installer should attempt to remove both old specifiers (ignoring absence)
before installing the new package.

## Requirements

- `package.json`:
  - `name` → `@elvisw/dsh-magic-context`;
  - display description mentions `elvisw fork`;
  - repository/homepage/bugs may stay; verify URLs;
  - version `0.13.0` after the bootstrap cycle.
- `package-lock.json`: regenerate so the root package name matches.
- `cordis.patch.yml`: loader `name` → new package; `id: magic-context-dsh`
  unchanged.
- `src/client/index.js`: package id / `PKG_NAME` → new package; `CFG_NS`,
  client bundle name and internal namespaces unchanged.
- `src/index.ts`: exported runtime name stays `magic-context-dsh-poc` unless a
  concrete behavior reason requires otherwise; this ticket does not rename
  storage identity.
- `tools/install-magic-context.bat`: `PKG` and `TGZ_PREFIX` → new package /
  `elvisw-dsh-magic-context-<version>.tgz`; attempt to remove both
  `@elvisw/dsh-plugin-magic-context` and upstream
  `dsh-plugin-magic-context` (ignore absence) before install.
- `package.json` `files`: include `tools/migrate-profile-package-name.mjs`
  **and** have `scripts/mc-pack-dist.mjs` copy it into the hand-out next to
  the installer; the tarball and hand-out must both contain it.
- `tools/migrate-profile-package-name.mjs`: the one-time patch migration
  described in D2, with explicit `--patch`, state table, backup,
  idempotence and refusal for ambiguous/conflicting/unsafe YAML; zero
  dependencies and conservative block-style parsing.
- `scripts/phase-map.mjs`: register the new helper spec in `PHASE_BASE` (or a
  phase) so `tests/phase-map.spec.ts` does not fail for an unmapped spec.
- `tests/client-pure.spec.ts` (and a config test): assert the client
  definition id equals `package.json` name and `cordis.patch.yml` `name`
  equals the package name.
- Tests for the migration helper: old-name rewrite (old fork and upstream
  names), second-run already migrated, no target id, id-only row, new-name
  row, duplicate target row, same-id old+new, different-id new-name, unknown
  name, empty/null `name:`, missing file, missing `--patch`, insert row,
  unparseable/multi-doc/anchor/flow-style/no-safe-match, backup-only-on-change,
  refusal leaves the file untouched, config/dataDir/disabled/comments/CRLF
  preservation. Add the spec file to covers.
- `tools/install-magic-context.bat`: after installing, print a blocking
  prompt with the exact helper command and profile patch path; do not edit
  the daily profile automatically. Keep `PROFILE=desktop` because this
  installer invokes the Desktop-bundled CLI; only npm CLI examples in README
  use `--profile web`.
- `NOTICE:10,28-29`, `CONTRIBUTING.md:94`,
  `docs/dsh-plugin-upgrade-followup.md:26-27`,
  `docs/dsh-plugin-ui-telemetry-contract.md:463`: update current package
  identity and co-install wording ("unsupported; remove old first", not
  "cannot be installed").
- `README.md:167,114`, `README.zh-CN.md:133,94` configuration/from-source
  examples: use the new package and `--profile web`; keep
  `README.md:390-418`/`README.zh-CN.md:325-339` as the 0.12.0 history but add
  the 0.13.0 identity/migration note. Change the historical
  "cannot be installed side by side" line (`README.md:418`,
  `README.zh-CN.md:339`) to "unsupported; remove old/upstream first".
- `docs/dsh-plugin-config-ui-contract.md:8,42,250,254,273,395,423,435,448,524`:
  this is a 0.12.x historical contract; change `:8` to say it is historical
  and that T13's `docs/dsh-plugin-settings-ui-contract.md` will supersede it
  once T13 lands, without linking a file that does not exist yet. Do not
  mass-rewrite the body. T14 owns its status header and final link.
- `AGENTS.md:21`: keep the upstream `dsh-plugin-magic-context@0.11.1`
  citation as a historical example, not a new-package command; no change.
- `docs/independent-package-release.md:7,10-11,14,18-19,39-55`: update
  install/remove commands, package/tarball names, trust/publish commands,
  co-install wording, and "no migration" -> data/session no migration but
  patch name needs one-time migration.
- `tools/install-magic-context.bat` comments (`:2,13`) and header/example
  text: replace the old tarball prefix and package name, not just
  `PKG`/`TGZ_PREFIX`.
- `scripts/mc-pack-dist.mjs`: copy the migration helper to the hand-out and
  list it in the console/README; keep the tarball `files` entry too.
- `.github/workflows/release.yml`: package-name/tarball expectations, the
  "first release 0.10.0" comment and Trusted Publisher documentation; note
  the new package's separate bootstrap. Verify no hardcoded old name.
- `scripts/phase-map.mjs`: register the new helper spec in `PHASE_BASE` or a
  phase so the phase-map test passes.
- README.md, README.zh-CN.md, CHANGELOG.md, PARITY.md,
  `docs/independent-package-release.md`:
  - new install/uninstall/upgrade commands using `--profile web`;
  - one-paragraph fork/upstream distinction;
  - note that the loader row id/settings/data dir are unchanged;
  - note the one-time `cordis.patch.yml` `name` migration and that a skipped
    row can make settings/dataDir appear lost; include the helper command;
  - note that old/upstream co-install is unsupported and must be removed
    first, not that the loader refuses it;
  - do not claim Desktop has been verified; do not claim "no migration" for
    settings.
- Tests/snapshots that assert the package name, client id, tarball prefix or
  README command.
- No runtime behavior, schema, database, loader row id, settings namespace or
  data-directory change.
- No release until the user explicitly authorizes it.

## Acceptance

- `npm run build` (or `npm run pack:dist`) then `npm pack` produces
  `elvisw-dsh-magic-context-0.13.0.tgz`; the tarball contains
  `package/lib/index.js` **and**
  `package/tools/migrate-profile-package-name.mjs`. The `mc-pack-dist`
  hand-out contains the tarball, installer and migration helper.
- The helper state table is covered by tests: old->new rewrite (old fork and
  upstream names), second run already migrated, no target row, id-only row,
  new-name row, duplicate target row, same-id conflict, different-id
  new-name (including no target id), unknown name, empty/null name, missing
  file, missing `--patch`, insert row,
  unparseable/multi-doc/anchor/flow-style/no-safe-match, backup-only-on-change,
  refusal leaves the file untouched, config/dataDir/disabled/comments/CRLF
  preserved.
- The installer prints a copy-pasteable command template that resolves the
  helper path and a profile patch path (`%USERPROFILE%\.dsh\profiles\<profile>\
  cordis.patch.yml` or `$DSH_HOME/cordis.patch.yml`), plus the overlay form;
  it does not silently edit the daily profile. It keeps `PROFILE=desktop`
  because it uses the Desktop-bundled CLI; README npm CLI examples use
  `--profile web`.
- A fresh isolated **web** profile installs
  `@elvisw/dsh-magic-context@0.13.0`; `--dump-config` shows the new package
  name and the unchanged row id `magic-context-dsh`.
- An isolated upgrade from `@elvisw/dsh-plugin-magic-context@0.12.3` to the
  new package, with a non-default setting and a custom `dataDir`, keeps the
  **effective** `--dump-config` values, memories, journal, `schema_version`
  and the custom data directory; no second namespace/directory is created.
  This requires the one-time profile patch `name` migration, not just package
  remove/add.
- The same upgrade migrates `$DSH_HOME/cordis.patch.yml` and a block-style
  `--patch` overlay fixture, and a second run is idempotent; all three
  effective overrides survive restart.
- A repo-wide grep (including `scripts/`, `SECURITY.md`, `NOTICE`,
  `CONTRIBUTING.md`, `AGENTS.md`, `docs/`) has no unintended old package
  specifiers; helper/fixtures, upstream citations, the repo URL, the
  historical 0.12.0 README/CHANGELOG sections, and the installer's
  removal-only old/upstream specifiers are explicitly allowed.
- Registry artifact verification: the published tarball matches the local
  build (`lib/*.js` hashes, `cordis.patch.yml`), installs into an isolated
  profile, and the README/npm page first screen identifies the elvisw fork.
- Co-installing the old package, the new package and/or upstream
  `dsh-plugin-magic-context` is documented as **unsupported** because the
  loader keeps one duplicate-id row and settings may disappear; the README
  says to remove old/upstream first. Do not claim the loader refuses the
  install. The historical 0.12.0 section may remain, but its "cannot be
  installed side by side" wording is changed to "unsupported; remove first".
- `npm view @elvisw/dsh-magic-context dist-tags` and
  `npm view @elvisw/dsh-magic-context@0.0.0-bootstrap.0 version` show the
  bootstrap before the formal release; Trusted Publisher is bound; tag
  `v0.13.0` publishes with provenance; only then `dist-tags.latest` is
  `0.13.0`.
- The old package is deprecated with a rename message and is not unpublished.
- README/npm page first screen clearly says this is an elvisw fork, not the
  upstream package; install commands use `--profile web`.
- `npm test`, `npm run typecheck`, `npm run check:i18n`, `npm run build` pass.
- Secret scan is clean; no `sk-…`, API keys or Bearer tokens in evidence.
- No loader row id, settings namespace, data dir, schema or behavior change.

## Boundaries

- Do not change the loader row id, settings namespace, data directory, DB
  schema, storage format or runtime behavior.
- Do not rename the GitHub repository in this ticket.
- Do not remove or unpublish old npm versions.
- Do not publish a formal `0.13.0` manually; bootstrap + tag only.
- Do not touch T13's Settings page implementation or T14's documentation
  index; those follow this ticket.
- No release until explicit user authorization.

## References

- `package.json:2` — current package name.
- `cordis.patch.yml:17-18` — loader row id and package name.
- `src/client/index.js:43-59` — client package identity and `CFG_NS`.
- `tools/install-magic-context.bat:20-21` — `PKG` / `TGZ_PREFIX`.
- `NOTICE:10,29`, `CONTRIBUTING.md:94`, `AGENTS.md:21` — package identity
  references that also need updating or explicit historical treatment.
- `docs/dsh-plugin-config-ui-contract.md:8,448`,
  `docs/dsh-plugin-upgrade-followup.md:26-27`,
  `docs/dsh-plugin-ui-telemetry-contract.md:463` — docs with old package
  references; decide current vs historical.
- `package.json:43-50` `files` and `scripts/mc-pack-dist.mjs:25,69` — helper
  must ship in the tarball and hand-out, not only in the repo.
- `scripts/phase-map.mjs:22-121`, `tests/phase-map.spec.ts:38-41` — new
  helper spec must be registered.
- `tools/install-magic-context.bat:96-111` — installer post-install output
  and `PROFILE=desktop` behavior.
- `@deepseek-ai/dsh-plugin-manager/lib/index.js:411-449` — add/remove writes
  profile bundles, not `cordis.patch.yml`; `dsh-app-boot/lib/index.js:1992-2014`
  reconciles bundles only.
- `@deepseek-ai/dsh-app-boot/lib/index.js:1908-1917` — home patch is also
  applied; the helper accepts `--patch <path>`.
- `@deepseek-ai/dsh-app-boot/lib/index.js:545-547` — patch rows match by `id`
  and `name`; a stale name skips the whole patch.
- `@deepseek-ai/dsh-plugin-manager/lib/index.js:1139-1184` and
  `dsh-config-editor/lib/index.js:97-109` — GUI can append an id-only or
  new-name row when the old name does not match; define those states.
- `@deepseek-ai/cordis-plugin-loader/lib/index.js:82-97` — duplicate ids are
  overwritten, not rejected.
- `README.md:41,44,101,114,139` and `README.zh-CN.md:28,31,81,94,112` —
  current package-name install/from-source examples.
- `_bmad-output/initiative-dsh-magic-context/tickets/story-independent-package-identity-and-release.md`
  — T6 bootstrap/trust/release path.
- `_bmad-output/initiative-dsh-magic-context/tickets/story-historian-reasoning-effort-picker.md`
  — T13, starts after this ticket.
