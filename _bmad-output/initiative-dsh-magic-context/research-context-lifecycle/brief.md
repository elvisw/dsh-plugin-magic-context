---
type: codebase-research-brief
status: approved
validation: normal
---

# Context lifecycle — research brief

## Repositories

- MC: `https://github.com/cortexkit/magic-context`, release `v0.49.40`, commit `33fb6ac9a39c8bb299776b6b514ea0815a15a225` (`33fb6ac9`), detached release snapshot at `C:/Users/w_elv/AppData/Local/Temp/opencode/dsh-mc-reference-0.49.40`.
- DSH: `https://github.com/deepseek-ai/deepseek-harness`, commit `fcc0ad462172522aaf5c93a7b2e01f6b9f0b0159` (`fcc0ad46`), source snapshot at `C:/Users/w_elv/AppData/Local/Temp/opencode/dsh-reference-20261107`. Its release-merge commit names `0.2.2-rc.1`; the local CLI reports that version. Equality between published package contents and this source commit is not established by the version string alone.

## Approved factual questions

1. **How / DSH:** How does one model request derive from Session events, which plugin hooks participate, and what mutation, persistence, cancellation and tool-pairing constraints apply?
2. **How / MC:** How do stable tags, queued reductions, persisted replay decisions and raw-history expansion form one lifecycle, and what causes recovery to refuse?
3. **Where / MC:** Where are host-dependent boundaries, runtime/build dependencies and shared-source entry points used by the OpenCode and Pi implementations?
4. **How / both:** How are cache-prefix stability, restart/replay consistency, tool pairing and raw recovery checked by existing tests? What relevant behaviors are not established by the inspected tests?

## Evidence rules and budgets

- Inspect source through `git ls-tree`, `git grep`, and `git show` at the named commit; do not use mutable working-tree contents as evidence.
- At most 15 distinct deeply read files per question, across repositories for question 4. Search-only hits do not consume the deep-read budget. At most 10 historical commits if a history question is later approved; no history question is currently assigned.
- Validation is normal: independent re-check of load-bearing claims, with source anchors checked mechanically.
- Never conclude from training data alone. Prior project discussion guides the questions, not the factual answers. Claims require retrieved source evidence from this run.
- Research firewall: researchers receive only factual questions, source paths, commits, budgets and role instructions. They do not receive the product intent, requirements draft or prior conclusions.
- Exclude `_bmad/`, `_bmad-output/`, planning/specification/ticket/ADR proposal directories from evidence searches. Existing implementation documentation may support orientation; code and test assertions support behavioral claims.
- Read-only source research: do not install dependencies, run application code or tests, alter DSH settings, or create implementation files. Existing tests are evidence of asserted contracts, not evidence that the current environment passes them.
- Cite as `repository/path:line-line (symbol) @ shortsha`, using symbols without nested parentheses.
- A source digest reports facts, uncertainties, refusals and budget limits; it makes no implementation recommendation.

## Research checklist

- [x] User approved scope, approach and initiative name.
- [x] Local CLI version observed: `0.2.2-rc.1`.
- [x] Fixed source snapshots resolved and inspected.
- [x] Locator digests persisted.
- [x] Four question digests persisted.
- [x] Load-bearing claims independently verified.
- [x] Source anchors and citation checks completed.
- [x] Factual research report completed.
- [x] Separate requirements/design draft prepared with assumptions and open decisions.

## Prior documents

No existing research report or ADR was present in the project output folder at initiation. Earlier chat observations used a different MC master commit and must not be treated as release evidence.
