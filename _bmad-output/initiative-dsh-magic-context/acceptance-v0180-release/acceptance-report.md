# 0.18.0 — Android native panels and desktop credential entry

**Status:** release candidate built and locally checked. npm publication and the
dsh-go market submission are separate post-build steps. Android native key entry
is blocked by a dsh-go bridge gap and is not claimed.

## Scope

0.18.0 ships two user-visible changes:

- **T23 Android native surface** for dsh-go 1.1.0: composer strip, session/global
  context panel, and embedding panel over the existing telemetry and embedding
  services. No second package or Flutter change.
- **T24 desktop credential-backed embedding key**: the Web Settings page writes
  the key to the host credential store through `remote.credentials.set/unset`,
  shows only configured/unconfigured and the source, and keeps the value out of
  the profile, logs, database and status payload.

The Android native settings form declares the same `role('secret')` +
`role('credential-ref')` schema, but dsh-go 1.1.0's bridge does not return
`credentialRef`; the native input therefore renders unbound and disabled. This
is tracked in [issue #1493](https://github.com/ccch1mneyyy/dsh-Go/issues/1493)
and is not claimed as an Android credential pass.

## Identity

| Item | Value |
| --- | --- |
| Package | `@elvisw/dsh-magic-context@0.18.0` |
| Tarball | `elvisw-dsh-magic-context-0.18.0.tgz` |
| Bytes | 4,087,402 |
| Files | 71 |
| SHA-1 | `73f39de5185622f74046be396cba1aedcc000a86` |
| SHA-256 | `0ab7f5168bda13cf38db83c9af68067a14f5f78c764757ad80d73d0ce852aa30` |
| Previous T24 candidate | `0.17.0` / `e3c7b7b4…b2c3` / 4,086,969 bytes (a local candidate build, not the published npm `0.17.0` artifact) |

`evidence/pack-compare-t24.json` shows that against the T24 candidate only
`package/README.md`, `package/README.zh-CN.md` and `package/package.json`
changed; `package/lib/` has no normalized changes.

## Checks

| Check | Result |
| --- | --- |
| `npm test -- --maxWorkers=4` | 85 files / 1,051 tests pass |
| `npm run typecheck` | exit 0 |
| `npm run check:i18n` | ALL PASS (314 zh/en keys, 193 settings keys) |
| `npm run build` | exit 0 |
| `npm pack` | 71 files, SHA-256 above |
| T23 Android device gate | passed on the pre-release T23 candidate |
| T24 desktop Web gate | passed on the T24 candidate |
| Android local MiniLM WASM probe | passed on the same phone, 384 dims, 891 ms |

The T23 and T24 host gates are reused rather than rerun: the only runtime bytes
in 0.18.0 are the code already present in the validated T24 candidate; the final
tarball differs only in version/docs. The T23 phone evidence predates the T24
go-native edits, so it is device evidence for the T23 feature, not a fresh
end-to-end run of every T24 UI path.

## Not verified

- Android native credential input: blocked by dsh-go 1.1.0 bridge
  ([issue #1493](https://github.com/ccch1mneyyy/dsh-Go/issues/1493)); the desktop
  path is verified, the native path is not.
- Full local retrieval/backfill on Android: only the MiniLM WASM primitive was
  probed on the phone; full local search and backfill remain untested.
- Real embedding vendors, iOS, and mobile failure/lifecycle matrices.
- The dsh-go market entry is not visible until the directory PR is merged and
  the generated index refreshes; do not claim market availability before then.

## Release order

1. Push the release commit to `main` and wait for CI.
2. Push the `v0.18.0` tag; `.github/workflows/release.yml` publishes through
   Trusted Publishing/OIDC.
3. Verify `latest`, integrity, provenance and the registry tarball.
4. Submit one `plugins/*.json` entry to the dsh-go market repository; verify the
   generated index separately.

Evidence: `evidence/unit-test.txt`, `typecheck.txt`, `i18n.txt`, `build.txt`,
`npm-pack.txt`, `tarball.json`, `pack-compare-t24.json`, plus the linked T23/T24
acceptance directories.
