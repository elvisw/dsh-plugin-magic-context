---
id: 28
type: story
hitl: true
risk: low
after: [27]
---

# Lead with automatic reclaim, stop teaching tag-level operation

## Why

The user, reading the freshly updated README, put it plainly: nobody sits around telling the
plugin which record to reclaim or which to restore. That is correct, and the README still
teaches exactly that interaction:

- the first item under *Common tasks* is a scripted dialogue, `you: drop tags 4 through 7` →
  `ctx_reduce {"drop": "4-7"}`;
- the second is `you: bring back tag 5` → `ctx_expand {"tag": "5"}`;
- the tools table describes `ctx_reduce` as parsing `"3-5,8"`, which reads as a user-facing
  syntax.

In practice the user never names a tag. The model stamps outputs it has finished with while it
works (the desk section and the nudges exist for that), and at 85% the force band takes the
oldest unprotected ones without being asked. `ctx_expand` is reached by asking a question in
words; the model resolves which output to bring back.

The result is a README that describes the one workflow nobody uses, and buries the one that
runs by itself. T27 added the automatic story but left the tag-level tutorial in front of it.

## Requirements

1. **Common tasks opens with "you do not manage this".** State the two automatic paths (model
   stamping while it works; force band at 85%) before any tool is named. Keep the reason reclaim
   is deferred where it belongs — a rewrite invalidates the cache prefix — as one sentence, not
   as a manual procedure, and name `/ctx-flush` there as the only thing the reader might invoke.
2. **Restoring is the agent's move, not the reader's.** When the model needs an output it
   already consumed and that output was reclaimed, it calls `ctx_expand` itself; the original
   comes back as a new tool result and the placeholder stays. The README says this in the
   automatic section, not as a user task, and states that no UI asks the reader to pick a tag.
3. **The tools table says who calls them.** Lead-in: these are the model's tools, reached by
   asking in words, not by typing ranges.
4. **`/ctx-flush` stays, scoped.** It only makes already-queued reclaims land; it chooses
   nothing.
5. **The `§N§` term row says the reader never types it.** The model addresses items by tag.
6. **Chinese mirrors**, same content, not a literal translation.
7. **No heading changes**, no new terms that need glossary entries beyond what exists, and the
   T27 assertions must keep passing (`force band` + `protected window` + 85% + default in one
   paragraph).
8. **Scope:** the two READMEs only. No product code, no new config, no version bump inside this
   ticket.

## Non-goals

- Removing `ctx_reduce` or `ctx_expand`, or hiding them from the tools table: they are still
  real, and a reader who sees them in a transcript should find them documented.
- Reworking the memory or `/ctx-wrapup` items.
- Re-litigating the automatic-reclaim section added by T27.

## Acceptance

- Neither README shows a dialogue in which the user names a tag number, and neither frames
  retrieval as something the reader does.
- Both READMEs open *Common tasks* with the automatic behaviour and say plainly that the reader
  does not choose which output is reclaimed; the restore path is described as the model's move.
- `readme-lint.mjs` (T27 copy) reports 82 checks, 0 failures; link check 0 failures.
- One read-only review confirms the new text matches the code and that removing the tag
  dialogue did not leave a dangling reference elsewhere in the file.

## Evidence

`_bmad-output/initiative-dsh-magic-context/acceptance-readme-automatic-reclaim-2026-11-19/`
(T28 reuses the T27 scripts; a second evidence directory would duplicate them for no gain.)
