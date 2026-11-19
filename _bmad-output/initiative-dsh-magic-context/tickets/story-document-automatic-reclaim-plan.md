---
title: Document automatic reclaim in the READMEs
ticket: 27
status: draft
---

# Plan — document automatic reclaim

## Source facts (verified against the code on 2026-11-19, not recalled)

| Fact | Where |
|---|---|
| Routine reclaim is agent-driven; only the emergency band drops without asking | `src/dsh/reduce-guidance.ts:9-13` |
| The two automatic drop call sites | `src/dsh/management-pass.ts:732`, `src/index.ts:592` |
| `/ctx-flush` lands only rows already in `pending_drops` | `src/dsh/pre-step.ts:194-208`, `src/dsh/flush-command.ts:68-84` |
| Force band condition, stale-reading skip, `skipForce` | `src/dsh/management-pass.ts:705-723`, `src/dsh/pre-step.ts:756` |
| `forceThreshold` default 85, `protectedToolResults` default 8, both configurable | `src/core/policy.ts:73-79`, `src/index.ts:1409,1423` |
| Protection window `clamp(window × 5%, 8k, 64k)`; count floor; no window → floor only | `src/dsh/emergency.ts:19, 73-78, 104-116` |
| Tier order: read/todowrite/task last, edit-class next, rest first; oldest first inside a tier | `src/dsh/emergency.ts:54-55, 118-123` |
| `cannot-fit` guard, both paths | `src/dsh/emergency.ts:125-141`, `src/dsh/management-pass.ts:749-766` |
| Provider overflow: publish ready digests → drop → retry once | `src/index.ts:543-629` |
| Guidance needs tail ≥ 60k **and** unstamped ≥ 25k; severity 0.2/0.4/0.6; channel-2 at ≥ 50k and ≥ 0.75; same band every ≥ 5 real user turns | `src/dsh/reduce-guidance.ts:20-29, 57-95` |
| The reminder is a system-prompt context and never mutates the surface | `src/dsh/pre-step.ts:938-1000` |
| The pre-rewrite README carried this as one table row | `git show d2e9190^:README.md` |
| Named but never explained: changelog prose, one parity row, one feasibility note | `CHANGELOG.md:58,157,183-185`, `PARITY.md:262`, `docs/dsh-port-feasibility-2026-10-06.md:93,176` |
| Current lint: 81 checks, 0 failed; asserts 1 h1 + 12 h2 + 0 h3 | `acceptance-readme-rewrite-2026-11-19/evidence/readme-lint.mjs:38-45` |

## Placement

The new material goes inside `## What you get` / `## 装完会看到什么`, split into two parts:

1. **Two term-table rows** next to the existing `reclaim band` and `execute band` rows
   (`README.md:63,72`; `README.zh-CN.md:53,62`): `force band` and `protected window`.
2. **One paragraph** after the three bullets, before `## Common tasks`.
3. **One alignment fix** so the justification for item 1 holds in both languages: the
   English `execute band` row (`README.md:72`) gains the clause the Chinese row already has
   (`README.zh-CN.md:62`) — historian digests land on the surface inside that band.

No heading changes: the lint asserts `h3 === 0` and an exact 12-heading h2 order, so a new
heading would fail two checks. Line limits still apply (≤400 chars, ≤5 links per line).

## Copy — English

Term table rows (insert after the `execute band` row), and align that row with the Chinese
one — append `; historian digests land on the surface here`:

```
| force band | The pressure line where the plugin drops on its own instead of waiting for `ctx_reduce` |
| protected window | What the force band leaves alone: the newest results, up to 5% of the window (clamped to 8k–64k tokens), and at least the newest eight by default |
```

Paragraph (after the three bullets):

