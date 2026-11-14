# Independent package identity — acceptance report

- Date: 2026-11-14
- Ticket: `story-independent-package-identity-and-release.md`
- Scope: package identity, artifact, isolated DSH install/load, one real model smoke, npm bootstrap, Trusted Publisher binding, `v0.12.0` tag release, registry verification, `v0.12.1` docs-only patch.
- Not in scope: browser settings-card run; T2–T5 behavioral regression rerun.

## 1. Artifact

| Item | Value |
|---|---|
| Package name | `@elvisw/dsh-plugin-magic-context` |
| Version | `0.12.0` |
| Tarball | `elvisw-dsh-plugin-magic-context-0.12.0.tgz` |
| Registry tarball SHA-256 | `7667c6074e496070c762712e7c55a269c3b062ebd2ece683423a01143e2ed16b` |
| Release-tree local pack SHA-256 | `7667c6074e496070c762712e7c55a269c3b062ebd2ece683423a01143e2ed16b` |
| Tarballs byte-identical | yes (same SHA-256 and SHA-1) |
| Registry shasum / integrity | `c919131f768099f2b6477a034bb1f73b76c6c61f` / `sha512-ICGZVB1xVREDwjFokMzZT+7v2RCkBxkyk4uyjKMy7Ybg8bSMJ8WTU6NyvN44Pum9GPn1W+vsnGuUM6X1etO4qA==` |
| Contents | 65 files, 4.0 MB packed / 15.3 MB unpacked |
| Earlier host-gate tarball | `eac83d0951823030f7faccec88f81ef926057eeffc0c0b371cbd6af189766581` |
| Built tree check | no bare upstream specifier in `lib/` or `cordis.patch.yml`; `tools/install-magic-context.bat` intentionally contains the tarball prefix, and docs/URLs retain historical attribution (`evidence/package-specifier-grep.txt`) |
| Extracted tarball check | `package.json` root name is the scoped name; `lib/client.js` registers the scoped id; no bare upstream specifier in `lib/` or `cordis.patch.yml` (`evidence/package-specifier-grep.txt`) |

A release-tree pack at HEAD `99ab6b7` is byte-identical to the registry tarball. The earlier host-gate tarball (`eac83d…`) was packed before the `README.zh-CN.md` test-count line was updated to `838`; 64/65 files match and only that documentation file differs, while all 55 `lib/*.js` files match. The release identity claim uses the release-tree pack, not the earlier tarball.

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
| `npm test` | 76 files / 838 tests passed (`evidence/unit-test.txt`) |
| `npm run typecheck` | passed (`evidence/typecheck.txt`) |
| `npm run build` | passed |
| `npm run check:i18n` | ALL PASS |
| `npm pack --dry-run` | scoped name, expected 65 files |
| `npm pack` + extract | scoped name, runtime grep clean |

## 6. Release

