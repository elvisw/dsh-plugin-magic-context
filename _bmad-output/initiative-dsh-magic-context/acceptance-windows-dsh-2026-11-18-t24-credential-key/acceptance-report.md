# T24 — credential-backed embedding key

**Status:** desktop gate PASS. The Android device gate for credential entry is
BLOCKED by a dsh-go 1.1.0 bridge gap ([issue #1493](https://github.com/ccch1mneyyy/dsh-Go/issues/1493));
the local MiniLM WASM primitive was separately verified on the same phone
(384 dimensions, 891 ms). This report does not claim an Android credential pass.

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

## Android local-model probe

Separate from the credential gate, the shipped local embedding primitive was run
on the same Android device (Android 17, dsh-go 1.1.0, local engine, Node 24.22.1)
with no network fetch: three pinned assets were pushed to
`/sdcard/Download/dsh-mc-t24/models`, and
`android/phone-t24-local-embed.cjs` loaded
`lib/core/embedding-local.js` from the installed candidate, validated the three
SHA-256 values, and embedded two Chinese/English strings.

Result (`android/phone-local-embed.json`): both vectors are 384-dimensional,
the first norm is 1.0000000059, and the run took 891 ms including model/session
load. This proves the WASM MiniLM primitive and tokenizer work on this phone; it
does **not** prove the full local retrieval/backfill lane or a local-only search
path on mobile.

After the probes, `phone-t24-install.cjs --restore` returned
`status: restored`, `pluginRemoved: true`, `originalPatchRestored: true`, and
`restoredSha256` equal to the original `fb3ba638958c631944e9a3cffc4bebe38de35fc5379a5362d701d5bb2c618796`
(`android/phone-install-restore.json`). The app profile is back to its original
patch; the test data directory is retained, and no test plugin remains installed.

## What is not verified

- **Android credential entry:** the device was later connected and the candidate
  was installed in an isolated test profile, but dsh-go 1.1.0's bridge does not
  return `credentialRef` to the App, so the native masked field is disabled and
  the flow cannot be completed. Root cause and a proposed bridge patch are in
  [issue #1493](https://github.com/ccch1mneyyy/dsh-Go/issues/1493); the plugin
  schema and the desktop gate are verified, the Android credential path is not.
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
