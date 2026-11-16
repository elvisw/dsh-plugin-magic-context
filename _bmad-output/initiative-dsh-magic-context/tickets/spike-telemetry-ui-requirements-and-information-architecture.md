---
id: 17
type: spike
title: "Telemetry UI requirements and information architecture"
parent: initiative-dsh-magic-context
covers: [src/client/index.js, src/index.ts, src/dsh/telemetry.ts, docs/dsh-plugin-ui-telemetry-contract.md, docs/dsh-plugin-settings-ui-contract.md]
after: [16]
refined: false
hitl: false
risk: medium
---

# Telemetry UI requirements and information architecture

Status: revision 1 — research spike. No implementation authorization.

## Goal

Define the telemetry UI requirements before changing the DSH Web/Desktop
surface. The result must describe what information the surface carries, where it
belongs (pill, popover, `/ctx-status`), which source makes it truthful, and what
is deliberately deferred.

The design target is the **idea** of the upstream Magic Context OpenCode TUI
sidebar, not its pixel layout. Upstream is a persistent right sidebar; DSH gives
a dock/status seat plus a popover overlay. Copying the sidebar wholesale would
crowd the composer; copying the current one-line ledger would keep the missing
information problem.

## Context

- Upstream `cortexkit/magic-context@v0.49.56` sidebar:
  `packages/plugin/src/tui/slots/sidebar-content.tsx` — header/collapse,
  pressure headline, segmented token bar and legend, Historian, Memory, Status,
  Dreamer and Stats sections; collapsed summary rows.
- Upstream full status view:
  `packages/plugin/src/shared/status-view.ts` — Tags, Reductions, Pending Queue,
  Context Details, Cache TTL, History Compression, Memory, warnings.
- Current DSH UI: `src/client/index.js:2095-2565` — one-line pill with a status
  dot, popover header, single-letter ledger `O L M P U T K V R E`, and an
  operations feed.
- Current DSH telemetry: `src/dsh/telemetry.ts:260-326` — adapter/project/health
  counters and recent journal rows; no context breakdown, historian state,
  queue count, memory token cost or warnings array.
- Current `/ctx-status`: `src/dsh/status-command.ts:82-106` — pressure, pass
  decision, tag counts, queue, historian/compartments, baseline, policy,
  journal.
- Host opportunity: `contextBreakdown` already exists in
  `@deepseek-ai/dsh-token-meter` (`lib/types/projection.d.ts:56-68`) and
  `sessionProjections.snapshot` can read it
  (`@deepseek-ai/dsh-session-projection/lib/types/index.d.ts:185`), but the
  adapter does not consume it today.

The user's complaint is concrete: the current surface does not show enough of
what the upstream sidebar shows. The requirements must therefore prioritize
missing information, not restyle the existing ledger.

## Deliverable

`_bmad-output/initiative-dsh-magic-context/research-telemetry-ui-requirements.md`

It must contain:

1. a comparison of the upstream sidebar/status-view and the current DSH surface;
2. design principles and the pill → popover → `/ctx-status` hierarchy;
3. English and Chinese static text wireframes for the pill, wide/narrow popover,
   empty, unavailable and warning states, plus a prioritized requirements matrix
   with meaning, source, one truth level per row, priority, surface and
   empty/stale/error behavior;
4. a v1 recommendation that separates must-have fields from deferred ones;
5. the minimum additive `/mc-telemetry/summary` fields and how they are sourced;
6. responsive, interaction, localization, accessibility and refresh rules;
7. acceptance criteria for a later implementation ticket;
8. explicit non-goals and resolved decisions for v1 (plus any remaining open
   decisions).

## In scope

- Research and requirements only.
- File:line citations to upstream and current DSH code.
- A documented decision on which upstream sections survive, which are renamed,
  and which are omitted because DSH has no honest source.
- A data contract proposal for the Web and the future dsh-go native renderer.

## Out of scope

- Editing `src/client/index.js`, `src/dsh/telemetry.ts`, `src/index.ts`, tests,
  docs contracts, README, CHANGELOG, package metadata or release files.
- Running a host gate, starting a browser, changing a profile, installing a
  package or publishing.
- Implementing context breakdown, historian progress, cache TTL, remote
  embeddings or the dsh-go port.

## Acceptance

- Independent ticket validation passes.
- The document cites upstream v0.49.56 and current DSH sources with file:line
  evidence.
- The matrix covers context/pressure, token composition, historian/recomp,
  memory, queue/notices, maintenance, cache/tags/hygiene, warnings and
  operations; it states that the bar has three host segments and message
  categories are a sub-list.
- It distinguishes exact, heuristic and unavailable data; no missing source is
  represented as zero; session notices are exact, smart notes are unavailable.
- It defines the minimum additive telemetry API without implementing it.
- It defines responsive behavior for DSH Web and the future dsh-go
  `composer.strip` + `panels` mapping.
- It defines refresh/stale behavior, localization, accessibility and acceptance
  criteria for implementation.
- `git diff` shows no runtime, test, package, release or profile changes.
