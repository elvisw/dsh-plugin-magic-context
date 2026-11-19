---
title: README warranty and lawful-use statement
ticket: 29
status: draft
---

# Plan — warranty and lawful-use statement

## Placement

End of `## Provenance and license`, immediately before the closing line that links NOTICE and
LICENSE. That line then reads as the pointer to the operative text, which is where it belongs.
No new heading: the lint asserts `h1 === 1`, `h2 === 12`, `h3 === 0`.

## Copy — English

```
**No warranty; your data is your responsibility.** The software is provided "as is", with no
warranty of any kind, as the MIT license states. It rewrites conversation history and drops tool
output by design, and it keeps memories in local SQLite files — back up anything you cannot afford
to lose. The maintainer is not liable for data loss, provider charges, or other damages arising
from its use.

**Lawful use is your responsibility.** Nothing here grants permission to break the law or infringe
the rights of others; follow your local laws.

**Third-party services.** Model providers, embedding endpoints and other applications are governed
by their own terms and billing. These paragraphs are a plain-language summary, not legal advice;
`LICENSE` is the operative text.
```

## Copy — Chinese

```
**不提供担保，数据请自己备份。** 本软件按 MIT 许可证以“现状”提供，不附带任何明示或默示担保。
它会按设计改写对话历史、丢弃工具输出，并把记忆保存在本地 SQLite 文件里——无法承受丢失的数据
请自行备份。因使用本软件造成的数据丢失、模型费用或其他损失，维护者不承担责任。

**合法使用由你负责。** 本仓库没有授予你违法或侵犯他人权利的许可；请遵守当地法律。

**第三方服务。** 模型提供商、向量服务与其他应用各有自己的条款与计费。
以上是便于阅读的说明，不构成法律意见；以 `LICENSE` 原文为准。
```

## Delivered deviations from this draft

- "the dsh-go app" → "other applications" / "其他应用": the plugin is a DSH plugin and is not
  tied to dsh-go, so naming that app was too specific.
- The Chinese lawful-use sentence is "请遵守当地法律", per the user's wording, and the English says
  "follow your local laws" so the two carry the same instruction.

## Why not stronger wording

- "The author is not responsible for anything" cannot be enforced for gross negligence or against
  mandatory consumer rights in most jurisdictions, and it reads as a promise the maintainer cannot
  keep. The MIT text already carries the operative disclaimer.
- "You must use it only for lawful purposes" would read as an added license condition, while MIT
  grants use "without restriction". Phrasing it as the user's responsibility avoids that conflict.
- Templates copied from the web come with unknown provenance and jurisdiction assumptions; if the
  user wants a stronger legal position, that needs a lawyer, not a search.

## Checks

- The three paragraphs sit inside the existing section; heading counts unchanged.
- The wording names data loss, provider charges, and lawful use; it does not claim
  "bug-free", because no disclaimer can promise that either.
- English and Chinese say the same thing.
- `readme-lint.mjs` 82 checks / 0 failures; `link-check-t29.mjs` 0 failures.
- One read-only review against `LICENSE` and against the plugin's real data behaviour
  (`src/index.ts` surface rewriting, `src/core/stores.ts` data dir, `src/dsh/emergency.ts` drops).

## Release

Documentation only → `0.18.4`, after the ticket closes.

## Review outcome

PASS with no Critical. Two wording suggestions were raised:

- "provider charges" → 中文「提供商费用」. Applied: the plugin can bill embedding calls, not just
  chat models, so 模型费用 was too narrow.
- "embedding endpoints" → 「向量服务」. Kept as a readable rendering, not a literal one.

The review also confirmed that the three paragraphs add no license condition, do not widen the
liability exclusion past `LICENSE`, and match the code paths that rewrite the surface, drop tool
output, and keep the databases in the local data directory.
