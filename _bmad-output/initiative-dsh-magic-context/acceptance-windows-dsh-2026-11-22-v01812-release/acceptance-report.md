# 0.18.12 发布记录

**结论：`@elvisw/dsh-magic-context@0.18.12` 已发布。** 这是 T39 的补丁发布：模型选择改到「模型 ID」字段本身，并给「测试连接」加上可见结果。

## 版本内容

- 向量检索的模型改在 **模型 ID** 字段本身选择。选了服务预设并加载模型列表后，该字段就是下拉框，首项是
  「请选择模型…」空选项，所以没选模型时不会显示成某个模型；末尾的「手动输入模型 ID…」把同一字段切回
  文本框。**没有选择预设时字段始终是文本框**，也不出现「从列表选择…」。改动提供方、预设、接口地址或
  密钥引用会清空已加载列表；已保存的 ID 不在列表里时保持文本框原样显示，可用「从列表选择…」显式换掉。
- 「测试连接」现在给出结果：成功为「连接成功 · 模型 · N 维 · ms」，失败为中文原因（认证失败、密钥未配置、
  模型不存在、限流、网络、超时、维度不匹配等），只有未知错误码才回退到原始代码。
- 原先在动作行下方突然出现的第二个下拉已删除。

## 已核对

| 项 | 值 |
|---|---|
| npm `latest` | `0.18.12` |
| tag / gitHead | `v0.18.12` → `<待填>` |
| release workflow | `<待填>` |
| tarball | 4,081,166 B / 71 members / SHA-256 `7c66a968bdf5b83323a73949ca4bfe1ea100580f6e091f69a551552469b39c40` |
| `dist.integrity` / `shasum` | 与下载字节重算一致 |
| 与 0.18.11 差异 | 71 个成员中 4 个变化：`package.json`（版本）、`lib/client.js`（修复）、`README.md`、`README.zh-CN.md`（累计版本号）；无新增/删除成员；`vendor/**` 未变 |
| 日常 `web` profile | 0.18.11 → 0.18.12，`magic-context-dsh`、verify 路由、`registerCompactionEngine: true` 保留 |

## 门禁

- `npm test -- --maxWorkers=4`：85 文件 / 1056 用例通过（`evidence/unit-test.txt`）
- `npm run typecheck`、`npm run check:i18n`、`npm run build`：全部 exit 0
- 隔离宿主 Web 门禁：`_bmad-output/initiative-dsh-magic-context/acceptance-windows-dsh-t39-model-picker-and-probe-feedback/`
  的 33 步 0 失败，跑在 `lib/client.js` 与本版逐字节相同的候选包上；本版相对该候选只改了
  `package.json` 的版本号与 CHANGELOG / README，因此未重跑宿主门禁。

## 未覆盖

- 未用真实硅基流动密钥跑模型列表；门禁用的假端点只验证协议与鉴权头。
- 「未选择预设」这一分支无法从界面制造（预设下拉只有 `siliconflow` / `custom`），只由纯函数单测覆盖。
- 桌面应用、Android 与其他 DSH 版本未测。
- 日常 profile 需重启宿主后加载 0.18.12。
