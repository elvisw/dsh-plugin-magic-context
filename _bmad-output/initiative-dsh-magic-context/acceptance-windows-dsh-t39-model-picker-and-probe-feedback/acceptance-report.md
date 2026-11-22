# T39 验收报告：模型在选择框内选定、测试连接给出结果

**结论：两项 UI 缺陷在真实 DSH Web 宿主上都已修复。** 加载模型后不再在动作行下方冒出第二个下拉——模型值就在 `模型 ID` 字段本身选择；「测试连接」成功显示「连接成功 · 模型 · N 维 · ms」，失败显示中文原因而不是机器码。

## 被测对象

| 项 | 值 |
|---|---|
| 候选包 | `elvisw-dsh-magic-context-0.18.11.tgz`（本地候选，未发布） |
| SHA-256 | `1369f58f396a03b6f0089209a7f3a10651ba75af974529b9c2cb42e09b19a85e` |
| 字节 / 成员 | 4,080,806 / 71 |
| 宿主 | DSH `0.2.2-rc.5`（Node v24.21.0） |
| 环境 | 全新隔离根内 `t39` profile；`DSH_HOME`、`HOME`、`USERPROFILE`、`XDG_*`、`TEMP` 全部指向本次新根 |
| 嵌入端点 | 本地假 OpenAI 兼容服务（16 维，`fixture-embed-a/b`、`fixture-bad-auth`） |

## 断言结果

`evidence/ui-gate.json`：29 步，**0 失败，0 console error**。

| 断言 | 结果 |
|---|---|
| 远程 + 空模型：字段是文本框（受控下拉不会画出没被选中的模型） | 通过 |
| 加载前不存在第二个下拉 | 通过 |
| 加载后提示「已加载 3 个模型」 | 通过 |
| 加载后 `模型 ID` 字段本身是 `<select>`，仍无第二个下拉 | 通过 |
| 下拉列出三个模型 + 「手动输入模型 ID…」 | 通过 |
| 从下拉选 `fixture-embed-b` 并保存，profile 写入该 ID | 通过 |
| 测试连接成功：`连接成功 · fixture-embed-b · 16 维 · 5 ms` | 通过 |
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
| `npm test -- --maxWorkers=4` | 85 文件 / 1055 用例通过（`evidence/unit-test.txt`） |
| `npm run typecheck` | 通过（`evidence/typecheck.txt`） |
| `npm run check:i18n` | ALL PASS（`evidence/i18n.txt`） |
| `npm run build` + `npm pack` | 通过，候选包即上文 SHA-256 |

## 实现要点

- 新增纯函数 `embeddingModelFieldMode`、`embeddingModelSelectValue`、`embeddingProbeResultText`、
  `embeddingVerdictText` 与 `EMBEDDING_ERROR_KEYS`，全部在 `tests/client-pure.spec.ts` 固化。
- 空值渲染为带显式空选项的下拉（`选择或填写模型`），因此受控 select 不会显示一个未被选择的模型。
- 「手动输入模型 ID…」是哨兵项，只切模式、不写值；列表外的值默认保持文本框，用「从列表选择…」显式进入下拉。
- provider / preset / endpoint / 密钥引用任一变化都清空已加载列表并清掉旧结论行；单独改模型 ID 也清掉旧结论行，避免把上一个模型的成功当成当前模型的结论。
- `测试连接` 走 `reportProbe` 分支，成功行带 `data-mc-embedding-result="ok"`，失败行为 `error` 并映射为中文原因；fetch 与 JSON 解析失败分别归为 `network` 与 `invalid-response`。
- 成功行按服务端实际返回的字段拼装：缺维度或延迟就省略该段，不会渲染 `null`；三者都缺时退回「连接成功」。
- 删除了 `renderEmbeddingTools` 里原来的 `model-select` 与 `modelOptions`。

## 历史证据

T38 的 gate 曾把「动作行下方出现下拉」写成断言（`acceptance-windows-dsh-t38-pending-remote-actions/evidence/ui-gate.json` 的 `model-select-rendered`）。本票把它视为被取代的旧标准，**没有改写该目录的任何文件**；T39 的断言只检查字段本身的形态。

## 复核后修正

独立 diff 复核（`deepseek-flash`）无 Critical，两条 Fix 与一条 Suggest 已处理：

- 忙碌提示（`settings.status.busy`）现在会同时把结果行标为失败色，不再继承上一次的成功绿。
- 改动目标或单独改模型 ID 都会清掉旧结论行，避免把上一个模型的「连接成功」当成当前模型的结论。
- 成功行改为按实际返回字段拼装，缺维度或延迟时省略该段；`tests/client-pure.spec.ts` 覆盖了缺字段与三者全缺的情况。

修正后重跑：gate 29 步 0 失败；`npm test` 85 文件 / 1055 用例；typecheck 与 i18n 均 exit 0。

## 未覆盖

- 没有用真实硅基流动密钥请求真实模型；本票只断言表单行为、保存语义与错误映射。
- 未在手机 dsh-go 上验证：宿主表单由 schema 生成，不能按值隐藏或用插件自定义选择器。
- 未测试 `remote-migrating` / `remote-paused` 状态下加载列表的行为差异（这些状态本就禁用加载与测试）。
- 未发版：候选包为本地 tarball，`0.18.11` 仍是当前 npm 版本。