| Item | Value |
|---|---|
| Bootstrap | `@elvisw/dsh-plugin-magic-context@0.0.0-bootstrap.0`, tag `bootstrap` |
| Bootstrap auth | operator statement: npm publish with web authentication/2FA; no temporary token was created, so there is no token to revoke |
| Tag | `v0.12.0` → commit `99ab6b7904e71379461a32903ef2ee94d8e98c9b` |
| Workflow run | [43593315877](https://github.com/elvisw/dsh-plugin-magic-context/actions/runs/43593315877), conclusion `success` |
| Publish step | OIDC, `npm publish --access public --provenance` |
| Registry version | `0.12.0` |
| Dist-tags | `latest: 0.12.0`, `bootstrap: 0.0.0-bootstrap.0` |
| `gitHead` | `99ab6b7904e71379461a32903ef2ee94d8e98c9b` |
| Provenance | `dist.attestations.provenance.predicateType = https://slsa.dev/provenance/v1`; Sigstore log index `3877613178` |
| Registry tarball | `https://registry.npmjs.org/@elvisw/dsh-plugin-magic-context/-/dsh-plugin-magic-context-0.12.0.tgz` |
| Registry `dist.shasum` | `c919131f768099f2b6477a034bb1f73b76c6c61f` (matches downloaded tarball) |
| Registry `dist.integrity` | `sha512-ICGZVB1xVREDwjFokMzZT+7v2RCkBxkyk4uyjKMy7Ybg8bSMJ8WTU6NyvN44Pum9GPn1W+vsnGuUM6X1etO4qA==` |
| Unpacked-vs-local check | full tarballs byte-identical (65/65 files); 55/55 `lib/*.js` hashes identical; `cordis.patch.yml` identical; `lib/dsh/tool-bridge.js` SHA-256 `7bd3d7a1bfcf51eb6b793a69e5bb64efed21c12857dee1570f470a0efb03564d` on both sides |
| Registry install | fresh isolated profile, `dsh plugin add @elvisw/dsh-plugin-magic-context@0.12.0 --ignore-scripts`, exit 0; installed version `0.12.0` |
| Registry smoke | `exit_code=0`, `final_text=REGISTRY_PACKAGE_OK`, session `session-528f658c-b50c-413b-9a36-c1d9f14f0fb8`, route `deepseek-official/deepseek-flash` |

Trusted Publisher (operator-supplied `npm trust list` output; the same command currently requires OTP in this shell):

```text
type: github
id: 3fc60ccd-836d-4f73-9495-421084b2a181
file: release.yml
repository: elvisw/dsh-plugin-magic-context
permissions: publish, stage publish
```

The successful OIDC publish independently proves the binding matches this repository and `release.yml`.

Evidence: `evidence/release-workflow.json`, `evidence/npm-view.json`, `evidence/registry-artifact.json`, `evidence/package-specifier-grep.txt`, `evidence/git-tag.txt`, `evidence/sigstore.txt`, `evidence/actions-permissions.json`, `evidence/actions-incident.txt`, `evidence/trust-list.txt`, `evidence/unit-test.txt`, `evidence/typecheck.txt`, and `evidence/registry-host/` for the registry-install smoke.

### 0.12.1 documentation patch

`0.12.1` is a docs-only patch that publishes the fork/upstream differences and copyright text added in `644909c`; it changes no code, schema, or runtime behavior.

| Item | Value |
|---|---|
| Tag | `v0.12.1` → commit `d35a3bcd883b96ebb75f2bec27af92d13a34ddd1` |
| Workflow run | [43594965868](https://github.com/elvisw/dsh-plugin-magic-context/actions/runs/43594965868), conclusion `success` |
| Registry version | `0.12.1` |
| Dist-tags | `latest: 0.12.1`, `bootstrap: 0.0.0-bootstrap.0` |
| `gitHead` | `d35a3bcd883b96ebb75f2bec27af92d13a34ddd1` |
| Registry `dist.shasum` | `46ef2590118375315a2321ed3d470c77bd88a817` |
| Local vs registry | byte-identical, SHA-256 `341e92c886168070e7ae800a8c2c414fb09fbb478cf8ff79bb584914af2b665d` |
| Provenance | `dist.attestations.provenance.predicateType = https://slsa.dev/provenance/v1` |

Evidence: `evidence/release-workflow-0121.json`, `evidence/npm-view-0121.json`.

### Actions-on-fork incident

The operator confirmed that this fork's GitHub Actions had not been enabled. The first `git push origin v0.12.0` produced **no workflow run**. After Actions was enabled (current API state: `enabled=true, allowed_actions=all`), the tag was deleted and re-pushed at the same commit `99ab6b7`; the re-push created run `43593315877`, which published successfully. No release was produced by the first tag push. The tag was briefly deleted and recreated; its final peeled commit is unchanged.

## 7. What this does not prove

- No browser UI run; the settings card was not opened.
- No T2–T5 behavioral regression suite was rerun. The package-identity commits change the package name and docs; 0.12.0 additionally carries the already-accepted T2–T5 behavior (recovery, `message`, `/ctx-flush`, durable drop state, tag-prune removal, schema v11), and the full unit/integration suite passed.
- `npm run gate` was not used as the release gate; it may fail on absent daily databases. The four release checks above passed.
- The `bootstrap` dist-tag intentionally remains on `0.0.0-bootstrap.0`; `latest` points at `0.12.0`.

## 8. Isolation disclosure

All DSH paths used by the run are under the new root: `DSH_HOME`, `HOME`/`USERPROFILE`, `XDG_DATA_HOME`, `XDG_CACHE_HOME`, `APPDATA`, `LOCALAPPDATA`, and the plugin `dataDir`. The daily profile was not used. The first preparation attempt against a copied profile failed with `ERR_PNPM_UNEXPECTED_STORE` because `node_modules` still pointed at the old pnpm store; it was discarded and the final run used a fresh profile. No evidence from the failed attempt is used.
