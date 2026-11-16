---
name: Magic Context Settings Redesign
description: UX run for the host-native redesign of the top-level Magic Context Settings card.
status: draft
created: 2026-11-17
updated: 2026-11-17
sources:
  - ../../../docs/dsh-plugin-settings-ui-contract.md
  - ../../../README.zh-CN.md
  - ../../../src/client/index.js
---

# Magic Context Settings Redesign

This UX run redesigns the top-level **Settings → Magic Context** card. It keeps the existing configuration contract and changes how the same fields are organized, summarized and reached.

## Spines

- [DESIGN.md](DESIGN.md) — host-native visual identity: tokens, type, spacing, components.
- [EXPERIENCE.md](EXPERIENCE.md) — information architecture, states, interactions, accessibility, key flows and the 34-field inventory.

## Layout references

- [wireframes/settings-redesign.md](wireframes/settings-redesign.md) — wide and narrow static wireframes.

## Source snapshot

- Card implementation: `src/client/index.js` (`FIELDS`, `settings.section`, remote action panel).
- Behavioral contract: `docs/dsh-plugin-settings-ui-contract.md`.
- Current remote-embedding screenshot: `docs/img/settings-page-embedding.png`.
- The field inventory in `EXPERIENCE.md` is the map, but `FIELDS` remains the source of truth for keys, defaults and validation.

## Scope

In scope:

- Split the flat field list into 常规 / Historian / Journal / 向量检索 / 维护与诊断.
- Add a summary strip, a jump row, advanced disclosures and an unsaved/status strip.
- Keep the host `SettingsForm` footer as the only Save/Reset surface; no duplicate Save.
- Make the remote embedding block easier to operate without changing its server contract.
- Make Chinese a complete, release-blocking locale for every label, hint, status, alert and action; switching locale updates immediately.
- Preserve all 34 existing fields, defaults, validation, translations and Save semantics.

Out of scope:

- New config keys, new server routes, schema changes or host API changes.
- A second navigation level or a full-page redesign of the host Settings dialog.
- Redesigning the legacy `plugins.item` / `plugins.row.config` cards.
- Telemetry panel redesign, dsh-go native UI, or project-level embedding overrides.

## Behavior changes to approve

The redesign is mostly presentation, but four interaction changes are deliberate. T21 must implement them as part of the approved ticket, not smuggle them in as “CSS only”:

1. **Remote actions with a dirty form.** `加载模型` and `测试连接` become `保存并加载模型` / `保存并测试`; one revision-fenced Save runs first, then the action.
2. **Start/rollback preconditions.** Both require a clean form; Start also requires a saved model, a successful probe and at least one searchable memory. Rollback stages `local`, saves, then disarms.
3. **No second Save.** The host footer remains the only Save/Reset surface; the new strip is non-button status text.
4. **Status polling.** While the card is visible, embedding status polls every 2s during migration and every 15s otherwise, stopping at a terminal state.

Everything else is grouping, typography, spacing, labels and visibility.

## Success criteria

- At 1280×900, the first viewport answers: reclaim policy, Historian state, vector space, rebuild state.
- Each of the five sections is one jump away; no section is hidden behind another tab.
- All 34 fields remain reachable and editable in the full Settings card.
- The Chinese card contains no English except model IDs, URLs, header names, environment-variable names and protocol terms.
- No second Save/Reset appears in the DOM.
- At 560px width there is no horizontal page scroll.

## Decision requested

Review `DESIGN.md`, `EXPERIENCE.md` and the two wireframes. If the direction is accepted, create **T21 — Settings UI redesign** from these spines and implement only that scope.
