---
name: Magic Context Settings Redesign
status: draft
created: 2026-11-17
updated: 2026-11-17
---

# Magic Context Settings Redesign

This UX run redesigns the top-level **Settings → Magic Context** card without changing any configuration semantics.

## Spines

- [DESIGN.md](DESIGN.md) — host-native visual identity: tokens, type, spacing, components.
- [EXPERIENCE.md](EXPERIENCE.md) — information architecture, states, interactions, accessibility, key flows.

## Layout references

- [wireframes/settings-redesign.md](wireframes/settings-redesign.md) — wide and narrow static wireframes.

## Scope

In scope:

- Split the flat field list into summary, jump row, sections and advanced disclosures.
- Give the remote embedding block a clear status/action hierarchy.
- Make Save/Reset a sticky action bar inside the card.
- Preserve all existing fields, defaults, validation, translations and Save semantics.

Out of scope:

- New config keys, new server routes, schema changes.
- A second navigation level or a full-page redesign of the host Settings dialog.
- Telemetry panel redesign.
- dsh-go native UI.
- Enabling project-level embedding overrides; that remains a server-side boundary, not a UI feature.

## Source snapshot

The current card is implemented in `src/client/index.js` as a generic `FIELDS` table rendered inside `settings.section`. Its controls are DSH-native but the layout is a single long list. The T20 screenshot in `docs/img/settings-page-embedding.png` is the visual input for the remote section; `docs/dsh-plugin-settings-ui-contract.md` is the behavioral contract.

## Next

1. Review the two spines and wireframes with the user.
2. If accepted, ask Sofia to create the implementation ticket from these spines.
3. Implement layout only; run one isolated DSH Web gate and update screenshots.
