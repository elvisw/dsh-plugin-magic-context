# 0.18.6 发布记录

## 内容

- 设置页按向量提供方收起远程配置（T31）：选本地 MiniLM 或关闭语义检索时，12 项远程字段、
  密钥状态行、模型下拉与隐私提示一起隐藏，换成一行说明；切回 OpenAI 兼容立即恢复。
- 手机端 schema 文案：12 项标「仅远程」，`preset` 写「服务预设（本地不适用）」；原因是 dsh-go
  只支持静态 `hidden`，已提上游请求 ccch1mneyyy/dsh-Go#1569。
- README 修正：手机端为什么仍然显示这 12 项；词表里「模型在包内」改为首次使用下载。

本次没有改配置键、没有迁移、没有新增路由。

## 版本与标签

- `package.json` 0.18.6；tag `v0.18.6` 指向 `94d683c895b3bf829861b13dcf2fe6c5347a771d`，release workflow 成功。

## registry 校验

| 项 | 结果 |
|---|---|
| `dist-tags.latest` | 0.18.6 |
| `dist.integrity` 与本地 sha512 | 一致（True） |
| `dist.shasum` 与本地 sha1 | 一致（True） |
| 解包成员 | 71 个 |
| registry tarball 与本地包 | 逐字节相同（True），4071264 bytes，SHA-256 `25a9cdc949d38b98247436b9bd75a2e8f811a06a414a428f3165dc175efaf856` |

本地包就是隔离宿主门禁跑过的那个（`acceptance-windows-dsh-2026-11-19-t31-local-hides-remote`），
所以门禁覆盖的字节与 registry 上的 0.18.6 是同一份；没有另起一套安装 smoke。

## 验证

- 门禁：隔离 DSH 0.2.2-rc.1，32 项断言，0 失败，0 console error。
- `npm test` 85 files / 1052 tests、typecheck、`check:i18n`、build、README lint 82/0 全过。
- 已在日常 `web` profile 升级到 0.18.6，`--dump-config` 保留 `registerCompactionEngine: true`、
  historian 路由与 `reasoningEffort: low`。
