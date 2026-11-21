# T36：市场条目滞后时改用命令行安装

**结论：文档已改。** 两份 README 的 Android 小节与 `docs/configuration.md` 现在都说明 dsh-go 市场目录可能落后于 npm，并给出在手机本机终端安装的路径。

## 改了什么

| 文件 | 变化 |
|---|---|
| `README.md` | Android 小节的安装段改为：市场目录由另一个仓库的 watcher 提 PR、合并后才更新，因此可能落后于 npm 或暂时没有该版本；命令改为不带版本号的 `dsh plugin --profile web add @elvisw/dsh-magic-context`，并说明固定版本用 `@<version>`、当前版本从 `npm view … dist-tags.latest` 取 |
| `README.zh-CN.md` | 同段落的中文同义改写，结构与英文对应 |
| `docs/configuration.md` | `## Android 上的配置` 开头补同一回退路径（一句命令 + 重启引擎） |

删掉了示例里过期的 `@0.18.6` 固定版本。出处与历史段落里的旧版本号（`0.18.6` 的差异列表、`v0.18.0` 截图链接等）保持不变，它们是记录而非当前指令。

## 验证

| 检查 | 结果 |
|---|---|
| README 结构快照 `readme-lint.mjs`（82 项） | 改动前后都是 0 失败。before 在 `git HEAD` 的 README 副本上跑，after 在工作树上跑，两份证据各自带运行时间与 README SHA-256，见 [evidence/readme-lint-before.json](evidence/readme-lint-before.json)、[evidence/readme-lint-after.json](evidence/readme-lint-after.json) |
| 段落断言 | 三份文件都同时出现「市场可能滞后」与「本机终端命令行安装」；命令中无钉死版本号 |
| `git diff --check` | 通过 |
| 产品门禁 | 未跑。本次没有产品代码、`package.json` 或构建输入变化（工作树只多了文档、票面与证据文件） |

## 措辞边界

- 不承诺市场更新需要多久；写的是「什么时候合并不由本包决定」。
- 不归咎维护者；只描述 watcher 提 PR、合并后生效的机制。
- 背景数据（2026-11-21 实测 npm `latest` 0.18.9、市场 sidecar 0.18.0、更新 PR #96 停在 0.18.8）只留在票面与报告里，不写进 README。

## 未覆盖

- 没有在手机上打开市场核对当前显示（本次只改文档）。
- 市场条目何时追到 0.18.9 不在此票范围；PR #96 的合并仍由市场维护者决定。