```
It also reclaims without being asked. Routine reclaim is agent-driven — nothing is dropped
because a result got old, and `/ctx-flush` only marks already-queued reclaims to land on the
next message. The exception is the force band. When a management pass has a current pressure
reading at or above `policy.forceThreshold` (85% by default), it drops tagged tool results
itself, outside the protected window: the newest results that fit in 5% of the context
window, clamped to 8k–64k tokens, plus at least the newest `protectedToolResults` (eight by
default). Without a known context window, only that count floor applies. The order is by
class, not by age: everything else goes first, then `edit` / `write` / `apply_patch` /
`grep` / `glob`, and `read` / `todowrite` / `task` last, oldest first within a class. A pass
triggered by `/ctx-wrapup`, a pass with no pressure reading, or one whose reading predates a
`/ctx-flush` landing, a published digest or a baseline refresh does not fire the band. Neither
does it fire when dropping every reclaimable result still could not make the request fit a
known window.

If the provider rejects a request as too long, a second path first publishes any digest that
is ready, then drops the same way — same window, same class order — and retries once, but
only after the surface actually changed: with nothing published and nothing dropped, the
retry would fail identically. Neither path has its own switch.

The system prompt also teaches the model the `§N§` habit, and once the tagged tail reaches
60k tokens with at least 25k of it not yet dropped, reminders start. How hard they push
depends on how much of the tail is still undropped: gentle, firm, urgent, and at the top a
"make it your next step" reminder at 50k or more undropped and three quarters of the tail
undropped. A band that stays the same re-fires no sooner than five user turns later.
Reminders ask; they never drop anything.
```

Three paragraphs: dropping, the provider-overflow path, and guidance. Mixing the last into
the first is how an earlier draft implied the reminders delete things.

## Copy — Chinese

Term table rows (insert after the `execute band` row):

```
| 强制带（force band） | 压力达到或超过它，插件不再等模型调 `ctx_reduce`，自己丢弃受保护窗口之外的带标签工具结果 |
| 受保护窗口 | 强制带不碰的区域：最新的若干条结果，累计不超过窗口的 5%（夹在 8k–64k token），且至少最新的八条（默认值） |
```

Paragraph:

```
它也会自己回收。日常回收由模型驱动：没有任何结果会因为“放旧了”被丢掉，`/ctx-flush` 只是把已经排队的
回收标记为下一条消息落地。例外是强制带：管理 pass 拿到当前压力读数、且达到或超过 `policy.forceThreshold`
（默认 85%）时，会自己把受保护窗口之外的带标签工具结果换成占位符。受保护窗口是从最新往前累计、总量
不超过上下文窗口 5% 的那些结果（夹在 8k 到 64k token 之间），外加至少最新的 `protectedToolResults` 条
（默认八条）；不知道上下文窗口时只剩这个条数下限。丢弃按类别而不是按年龄：其余工具最先丢，然后是
`edit` / `write` / `apply_patch` / `grep` / `glob`，`read` / `todowrite` / `task` 最后，同一类别里旧的先丢。
`/ctx-wrapup` 触发的 pass、没有压力读数的 pass、以及读数早于某次 `/ctx-flush` 落地、摘要发布或基线刷新的 pass
不会触发。如果丢光所有可丢结果、在已知窗口下仍然装不下，它也不丢。

如果提供商直接以请求过长拒绝，另一条路径先发布已就绪的摘要，再按同样的窗口和类别顺序丢弃，然后重试
一次——但只有在 surface 确实变化之后才重试；什么都没发布、什么都没丢时，重试只会得到同样的失败。
两条路径都没有各自的开关。

系统提示还会教模型养成 `§N§` 的习惯；当带标签的尾部达到 60k token、其中至少 25k 还没被丢弃时，
开始提醒。提醒的强度取决于尾部还有多少没丢：gentle、firm、urgent，最高一档是“下一步就做”——
未丢弃达到 50k 且占尾部四分之三时出现。同一档位最多每五个用户轮次重复一次。提醒只是要求，
它自己不丢任何东西。
```

## Glossary

`docs/glossary.md` uses `**term**` paragraphs, not a table — add two entries after the
`execute band` entry:

```
**强制带（force band）**
压力越过 `policy.forceThreshold`（默认 85%）时，管理 pass 不再等模型调用 `ctx_reduce`，
直接把受保护窗口之外的工具输出换成占位符。读数早于 surface 变化、或由 `/ctx-wrapup`
触发的 pass 不触发。

**受保护窗口**
强制带不碰的区域：从最新往前累计、总量不超过上下文窗口 5%（下限 8k、上限 64k token）
的工具结果，外加至少最新的 `protectedToolResults`（默认 8）条。不知道窗口时只有条数下限。
```

## Configuration reference

`docs/configuration.md:37` — the row is long; append to its description (the quoted head is
an excerpt, not the full line):

