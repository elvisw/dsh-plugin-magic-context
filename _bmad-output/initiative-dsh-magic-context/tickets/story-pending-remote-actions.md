---
id: 38
type: story
title: "Offer Load models and Test as soon as the provider draft is remote"
parent: initiative-dsh-magic-context
covers: [src/client/index.js, tests/client-pure.spec.ts, _bmad-output/initiative-dsh-magic-context/acceptance-windows-dsh-t38-pending-remote-actions/]
after: [37]
refined: false
hitl: true
risk: low
---

# Offer Load models and Test as soon as the provider draft is remote

## Description

Draft a provider switch to `OpenAI-compatible` without saving: the card shows only 刷新 / 高级 /
保存密钥 / 清除凭据. `embeddingActionState` derives `remote` from the **saved** status
(`state !== 'local' && state !== 'remote-off' && ...`), so `load.hidden` and `test.hidden` stay true
until the provider is saved. A user who selects SiliconFlow, saves the API key (which saves on its
own), and then looks for the model list never sees 加载模型.

Reproduced on the rc.5 Web host: after the draft switch the button set is `[重置, 重置, 保存密钥,
清除凭据, 刷新, 高级]`; after Save it becomes `[…, 加载模型, 测试连接, 开始重建向量]`.

## Requirements

1. When the provider draft is `openai-compatible`, show 保存并加载 and 保存并测试 even if the saved
   status is still local. They already save first (`saveThen`). 保存并加载 must also be enabled on
   that path (an empty model is fine); 保存并测试 stays visible but disabled until a model is set.
2. Start, pause, resume and rollback stay bound to the saved/armed state; do not offer them before
   the provider is saved.
3. No change when the saved provider is already remote, and no change to the resolved config or the
   models request.
4. Unit test pins `embeddingActionState({ state: 'local', remoteDraft: true })` and the unchanged
   default.
5. One real Web gate: fresh local profile, draft switch, click 保存并加载, provider written, model
   list rendered as a select, chosen model saved.

## Non-goals

- No auto-load of the model list on every render.
- No change to the model input itself or to the response parsing.
- No version bump in this ticket.
