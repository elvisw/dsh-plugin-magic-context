---
id: 27
type: story
hitl: true
risk: low
after: [26]
---

# Document automatic reclaim in the READMEs

## Why

The T26 rewrite dropped a fact the pre-rewrite README carried. `git show d2e9190^:README.md`
had one row in its feature table:

> **Pressure scheduling** | … execute/defer decisions (65% threshold, 5 min cache TTL, **85%
> force band**); `CONTEXT_WINDOW_EXCEEDED` triggers emergency reclaim + retry; tiered
> reduce-guidance nudges

That table moved into `docs/` as "internals", but `docs/configuration.md` only lists
`forceThreshold` (85) as a number and never says what it does. The band is *named* in
changelog prose (`CHANGELOG.md:58,157,183-185`), in one parity row (`PARITY.md:262`) and in a
feasibility note (`docs/dsh-port-feasibility-2026-10-06.md:93,176`), but no reader-facing
document explains what fires it or what it takes.

This is the worst class of documentation defect: the plugin drops tool output without being
asked, while the README describes only the `ctx_reduce` path, so a reader concludes nothing
leaves unless the model calls the tool.

## Requirements

1. **State the split, scoped to the drop lane.** Routine reclaim of tool results is
   agent-driven: nothing is dropped because a result got old, and `/ctx-flush` only lands
   drops already queued by `ctx_reduce` (`pre-step.ts:194-208`, `flush-command.ts:68-84`).
   The only automatic *drop* path is `reclaimForEmergency`, called from the force band
   (`management-pass.ts:732`) and the provider-overflow path (`index.ts:592`) — do not claim
   it is the only automatic surface rewrite: compartment publishing at the execute band
   (`management-pass.ts:771`) and wire repair (`management-pass.ts:616-645`) also rewrite
   the surface. The historian/compartment story is already in the README, but the English
   `execute band` row does not yet say where digests land while the Chinese row does
   (`README.md:72` vs `README.zh-CN.md:62`), so this ticket aligns the English row — after
   that the justification holds in both languages.
2. **Document trigger one, with its qualifiers.** The force band fires inside a management
   pass when a *current* reading is at or above `policy.forceThreshold` (85% by default). A
   reading that predates a surface change is skipped (`management-pass.ts:705-723`), and a
   `/ctx-wrapup` pass sets `skipForce` (`pre-step.ts:756`), so `≥85%` alone must not be
   written as a guarantee.
3. **Document trigger two.** A provider rejection with `CONTEXT_WINDOW_EXCEEDED` publishes
   any ready digest, then drops, then retries once against the smaller surface
   (`index.ts:543-629`); if the window is known and dropping every reclaimable node still
   cannot fit, nothing is dropped (`emergency.ts:125-141`, force-band branch
   `management-pass.ts:749-766`).
4. **Document what is protected, and when.** The newest tagged results whose cumulative
   estimate fits `clamp(context window × 5%, 8k, 64k)` tokens, plus at least the newest
   `policy.protectedToolResults` (eight by default) tagged nodes
   (`emergency.ts:73-78, 104-116`). Without a known context window the token window does not
   apply and only the count floor stands (`emergency.ts:19, 73-78`).
5. **Document the drop order.** Tool tiers: `read` / `todowrite` / `task` drop last, then
   `edit` / `write` / `apply_patch` / `grep` / `glob`, then everything else; oldest first
   *within a tier*, not across tiers (`emergency.ts:54-55, 118-123`).
6. **Document the guidance as prompting, and state both thresholds.** The desk section
   teaches the §N§ habit; reminders fire only when the tagged tail is at least 60k tokens
   **and** at least 25k of it is unstamped (`reduce-guidance.ts:21-22, 58`), rising through
   gentle / firm / urgent, plus a channel-2 "next step" reminder at ≥50k unstamped and
   ≥0.75 severity, with the same band repeating at most every 5 real user turns (`:23-29`).
   The README names the three levels, not the ratio constants: those stay in this ticket and
   the plan's source table. The reminder is a system-prompt context; it never mutates the
   surface (`pre-step.ts:938-1000`).
7. **Both languages, structure parity.** `README.md` and `README.zh-CN.md` keep the same
   h2 count and order (12 each) and the same section content; the new material adds no
   heading.
8. **The configuration reference explains the consequence.** `docs/configuration.md`'s
   pressure-policy row says what `forceThreshold` starts, and that the provider-overflow
   path does not read it.
9. **Make the gap mechanically checkable at acceptance.** A copy of `readme-lint.mjs` in
   this ticket's evidence directory gains one assertion requiring, in the same paragraph,
   the force-band term, the protected-window term, `85%` and the word "default"; a copy of
   `link-check.mjs` with its output redirected into this ticket's evidence. Both copies,
   never the T26 originals (whose `sha256-manifest.json` pins them).
10. **Scope.** Documentation plus this ticket's acceptance scripts. No product code, no new
    config key, no default change, no version bump.

## Non-goals

- Changing the 85% default, the protection window, the tier order, or the 60k/25k bands.
- Turning the acceptance lint into a CI obligation: it stays a script that is run at
  acceptance, and the plan says so rather than claiming future rewrites will fail.
- Documenting journal kinds, drop states, or the compaction-engine paths in the README.
- Re-running the product gate or a host gate: no file under `src/` changes.
- Claiming a reader can switch the force band off. It has no off switch, and
  `forceThreshold` does not govern the overflow path.

## Acceptance

- Both READMEs describe the split, both triggers with their qualifiers, the protection
  window (including the no-window case), the tier order and the guidance thresholds, in the
  reader's language, without contradicting `docs/configuration.md`.
- The acceptance copy of `readme-lint.mjs` reports 0 failures and now runs 82 checks; a
  positive control (the committed text) and two mutation controls (term removed, number
  removed) behave as expected.
- The acceptance copy of `link-check.mjs` reports 0 failures and writes only inside this
  ticket's evidence directory.
- One read-only review confirms each claim matches the cited line and no sentence is
  stronger than the code.
- No file outside `README.md`, `README.zh-CN.md`, `docs/glossary.md`,
  `docs/configuration.md` and `_bmad-output/initiative-dsh-magic-context/acceptance-readme-automatic-reclaim-2026-11-19/`
  changes; the T26 evidence directory stays byte-identical.

## Evidence

`_bmad-output/initiative-dsh-magic-context/acceptance-readme-automatic-reclaim-2026-11-19/`
