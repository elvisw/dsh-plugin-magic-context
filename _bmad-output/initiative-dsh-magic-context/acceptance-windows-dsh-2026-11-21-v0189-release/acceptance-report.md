# T35 发布记录：0.18.9 已在 npm registry 生效

**结论：`@elvisw/dsh-magic-context@0.18.9` 已发布，registry 字节与本地候选逐字节相同，日常 `web` profile 已升级；DSH `0.2.2-rc.5` 上不再因版本声明跳过插件。**

## 已核对

| 项 | 值 |
|---|---|
| npm `latest` | `0.18.9` |
| tag | `v0.18.9` → `4519148`，`gitHead` 一致 |
| release workflow | `44857243965`，成功（typecheck / test / build / i18n / inspect / publish） |
| tarball | 4,071,977 B / 71 members / SHA-256 `1e6a0b9c…a3deb2f` |
| vs 本地候选 | 成员逐一相同，`changedVsLocalCandidate: []`，`lib`/`vendor` 一致 |
| `dist.integrity` / `shasum` | 与下载字节重算一致 |
| attestation | `publish/v0.1` 与 `slsa.dev/provenance/v1` 两条，subject `sha512` 与本地 tarball 的 hex `aad605dd…ea12d` 相同 |
| 日常 profile | `dsh plugin --profile web add @0.18.9` 成功 |

日常 `web` profile 的 `--dump-config` 仍显示 `magic-context-dsh` 行、`verifyProvider: commandcode`、`verifyModel: deepseek/deepseek-v4.1-flash`、`historian.reasoningEffort: low`、`registerCompactionEngine: true`。

证据：[registry-verification.json](../acceptance-windows-dsh-2026-11-21-t35-rc5-support/evidence/registry-verification.json)；发布字节的 SHA-1/SHA-256/SHA-512 见 [registry-tarball.json](evidence/registry-tarball.json)。4 MB 的 tarball 本身不随仓库提交，可按该文件里的 URL 重新下载并核对。

## 未覆盖

- 未在真实 DSH `0.2.2-rc.5` 上重跑运行期会话：T35 已证明该字节通过安装器与启动加载、设置入口渲染；T34 的回收/取回/重启检索结论来自仅差 `package.json` 与 README 的重打包候选，`lib`/`vendor` 与本次发布字节逐字节相同。
- 桌面应用、Android 与其他 DSH 版本未验证。
- 日常 profile 需要重启宿主后才会加载新版本。用户于 2026-11-21 重启电脑端 web profile 后反馈正常，跳过插件的提示不再出现（用户观察，未另行抓取宿主日志）。
