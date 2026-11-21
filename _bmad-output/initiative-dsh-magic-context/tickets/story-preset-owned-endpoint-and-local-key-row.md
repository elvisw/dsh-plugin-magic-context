---
id: 37
type: story
title: "Make the service preset own the endpoint, and stop showing a key input for local embeddings"
parent: initiative-dsh-magic-context
covers: [src/client/index.js, src/index.ts, tests/client-pure.spec.ts, docs/configuration.md, CHANGELOG.md, _bmad-output/initiative-dsh-magic-context/acceptance-windows-dsh-t37-preset-and-key-row/]
after: [36]
refined: false
hitl: true
risk: medium
---

# Make the service preset own the endpoint, and stop showing a key input for local embeddings

## Description

Two problems in the embedding section of the settings page.

1. The service preset acts only as a fallback: a fresh SiliconFlow selection still shows an editable
   endpoint and auth header, so the preset looks meaningless, and a saved value silently overrides it.
2. The API-key field stays visible after switching to Local MiniLM when a key is already stored. That
   row exists to delete a credential, but it looks like the local path needs a key.

## Requirements

1. **Preset hides what it owns, without rerouting anyone.** With `preset=siliconflow` and a stored
   endpoint/auth header that is empty or the preset default, the Web form hides both inputs and shows
   the fixed endpoint as read-only text. If a non-default value is stored, both inputs stay visible
   together with one line saying the saved value takes precedence and clearing it returns to the
   preset address. The resolver keeps today's behaviour, so no existing configuration changes target
   on upgrade.
2. **Custom shows both.** With `preset=custom`, the endpoint and auth header are editable as today.
   An empty endpoint remains a validation state, not a silent default.
3. **Normalisation matches the resolver.** Empty or unknown preset values are treated as
   `siliconflow` or `custom` exactly as `resolveEmbeddingConfig` does, both for visibility and for the
   action matrix; switching provider or preset prunes drafts of fields that become hidden.
4. **Local means local.** With Local MiniLM or Off selected there is no key input. A stored credential
   gets one compact row with its state and a clear button. A literal key from the profile gets a state
   line and a hint that it is removed in the profile patch, no dead button.
5. **Phone stays honest.** The dsh-go form cannot hide fields conditionally (upstream #1569), so the
   endpoint and auth-header descriptions say they belong to the Custom preset. The disabled key field
   stays until dsh-go #1493 is fixed.
6. **Docs and tests.** `docs/configuration.md` and `CHANGELOG.md` describe the preset behaviour;
   `tests/client-pure.spec.ts` pins the visibility, key-row and normalisation helpers; one real Web
   gate drives the settings page against a fake embedding endpoint and is kept under the evidence
   directory named in `covers`.

## Non-goals

- No runtime endpoint rewrite and no migration: the resolver keeps accepting a saved endpoint.
- No new presets, no per-endpoint preset registry.
- No change to credential reference semantics.
- No dsh-go app change; #1569 and #1493 stay upstream.
- No version bump or release in this ticket.
