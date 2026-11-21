# 0.18.11 发布记录

**结论：`@elvisw/dsh-magic-context@0.18.11` 已发布。** 这是 T38 的补丁发布：草稿切到远程后立即显示「保存并加载模型」与「测试连接」。

## 版本内容

- 修复：provider 草稿为 `openai-compatible` 时，向量卡片立即显示两个远程动作；点击「保存并加载模型」会先保存 provider 再拉模型列表。此前必须先保存 provider，用户先存好 API Key 后会找不到模型列表。
- 「开始重建向量」、暂停、继续、回滚仍按已保存/已武装状态出现，未改动。

## 已核对

| 项 | 值 |
|---|---|
| npm `latest` | `0.18.11` |
| tag / gitHead | `v0.18.11` → `c6e2c93960e4562357c8224c258c99a8b6133019` |
| release workflow | `44927164561`，成功（typecheck / test / build / i18n / inspect / publish） |
| tarball | 4,074,674 B / 71 members / SHA-256 `933fdd08…6d717f85` |
| `dist.integrity` / `shasum` | 与下载字节重算一致 |
| provenance | publish v0.1 与 SLSA v1，subject sha512 与包一致 |
| 与 0.18.10 差异 | 71 个成员中仅 2 个变化：`package.json`（版本）、`lib/client.js`（修复）；无新增/删除成员 |
| 日常 `web` profile | 0.18.10 → 0.18.11，`magic-context-dsh`、verify 路由、`registerCompactionEngine: true` 保留 |

证据：[registry-verification.json](evidence/registry-verification.json)、[pack-comparison.json](evidence/pack-comparison.json)。

## 门禁

- `npm test -- --maxWorkers=4`：85 文件 / 1053 用例通过（`evidence/unit-test.txt`）
- `npm run typecheck`、`npm run check:i18n`、`npm run build`：全部 exit 0
- T38 的 Web 门禁（14 步，0 失败）跑在与本版 `lib/client.js` 相同的字节上（0.18.10 候选），本版只改版本号与 CHANGELOG，因此未重跑宿主门禁

## 未覆盖

- 本版未用真实硅基流动密钥跑模型列表；T38 门禁的假端点只记录认证头存在与否。
- 桌面应用、Android 与其他 DSH 版本未测。
- 日常 profile 需重启宿主后加载 0.18.11。
