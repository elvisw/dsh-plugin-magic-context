---
title: Lead with automatic reclaim
ticket: 28
status: done
---

# Plan — lead with automatic reclaim

## What changes, and where

| Location | Now | After |
|---|---|---|
| `README.md` / `README.zh-CN.md`, first item under *Common tasks* | Scripted dialogue where the user says `drop tags 4 through 7` | A statement that the reader does not manage this, naming the two automatic paths, with the cache-cost reason as one sentence |
| Second item | `bring back tag 5` dialogue | Removed; restoring is described in the automatic section as the model's own `ctx_expand` call |
| Tools table lead-in | "Tools are registered at mount time…" | Adds: they are the model's tools, reached by asking in words |
| `§N§` term row | "The tag on a tool result; reclaim and expand both address items by it" | Adds that the reader never types it |
| Third/second items, memory and wrapup | unchanged | unchanged |

## Copy — English

First item under Common tasks, plus the paragraph added to What you get:

```
**You do not manage reclaim.** It runs as described above: the model stamps what it has finished
with, and the force band takes the rest at 85%. A reclaim lands on the next reclaim band rather
than immediately because rewriting the conversation invalidates the cache prefix. If a stamped
reclaim should land now rather than wait for that band, `/ctx-flush` makes queued ones land on
your next message. You never name a tag and you never pick which output goes.

Reclaimed output is not lost either. The tag stays a pointer, and when the model needs the
original — because a result it already consumed turns out to matter — it calls `ctx_expand` and
gets the text back as a new tool result; the placeholder stays where it was. That is an agent
move, not a user task: nothing in the UI asks you to pick a tag.
```

Tools lead-in:

```
The model calls these tools; you reach them by asking in words, not by typing ranges. The slash
commands below are yours to type.
```

Term row:

```
| `§N§` | The tag on a tool result; the model addresses items by it, and you never type it |
```

## Copy — Chinese

对应中文：

```
**这件事不用你管。** 回收按上面的方式自己进行：模型用完输出就打标记，压力到 85% 时强制带接手其余部分。
回收要等到下一个**回收带**才落地，因为改写会话会让缓存前缀失效；如果希望已经标记的回收现在就落地，
`/ctx-flush` 会让排队的条目在你下一条消息时落地。你不用报标签号，也不用挑哪一条该丢。

回收掉的内容也没有丢。标签仍然是一个指针——模型发现某个已经用过的结果现在又要用到时，会自己调
`ctx_expand`，把原文作为新工具结果返回，占位符留在原地。这是模型的动作，不是用户的任务：
界面上没有任何地方要你挑标签。
```

工具表引导句：

```
这些工具由模型调用：你用一句话提出需求，不需要自己写范围语法。下面的斜杠命令是给你直接敲的。
```

术语行：

```
| `§N§` | 工具结果上的标签；由模型按它定位条目，你不需要手写 |
```

## Checks

- The two fake tag dialogues are gone; the only `ctx_expand` example asks a question.
- `force band` + `protected window` + `85%` + default remain in one paragraph (T27 assertion).
- No new heading; h1/h2 counts unchanged.
- Anything else in either README that tells the reader to name a tag gets the same treatment
  (search for `tag 5`, `tags 4`, `号标签`).
- Run the T27 `readme-lint.mjs` and `link-check.mjs` copies: 82 checks / 0 failures, links 0
  failures.
- One read-only review against `src/dsh/reduce-guidance.ts` (who stamps), `src/dsh/pre-step.ts`
  (flush), and `src/dsh/tool-bridge.ts` (what `ctx_expand` returns).

## Release

Documentation only → `0.18.3`, after the ticket closes.

## Delivered deviations from this draft

- The tools lead-in no longer mentions `registerTools` / `registerStatusCommand`: the user asked
  that uncommon switches stay out of the README, so the sentence now just says the model calls
  the tools and the slash commands are for the reader. Both keys remain documented in
  `docs/configuration.md:35`.
- The `ctx_reduce` table row no longer prints the range syntax; it reads "queues outputs for
  reclaim (a range or a list)".
- The Chinese `ctx_expand` sentence had to keep "作为新工具结果返回" on one line: the T26 lint
  asserts exactly one statement of that semantics per file.
- The first item says the force band "drops unprotected output", not "takes the oldest": the
  order is by tool class, oldest only within a class (`src/dsh/emergency.ts:54-55,118-123`).
- Restoring moved out of *Common tasks* entirely: the user pointed out that a human never asks
  for a tag, so `ctx_expand` is described as the model's own move when it needs a consumed
  result, and the README states that no UI asks the reader to pick a tag.

Review round applied on top of the above (read-only review, NEEDS CHANGES):

- "the force band takes the rest at 85%" was wrong twice: it claimed blanket coverage and it
  skipped the protected window. Now "drops tagged results outside the protected window".
- The restore paragraph moved above the provider-overflow paragraph, because in the old position
  the nearest antecedent for its "either" was the overflow path, so it read as a claim about
  that path rather than about reclaim in general.
- Two dangling references to the deleted example were removed from the "changes since upstream"
  list; both bullets are now self-contained and say the tag stays spent and re-reclaiming it is
  refused as already dropped (`src/dsh/tool-bridge.ts:501-519`).
- "A reclaim lands on the next reclaim band" → "A queued reclaim…", so the force band's in-pass
  drop is not described as waiting.
