---
ticket: 15
title: "Magic Context package identity rename — plan"
status: done
---

# Plan — Magic Context package identity rename

Ticket: 15
Story: `tickets/story-magic-context-package-identity-rename.md`
Status: revision 3 — pending independent re-validation (second validation returned NEEDS CHANGES; helper delivery, state machine, phase-map, installer prompt and docs coverage are fixed below)

## 1. Scope lock

Rename the npm package and visible identity only, plus the one-time profile
patch migration required by the rename:

- package: `@elvisw/dsh-plugin-magic-context` → `@elvisw/dsh-magic-context`;
- display: `Magic Context for DeepSeek Harness — elvisw fork`;
- version target: `0.13.0`;
- migration: `tools/migrate-profile-package-name.mjs`.

Keep stable: loader row id `magic-context-dsh`, settings namespace, data dir,
schema, storage format and runtime behavior.

## 2. Current identity map

| Identity | Current | New | Change? |
| --- | --- | --- | --- |
| npm package | `@elvisw/dsh-plugin-magic-context` | `@elvisw/dsh-magic-context` | yes |
| Loader row id | `magic-context-dsh` | `magic-context-dsh` | no |
| Settings namespace | `magic-context-dsh` | same | no |
| Plugin data dir | `magic-context-dsh-poc` | same | no |
| Runtime exported name | `magic-context-dsh-poc` | same | no |
| Client package id | `@elvisw/dsh-plugin-magic-context` | new package | yes |
| Tarball prefix | `elvisw-dsh-plugin-magic-context-` | `elvisw-dsh-magic-context-` | yes |
| README title | `dsh-plugin-magic-context — Magic Context adapter` | `Magic Context for DeepSeek Harness — elvisw fork` | yes |
| GitHub repo | `elvisw/dsh-plugin-magic-context` | same | no |

## 3. Files to change

- `package.json`:
  - `name`, `description`, version;
  - verify `homepage`, `repository`, `bugs` URLs still resolve;
  - keep `publishConfig`; there is no `bin` field to preserve.
- `package-lock.json`: regenerate with `npm install --package-lock-only
  --ignore-scripts` after the name change.
- `cordis.patch.yml`: `name: '@elvisw/dsh-magic-context'`; keep `id:
  magic-context-dsh`.
- `src/client/index.js`: `id` and `PKG_NAME` constants; keep `CFG_NS =
  'magic-context-dsh'`, client bundle name and all labels.
- `tools/install-magic-context.bat`: `PKG=@elvisw/dsh-magic-context`,
  `TGZ_PREFIX=elvisw-dsh-magic-context`; attempt to remove old
  `@elvisw/dsh-plugin-magic-context` and upstream
  `dsh-plugin-magic-context` before install (ignore absence); update header
  comments and print the migration prompt after install; keep `PROFILE=desktop`
  for the Desktop-bundled CLI.
- `tools/migrate-profile-package-name.mjs`: one-time patch migration with
  **required** `--patch <path>` and this order:
  - missing/unreadable file -> non-zero;
  - unparseable, flow-style, anchor/alias, multi-doc or unsafe scalar ->
    non-zero refusal;
  - `insert` row for the target id -> non-zero refuse;
  - new-name row under a different id -> non-zero conflicting identity,
    even if the target id is absent;
  - more than one target row -> non-zero ambiguous;
  - no target row (and no different-id new-name) -> exit 0 "nothing to
    migrate";
  - exactly one target row: old name -> rewrite; new name -> already
    migrated; no name -> preserve; empty/null name -> refuse; unknown name ->
    refuse.
  Rows considered for rewrite are limited to the target id; unrelated ids are
  untouched, except the different-id new-name conflict above.
  Preserve `config`, `dataDir`, `disabled`, comments and CRLF; backup only on
  change; Windows-safe timestamp; atomic replace; zero dependencies.
  Do not edit the daily profile automatically.
- `package.json` `files` **and** `scripts/mc-pack-dist.mjs`: both must deliver
  the helper; verify by unpacking the tarball and listing the hand-out.
- `scripts/phase-map.mjs`: register the new helper spec in `PHASE_BASE` or a
  phase; `tests/phase-map.spec.ts` fails on unmapped specs.
