# 0.18.8 发布记录

## 内容

- 手机（dsh-go）会话上下文面板的组成环形图：系统 / 工具 / 消息三扇区，图例带数值与百分比。
- 图例在手机上只放得下两个汉字，因此环形图使用短标签；下方 keyValue 行保留全名。
- 修 T32 过程中发现的两个问题：同版本重装会被包管理器跳过（改为版本递增 + 安装脚本校验磁盘上的
  渲染器哈希）。

## 版本与标签

- `package.json` 0.18.8；tag `v0.18.8` 指向 `a72f808e3dd7d7983ae139f2c4c9afd603824216`，release workflow `44548281061` 成功。

## registry 校验

| 项 | 结果 |
|---|---|
| `dist-tags.latest` | 0.18.8 |
| `dist.integrity` 与本地 sha512 | 一致（True） |
| `dist.shasum` 与本地 sha1 | 一致（True） |
| 解包成员 | 71 个 |
| registry tarball 与本地候选包 | 逐字节相同（True），4071563 bytes，SHA-256 `c2e0b06d685db8e9e5523246d03c07b1a6af10ecff4793c9fb3878f2d712a6b1` |

本地候选包就是手机上装过并截图验收的那一份（T32 安装回执
`rendererMatches: true`），所以真机验收覆盖的字节与 registry 上的 0.18.8 相同；手机不需要重装。

## 验证

- 真机：会话面板显示三扇区环形图，图例 `系统 / 工具 / 消息` 完整可读（T32 报告）。
- `npm test` 1053、typecheck、check:i18n、build 全过。
- 日常 `web` profile 已从 0.18.6 升到 0.18.8，`--dump-config` 保留 `registerCompactionEngine: true`、
  historian `reasoningEffort: low`、verify 服务与模型。

## 补充

发布后对仓库 `_bmad-output` 做了一次隐私扫描：没有发现真实凭据；已从当前提交中移除测试机序列号，
并清理了本地未跟踪的 `__pycache__`。历史提交里仍保留该序列号（低敏，未重写历史）。
