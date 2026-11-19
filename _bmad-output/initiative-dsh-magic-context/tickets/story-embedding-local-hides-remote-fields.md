---
id: 31
type: story
hitl: true
risk: medium
after: [30]
---

# Hide remote embedding settings when the provider is local (Web), and label them "remote" on Android

## Why

Choosing **Local MiniLM** leaves twelve remote-only fields on screen: preset, endpoint, model ID,
key variable, key, auth header, dimensions, query prefix, document prefix, request timeout, query
timeout, batch size. None of them is read by the local path — the only reader is
`src/core/embedding-remote.ts` (verified: `queryInstruction` / `documentPrefix` / `authHeader` /
`dimensions` appear only there and in the lane's remote branch). A reader who picks local is
therefore asked to configure things that cannot affect them.

## Constraint found before designing

The Android settings page is **not ours**: dsh-go renders the plugin's schema. Its form only
honours a static `meta.hidden` (`app/lib/ui/engine_settings/schema_fields.dart:82-85`), and
`SchemaMeta` (`packages/dsh_client/lib/src/engine_settings_api.dart:36-84`) has no expression that
could depend on another field's current value. Conditional hiding on the phone therefore needs a
host feature. Until that ships, the phone can only be *labelled*, not reshaped.

## Requirements

1. **Web hides, Android labels.** Web: when `embedding.provider` is `local` or `off`, hide the
   twelve remote-only fields in the settings card, following the *draft* value so the change is
   immediate, before Save. Android: keep the fields, but make the schema say they are remote-only.
2. **Hiding does not clear.** Saved endpoint/model/key stay in the config and reappear when the
   provider switches back to `openai-compatible`. Switching the draft to local/off drops the
   *unsaved* drafts for hidden fields, so the footer Save does not sit dirty with nothing to write.
3. **Hidden fields cannot block Save.** A hidden field holding an invalid number must not stop the
   save of visible fields.
4. **Explain the absence.** With local/off selected, the section shows one line saying the remote
   settings are hidden and why (bundled 384-dimension model).
5. **Remote actions follow the mode.** With local/off, the API-key row and the model dropdown are
   hidden too; the buttons keep their existing gating.
6. **Android copy.** The `embedding` group description becomes
   `向量检索（选本地 MiniLM 时只有「向量服务」需要设置）` /
   `Embedding (with local MiniLM, only the provider matters)`. Each remote-only field gets
   `名称（仅远程）` zh / `Remote embedding only` en, which the phone renders as a title or a one-line
   hint (`_fitsTitle` ≤18 runes, `_firstSentence` ≤40).
7. **Upstream request.** File a dsh-go issue for `meta.visibleWhen` with our field list and the
   exact evaluation point, so the phone can hide rather than label once the host supports it.
8. **Scope.** `src/client/index.js`, `src/index.ts` (descriptions only), both READMEs (one line
   about the phone), tests, and the acceptance evidence. No new config key, no migration, no
   server route, no version bump inside the ticket.

## Acceptance

- In a real Web settings page at an isolated host root: default is local, the twelve fields are
  absent, the note is present; switching to OpenAI-compatible makes them appear; switching back
  hides them again; a previously saved endpoint survives the round trip (checked in the profile
  file, not just on screen).
- On the phone schema: the group hint and the twelve `（仅远程）` descriptions are present in the
  serialized schema; screenshots are not required, because the phone form is host-rendered and the
  host has not changed.
- `npm test`, typecheck, i18n and build pass; the Web gate screenshots are stored as evidence.