- Tests for the helper: state table, old fork/upstream names, no target,
  different-id new-name with and without a target, insert, multiple target
  rows, empty/null name, unknown name, missing file, missing `--patch`,
  unparseable/multi-doc/anchor/flow-style, backup-only-on-change, refusal
  leaves file, preservation, CRLF/comments. Add the spec name to covers.
- `tools/install-magic-context.bat`: after install, print a blocking prompt
  with a copy-pasteable helper command and the profile/home/overlay patch
  forms; keep `PROFILE=desktop` because it uses the Desktop-bundled CLI. Only
  README npm CLI examples use `--profile web`.
- `NOTICE:10,28-29`, `CONTRIBUTING.md:94`,
  `docs/dsh-plugin-upgrade-followup.md:26-27`,
  `docs/dsh-plugin-ui-telemetry-contract.md:463`: update current package
  identity and co-install wording.
- `README.md:167,114`, `README.zh-CN.md:133,94`: config/from-source
  examples to new name and `--profile web`; keep
  `README.md:390-418`/`README.zh-CN.md:325-339` as 0.12.0 history, add a
  0.13.0 identity/migration note, and change the historical
  "cannot be installed side by side" lines (`README.md:418`,
  `README.zh-CN.md:339`) to "unsupported; remove first".
- `docs/independent-package-release.md:7,10-11,14,18-19,39-55`: update
  commands, package/tarball names, co-install wording, and "no migration" ->
  data/session no migration, patch name needs one-time migration.
- `AGENTS.md:21`: keep the upstream `dsh-plugin-magic-context@0.11.1`
  citation as a historical example; no change.
- `docs/dsh-plugin-config-ui-contract.md:8,42,250,254,273,395,423,435,448,524`:
  this is a 0.12.x historical contract; change `:8` to say it is historical
  and that T13's contract will supersede it once T13 lands, without linking a
  not-yet-created file. Do not mass-rewrite. T14 owns its header and link.
- `tools/install-magic-context.bat:2,13`: update header/example comments, not
  just `PKG`/`TGZ_PREFIX`.
- `.github/workflows/release.yml`: package/tarball guards, "first release
  0.10.0" comment, and separate bootstrap note for the new package.
- `scripts/phase-map.mjs`: register the helper spec.
- README.md, README.zh-CN.md:
  - title, badges, install/uninstall/upgrade commands (`--profile web`);
  - fork/upstream distinction and same-row-id warning;
  - one-time profile patch `name` migration; a skipped row can make settings
    or a custom `dataDir` appear lost;
  - old/upstream co-install is unsupported and must be removed first, not
    "refused by the loader";
  - Desktop app uses its bundled command runtime, not npm `--profile desktop`;
  - data-dir/settings compatibility statement.
- CHANGELOG.md: new `0.13.0` entry describing the rename, the profile patch
  migration and unchanged internal identity.
- PARITY.md: adapter package name/version; upstream baseline unchanged.
- `docs/independent-package-release.md`: bootstrap/trust/publish commands use
  the new package; remove old fork package and upstream; do not claim "no
  migration".
- Tests/snapshots with old package/client id or tarball prefix, plus a test
  that client `definition.id` equals `package.json` name and
  `cordis.patch.yml` `name` equals that name.
- `src/index.ts` runtime name stays unchanged; do not edit unless a failing
  test proves the identity must move.

## 4. Order of work

1. Rename package/client/installer metadata; regenerate lockfile.
2. Add and test the one-time patch `name` migration helper; include it in
   `package.json` `files` **and** the `mc-pack-dist` hand-out, and verify the
   tarball and the hand-out separately; both must contain it.
3. Update README/CHANGELOG/PARITY/release guide, NOTICE/CONTRIBUTING/AGENTS
   and tests.
4. `npm test`, typecheck, i18n, `npm run build`; `npm run pack:dist` and
   inspect the tarball name/contents (must include `lib/index.js` and the
   helper) and the hand-out.
5. Run a fresh isolated **web** profile install and a separate isolated
   upgrade from `0.12.3` (including a custom `dataDir`); verify effective
   settings, memories and journal preserved.
6. Independent diff review; fix all Critical/Fix.
7. Bootstrap the new npm package (`0.0.0-bootstrap.0`), bind Trusted
   Publisher, restore `0.13.0` (all HITL, user-authorized).
8. Tag `v0.13.0` and release through the workflow only after explicit user
   authorization.
9. Deprecate the old package; verify the new registry artifact and npm page.
10. Independent report audit; mark built/done. T13 starts after this ticket.

