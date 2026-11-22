---
id: 39
type: story
title: "Pick the embedding model in the model field itself, and report the connection test"
parent: initiative-dsh-magic-context
covers: [src/client/index.js, tests/client-pure.spec.ts, docs/configuration.md, CHANGELOG.md, _bmad-output/initiative-dsh-magic-context/acceptance-windows-dsh-t39-model-picker-and-probe-feedback/]
after: [38]
refined: false
hitl: true
risk: medium
---

# Pick the embedding model in the model field itself, and report the connection test

## Description

Two interaction defects in the embedding section of the Web settings page.

1. Loading the model list appends a second `<select>` under the action row, while the
   `模型 ID` text field above it stays empty and editable. Two controls for one value, and
   the new one appears somewhere the reader was not looking.
2. `测试连接` writes nothing on success. `callEmbedding` clears the message on `ok:true`
   and only prints `远程错误: <code>` on failure, so a successful test looks like a no-op
   and a failure shows an English machine code.

## Requirements

1. **One control for the model.** The value stays on the `embedding.model` field. When the
   provider is remote, the model list has been loaded, and the current value is one of the
   loaded ids, that field renders as a select of the loaded ids plus a `手动输入模型 ID…`
   entry. The separate select under the action row is removed.
2. **No invented selection.** An empty model value stays a text input: a controlled select
   would render its first option while the stored value is still empty, which reads as a
   choice nobody made. The `手动输入模型 ID…` entry only switches the field to text mode and
   never becomes a stored value. A value outside the loaded list stays a text input showing
   that value; loading a list must not silently replace or blank a model id.
3. **The list belongs to one target.** Changing the provider, the preset, the endpoint or
   the model reference clears the loaded list, so a select can never offer another
   service's ids.
4. **Always a way back.** After a successful load, if the current value is empty or inside
   the new list, the manual mode resets; the text input also carries a `从列表选择…`
   affordance when a list is loaded, so manual mode is never a dead end.
5. **Say when the list arrived.** A successful load reports `已加载 N 个模型`; an empty list
   keeps the existing `无模型；可手动填写模型 ID` message.
6. **Report the test.** A successful `测试连接` shows `连接成功 · <model> · <dimensions> 维 · <ms> ms`
   and refreshes the status. A failed test shows one localised reason (认证失败, 密钥未配置,
   模型不存在, 请求过于频繁, 网络不可达, 请求超时, 向量维度不匹配, 服务端错误, 响应格式无效…)
   and falls back to `远程错误: <code>` for an unknown code.
7. **Every failure is readable.** The mapping covers every code the probe and the model
   list can return — including `model-required`, `endpoint-required`, `invalid-endpoint`,
   `blocked-endpoint`, `dns-failed`, `response-too-large`, `dimensions-changed`,
   `cache-write-failed`, `not-ready` — and the fetch/JSON catch paths classify into
   `network` / `invalid-response` instead of echoing a browser message.
8. **Same verdict for the other actions.** Start, pause, resume and rollback keep their
   existing behaviour; this ticket only changes the model field and the result line.
9. **Docs and tests.** `docs/configuration.md` describes the picker and the result line;
   `CHANGELOG.md` records the change; pure helpers are pinned in
   `tests/client-pure.spec.ts`; one real Web gate drives the settings page against a fake
   embedding endpoint and is stored under the evidence directory in `covers`.

## Non-goals

- No server, schema, resolver or credential change; the model-list request is unchanged.
- No new presets and no model-id validation against a catalogue.
- No dsh-go change: its form is generated from the schema and has no picker.
- No version bump or release inside this ticket.
