# T31 验收报告：选本地 MiniLM 时收起远程向量配置

## 结论

Web 设置页在 `embedding.provider` 为 `local` 或 `off` 时隐藏 12 项远程向量配置，
切到 `openai-compatible` 立即恢复；隐藏字段的未保存草稿会被丢弃，已保存的值不被清空。
本地/关闭时不产生远程请求，配置解析仍会读这些键，但没有任何本地路径使用它们的值。

手机端不能条件隐藏（dsh-go 只支持静态 `hidden`），改为在 schema 文案上标注「仅远程」，
并向上游提了能力请求 https://github.com/ccch1mneyyy/dsh-Go/issues/1569。

隔离 Web 宿主门禁：**32 项断言，0 失败，0 console error**。

## 改动

| 位置 | 内容 |
|---|---|
| `src/client/index.js` | `REMOTE_ONLY_EMBEDDING` 与 `embeddingFieldVisible(key, provider, keyStored)`：provider 先 trim+小写（与 `resolveEmbeddingConfig` 一致）；分区的 common/advanced 按草稿 provider 过滤；`plan()`、无效计数、自动聚焦都跳过隐藏字段；provider 变化时（不只是下拉事件）丢弃这些字段的草稿；本地/关闭时隐藏密钥行、模型下拉和隐私提示，改为显示下载说明；若凭据库里存着密钥，密钥行仍然保留，不必切回远程才能删除 |
| `src/index.ts` | 12 个远程字段的 description 改为「名称（仅远程）」/ `Remote provider only`；`preset` 为「服务预设（本地不适用）」/ `Preset (not used by local MiniLM)` |
| `tests/client-pure.spec.ts` | 12 个键逐一断言 local/off 隐藏、remote 显示；大小写变体按远程处理；存有密钥时密钥行可见；这 12 个键恰好覆盖除 provider 外的全部 embedding 字段 |
| `tests/config-schema.spec.ts` | 逐项固定中文标签原文、英文 hint 原文，并断言中文 ≤18 runes |
| `README.md` / `README.zh-CN.md` | 说明手机端为什么仍然显示这 12 项；同时修正词表里「模型在包内」的错误（模型在首次使用时下载） |

隐藏不是清空：值仍保存在配置里。证据见 `evidence/profile-patch-after-gate.yml`——
provider 最终为 `provider: local`，`endpoint: http://127.0.0.1:4461/v1` 保留，
切换过程中输入但未保存的 `never-saved` 值没有写进文件（`hidden-draft-dropped`）。

## 手机端为什么只是标注

dsh-go 的 schema 表单只认静态 `meta.hidden`（`schema_fields.dart:82-85`），
`SchemaMeta`（`engine_settings_api.dart:36-84`）没有依赖其他字段值的表达式。
静态隐藏会把远程用户需要的配置一起藏掉，所以没有采用。
中文标签在 18 rune 标题上限内可以带「仅远程」；英文放不下，超过上限的描述会变成行内 hint，
标题回退到宿主自带的键名。桥接层不拦截这个键（`plugin-config.js:186` 只在敏感节点按白名单裁
未知 meta），所以上游只需要改 App。

## 门禁运行

- 宿主：DSH 0.2.2-rc.1，隔离根 `C:\Users\elvis\AppData\Local\Temp\opencode\dsh-mc-t31-20261119-220337`，profile `t31`，默认 `provider: local`
- 包：`C:\Users\elvis\AppData\Local\Temp\opencode\t31-pack\elvisw-dsh-magic-context-0.18.6.tgz`，SHA-256 `25a9cdc949d38b98247436b9bd75a2e8f811a06a414a428f3165dc175efaf856`，4071264 bytes / 71 files
- 步骤：`evidence/ui-gate.json`；截图：`screenshots/t31-local-hidden.png`、`t31-remote-shown.png`、`t31-back-to-local.png`
- 最终包与门禁包字节相同：SHA-256 `25a9cdc949d38b98247436b9bd75a2e8f811a06a414a428f3165dc175efaf856`，4071264 bytes（`changedMembers: []`）

## 其它检查

`npm test` 85 files / 1052 tests、`npm run typecheck`、`npm run check:i18n`、`npm run build` 全部通过。

## 未覆盖

- 浏览器里没有驱动“隐藏字段里的非法数字”：`input[type=number]` 会丢弃 `abc`，构造不出草稿。
  该路径由同一个 `specVisible` 谓词在 `plan()`、无效计数与自动聚焦三处覆盖，并有 12 键并集断言防漏项。
- 没有在 Android 真机跑：手机表单由宿主渲染，本轮没有改宿主；schema 文案由
  `tests/config-schema.spec.ts` 固定。等上游支持条件显示后再做真机验收。
- 英文手机标签回退成宿主自带的常用键名（如 endpoint → Base URL），这是宿主行为，本插件只能控制
  hint 文案。

## 复核记录

独立 diff 复核（deepseek-v4.1-flash）给出 2 Critical / 6 Fix，全部处理：
模型不是包内（文案改为首次使用下载）；README 的英文标签描述不准确；中文标签只固定了 3 条
（改为 12 条逐项固定）；provider 大小写（谓词内 trim+lower）；快照刷新后草稿未清理（改为按
provider 变化清理）；本地仍显示隐私提示（只在远程显示）；存有密钥时密钥行被隐藏（保留）；
gate 只覆盖 8 个键（改为 12 个）。另接受其一条相关性修正：文档里“只有远程路径读取”改为
“本地/关闭路径不使用这些值，配置解析对所有 provider 都跑”。