## 5. Tests

- `npm test`
- `npm run typecheck`
- `npm run check:i18n`
- `npm run build`
- `npm run build` before packing; a clean checkout without `lib/` must not be
  packed directly.
- `npm pack --dry-run` and a real `npm pack`: tarball
  `elvisw-dsh-magic-context-<version>.tgz` contains `package/lib/index.js`,
  `package/tools/migrate-profile-package-name.mjs`, and the new
  `package/package.json` name.
- `npm run pack:dist` hand-out contains the tarball, installer and helper.
- Search the repo for old package specifiers with repo-wide `rg`, excluding
  `_bmad-output` and `node_modules`:
  ```bash
  rg -n "dsh-plugin-magic-context" --glob '!_bmad-output/**' --glob '!node_modules/**' .
  ```
  Allow repo URLs (`github.com/elvisw/dsh-plugin-magic-context`), upstream
  citations (`dsh-plugin-magic-context@0.11.2`), the migration helper and its
  fixtures, and historical docs. Current installation identity must use the
  new package. Include `scripts/`, `SECURITY.md`, `NOTICE`, `CONTRIBUTING.md`,
  `AGENTS.md` and `docs/`.
- Add `tests/client-pure.spec.ts`/config tests asserting client
  `definition.id === package.json.name` and `cordis.patch.yml.name ===
  package.json.name`.
- Add `tests/package-identity-migration.spec.ts` for the helper state table
  and preservation; register it in `scripts/phase-map.mjs`. This exact path is
  listed in tickets.toml covers.
- Unpack the tarball and list the `mc-pack-dist` hand-out; **both** must
  contain the migration helper. Record in evidence.
- Tarball unpack: `package/package.json` name is new; `cordis.patch.yml` row
  id is still `magic-context-dsh`; client bundle references the new package.

## 6. Host gates

Isolation: set a temporary `DSH_HOME`, `HOME`, `USERPROFILE`, `APPDATA`,
`LOCALAPPDATA` and `XDG_*` before every run. The plugin data dir uses
`os.homedir()` (`src/core/stores.ts:371`), so `DSH_HOME` alone is not enough.
Never touch the daily profile or
`~/.local/share/cortexkit/magic-context-dsh-poc`; inject model credentials
through the isolated environment and keep `.credentials.yaml`, `sk-…` and
Bearer tokens out of evidence.

### Fresh install

Fresh isolated root, fresh `web` profile, install
`@elvisw/dsh-magic-context@0.13.0` from a local tarball (before release) or
registry (after release). Assert:

- `--dump-config` shows the new package and row id `magic-context-dsh`;
- one real model call returns a success token;
- plugin data dir is still `magic-context-dsh-poc` under the isolated HOME.

### Upgrade from 0.12.3

In a separate isolated root/profile:

1. Install `@elvisw/dsh-plugin-magic-context@0.12.3`.
2. Create a non-default setting, a custom `dataDir`, a memory and a
   tagged/dropped result.
3. Remove the old package; add the new package.
4. Run `tools/migrate-profile-package-name.mjs --patch <profile
   cordis.patch.yml>`; assert the `id: magic-context-dsh` row's `name`
   changed and `config`/`dataDir` are untouched.
5. Create a `$DSH_HOME/cordis.patch.yml` fixture and a block-style `--patch`
   overlay fixture, each with a target row using the old name; migrate both
   and assert their effective overrides survive after restart. A missing or
   malformed fixture is a blocked gate, not "if present".
6. Restart and assert the **effective** `--dump-config` setting, memory
   search, journal rows, `schema_version` and custom data directory survive;
   no new namespace or default data dir appears.
7. Run the migration a second time; assert idempotence/no duplicate row.
8. Check the installer output: it prints the helper command and profile patch
   path before restart, and does not silently edit the daily profile. It
   keeps `PROFILE=desktop` because it invokes the Desktop-bundled CLI.

### Conflict check

- The loader does not reject duplicate row ids: it keeps one row (later
  wins), and the settings editor may hide duplicate-id rows. Install old +
  new (and old upstream) in a throwaway profile and record the observed
  behavior. Documentation must say "remove old/upstream first; co-install is
  unsupported", not "the loader refuses it". The installer must attempt to
  remove both old specifiers before install.

## 7. Release sequence (HITL; stop for explicit authorization)

