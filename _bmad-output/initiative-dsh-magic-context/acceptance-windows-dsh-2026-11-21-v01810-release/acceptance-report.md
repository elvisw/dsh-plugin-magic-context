# 0.18.10 发布记录

**结论：`@elvisw/dsh-magic-context@0.18.10` 已发布。** registry 字节与本地候选逐字节一致，两条 provenance 的 subject 摘要都匹配，日常 `web` profile 已升级。

## 版本内容

- T37：服务预设决定接口地址（硅基流动固定 `https://api.siliconflow.cn/v1`，Web 隐藏地址与认证头输入）；
- T37：本地/关闭时不再显示密钥输入，已存凭据只留一行「清除已保存的密钥」；
- T36：README 与 `docs/configuration.md` 说明 dsh-go 市场条目可能滞后，给出命令行安装路径。

运行时解析器未改动，已有配置的请求目标不变。

## 已核对

| 项 | 值 |
|---|---|
| npm `latest` | `0.18.10` |
| tag / gitHead | `v0.18.10` → `4f1d07f3a83022ab06ca17f4314bd683b1709170` |
| release workflow | `44900658658`，成功（typecheck / test / build / i18n / inspect / publish） |
| tarball | 4,074,536 B / 71 members / SHA-256 `d3f1d9ae…9fc79d7` |
| `dist.integrity` / `shasum` | 与下载字节重算一致 |
| provenance | `publish/v0.1` 与 `slsa.dev/provenance/v1`，subject sha512 hex `bed05b02…aaab4b5` 与本地一致 |
| 与 0.18.9 差异 | 71 个成员中仅 5 个变化：`package.json`、`lib/client.js`、`lib/index.js`、`README.md`、`README.zh-CN.md`；无新增/删除成员 |
| 日常 `web` profile | 0.18.9 → 0.18.10，`magic-context-dsh`、historian `reasoningEffort: low`、verify 路由、`registerCompactionEngine: true` 保留 |

证据：[registry-verification.json](evidence/registry-verification.json)、[pack-comparison.json](evidence/pack-comparison.json)。

## 门禁

- `npm test -- --maxWorkers=4`：85 文件 / 1053 用例通过（`evidence/unit-test.txt`）
- `npm run typecheck`、`npm run check:i18n`、`npm run build`：全部 exit 0
- 上一篇 T37 验收已在 DSH `0.2.2-rc.5` 隔离宿主跑过 31 步 UI 门禁（0 失败）；本版相对该候选只多版本号与 README，`lib/client.js` 未再改动，因此未重跑 UI 门禁

## 未覆盖

- 桌面应用、Android 与其他 DSH 版本未测；手机端本次只随包更新 schema 文案，字段仍会显示（上游 #1569）。
- 没有用真实硅基流动密钥发起 embedding 请求。
- 日常 profile 需要重启宿主后加载 0.18.10。
