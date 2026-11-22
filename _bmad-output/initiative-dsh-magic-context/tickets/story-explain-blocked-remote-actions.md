---
id: 41
type: story
title: "Say why a remote action is blocked, and tell readers to load models before picking"
parent: initiative-dsh-magic-context
covers: [src/client/index.js, tests/client-pure.spec.ts, docs/dsh-plugin-settings-ui-contract.md, docs/configuration.md, CHANGELOG.md, _bmad-output/initiative-dsh-magic-context/acceptance-windows-dsh-t41-switch-and-load-probe/]
after: [40]
refined: false
hitl: true
risk: low
---

# Say why a remote action is blocked, and tell readers to load models before picking

## Description

Reported: switching from 本地 MiniLM to OpenAI 兼容 API leaves 加载模型 doing nothing, and the model
field's hint should say that the list has to be loaded before anything can be picked.

An isolated-host reproduction shows two different causes stacked behind the same dead button:

| Stage | Button | Explanation on screen |
|---|---|---|
| provider switched, not saved | disabled | present, but at the bottom of the card while the button sits in the field row |
| saved, no API key yet | disabled | **none at all** — this is the reported "does nothing" |

The disabled state came from `embeddingActionState`, which only answers hidden/disabled. Gates that
depend on the saved status (missing key, memory off, unresolvable endpoint) never reached the screen.

## Requirements

1. The disabled 加载模型 states its blocker in the field row itself — unsaved edit, missing API key,
   empty endpoint, memory off, migration running, read-only — and carries the same text as a `title`.
2. When the blocker is an unsaved edit, the row offers an explicit 保存 shortcut. It is a real button
   the reader clicks, not the implicit save T40 removed.
3. The action row's reason line is resolved from the same inputs instead of only covering `dirty`.
4. The model hint states the order: click 加载模型 to fetch the list, pick from it, and type an id the
   list does not include.
5. Chinese and English copy in pairs.

## Non-goals

- No change to the server gate: a missing key still refuses to list models.
- No change to the model picker (T39) or the discard control (T40).
- No version bump in this ticket.

## Verification

- Pure spec: `embeddingBlockReason` covers every code and its priority, and each code maps to a
  defined dictionary key.
- Isolated host gate `t41_ui_gate.cjs`: local seed hides the control; switching shows it disabled with
  `data-mc-model-block=saved` inside `[data-mc-model-field]` and a save shortcut; the shortcut writes
  the provider and flips the reason to `key`; saving a key clears it and enables the button; loading
  lists three models and leaves the profile bytes untouched; the hint contains 先点「加载模型」.