1. Check `npm view @elvisw/dsh-magic-context` is 404 (available).
2. `npm version 0.0.0-bootstrap.0 --no-git-tag-version`.
3. `npm publish --provenance=false --tag bootstrap --access public` in the
   user's terminal (web auth/OTP; no token in evidence).
4. Restore `package.json` + `package-lock.json` to `0.13.0`.
5. Check `npm view @elvisw/dsh-magic-context dist-tags` and
   `npm view @elvisw/dsh-magic-context@0.0.0-bootstrap.0 version`; the
   bootstrap tag may also set `latest`, so do not use bare `npm view` as the
   only check.
6. `npm trust github @elvisw/dsh-magic-context --file release.yml --repo
   elvisw/dsh-plugin-magic-context --allow-publish --yes` in the user's
   terminal; verify `npm trust list` includes publish.
7. Update `release.yml` if the package name is hardcoded; commit.
8. `git tag -a v0.13.0 -m "v0.13.0"` and push; `gh run watch`.
9. Verify version/provenance/gitHead/tarball and `dist-tags.latest ===
   '0.13.0'`; run registry install smoke.
10. `npm deprecate @elvisw/dsh-plugin-magic-context "Renamed to
    @elvisw/dsh-magic-context; install the new package."`

## 8. Evidence bundle

`_bmad-output/initiative-dsh-magic-context/acceptance-windows-dsh-2026-11-15-package-rename/`:

- `evidence/npm-view.json` (old/new packages, versions, dist-tags);
- `evidence/npm-pack.txt` and tarball hashes;
- `evidence/tarball-files.txt` (must include the migration helper);
- `evidence/hand-out.txt` (installer + helper);
- `evidence/dump-config.txt` for fresh and upgraded profiles;
- `evidence/upgrade-state.json` (settings/memory/journal/schema before/after,
  including custom `dataDir`);
- `evidence/profile-patch-migration.txt` (before/after `name`, backup path,
  idempotence);
- `evidence/home-overlay-migration.json` (home patch and overlay fixtures,
  effective overrides after restart);
- `evidence/installer-prompt.txt` (helper command/path printed, no auto-edit);
- `evidence/conflict-check.json` (duplicate-id observed behavior);
- `evidence/release-workflow.json`, `git-tag.txt`, `sigstore.txt`;
- `evidence/registry-artifact.json` (registry tarball vs local pack);
- `evidence/unit-test.txt`, `typecheck.txt`, `i18n.txt`;
- `acceptance-report.md`, `REPRODUCE.md`, `sha256-manifest.json`;
- secret scan output.

## 9. Risks

| Risk | Mitigation |
| --- | --- |
| New package cannot use Trusted Publishing on first publish | Bootstrap `0.0.0-bootstrap.0` with web auth, then bind trust; no formal manual publish. |
| Existing settings/dataDir lost because the old patch row name is skipped | One-time `cordis.patch.yml` `name` migration; host gate asserts effective config and custom `dataDir`. |
| Existing users lose memories/journal | Keep loader id/namespace/data dir; upgrade gate proves preservation. |
| Old package still installed next to new | Loader keeps one duplicate-id row; document co-install as unsupported and make installer remove old/upstream first. |
| `--profile desktop` slips into new examples | Use `--profile web`; separate Desktop note. |
| README/docs still contain old package name | Repo-wide grep including NOTICE/CONTRIBUTING/AGENTS/docs, with an allowlist for historical/upstream references. |
| Repo rename churn | Keep GitHub repo URL; only package identity changes. |
| Release accidentally published twice | Bootstrap tag separate; formal tag only `v0.13.0`; verify registry guards. |
| Unauthorized publish | `hitl: true`; bootstrap/trust/tag/deprecate each stop for explicit authorization. |
| T13/T14 built under old name | T15 precedes T13; T14 starts after T13. |

## 10. Done criteria

- New package name, tarball prefix, client id, installer and README all use
  `@elvisw/dsh-magic-context`.
- Loader row id, settings namespace, data dir, schema and behavior unchanged.
- Fresh install and upgrade gates pass.
- Bootstrap, trust, `v0.13.0` release, provenance and old-package deprecation
  are complete (or explicitly blocked on user authorization).
- Independent diff review and report audit complete; all Critical/Fix closed.
- T13 may start; T14 remains after T13.
