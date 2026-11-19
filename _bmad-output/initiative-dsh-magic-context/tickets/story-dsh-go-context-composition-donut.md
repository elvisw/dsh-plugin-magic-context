---
id: 32
type: story
hitl: true
risk: low
after: [31]
---

# Show the context composition as a donut in the dsh-go session panel

## Why

The Web telemetry panel draws a three-segment bar (`system` / `tools` / `messages`,
`src/client/index.js:2434-2453`). The phone panel only lists the three numbers as rows, so the
proportions have to be worked out in your head. dsh-go has no stacked-bar component — `chart` is
`bar|hbar|line|donut` with no stacking, and there is no custom-paint escape hatch — but its `donut`
draws one slice per category and prints a legend row with value, unit and percentage. That carries
the same information as the Web bar.

## Requirements

1. The **session** context panel renders a `chart` node: `kind: "donut"`, `unit: "tok"`,
   `categories` = localized 系统 / 工具 / 消息, one series whose `values` bind to the panel data.
2. `goContextData` adds the raw numbers (`contextBreakdown.systemTokens/toolsTokens/messageTokens`)
   as a three-item numeric array; unknown values stay `null`. No token arithmetic is added.
3. The three duplicated rows are removed from the composition `keyValue` list: the donut legend
   already prints value and percentage. The other composition rows are unchanged.
4. A missing breakdown renders as `null` slices (legend `—`, empty ring); it must not throw and must
   not fabricate zeroes.
5. The global panel is unchanged.
6. No host change: `chart` with these kinds exists in dsh-go v1.1.0 (`docs/plugins/components.md`
   at tag `v1.1.0`), and `{"$": ...}` bindings resolve inside arrays (`dsh_ui_bind.dart:105-110`).

## Non-goals

- A stacked bar; the protocol has no such component and no self-drawing. If the ring is not legible
  on the phone, the fallback is `hbar` (three bars), not a host change.
- Any change to the Web panel, config keys, or the telemetry contract.

## Acceptance

- `tests/go-view.spec.ts` pins the chart node (kind, unit, three categories, bound values) and the
  data array for a full summary and for a missing breakdown, and asserts the three labels appear
  once (chart only) in the session view.
- `npm test`, typecheck, i18n and build pass.
- One real dsh-go device check: install the candidate, open a session's context panel, screenshot.
  A ring that renders but is unreadable is a finding, not a pass.
