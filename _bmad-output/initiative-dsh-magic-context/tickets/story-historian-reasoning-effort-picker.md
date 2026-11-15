---
id: 13
type: story
title: "Historian reasoning effort picker"
parent: initiative-dsh-magic-context
after: [12]
refined: false
hitl: false
risk: low
---

# Historian reasoning effort picker

Status: draft (backlog; start only after the 0.12.3 daily-profile E2E is complete)

## Goal

Replace the free-text `Historian reasoning effort` settings field with a picker
whose options match the reasoning efforts advertised by the routed
provider/model, without changing runtime pass-through semantics.

## Why

The current field in `src/client/index.js` is `kind: 'text'` with a generic
`low/medium/high` hint. Accepted ids are provider/model specific: the user's
`commandcode / deepseek/deepseek-v4.1-flash` route accepts `off`, `low`, `high`,
`max` and does **not** accept `medium`. Typing an invalid id makes the next
Historian call fail with `UNSUPPORTED_REASONING_EFFORT` instead of being
corrected.

## Decisions to settle during refinement

1. **Catalog source.** The client already reads
   `remote.session.modelCatalog()` for provider/model selects, but currently
   keeps only `{id,name}`. Confirm whether the host catalog exposes reasoning
   efforts and, if so, extend the read to include them.
2. **Fallback.** If the host catalog has no reasoning metadata, use a hybrid:
   a select with common ids plus a `Custom…` text input, or keep plain text.
   Do not ship a static global list as if it were authoritative.
3. **Default.** Include `Default (model decides)` mapped to clearing the key
   (the existing blank behavior), not to a made-up effort id.
4. **Unknown legacy value.** Show it as `Custom (current value)` and preserve
   it until the user changes it; do not silently clear or remap it.
5. **No reasoning support.** If the routed model advertises no efforts, disable
   the control (or offer only Default) and say why.
6. **Field kind.** Prefer a reusable `select`/combo field kind in the client
   form rather than one-off DOM code, so future settings can use it.

## Requirements

- `src/client/index.js`: change the `historian.reasoningEffort` spec from
  `text` to the new picker kind; derive options from the committed
  provider/model; preserve the existing write path (`{clear:true}` for empty,
  `{clear:false,text}` otherwise).
- If needed, extend the model-catalog reader to keep reasoning metadata; do not
  add a second catalog fetch.
- `src/dsh/config.ts`: no schema change required unless the picker needs a
  declared enum; keep the value a string because the host owns the id space.
- No changes to `src/dsh/pre-step.ts`, `compaction-engine.ts`, `recomp.ts` or
  `historian.ts` pass-through behavior.

## Acceptance

- A model advertising `off/low/high/max` shows exactly those ids plus
  `Default`.
- A model advertising `low/medium/high` shows `medium`; a model without
  `medium` never offers it.
- A model with no reasoning metadata disables the control or offers only
  `Default`.
- An unknown stored id is shown as Custom and remains unchanged until edited.
- Switching provider/model refreshes the options and does not silently rewrite
  the stored effort.
- A real Historian/`/compact` call receives the selected id; an unsupported id
  still fails explicitly with `UNSUPPORTED_REASONING_EFFORT`.
- `npm run typecheck`, `npm run check:i18n`, `npm run build` and the client
  tests pass; no schema or host-store change.

## Boundaries

- No runtime effort mapping, clamping, or fallback aliasing.
- No new model catalog RPC if the host already exposes one.
- No release/tag/publish in this ticket.
- Do not start before the 0.12.3 daily-profile E2E is complete.

## References

- `src/client/index.js:265-268` (current text field).
- `src/client/index.js:359-467` (model catalog reader; keeps only id/name).
- `src/dsh/config.ts:25-35` (config leaf; blank means provider default).
- `src/dsh/pre-step.ts:528-541` (live effort merge).
- `@mars-sea/dsh-commandcode-provider/lib/index.js:291-296` (current model's
  `off/low/high/max` capabilities).
