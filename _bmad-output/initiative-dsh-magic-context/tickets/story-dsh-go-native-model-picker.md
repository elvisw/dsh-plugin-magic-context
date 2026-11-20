---
id: 33
type: story
title: Select summary and verification models in dsh-go native plugin settings
parent: initiative-dsh-magic-context
after: []
refined: false
hitl: true
risk: medium
---

# Select summary and verification models in dsh-go native plugin settings

## Description

用户在 Android dsh-go 原生插件设置中从当前引擎的模型目录选择摘要模型和维护验证模型，不再手录两个 ID。宿主发版前只提供 Web 配置指引，不改插件功能。

## Requirements

Verify: 上游发版前，核对 Issue 正文和三份文档的本机 Web 路径。发版后，先核对宿主实际接口再细化票面；届时在一台 Android 手机上选好两组服务和模型、保存并重开确认，再清空并确认原有默认行为。

## References

- parent — `_bmad-output/initiative-dsh-magic-context/initiative-dsh-magic-context.md`，dsh-go 移植调研与计划。
- upstream — [dsh-go #1648](https://github.com/ccch1mneyyy/dsh-Go/issues/1648)。
- companion — `_bmad-output/initiative-dsh-magic-context/dsh-go-port/upstream-plugin-model-picker.md`，公开 Issue 正文。

## Notes

- Decision: 2026-11-21 — 只提摘要模型和维护验证模型；远程向量的模型列表不在范围内。等 dsh-go 发布原生插件表单支持后再实现，本轮不改产品代码、不发版。
- Risk: 选错服务或模型会造成摘要或验证调用使用非预期的模型，因此采用中等风险；实际交互和旧配置回退按上游发布的接口确认。
