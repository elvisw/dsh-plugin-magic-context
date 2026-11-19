---
title: Hide remote embedding fields when the provider is local
ticket: 31
status: built
---

# Plan: hide remote embedding fields when the provider is local (T31)

## Phase 1 — the rule

One pure predicate owns the decision, exported for tests:
`embeddingFieldVisible(key, provider)` plus the `REMOTE_ONLY_EMBEDDING` list of the twelve keys.
`src/core/embedding-remote.ts` is the only reader of `preset`/`endpoint`/`model`/`apiKeyEnv`/
`apiKey`/`authHeader`/`dimensions`/`queryInstruction`/`documentPrefix`/`timeoutMs`/
`queryTimeoutMs`/`batchSize`; the local and off paths never consult them.

## Phase 2 — the card

- The section's common and advanced lists are filtered by the predicate, using the **draft** provider
  so the change lands before Save.
- Switching the provider away from `openai-compatible` deletes the staged drafts of the twelve keys:
  a hidden field must not keep `staged.size > 0` alive, and its text must never be written.
- `plan()`, the invalid counter and the auto-focus hook skip hidden specs, so an invisible field
  cannot block or steal focus from a visible save.
- With local/off selected, the key row and the model dropdown are hidden and one line explains why.

## Phase 3 — the phone

dsh-go renders the plugin schema; its `kindOf` only reads a static `meta.hidden`
(`app/lib/ui/engine_settings/schema_fields.dart:82-85`), and `SchemaMeta` has no expression that
could depend on another field (`engine_settings_api.dart:36-84`). Static hiding would also hide the
fields from remote users, so the phone keeps them and changes the copy instead:
`名称（仅远程）` / `Remote provider only`, and `服务预设（本地不适用）` for preset.
The English marker cannot fit all twelve names in the 18-rune title limit, so English descriptions
become hints (the host then renders its own key labels). Filed ccch1mneyyy/dsh-Go#1569 for
`visibleWhen`, which would let the phone hide the same twelve.

## Phase 4 — verification

Minimum set: the predicate test over exactly the twelve keys, the schema-label test, and one real
Web host gate at a fresh isolated root. The gate drives: local by default, remote on switch, save,
drop of an unsaved hidden draft, and restoration of the saved value. Screenshots and
`ui-gate.json` are kept as evidence. No host gate is re-run for the README sentence, and the phone
is not re-tested because no host byte changed.
