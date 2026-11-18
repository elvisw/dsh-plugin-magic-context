# Credential-backed embedding key entry — source notes (2026-11-18)

Status: research for T24; no product code changed.

## Decision

Move the remote embedding key from “user edits `$DSH_HOME/.env` and restarts” to a
write-only field in the plugin configuration UI, stored by the host credential
store. The same configuration must work on desktop Web and Android dsh-go 1.1.0.

The config continues to carry only a reference name (`embedding.apiKeyEnv`).
Secret material is stored under that reference; it must never be written to the
profile patch, journal, telemetry, logs or evidence.

## Host facts (verified in source)

### Desktop credential seam

- `@deepseek-ai/dsh-credentials` exposes `ctx.credentials.resolve/describe/set/unset`.
  `describe` returns `configured`, `source`, `writable` and never the value;
  `credentialRef` is a POSIX-style name (`^[A-Za-z_][A-Za-z0-9_]*$`).
  Source: `node_modules/@deepseek-ai/dsh-credentials/README.md:32-95`.
- `@deepseek-ai/dsh-api-settings-controller` exposes the browser namespaces
  `remote.settings` and `remote.credentials`; secret values cross only inward
  (`credentials.set`), and no read returns one.
  Source: `.../dsh-api-settings-controller/README.md:11,26-28` and
  `lib/index.js:154-208`.
- The official Models settings page writes keys with
  `ctx.remote.credentials.set(ref, value)` / `unset(ref)` and keeps only
  `apiKeyEnv` in the profile; it never asks for an environment-variable name as
  the primary field.
  Source: `.../dsh-client-ui-settings-models/README.zh.md:40-46` and
  `lib/client.js:3293-3304`.
- `role('secret')` config values are **redacted from reads, not a separate
  store**: `dsh-settings` strips them from `value/base/user` and returns
  `secrets: [{path, set}]`; `mutate()` still writes the value through the config
  editor. Do not rely on `role('secret')` alone to keep values out of
  `cordis.patch.yml`.
  Source: `.../dsh-settings/lib/index.js:22-87,440-450,488-535` and
  `README.md:49`.

### Android dsh-go native form

- The released app recognizes two schema roles:
  - `role('credential-ref')` — a string field naming a credential; hidden from
    the form (`FieldKind.hidden`).
  - `role('secret')` — a write-only masked field; it is bound to the sibling
    `credential-ref` field (same object) via `credentialRefOf`.
  Sources: `ccch1mneyyy/dsh-go@v1.1.0 app/lib/ui/engine_settings/schema_fields.dart:35-36,84-85`;
  `app/lib/state/engine_settings_state.dart:285-320`;
  fixture `app/test/engine_settings/fixtures/schemastery-secret-wrapper.json`
  (`apiKey` secret + `keyRef` credential-ref).
- The secret sheet calls `controller.setSecret(field, value)` /
  `clearSecret(field)`, and the bridge renders “已配置 / 未配置” from the
  credential, not from the configured value.
  Sources: `schema_form.dart:527-586`; `field_sheets.dart:876-1004`.
- Therefore the phone needs **no custom native client**: declare `apiKey` as
  `role('secret')` and `apiKeyEnv` as `role('credential-ref')`; the host renders
  the input and stores the secret.

## Consequences for the plugin

- Runtime resolution order:
  1. a non-empty `embedding.apiKey` materialized by the host/bridge (if any);
  2. `credentials.resolve(apiKeyEnv)` (desktop and phone);
  3. `process.env[apiKeyEnv]` (headless/backward compatibility);
  4. missing.
- The desktop custom settings card cannot use `scope.mutate` for the secret:
  that path writes the profile patch. It must call
  `ctx.remote.credentials.set(ref, value)` / `unset(ref)` and show
  `describe(ref)` presence. It may still use `scope.mutate` for ordinary fields.
- Keep `apiKeyEnv` as the reference name. It is hidden on the phone; on desktop
  it stays in advanced settings for custom endpoints. Its schema default must be
  a valid non-empty ref so the phone can bind the secret (SiliconFlow:
  `SILICONFLOW_API_KEY`; custom endpoints can clear it on desktop for no auth).
- A secret must never enter: `staged` form state after save, React props after
  save, `summary`/SSE, journal, error messages, HTTP logs, screenshots or
  acceptance evidence. Tests must scan the status payload and profile patch for
  the sentinel key.

## Open question for the ticket

Whether the desktop custom page can rely on `ctx.remote.credentials` in every
composition (Web profile has the settings controller; headless has the service
but no browser). If the remote namespace is absent, the desktop card must show
the field as unavailable and keep the env fallback; it must not fall back to
writing the secret into `scope.mutate`.