```
`forceThreshold` 是管理 pass 强制带的起点：当前读数越过它，就自动丢弃受保护窗口之外的工具
输出（窗口与分档见 README）；读数过期或 `/ctx-wrapup` 触发的 pass 不触发。提供商溢出那条
路径不看这个阈值，它由 `CONTEXT_WINDOW_EXCEEDED` 触发。
```

## Acceptance scripts

Copy `readme-lint.mjs` and `link-check.mjs` from the T26 evidence directory into
`acceptance-readme-automatic-reclaim-2026-11-19/evidence/`, then:

- in `link-check.mjs`, point `evidenceDir` at this ticket's directory so it writes here, and
  leave the T26 original byte-identical;
- in `readme-lint.mjs`, add a section helper and one check:

```js
const sectionText = (text, heading) => {
  const lines = text.split('\n')
  const start = lines.findIndex((l) => l.replace(/^#+\s*/, '').trim() === heading)
  if (start < 0) return ''
  const level = lines[start].match(/^#+/)[0].length
  const rest = lines.slice(start + 1)
  const end = rest.findIndex((l) => {
    const m = l.match(/^(#+)\s/)
    return m !== null && m[1].length <= level
  })
  return (end < 0 ? rest : rest.slice(0, end)).join('\n')
}

const FORCE_BAND = [
  ['en', en, 'What you get', /force band/i, /protected window/i, /(?:by default|default)/i],
  ['zh', zh, '装完会看到什么', /强制带/, /受保护窗口/, /默认/],
]
const forceMissing = []
for (const [lang, text, heading, term, win, dflt] of FORCE_BAND) {
  const ok = sectionText(text, heading).split(/\n{2,}/).some((p) =>
    term.test(p) && win.test(p) && /(?<![\d.])85\s*[%％]/.test(p) && dflt.test(p))
  if (!ok) forceMissing.push(lang)
}
check('fact-force-band-documented', forceMissing.length === 0, forceMissing.join(','))
```

The four conditions sit in one paragraph on purpose: a bare `85` elsewhere in the file must
not satisfy the check, and `(?<![\d.])` keeps `0.85` from matching.

Also extend the existing term lists, and only these:

- `GLOSSARY_TERMS` += `force band`, `强制带`, `受保护窗口` (the lint checks the glossary
  contains each);
- `EN_ONLY` += `force band`, `ZH_ONLY` += `强制带` (each README must use its own term);
- **not** `SHARED_IN_BOTH`: that list asserts both files contain the literal term, and the
  Chinese README uses 强制带.

## Verification

```sh
node <t27>/evidence/readme-lint.mjs .     # 82 checks, 0 failed
node <t27>/evidence/link-check.mjs .      # 0 failures, writes into <t27>/evidence
```

Two mutation controls, then restore, to prove the new check is not vacuous:

1. replace `force band` / `强制带` with a neutral phrase → `fact-force-band-documented`
   fails for both languages;
2. replace `85%` / `85%` with `90%` → the same check fails.

No `npm test`, build or host gate: nothing under `src/`, `tests/` or `package.json` changes.
The acceptance report says so instead of implying a product gate ran.

## Review

One read-only review, scoped to: each claim matches its cited line; the split is stated
without becoming an exhaustive claim about every surface rewrite; no sentence is stronger
than the code (defaults marked as defaults, `≥85%` qualified by current-reading and ordinary
pass, `cannot-fit` qualified by a known window).

## Follow-up, outside this ticket

Release `0.18.2` afterwards (documentation-only patch: both READMEs, glossary, configuration
reference). That step touches `package.json`, `package-lock.json`, `CHANGELOG.md` and the
version lines inside the READMEs, so it is not part of T27's `covers`.

## Risks

- **Overclaiming.** "Drops at 85%" without the window reads as "anything can vanish"; "only
  these three things happen" reads as exhaustive when compartment publishing and wire repair
  also rewrite the surface. Both halves ship together, and the copy talks about the drop
  lane specifically.
- **Divergence between README and configuration reference.** Two places describe
  `forceThreshold`; the configuration row states its scope (force band only) and points at
  the README for the window instead of restating it.
- **Heading budget.** The lint fails on any new heading, which is why this is a paragraph,
  not a section.
