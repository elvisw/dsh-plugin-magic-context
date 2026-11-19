---
title: Donut composition in the dsh-go session panel
ticket: 32
status: done
---

# Plan — session context composition donut

## Phase 1 — data

`goContextData` already formats `contextBreakdown` into strings for the `keyValue` rows. Add one
numeric field, `share`, built with the existing `finite()` helper:
`[finite(systemTokens), finite(toolsTokens), finite(messageTokens)]`. Unknown stays `null`; no
summing, no percent calculation (the host computes the slices).

## Phase 2 — view

In `sessionContextView`, after the composition heading, insert:

```json
{ "type": "chart", "kind": "donut", "unit": "tok",
  "categories": [c.system, c.tools, c.messages],
  "series": [{ "values": { "$": "data.share" } }] }
```

Remove the three `keyValue` rows for the same three numbers; the legend prints value, unit and
percentage (`dsh_ui_chart.dart:1017-1063`). Keep the remaining composition rows.

## Phase 3 — tests

`tests/go-view.spec.ts`:
- the session view has exactly one `chart`, kind `donut`, unit `tok`, the three localized
  categories in order, `series[0].values` bound to `data.share`;
- `goContextData(summary('s1')).share` is `[1000, 2000, 3000]`; for the summary without a breakdown
  it is `[null, null, null]`;
- each of the three category labels occurs once in the whole session view (moved from rows to the
  chart, not duplicated);
- the global view has no chart.

## Phase 4 — device check

Build a candidate tarball, push it with the existing phone update script, and ask for one manual
run: update → restart engine → open a session → open the context panel → screenshot. Record what
the ring and legend look like. If the ring is too small to read at 64 px, the finding is recorded
and the fallback is `hbar`, not a bigger change.
