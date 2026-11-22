# T39 验收报告：模型在选择框内选定、测试连接给出结果

**结论：两项 UI 缺陷在真实 DSH Web 宿主上都已修复。** 加载模型后不再在动作行下方冒出第二个下拉——模型值就在 `模型 ID` 字段本身选择，并且空值有显式的「请选择模型…」选项；未选择预设时该字段始终是文本框。「测试连接」成功显示「连接成功 · 模型 · N 维 · ms」，失败显示中文原因而不是机器码。

## 被测对象

| 项 | 值 |
|---|---|
| 候选包 | `elvisw-dsh-magic-context-0.18.11.tgz`（本地候选，未发布） |
| SHA-256 | `10c464a26a51350294f1fdf84a864b8c7d037ac6e26cd8a24c399edb70b66063` |
| 字节 / 成员 | 4,081,171 / 71 |
| 宿主 | DSH `0.2.2-rc.5`（Node `v24.21.0`，记录在 `evidence/host-env.json`） |
| 环境 | 全新隔离根内 `t39` profile；`DSH_HOME`、`HOME`、`USERPROFILE`、`XDG_*`、`TEMP` 全部指向本次新根 |
| 嵌入端点 | 本地假 OpenAI 兼容服务（16 维，`fixture-embed-a/b`、`fixture-bad-auth`） |

## 范围与隔离

- 宿主是 DSH `0.2.2-rc.5`（Node v24.21.0），跑在 `%TEMP%\opencode\dsh-mc-t39-<时间戳>` 下的全新根里，
  `DSH_HOME` / `HOME` / `USERPROFILE` / `XDG_*` / `TEMP` / `APPDATA` / `LOCALAPPDATA` 与 pnpm、npm 缓存全部指向该根。
- 宿主不继承操作者真实的 `SILICONFLOW_API_KEY` / `OPENAI_API_KEY` / `ANTHROPIC_API_KEY`（脚本显式剔除）。
- `DEEPSEEK_API_KEY` 被设成一个**哨兵值**（`t39-gate-sentinel-not-a-real-key`，同时记录在 `evidence/host-env.json`），不是凭据：不设它时首启的「开始使用」对话框会盖住整个界面、设置页进不去。宿主因此会向 `https://api.deepseek.com/models` 发一次模型目录请求，该请求返回 401 后回退到内置目录（`evidence/server-log.txt` 记录了这一行），本票没有依赖它的任何结果。
- 宿主与 Node 版本取自 `evidence/host-env.json`（`dshVersion` / `nodeVersion`），不是从截图或人工判断得来。
- 嵌入端点只有一个本地假 OpenAI 兼容服务（16 维，三个模型），全部请求都指向它。

## 断言结果

`evidence/ui-gate.json`：33 步，**0 失败，0 console error**。

| 断言 | 结果 |
|---|---|
| 远程 + 未加载列表：模型字段是文本框 | 通过 |
| 预设下拉只有 `siliconflow` / `custom`，没有空选项（因此未选预设只能来自手改 profile，由纯函数单测覆盖） | 通过 |
| 加载后提示「已加载 3 个模型」 | 通过 |
| 加载后 `模型 ID` 字段本身是 `<select>`，全页只有一个列出 fixture 模型的 select，且它的 `id` 就是 `mc-field-embedding.model` | 通过 |
| 空值状态下该下拉的受控值为空，首项文本是「请选择模型…」且其 `value` 为 `''` | 通过 |
| 下拉列出三个模型 + 「手动输入模型 ID…」 | 通过 |
| 从下拉选 `fixture-embed-b` 并保存，profile 写入该 ID | 通过 |
| 测试连接成功：`连接成功 · fixture-embed-b · 16 维 · 6 ms` | 通过 |
| 改选模型后旧的结论行消失（不留旧模型的成功绿行） | 通过 |
| 被 401 拒绝的模型显示「认证失败：检查密钥是否有效」，不含 `auth-failed` | 通过 |
| 「手动输入模型 ID…」把同一字段变回文本框，保留当前值 | 通过 |
| 哨兵值 `__mc_manual_model__` 从未写入 profile | 通过 |
| 手动输入的列表外 ID 可保存 | 通过 |
| 再次加载列表：列表外的值仍是文本框且不被替换 | 通过 |
| 点「从列表选择…」回到下拉 | 通过 |

## 单元与静态检查

| 检查 | 结果 |
|---|---|
| `npm test -- --maxWorkers=4` | 85 文件 / 1056 用例通过（`evidence/unit-test.txt`） |
| `npm run typecheck` | 通过（`evidence/typecheck.txt`） |
| `npm run check:i18n` | ALL PASS（`evidence/i18n.txt`） |
| `npm run build` + `npm pack` | 通过，候选包即上文 SHA-256 |

