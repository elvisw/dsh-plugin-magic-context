# T15 package identity rename — acceptance report

Date: 2026-11-15
Ticket: `initiative-dsh-magic-context/15`
Host: DSH `0.2.2-rc.1` via the isolated CLI at
`%TEMP%\opencode\mc-t0-2026-11-13\tools\dsh`
Build: local `@elvisw/dsh-magic-context@0.13.0` tarball
`elvisw-dsh-magic-context-0.13.0.tgz`
Tarball SHA-256: `1c8ac596be020e72b6e0103c287bcd606721dccd5af5b118605d253e2049dfd6`
Root: `%TEMP%\opencode\dsh-mc-t15-20261115-211430`
Fresh root: `%TEMP%\opencode\dsh-mc-t15-fresh-20261115-211430`

Release follow-up: `0.13.0` was published after this implementation gate. See
`../acceptance-windows-dsh-2026-11-15-t15-release/acceptance-report.md` for the
registry artifact hash, Trusted Publisher, GitHub run, and isolated registry
install smoke.

## 1. What changed

| Identity | Before | After | Changed? |
| --- | --- | --- | --- |
| npm package | `@elvisw/dsh-plugin-magic-context` | `@elvisw/dsh-magic-context` | yes |
| tarball prefix | `elvisw-dsh-plugin-magic-context` | `elvisw-dsh-magic-context` | yes |
| client module id / `PKG_NAME` | old package | new package | yes |
| `cordis.patch.yml` row name | old package | new package | yes |
| loader row id | `magic-context-dsh` | `magic-context-dsh` | no |
| settings namespace | `magic-context-dsh` | `magic-context-dsh` | no |
| plugin data dir | `magic-context-dsh-poc` | `magic-context-dsh-poc` | no |
| schema / stored format | v11 | v11 | no |

The package version is `0.13.0`. The old package name remains only in current
upgrade/removal instructions, the migration helper's accepted old names, test
fixtures, historical changelog/README sections, upstream citations, repo URLs
(`package.json` homepage/bugs/repository), and the installer's removal commands
and upgrade prompt. Historical contract docs that still mention it
(`docs/dsh-plugin-config-ui-contract.md`, `docs/dsh-plugin-ui-telemetry-contract.md`)
are the files T14 will mark historical in their status headers and README index;
that marking is not applied yet in this working tree.

## 2. Upgrade gate (0.12.3 → 0.13.0)

A fresh isolated `DSH_HOME`/`HOME`/`USERPROFILE` root was created. The published
`@elvisw/dsh-plugin-magic-context@0.12.3` was installed from npm, then a real
profile patch row was written:

```yaml
- id: magic-context-dsh
  name: '@elvisw/dsh-plugin-magic-context'
  config:
    dataDir: <root>/plugin-data-custom
    historianEnabled: false
    policy:
      executeThreshold: 42
```

The profile was replaced with the local 0.13.0 tarball and the migration helper
was run with that profile patch. Results:

- old `--dump-config` showed the old package row, the custom dataDir and
  `executeThreshold: 42` (`upgrade-dump-old.extract.txt`);
- after migration and package replacement, `--dump-config` showed
  `@elvisw/dsh-magic-context`, the same custom dataDir and
  `executeThreshold: 42`, with no old package row
  (`upgrade-dump-new.extract.txt`);
- a second helper run printed
  `already migrated: magic-context-dsh uses @elvisw/dsh-magic-context`;
- home patch and overlay fixtures were each migrated and `--dump-config` with
  the fixture showed the new package name
  (`upgrade-dump-home.extract.txt`, `upgrade-dump-overlay.extract.txt`).

This is the regression the ticket exists for: DSH's patch merge finds the row by
`id` and then checks `name`; a mismatch skips the whole patch
(`@deepseek-ai/dsh-app-boot/lib/index.js:545-547`), so the custom dataDir and
settings silently stop applying. This gate dumps the old package before
migration, then dumps after migration; it does not dump the new package while
the old name row is still present, so the skip itself is host-source evidence,
not an observed dump in this run.

