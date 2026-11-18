# T24 — credential-backed embedding key

**Status:** desktop gate PASS; real Android device gate BLOCKED (no device connected
during this run). This report does not claim an Android pass.

## Identity

| Item | Value |
| --- | --- |
| Isolated root | `%TEMP%\opencode\dsh-mc-t24-20261118-143932` |
| Plugin candidate | `@elvisw/dsh-magic-context@0.17.0` |
| Tarball | `elvisw-dsh-magic-context-0.17.0.tgz` |
| Tarball bytes | 4,086,969 |
| Tarball files | 71 |
| Tarball SHA-256 | `e3c7b7b4dced12feb41f2d99620154e38f166e4198a7ca2727f37a1f1790b2c3` |
| Isolated host | DSH `0.2.2-rc.1`, Node `24.21.0`, profile `t24` |
| Fake embedding endpoint | local authenticated fixture, model `fixture-embed-a`, 16 dimensions |
| Gate | 30 steps, 0 failures, 0 errors (`evidence/ui-gate.json`) |
| Unit tests | 85 files / 1,051 tests (`evidence/unit-test.txt`) |
| Typecheck / i18n / build | exit 0; i18n `ALL PASS` with 314 zh/en keys and 193 settings-copy keys |

## What this gate verifies

The desktop settings page was opened against a real isolated DSH Web host. The
fact table is `evidence/ui-gate.json`; screenshots are in `evidence/`.

1. The Chinese Settings page renders the write-only **API Key** row below the
   saved `apiKeyEnv` reference (`01-key-absent-zh.png`).
2. Saving a sentinel key through the card succeeds, clears the password input,
   and reports the source as the host credential store
   (`02-key-saved-zh.png`).
3. Saving the key does not mutate configuration: the profile patch hash and the
   mutation count are unchanged.
4. Saving the key sends no embedding request (`requests: []`).
5. The sentinel is absent from the rendered card, the profile patch, the plugin
   database, and the host log. It is intentionally present only in the isolated
   host credential store.
6. **Test connection** uses the saved credential: the fake provider records an
   `Authorization` header and returns 16 dimensions (`03-probe-zh.png`).
7. **Clear credential** removes the stored value, does not call the provider, and
   leaves Test disabled (`04-cleared-zh.png`).
8. Editing the reference without saving disables the secret controls and shows
   the save-first copy; restoring the saved value re-enables them.
9. Switching to English keeps the secret row and its label (`05-key-en.png`).
10. Saving an explicit empty reference on the custom preset persists it, shows
    no-auth, and disables the secret controls; `unset` is not used because it
    would fall back to the schema default.

The key is resolved in this order: literal `apiKey` (host bridge only) → host
credential store under `apiKeyEnv` → environment variable. The card never reads
or displays the value. The schema default reference is `SILICONFLOW_API_KEY`, so
the dsh-go native form (which hides `role('credential-ref')` fields) has a
non-empty effective reference. An empty reference means unset: the SiliconFlow
preset still falls back to the default environment variable, while a custom
preset saves an explicit empty string and means no auth. This is documented in
both READMEs and the settings contract.

## What is not verified

- **Android real device:** no `adb` device was connected for this run. The
  `role('secret')` + sibling `role('credential-ref')` schema and the native view
  were checked by unit tests and the dsh-go v1.1.0 schema, not on a phone. The
  T23 fake-provider phone gate remains the last device evidence for dsh-go.
- **Real SiliconFlow / paid provider:** the gate uses a local authenticated
  fixture; no real key or quota was used.
- **Host without a credential store:** the schema and code keep the environment
  fallback and disable the write row when `remote.credentials` is absent, but
  this branch was not exercised in the host gate.
- **Generation races, read-only credential stores, native cache refresh after a
  desktop key change:** recorded as backlog, not claimed here.

## Reproduction

See `REPRODUCE.md`. The candidate tarball is byte-for-byte the one installed by
`prepare_t24_host.py`; `evidence/prepare.json` records its SHA-256 and size.
