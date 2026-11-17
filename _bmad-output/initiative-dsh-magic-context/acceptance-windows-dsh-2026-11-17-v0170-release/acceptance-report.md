# Acceptance report — @elvisw/dsh-magic-context 0.17.0

Status: **released and registry-verified**
Date: 2026-11-17

## 1. Release identity

| Item | Value |
|---|---|
| Package | `@elvisw/dsh-magic-context` |
| Version | `0.17.0` |
| Release commit | `2cf1c72cf10ad9b605887f9239d2f621f74a4c2e` |
| Tag | annotated `v0.17.0` |
| Release workflow | `44048210846`, conclusion `success` (42s) |
| Registry `latest` | `0.17.0` |
| Registry tarball | `elvisw-dsh-magic-context-0.17.0.tgz` |
| Tarball bytes | `4,059,906` |
| Tarball members | `69` |
| SHA-1 | `7c0918938ed6643245294631bc4411e9dca1fb9f` |
| SHA-256 | `2264998cc95349d5e204da68bf8c279b6d063fc5e46c9032c72253826525642e` |
| Integrity | `sha512-RR/Odl2OCpwCOLqOUgDTkSANkfpgh717bvfq4oNkmAWkij2XII8d9yaoZGF47gg1DX/u5Md82ciZe+08zmizQA==` |
| `gitHead` | `2cf1c72cf10ad9b605887f9239d2f621f74a4c2e` |
| Provenance | SLSA v1 attestation present |

`0.17.0` adds the T22 manual `/ctx-wrapup` command. `0.16.0` already contained
the remote embedding Settings controls and the T21 Settings redesign.

## 2. Pre-release gates

Local gates ran on the release-candidate working tree before the release commit;
the tagged workflow re-ran them on `2cf1c72`:

- `npm test`: 83 files / 994 tests passed (`evidence/unit-test.txt`);
- `npm run typecheck`: exit 0 (`evidence/typecheck.txt`);
- `npm run check:i18n`: ALL PASS, 296 client keys (`evidence/i18n.txt`);
- `npm run build`: exit 0 (`evidence/build.txt`);
- `npm pack --dry-run`: `0.17.0`, 69 files (`evidence/npm-pack-dry-run.txt`).

The release workflow repeated typecheck, test, build, i18n and `npm pack --dry-run`
on the tagged commit before publishing.

## 3. Artifact comparison

The local pack and the registry tarball are byte-identical:

- `evidence/tarball-compare.json`: `byteIdentical: true`,
  `memberContentDiff: []`;
- both files are `4,059,906` bytes / 69 members / SHA-256
  `2264998c…642e`.

Compared with the 0.16.0 pack, these members changed or were added
(`package/lib/dsh/wrapup-command.js` is new; 0.16.0 had 68 members):

```text
package/README.md
package/README.zh-CN.md
package/lib/dsh/historian.js
package/lib/dsh/management-pass.js
package/lib/dsh/pre-step.js
package/lib/dsh/wrapup-command.js
package/lib/index.js
package/package.json
```

`package/lib/client.js` is unchanged, so no new Settings/telemetry browser gate
was required for this release. The T21 UI gate remains the evidence for the
unchanged client bytes.

`evidence/pack-compare-previous.json` is a pre-publication comparison whose
`registry` field points at the same local pack; it is not registry evidence.
The registry claim is backed by `evidence/tarball-compare.json`.

## 4. Registry install smoke

`run_registry_e2e.py` installed `@elvisw/dsh-magic-context@0.17.0` into a fresh
isolated headless profile under:

`%TEMP%\opencode\mc-t0-2026-11-13\tools\dsh-mc-v0170-release-20261117-164314`

Assertions:

- installed package name/version are `@elvisw/dsh-magic-context@0.17.0`;
- the profile patch keeps row id `magic-context-dsh`;
- `--dump-config` contains both the scoped package and the row id;
- the installed `lib/index.js` SHA-256 matches the repository build:
  `e9b9a8df9a4aa9895c3f90494729cad37df74bce73e2899035f2811ac5e14e0c`;
- one real-model request returned `V0170_REGISTRY_OK`.

Evidence: `evidence/registry-host/` and `evidence/host-state.json`.

## 5. Scope and limitations

- This is a feature release for the server-side `/ctx-wrapup` command. It does
  not change `lib/client.js`; no new Web UI gate was run.
- The real-model smoke verifies the published package can load and answer; it
  does not exercise a real `/ctx-wrapup` compression run. The command's
  scheduling and publish path are covered by the T22 fake-LLM integration suite.
- The daily `web` profile upgrade is a separate local action and is not part of
  the registry artifact identity.
- No package, schema, storage path, loader row id, or Settings namespace change.
