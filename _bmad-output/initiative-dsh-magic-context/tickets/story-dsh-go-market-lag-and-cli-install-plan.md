---
title: "Tell users what to do when the dsh-go market entry lags behind npm"
ticket: 36
created: '2026-11-21'
status: built
baseline_revision: 'dfb9f1d'
route: quick
route_source: pinned
risk: low
review: read-only
review_source: pinned
lenses_ran: []
review_loop_iteration: 0
context: []
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

用户要求：dsh-go 市场的插件条目不一定及时跟上 npm 发布，出现这种情况时用户应被明确告知可以改用命令行安装。把这条事实与命令写进两份 README 的 Android 小节和 `docs/configuration.md`。

## Boundaries & Constraints

**Always:** 只改文档；市场滞后只说「可能滞后、可能还没有这个版本」，不给时长承诺、不归咎维护者；失败回退命令是手机本机终端里的 `dsh plugin --profile web add <包名>` 后重启引擎；保留 README 的 12 个二级标题结构与既有 lint 断言。

**Never:** 不改市场仓库、watch 工作流或 PR #96；不改产品代码、配置 schema、版本号；不为这次文档改动加减 CHANGELOG 条目；不改出处/历史段落里既有的旧版本号提及。

| 输入 | 预期 | 未达到时 |
|---|---|---|
| 两份 README 的 Android 小节 | 说明市场条目可能滞后，给出本机终端安装命令与固定版本的方法 | 缺任一项即补，不以「见市场」代替 |
| `docs/configuration.md` Android 节 | 同一指令 | 补上；不重复整段 README |
| `readme-lint.mjs`（2026-11-19 快照） | 0 失败 | 先修文档，不放宽断言 |

</frozen-after-approval>

## Code Map

- `README.md` `## Android`（约 214-231 行）：现状是「Once the market entry is available … If it is not there, install the exact version」，示例钉在 `@0.18.6`。
- `README.zh-CN.md` `## Android`（约 181-194 行）：同上，中文。
- `docs/configuration.md` `## Android 上的配置`（65 行起）：只讲配置，不含安装命令。
- `_bmad-output/initiative-dsh-magic-context/acceptance-readme-automatic-reclaim-2026-11-19/evidence/readme-lint.mjs`：结构快照断言（12 个 h2、无 h3、单行 ≤400 字符、单行 ≤5 链接、若干 exactly1 措辞）。

## Tasks & Acceptance

- [x] 改 `README.md` 的 Android 小节：说明市场条目由市场仓库的 watcher 工作流提 PR、合并后才更新，因此可能落后于 npm 或暂时没有这个版本；给出本机终端 `dsh plugin --profile web add @elvisw/dsh-magic-context`，并说明要固定版本就加 `@<version>`（用 `npm view @elvisw/dsh-magic-context dist-tags.latest` 取当前版本），然后重启引擎。
- [x] `README.zh-CN.md` 同段落做同义改写，保持中英结构对应。
- [x] `docs/configuration.md` 的 `## Android 上的配置` 增补同一回退路径（简短，指向 README 的完整说明）。
- [x] 用 `readme-lint.mjs` 快照跑一次，0 失败；`git diff --check` 通过。

**Acceptance Criteria**

- 给定两份 README 与 `docs/configuration.md`，都能读到「市场可能滞后」与「用本机终端命令行安装」两件事，且命令里没有钉死的旧版本号。
- 新增措辞不出现时长承诺、不出现「维护者没更新」这类归因。
- `readme-lint.mjs` 82 项 0 失败；产品字节未变，因此不重建宿主、不跑产品门禁、不打包。

## Implementation Notes

- 2026-11-21 实测（`checkedAt 03:14Z`）：npm `latest` 0.18.9；市场 sidecar `generatedAt 2026-11-21T01:47:48Z` 仍列 0.18.0；市场仓库 watcher 已开 PR #96（0.18.8，CLEAN 未合并）。这条只作背景，不写进 README。
- 手机端安装路径与 T23/T24/T25/T32 脚本一致：`dsh plugin --profile web add <spec>`，profile 是 `web`。

## Plan Change Log

## Review Triage Log

- 独立票面校验（`deepseek-flash`）：NEEDS CHANGES。三条 Fix 全部成立：①把 watcher 说成「发布后自动同步」不实，实际只开 PR、合并才生效；②要求 2（教用户固定版本）与要求 4（示例不得有陈旧版本号）冲突，需明确用占位符 + `npm view` 取值；③`CHANGELOG.md` 进了 covers 但没有任何要求覆盖它，而 lint 快照脚本不在 covers 里。已改为保留前两条措辞准确性、covers 去掉 CHANGELOG、verify 点名 lint 快照脚本与「产品字节未变不重跑门禁」。另采纳 Suggest：示例改动只限 Android 安装块，出处/历史里的旧版本号不动。

## Review Triage Log (round 2)

- 独立文档复核（`deepseek-flash`）：PASS，三条非阻塞建议。①「after each npm release」偏强，已改为「when npm has a newer version」/「只在 npm 上有更新版本时」；②报告写「只改 Markdown」不准，已改为「文档、票面与证据文件」；③before/after 两份 lint 证据字节相同、无法区分布局，已把 before 改成在 `git HEAD` 的 README 副本上重跑，两份各自记录运行时间与 README SHA-256，并附 after 的 SHA 与当前文件一致的核对。

## Verification

- 文档层验证：两份 README 与 `docs/configuration.md` 的段落断言 + `readme-lint.mjs` 快照 82 项 0 失败 + `git diff --check`。
- 不跑 `npm test`、不重建隔离宿主、不重新打包：本次没有产品代码、`package.json` 或构建输入变化。
