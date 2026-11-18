# 0.18.0 发布与 dsh-go 市场投稿

目标：发布 T23 Android 原生适配与 T24 桌面凭据录入，不改运行时代码或日常 profile，并向 dsh-go 市场提交精确版本的目录条目。用户已授权 Git 推送、npm 发布和市场投稿。

- [x] 核实远端 main 基线、npm 当前版本、官方市场投稿格式与顺序。
- [x] T23 Android 本机 gate、T24 桌面 gate、T24 本地 MiniLM WASM 真机探针完成；Android 原生密钥字段仍受 dsh-go bridge 限制（issue #1493），不在发布中声称通过。
- [ ] 仅更新版本、兼容性元数据和用户文档；一次独立只读复核。
- [ ] 本地单次测试与打包；核对除发布元数据和 README 外，包内容与 T24/0.18.0 候选逐成员一致。不重跑手机或桌面宿主验收。
- [ ] 把 T23、T24 和发布提交推送到 main，等待 CI；再推 v0.18.0，由现有 Trusted Publishing 工作流发布。
- [ ] 验证实际 npm `latest`、完整性及 provenance，比较 registry tarball 与本地包。
- [ ] 依据官方仓库规则投稿，只改一个 JSON；核实 PR、审核状态、正式索引。索引未出时保留跟进，不宣称 App 可见或已从市场安装。

来源：[DSH Go 发布与上架](https://github.com/ccch1mneyyy/dsh-Go/blob/main/docs/plugins/market.md) · [市场仓库规则](https://github.com/ccch1mneyyy/dsh-go-market#提交插件) · [T23 真机验收](../acceptance-android-dsh-go-2026-11-17-t23/acceptance-report.md) · [T24 桌面与本地模型](../acceptance-windows-dsh-2026-11-18-t24-credential-key/acceptance-report.md)。