## 3. Fresh install

A second fresh isolated profile installed the local 0.13.0 tarball only.
`--dump-config` showed `@elvisw/dsh-magic-context` and no old package name
(`fresh-fresh-dump-after.extract.txt`).

## 4. Data compatibility probe

The config gate above intentionally starts with an empty custom data directory.
A separate storage probe used the exact published 0.12.3 tarball and the exact
local 0.13.0 tarball (`probe_t15_data.py`):

1. the old package created `memories.db` (corpus schema v95) and
   `dsh-magic-context.db` (adapter schema v11);
2. it wrote one memory (`CONFIG_VALUES`, importance 7, content
   `T15_DATA_SURVIVAL_4097`), one journal row and one pending drop;
3. a separate process opened the same directory with the 0.13.0 storage
   modules and read them back: one memory with the same content/category/
   importance, one journal row with the same marker, pending drop still
   `pending`, adapter schema 11, corpus `exists`.

`evidence/t15-data-probe.json` records `ok: true`, both tarball hashes and the
Node version used; `data-probe-seed.json` / `data-probe-verify.json` are the raw
outputs. `probe_t15_data.py` checks the old tarball SHA-1 and the new tarball
SHA-256 before extraction, then wipes and recreates its fixed temporary root.
This is a storage-level compatibility probe using the two packaged tarballs
(0.12.3 from the registry, 0.13.0 local), not a model session or a full DSH
host run. It exercises the new package's read path only; writing through the
new package is not claimed.

## 5. Artifacts and installer

- `npm pack --pack-destination %TEMP%\opencode\t15-pack-gate` produced
  `elvisw-dsh-magic-context-0.13.0.tgz`, 66 files, 4,007,255 bytes packed; its
  SHA-256 is in `tarball-sha256.txt`. It contains `package/lib/index.js` and
  `package/tools/migrate-profile-package-name.mjs` (`npm-pack-dry-run.txt` is
  the final dry run; its shasum matches the gate tarball).
- `node scripts/mc-pack-dist.mjs --no-build --out %TEMP%\opencode\t15-dist-gate`
  produced the hand-out with the tarball,
  `install-magic-context.bat`, and `tools/migrate-profile-package-name.mjs`
  (`pack-dist.txt`; same SHA-256 as the gate tarball).
- The installer text contains the helper command/prompt and exactly three
  `plugin --profile ... remove` commands: new package, old fork package and
  upstream; the gate parses the operands and checks the set
  (`installer_removal_specifiers` / `installer_removal_count` in
  `t15-state.json`). The old name also appears in the printed upgrade warning,
  so this is not a "removal-only" string claim.
- The installer keeps `PROFILE=desktop` because it invokes the Desktop-bundled
  CLI; README npm CLI examples use `--profile web`.

## 6. Co-install observation

In the fresh root, adding the old 0.12.3 package next to the new package
succeeded (`conflict_add_exit_code: 0`); `--dump-config` then showed both names
(`conflict_dump_has_old_name: true`, `conflict_dump_has_new_name: true`). This
proves the plugin manager and config dump accept both rows. It does **not**
prove the loader rejects or serves a particular row: the host source
(`@deepseek-ai/cordis-plugin-loader` entry groups/`EntryTree` keyed by `id`,
`lib/index.js:63-64,206`) keeps one row per id, and `dsh-config-editor` filters
duplicate ids. The documented
rule is therefore "co-install unsupported; remove old first", not "the loader
refuses the install".

## 7. Repo gates

- `npm test`: 77 files / 902 tests passed (`unit-test.txt`).
- `npm run typecheck`: passed (`typecheck.txt`).
- `npm run check:i18n`: ALL PASS (`i18n.txt`).
- `npm run build`: passed (`build.txt`).
- `git diff --check`: no whitespace errors; one CRLF warning
  (`git-diff-check.txt`). Untracked at capture time: `.codegraph/`, the T15
  acceptance directory, `tools/migrate-profile-package-name.mjs`,
  `tests/package-identity-migration.spec.ts`, the T15 story and plan, the T14
  story and plan, and the historian-picker plan. `git diff --check` does not
  cover those new files.
