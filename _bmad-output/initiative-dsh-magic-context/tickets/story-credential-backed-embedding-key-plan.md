---
title: Credential-backed embedding key entry for desktop and Android
type: feature
ticket: "24"
created: 2026-11-18
status: done
baseline_revision: c63e120268215caee7d7a86d57bd42041e41bf8d
route: full
route_source: auto
risk: high
review: quick
review_source: pinned
lenses_ran: []
review_loop_iteration: 0
context:
  - _bmad-output/initiative-dsh-magic-context/research-credential-backed-embedding-key-2026-11-18.md
  - _bmad-output/initiative-dsh-magic-context/acceptance-android-dsh-go-2026-11-17-t23/acceptance-report.md
---

<frozen-after-approval reason="human-owned intent — awaiting approval">

## Intent

Move the remote embedding API key from `$DSH_HOME/.env` to a write-only configuration
field backed by the host credential store. The same configuration must work on DSH Web
and Android dsh-go 1.1.0. The profile carries only a reference name; secret values are
never written to config, logs, telemetry or evidence.

## Boundaries & Constraints

Always: keep `apiKeyEnv` as the credential reference; keep env fallback for existing
users and headless; use the host credential seam (`ctx.credentials` on the server,
`ctx.remote.credentials` on desktop, the native `secret` field on Android); show only
configured/unconfigured; clear the input after save; keep Chinese and English copy.

Never: write the secret through `configForms.mutate` or `cordis.patch.yml`; read or
print the real key in tests/evidence; call a real vendor; add a provider, route, database
schema, command or Flutter/host change; edit the user's `.env`; publish or change the
version in this ticket. Do not claim desktop or Android success from unit tests alone.

## I/O & Edge-Case Matrix

| Scenario | Expected behavior |
|---|---|
| No credential, no env | status unconfigured; remote actions blocked with the existing missing-key path |
| Credential present | status configured; test/query resolve it; no value in status payload |
| Env only (existing install) | status configured via env fallback; upgrade works without editing |
| Literal `apiKey` materialized by host | highest precedence; never returned by status |
| Clear credential | unset; status unconfigured; env fallback may still apply |
| Empty ref (`apiKeyEnv: ''`) | custom preset: explicit empty string means no auth; SiliconFlow preset: falls back to the default `SILICONFLOW_API_KEY`; key input disabled because no ref exists to bind |
| Malformed ref | refuse writes and report `invalid-key-env`; do not send |
| Credential service absent | desktop field unavailable; env fallback only; no config write |
| Ref edited while dirty | require Save first; key input uses the saved ref |
| Android native form | masked write-only field; configured badge; set/clear via the host |
| Restart | stored credential and configured badge survive; no `.env` needed |

## Phases

- [x] Phase 1 — Host contract frozen on 2026-11-18:
      - Desktop: `@deepseek-ai/dsh-api-settings-controller` mounts the
        `credentials` Remote namespace (`lib/index.js:144`) with
        `describe/set/unset` (`:154-193`); `@deepseek-ai/dsh-credentials`
        defines `resolve/describe/set/unset` and keeps values out of config.
      - Read-side: `@deepseek-ai/dsh-settings` only redacts `role('secret')`
        fields (`lib/index.js:11-15,73-87`); it does not move them to the
        credential store. The desktop card must call `remote.credentials`
        explicitly and must not stage the secret through `configForms.mutate`.
      - Android: dsh-go `engine_settings_state.dart` `credentialRefOf` reads the
        sibling `role('credential-ref')` current value or default;
        `plugin_config_state.dart` `_secret` calls `setCredential/clearCredential`
        when that ref resolves, and only falls back to the settings document
        when it does not. `schema_form.dart:527-586` is the write-only
        `SecretFieldTile` (configured/unconfigured, set/clear).
      - Consequence: the ticket's Android path is host-backed; the desktop path
        is explicit `remote.credentials`; a bare `role('secret')` alone is not
        credential storage.
- [x] Phase 2 — Schema and runtime: `embedding.apiKey` secret, `apiKeyEnv`
      credential-ref/default, resolution order, status presence, tests.
- [x] Phase 3 — Desktop card: write-only input, configured badge, set/unset,
      save-first rule, i18n, a11y, no secret in staged state, tests.
- [x] Phase 4 — Android: schema/unit checks for the host-rendered secret field
      and labels; no custom native client. Device connected, but the native
      credential field is blocked by dsh-go 1.1.0's bridge not returning
      `credentialRef` (https://github.com/ccch1mneyyy/dsh-Go/issues/1493).
      Local MiniLM WASM was verified separately on the phone (384 dims); that
      does not verify the credential path.
- [x] Phase 5 — Gates: desktop isolated DSH Web + fake authenticated provider
      (save without config mutation/provider request, Bearer sentinel on test,
      clear, redaction). Strip `SILICONFLOW_API_KEY` and `DEEPSEEK_API_KEY` from
      the desktop gate host environment before asserting `clear → unconfigured`,
      so that assertion proves the credential store was cleared rather than
      testing an env fallback. Android minimal gate accepted as blocked by
      [#1493](https://github.com/ccch1mneyyy/dsh-Go/issues/1493); the local WASM
      probe passed, the credential path is not claimed.
- [x] Phase 6 — Docs: README both languages, settings contract, CHANGELOG; remove
      the `.env`-first instruction, keep fallback; note security limits.
- [x] Phase 7 — Quick diff review, fix pass, report audit; then return to the paused
      0.18.0 release.

## Test Matrix

| Area | Test |
|---|---|
| Resolution | literal > credential > env (including preset default env); empty ref on custom = no auth, on SiliconFlow = default env; missing; empty credential; malformed ref |
| Redaction | status JSON, journal line, error text, client snapshot contain no sentinel |
| Desktop UI | unconfigured → save → configured; clear; save-first on dirty ref; service unavailable |
| Android schema | `role('secret')` + sibling `role('credential-ref')`; native field present; no `.env` path |
| Desktop gate | fake authenticated endpoint checks Bearer sentinel; no mutation/provider call on save; patch/database/log scan; clear |
| Android gate | blocked by dsh-go bridge issue #1493 (no `credentialRef`); local WASM primitive verified separately, credential path not claimed |

## Release Handoff

The 0.18.0 release stays paused. After this ticket is reviewed and accepted, restore the
stashed release prep, update the README/market copy, and follow the earlier order:
push main → CI → tag `v0.18.0` → verify registry → dsh-go market PR. Do not submit the
market entry before the npm version and tag exist.
