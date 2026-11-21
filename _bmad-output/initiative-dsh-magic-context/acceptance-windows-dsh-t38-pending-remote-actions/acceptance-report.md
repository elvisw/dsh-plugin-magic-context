# T38 验收报告：草稿切到远程后立即可用「保存并加载」

**结论：根因已复现并修复。** 选硅基流动后看不到模型下拉，是因为「加载模型 / 测试连接」的可见性按**已保存**状态判断；切到远程但还没保存 provider 时，这两个按钮根本不存在。现在只要草稿 provider 是远程，按钮立即出现，点击会先保存再加载。

## 复现（修复前）

`evidence/repro-before-fix.json`，DSH `0.2.2-rc.5` 隔离宿主、provider 保存为 local：

| 状态 | 向量卡片里的按钮 |
|---|---|
| 切到远程（未保存） | `重置, 重置, 保存密钥, 清除凭据, 刷新, 高级` |
| 点保存后 | `重置, 重置, 保存密钥, 清除凭据, 刷新, 加载模型, 测试连接, 开始重建向量, 高级` |

用户在 provider 仍是草稿时先保存了 API Key（密钥绑定的是已保存的引用，默认引用本来非空），随后就找不到模型列表。

## 修复后的门禁

`evidence/ui-gate.json`：14 步，**0 失败，0 console error**。候选包
`elvisw-dsh-magic-context-0.18.10.tgz`，SHA-256 `8d2f54cd80ca6e37ccbcd0581f49e1da3035498d66e39066bd023eb0d1db73b6`，
4,074,674 B / 71 members，宿主 DSH `0.2.2-rc.5` + Node v24.21.0。

| 断言 | 结果 |
|---|---|
| 保存状态为 local 时没有「加载模型」 | 通过 |
| 只切 provider 草稿（不保存）就出现「保存并加载模型」 | 通过 |
| 该按钮可点击；`开始重建向量` 仍不出现 | 通过 |
| 草稿状态下密钥行可用，保存密钥成功，provider 仍是草稿 | 通过 |
| 点击后 provider 写入 profile | 通过 |
| 假端点返回的模型列表渲染为下拉（`fixture-embed-a` / `fixture-embed-b`） | 通过 |
| 模型列表请求带 Authorization | 通过（1 次请求，`authPresent: true`） |
| 选择模型后保存写入 profile | 通过 |

## 单元与静态检查

| 检查 | 结果 |
|---|---|
| `npm test -- --maxWorkers=4` | 85 文件 / 1053 用例（`evidence/unit-test.txt`） |
| `npm run typecheck` | 通过 |
| `npm run check:i18n` | ALL PASS |

新增用例固定：`state=local, remoteDraft=true` 时 `load.hidden=false`、`load.disabled=false`、`test.hidden=false`、`test.disabled=true`（模型为空）、`start.hidden=true`；不传 `remoteDraft` 时维持旧行为。

## 未覆盖

- 没有用真实硅基流动密钥跑模型列表；门禁用本地假端点，只验证按钮可达、保存顺序、请求带认证与下拉渲染。
- 假端点只记录 `Authorization` 是否存在，不区分它来自刚保存的凭据还是宿主进程环境；本次门禁的父进程环境里本来就设了 `SILICONFLOW_API_KEY`，所以「带认证」不能单独证明凭据路径。凭据写入本身由宿主回执文案断言，且凭据优先级高于环境（`src/dsh/embedding-lane.ts` 的解析顺序）。
- `开始重建向量`、探针与回填未在本票重测；它们的判定未改动。
- 已保存状态为 `remote-ready` 时再草稿切换 provider，点「保存并加载」会改变目标身份并解除已武装状态；这是 T21 既有行为，本票未引入也未改变。
- 桌面应用、Android 与其他 DSH 版本未测。