- Secret scan: the raw isolated roots match only `apiKeyEnv: DEEPSEEK_API_KEY`
  (an environment-variable **name**, not a credential value) on 16 lines
  (eight isolated config dumps × two lines each); there is no `sk-…` or
  `Bearer …` value (`secret-scan-raw.txt`, exit 0 because of those name lines).
  The committed-tree scan matches only two deliberate fixture strings in
  `tests/org-domain.spec.ts`; no real credential (`secret-scan.txt`, exit 0).
  Both scans are reproducible with the commands and UTC timestamps recorded in
  the files.

## 8. What this does not prove

- This implementation gate itself did not publish, tag, bind Trusted Publisher,
  or deprecate the old package. Those actions were run afterward and are covered
  by the release report linked at the top; the release smoke is a separate
  registry-install check, not part of this local-tarball gate.
- No Settings-page or UI migration test: T13 owns the new Settings page and
  `docs/dsh-plugin-settings-ui-contract.md`.
- No real model call was made in this gate. The package identity and profile
  config migration are host-level, not model-level.
- The upgrade gate proves the profile patch row, custom `dataDir` and
  `executeThreshold: 42` survive. The data probe proves memory, journal, pending
  drop, adapter schema 11 and corpus v95 survived an old-package write followed
  by a new-package read. Neither is a full live host session: the data probe did
  not start DSH or call a model, did not write through the new package, and did
  not cover vector embeddings or a Historian run.
- The helper is deliberately limited to block-style YAML; flow-style,
  anchors/aliases, multi-document files and ambiguous rows are refused, not
  rewritten. It also refuses a bundle `insert:` row; run it on the profile,
  home patch, or overlay, not on the installed package's `cordis.patch.yml`.
- The "conflict" observation is a config-dump observation, not a claim about
  which duplicate row the loader ultimately serves in every host version.
- The daily DSH profile, its plugin data directory and its sessions were not
  touched; isolation used a temporary `DSH_HOME`, `HOME`, `USERPROFILE`,
  `XDG_DATA_HOME`, `XDG_CACHE_HOME`, `APPDATA` and `LOCALAPPDATA`.

## Evidence index

| File | Purpose |
| --- | --- |
| `evidence/t15-state.json` | machine-readable assertions and exit codes |
| `evidence/upgrade-add-old.txt` | registry 0.12.3 install |
| `evidence/upgrade-dump-old.extract.txt` | old row + custom config |
| `evidence/upgrade-add-new.txt` | local 0.13.0 install |
| `evidence/upgrade-migrate-profile.txt` | profile patch migration |
| `evidence/upgrade-migrate-profile-second.txt` | idempotent second run |
| `evidence/upgrade-dump-new.extract.txt` | effective new row + custom config |
| `evidence/upgrade-migrate-home.txt` / `upgrade-dump-home.extract.txt` | home patch |
| `evidence/upgrade-migrate-overlay.txt` / `upgrade-dump-overlay.extract.txt` | overlay patch |
| `evidence/fresh-fresh-add.txt` / `fresh-fresh-dump-after.extract.txt` | fresh install |
| `evidence/fresh-conflict-add-old.txt` / `fresh-conflict-dump.extract.txt` | co-install observation |
| `evidence/t15-data-probe.json` / `data-probe-seed.json` / `data-probe-verify.json` | 0.12.3 → 0.13.0 storage compatibility |
| `evidence/npm-pack-dry-run.txt` / `tarball-sha256.txt` / `pack-dist.txt` | artifact identity and hand-out |
| `evidence/unit-test.txt`, `typecheck.txt`, `i18n.txt`, `build.txt` | repo gates |
| `evidence/git-head.txt`, `git-status.txt`, `git-diff-check.txt` | tree state |
| `evidence/secret-scan.txt`, `secret-scan-raw.txt` | credential-value scans |
