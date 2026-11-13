# 指定竞品：四项承重事实核查

核查日期：2026-11-09。对象：`wk544863858/dsh-plugin-magic-context`，固定提交 `93ef5fe4a06a2c05f53e6a6225346919e860d74e`。

仅以 `named-competitor.md` 确定待核查声明；证据为本次重新取得的 npm registry、GitHub Actions API、远程仓库源码及文档。未安装包、未运行插件、未修改原摘要或项目配置。工具调用共 6 次，含一次被 shell 扫描器拒绝的调用及本文件写入。

## 判定口径

- **source-supported**：本次取回的第一方代码、文档或记录支持该声明；不等于独立实测。
- **independently-verified**：存在独立运行或不同数据来源的证据，且只对该证据实际覆盖的事实成立。托管第一方 README 的另一网站不算独立来源。
- 未获得独立运行或不同数据来源支撑的能力声明，标为 **unverified，confidence: medium**；这不是判为虚假。

## 1. npm 实际发行版本 0.11.1，且有近期 CI

**是否支持：是，限发行记录与 CI 状态。**

本次 registry 返回 `name=dsh-plugin-magic-context`、`version=0.11.1`、`gitHead=93ef5fe4a06a2c05f53e6a6225346919e860d74e`，并给出对应 `.tgz` 地址及完整性字段。

GitHub Actions API 返回两次运行均为 `completed / success`，且 `head_sha` 与上述 gitHead 相同：

- CI：创建于 `2026-11-07T14:56:31Z`，更新于 `2026-11-07T14:57:03Z`。
- Release：创建于 `2026-11-07T14:57:36Z`，更新于 `2026-11-07T14:58:19Z`。

来源 URL：
- https://registry.npmjs.org/dsh-plugin-magic-context/latest
- https://github.com/wk544863858/dsh-plugin-magic-context/actions/runs/42383941346
- https://api.github.com/repos/wk544863858/dsh-plugin-magic-context/actions/runs/42383941346
- https://github.com/wk544863858/dsh-plugin-magic-context/actions/runs/42384021323
- https://api.github.com/repos/wk544863858/dsh-plugin-magic-context/actions/runs/42384021323

**过度断言：**不得由此推导第三方安装成功、包中全部能力可用、测试充分或 Windows 兼容。本次未下载 tarball，也未验证其内容与 gitHead 的对应关系。

**独立证据有无：**有不同数据来源的窄范围证据：npm registry 的分发记录与 GitHub 的实际运行状态，不是作者 README 的转述。上述记录事实可列 **independently-verified（仅记录层）**；安装成功及运行能力仍为 **unverified，medium**。CI 定义与提交仍由项目方控制，不是第三方验收。

## 2. 工具恢复读取原始 content，不是重新执行

**是否支持：是，source-supported（源码路径）。**

`defineCtxExpandTool` 对当前 surface 的占位符匹配 tag，调用 `originalContentOfPlaceholder(session, placeholder.seq)`，再调用 `replaceToolResultContent(session, placeholder.seq, original)`。

`originalContentOfPlaceholder` 从 `session.snapshotEvents()` 查占位符，要求其 `sourceEventSeqs` 只有一项，按该序号找到原 `tool/result`，返回 `[...original.data.message.content]`。替换函数追加 `tool/result`，设置 `surfaceOp: { op: 'replace', ... }`。这条恢复路径没有重新派发原工具，也没有调用模型生成摘要。

来源 URL：
- https://github.com/wk544863858/dsh-plugin-magic-context/blob/93ef5fe4a06a2c05f53e6a6225346919e860d74e/src/dsh/tool-bridge.ts
- https://github.com/wk544863858/dsh-plugin-magic-context/blob/93ef5fe4a06a2c05f53e6a6225346919e860d74e/src/dsh/seams.ts

**过度断言：**不能外推为任意历史均可恢复、跨所有宿主版本可用、重启后已实测一致或 Historian 遮蔽后仍可恢复。源码明确存在“找不到占位符”和“原文不可恢复”的拒绝分支。

**独立证据有无：**无独立运行或第三方运行记录；**independently-verified: 否；unverified，confidence: medium**。此次源码核查支持机制，不构成运行复现。

## 3. 明确独立存储，不承担与 MC 存储互读兼容

**是否支持：是，source-supported（作者明确声明的边界）。**

`PARITY.md` §B8 明示：`Superseded 2026-10-13: the adapter owns its corpus`；自己的数据目录中直接读写 `memories.db`；`The legacy shared context.db is never opened`；`Upstream MC is followed for FEATURES only; there is no storage-compatibility obligation`。文档表格也标注存储自 2026-10-13 起为 own lineage。

来源 URL：
- https://github.com/wk544863858/dsh-plugin-magic-context/blob/93ef5fe4a06a2c05f53e6a6225346919e860d74e/PARITY.md

**过度断言：**摘要关于“独立语料、无存储兼容义务”的边界有直接文字支持；若把“不与 MC 互读”解释为已经测试证明双向读取绝对不可能，则超出证据。未审计全部 IO 路径、未运行两端数据库互读实验，也不能由本页证明永远不会提供迁移或导入工具。文档含旧版号，不能把整页都当作当前配置事实。

**独立证据有无：**无；这是维护者的产品边界声明，非独立兼容性测试。**independently-verified: 否；unverified，confidence: medium**。

## 4. Windows 尚未验证，不是已证明不可用

**是否支持：是，限已抽查的 CI 覆盖与证据状态。**

固定提交的 `.github/workflows/ci.yml` 只有一个 `test` job，`runs-on: ubuntu-latest`；矩阵为 Node `22.x`、`24.x`。步骤包含依赖安装、类型检查、测试、构建及 i18n 检查。该工作流没有 Windows runner。

来源 URL：
- https://github.com/wk544863858/dsh-plugin-magic-context/blob/93ef5fe4a06a2c05f53e6a6225346919e860d74e/.github/workflows/ci.yml
- https://github.com/wk544863858/dsh-plugin-magic-context/actions/runs/42383941346

**过度断言：**Linux CI 成功不能证明 Windows 可用；未见 Windows CI 也不能证明 Windows 不可用，或证明任何人从未在 Windows 测试。本次仅抽查摘要所引 CI 文件，未穷尽所有工作流或私人测试记录。

**独立证据有无：**没有 Windows 独立运行证据，亦无已取回的 Windows 失败证据。Windows 兼容性为 **unverified，confidence: medium**；“已证明不可用”不受本次证据支持。

## 不同 publisher / 独立能力证据尝试

除 npm registry 的不同分发数据来源外，本次通过 `gh search issues` 在作者仓库之外检索 `"dsh-plugin-magic-context" -repo:wk544863858/dsh-plugin-magic-context`，尝试取得其他发布者的能力复现或故障记录；返回 `[]`。

可复查搜索 URL：
- https://github.com/search?q=%22dsh-plugin-magic-context%22%20-repo%3Awk544863858%2Fdsh-plugin-magic-context&type=issues

该结果仅表示本次指定检索未命中，不能证明不存在第三方用户、没有 bug 或第三方能力复现不可能存在。未获得可以核验的不同 publisher 运行材料；没有将转载 README 计作独立证据。**承重能力的独立验证仍缺失，维持 unverified / medium。**
