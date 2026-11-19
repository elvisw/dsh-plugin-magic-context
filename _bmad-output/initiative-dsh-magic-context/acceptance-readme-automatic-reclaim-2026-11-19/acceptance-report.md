# T27 — document automatic reclaim

Date: 2026-11-19
Ticket: 27 (documentation, low risk)

## The defect

The T26 README rewrite dropped a fact the pre-rewrite README carried. Before the rewrite,
`README.md` had one feature-table row naming the 85% force band, the `CONTEXT_WINDOW_EXCEEDED`
reclaim-plus-retry path, and the reduce-guidance nudges (`git show d2e9190^:README.md`). After
the rewrite the behaviour existed only as a number in `docs/configuration.md` (`forceThreshold`
(85)) and as unexplained names in changelog prose, one parity row, and a feasibility note.

The consequence is not cosmetic. The plugin replaces tool output with `[dropped §N§]` without
a `ctx_reduce` call, while the README described only the `ctx_reduce` path. A reader could
reasonably conclude nothing leaves unless the model asks.

## What changed

| File | Change |
|---|---|
| `README.md` | Term rows for `force band` and `protected window`; the `execute band` row now says historian digests land there; two paragraphs at the end of *What you get*: one on automatic dropping, one on the guidance reminders |
| `README.zh-CN.md` | The same, in Chinese |
| `docs/glossary.md` | `强制带（force band）` and `受保护窗口` entries |
| `docs/configuration.md` | The 压力策略 row explains what `forceThreshold` starts, its two skip conditions, and that the overflow path does not read it |

No product code, no configuration default, no version bump.

## The claims, and where each comes from

| Claim in the README | Source |
|---|---|
| Routine reclaim is agent-driven; nothing is dropped for being old | `src/dsh/reduce-guidance.ts:9-13` |
| `/ctx-flush` only lands drops already queued by `ctx_reduce` | `src/dsh/pre-step.ts:194-208`, `src/dsh/flush-command.ts:68-84` |
| Force band fires in a management pass at a current reading ≥ `forceThreshold` (85% by default), and does nothing when every reclaimable result still cannot fit | `src/dsh/management-pass.ts:724-748, 749-766`, `src/core/policy.ts:75` |
| A stale reading skips it; a `/ctx-wrapup` pass sets `skipForce` | `src/dsh/management-pass.ts:705-723`, `src/dsh/pre-step.ts:756` |
| Protected window: `clamp(window × 5%, 8k, 64k)`, plus the newest `protectedToolResults` (eight by default) | `src/dsh/emergency.ts:73-78, 104-116`, `src/core/policy.ts:78` |
| Unknown window → count floor only | `src/dsh/emergency.ts:19, 100-116` |
| Order: rest-class first, edit-class next, `read`/`todowrite`/`task` last, oldest within a class | `src/dsh/emergency.ts:54-55, 118-123` |
| Overflow path publishes ready digests, drops, and retries only after the surface actually changed | `src/index.ts:543-629` |
| Reminders need tail ≥ 60k **and** at least 25k not yet dropped; level depends on the undropped share; channel-2 at ≥ 50k and ≥ 0.75; a same-level band re-fires no sooner than 5 user turns | `src/dsh/reduce-guidance.ts:20-29, 57-95` |
| Reminders never mutate the surface | `src/dsh/pre-step.ts:938-1000` |

## Verification

Run on the working tree, 2026-11-19. This is a documentation check, not a product gate.

| Step | Result | Evidence |
|---|---|---|
| T27 copy of `readme-lint.mjs`, before the README change | 82 checks, 4 failed — exactly the four this ticket adds | `evidence/lint-before.json` |
| Same after the change | 82 checks, 0 failed | `evidence/lint-after.json` |
| Mutation control: `force band` replaced by a neutral phrase | `fact-force-band-documented` fails (`en`) | `evidence/lint-mutation-controls.json` |
| Mutation control: `85% by default` → `90% by default` | the same check fails (`en`) | same file |
| README restored byte-identical after both mutations | `restoredByteIdentical: true` | same file |
| T27 copy of `link-check.mjs` | 100 unique targets, 0 failed; writes only into this directory | `evidence/link-check.json` |
| T26 acceptance scripts untouched | both SHA-256 unchanged | `evidence/t26-originals.json` |

The mutation controls are the reason the new assertion is trustworthy: the committed text
passes, and removing either the term or the number makes it fail.

## Review rounds

| Round | Result | What it found |
|---|---|---|
| Ticket validation | NEEDS CHANGES | 5 Critical: missing split statement, copy would fail its own assertion, 25k without the 60k floor, editing T26 evidence, tier order described backwards |
| Ticket re-check | STILL NEEDS CHANGES | 1 remaining fact error (English `execute band` row does not say where digests land), plus three precision issues; all applied |
| Prose review | NEEDS CHANGES | 3 Critical: force-band `cannot-fit` unqualified, "retries once" unconditional, guidance starts at `gentle`; 7 Fixes; all applied |
| Fix confirmation | NEEDS CHANGES | "three quarters unclaimed" left over, and "a landing" was too broad — ordinary `ctx_reduce` landings inside the same pass do not suppress the band; both applied |

Two confirmation rounds, not five: each round was scoped to the previous round's findings, not a
new full review. The last round's two remaining items — "unclaimed" → "undropped", and narrowing
"a surface change" to a `/ctx-flush` landing / published digest / baseline refresh — were applied
directly and checked against `src/core/stores.ts:888-894` and `src/dsh/pre-step.ts:350-351`;
no fifth round was run for a one-word and one-clause edit.

## What was not run, and why

- **No `npm test`, typecheck, build, pack, or host gate.** Nothing under `src/`, `tests/`,
  `package.json` or `cordis.patch.yml` changed. Running them would exercise bytes this ticket
  does not touch.
- **No npm publication.** The follow-up `0.18.2` release is a separate step: it touches
  `package.json`, `package-lock.json`, `CHANGELOG.md` and the version lines inside the
  READMEs, none of which are in this ticket's `covers`.
- **The lint is not CI.** It lives in this evidence directory and runs when someone runs it.
  The ticket says "mechanically checkable at acceptance" rather than claiming a future rewrite
  would automatically fail.

## Still open

- Whether the prose reads well to a first-time reader was judged by a read-only review, not
  by user testing.
- The Chinese and English paragraphs are written independently; the lint enforces the same
  facts, not the same sentence structure.