## 实现要点

- 新增纯函数 `embeddingModelFieldMode`、`embeddingModelSelectValue`、`embeddingProbeResultText`、
  `embeddingVerdictText` 与 `EMBEDDING_ERROR_KEYS`，全部在 `tests/client-pure.spec.ts` 固化。
- 空值渲染为带显式空选项的下拉（`请选择模型…`，`value: ''`），因此受控 select 不会显示一个未被选择的模型；未选择预设时字段始终是文本框，也不出现「从列表选择…」。
- 「手动输入模型 ID…」是哨兵项，只切模式、不写值；列表外的值默认保持文本框，用「从列表选择…」显式进入下拉。
- provider / preset / endpoint / 密钥引用任一变化都清空已加载列表并清掉旧结论行；单独改模型 ID 也清掉旧结论行，避免把上一个模型的成功当成当前模型的结论。
- `测试连接` 走 `reportProbe` 分支，成功行带 `data-mc-embedding-result="ok"`，失败行为 `error` 并映射为中文原因；fetch 与 JSON 解析失败分别归为 `network` 与 `invalid-response`。
- 成功行按服务端实际返回的字段拼装：缺维度或延迟就省略该段，不会渲染 `null`；三者都缺时退回「连接成功」。
- 删除了 `renderEmbeddingTools` 里原来的 `model-select` 与 `modelOptions`。

## 历史证据

T38 的 gate 曾把「动作行下方出现下拉」写成断言（`acceptance-windows-dsh-t38-pending-remote-actions/evidence/ui-gate.json` 的 `model-select-rendered`）。本票把它视为被取代的旧标准，**没有改写该目录的任何文件**；T39 的断言只检查字段本身的形态。

## 复核与审计后修正

独立 diff 复核（`deepseek-flash`）无 Critical，两条 Fix 与一条 Suggest 已处理：

- 忙碌提示（`settings.status.busy`）现在会同时把结果行标为失败色，不再继承上一次的成功绿。
- 改动目标或单独改模型 ID 都会清掉旧结论行，避免把上一个模型的「连接成功」当成当前模型的结论。
- 成功行改为按实际返回字段拼装，缺维度或延迟时省略该段；`tests/client-pure.spec.ts` 覆盖了缺字段与三者全缺的情况。

报告独立审计（`deepseek-flash`）另指出四条，已全部处理：

- 「票面说空值保持文本、实现是空值下拉」：用户随后明确要求改成方案 B，票面、计划、报告与实现已统一为「空值也下拉 + 显式的『请选择模型…』空选项」。
- gate 原先按已删除的 `data-mc-model-select` 找第二个下拉，该断言恒真；现改为统计「含 fixture 模型 option 的 select 数量」，并断言唯一控件的 `id` 是 `mc-field-embedding.model`。
- 宿主启动未隔离 `DEEPSEEK_API_KEY`，导致一次真实的模型目录请求；现在只注入哨兵值（401 后回退内置目录），并在「范围与隔离」如实记录。
- `REPRODUCE.md` 补齐硬编码的宿主、Node、Playwright 路径依赖与 `t39-pack` 清理；`?token=` 不再写未脱敏副本。

第二轮审计给 PASS WITH CAVEATS，两条 Fix 也已处理：

- `evidence/host-env.json` 现在记录哨兵值本身与 `nodeVersion: v24.21.0`，报告不再只有正文声明而无文件支撑。
- `picker-has-empty-option` 同时断言首项文本与 `value === ''`，不再依赖两步推理。

修正后重跑：gate 33 步 0 失败；`npm test` 85 文件 / 1056 用例；typecheck 与 i18n 均 exit 0。

## 未覆盖

- 没有用真实硅基流动密钥请求真实模型；本票只断言表单行为、保存语义与错误映射。
- 未在手机 dsh-go 上验证：宿主表单由 schema 生成，不能按值隐藏或用插件自定义选择器。
- 未测试 `remote-migrating` / `remote-paused` 状态下加载列表的行为差异（这些状态本就禁用加载与测试）。
- 未发版：候选包为本地 tarball，本报告不判断 npm 上的当前版本。
- 未验证「未选择预设」的界面形态：预设下拉只有 `siliconflow` / `custom`，无法从 UI 制造空预设；该分支由纯函数单测覆盖（`preset` 为空/空白/缺省时始终返回 `text`）。
- 证据中的路径含本机用户目录（`C:\Users\elvis\…`）与临时根，属运行环境信息，不含凭据。
