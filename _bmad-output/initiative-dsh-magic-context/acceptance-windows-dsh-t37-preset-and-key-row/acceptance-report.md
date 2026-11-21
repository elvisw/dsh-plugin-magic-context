# T37 验收报告：服务预设固定接口地址、本地不再显示密钥输入

**结论：两项改动都在真实 DSH Web 宿主上通过。** 选硅基流动预设时接口地址与认证头输入消失、改为只读固定地址；选本地 MiniLM 时密钥输入消失，已存凭据只留一行「清除已保存的密钥」，且该行清除后自行消失。运行时解析器未改动，升级不会改变任何现有配置的请求目标。

## 被测对象

| 项 | 值 |
|---|---|
| 候选包 | `elvisw-dsh-magic-context-0.18.9.tgz` |
| SHA-256 | `214385d7a58582f014a1e658098f696d2cbd968fca69eb75566982d3157f13bc` |
| 字节 / 成员 | 4,074,522 / 71 |
| 宿主 | DSH `0.2.2-rc.5`（Node v24.21.0） |
| 环境 | 两个全新隔离根内的 `t37` / `t37b` profile，`DSH_HOME`、`HOME`、`USERPROFILE`、`XDG_*`、`TEMP` 全部指向本次新根 |

## 断言结果

`evidence/ui-gate.json`：31 步，**0 失败，0 console error**。

| 断言 | 结果 |
|---|---|
| 本地 + 无密钥：没有密钥行 | 通过 |
| 远程 + 硅基流动 + 空地址：接口地址与认证头输入都不渲染 | 通过 |
| 同状态显示只读固定地址 `https://api.siliconflow.cn/v1`，且不出现「保存值优先」提示 | 通过 |
| 切到自定义：两个输入出现，可编辑，固定地址行消失 | 通过 |
| 保存自定义地址后 profile 写入该地址；保存密钥后 profile 不含密钥、卡片提示已存凭据库 | 通过 |
| 自定义下输入未保存的接口地址，切回硅基流动后该输入消失，Save 后 profile 里没有这个地址 | 通过 |
| 切回本地：密钥行整体消失（不是只剩输入框），只剩「清除已保存的密钥」 | 通过 |
| 点击清除：该行消失，并提示凭据已清除 | 通过 |
| 硅基流动 + 已保存非默认地址：两个输入仍可见，并出现「已保存的接口地址或认证头优先于预设」 | 通过 |

## 单元与静态检查

| 检查 | 结果 |
|---|---|
| `npm test -- --maxWorkers=4` | 85 文件 / 1053 用例通过（`evidence/unit-test.txt`） |
| `npm run typecheck` | 通过（`evidence/typecheck.txt`） |
| `npm run check:i18n` | ALL PASS（`evidence/i18n.txt`） |
| `npm run build` + `npm pack` | 通过，候选包即上文 SHA-256 |

## 实现要点

- `embeddingFieldVisible` 改为接收 `keySource` 与 `presetOwnsTransport`；新增 `normalizeEmbeddingPreset`、`normalizeEndpointText`、`embeddingPresetOwnsTransport` 三个纯函数，归一化规则与 `resolveEmbeddingConfig` 一致。
- 预设是否接管传输只看**已保存**的地址与认证头；非默认保存值保持输入可见，运行时继续使用保存值。
- 切换预设到硅基流动且预设接管时，剪掉这两个字段的未保存草稿，避免「隐藏但 Save 仍可写」。
- `renderSecretField` 在本地/关闭时改为紧凑行：凭据显示状态 + 清除按钮，字面密钥显示状态 + 在 profile 补丁中移除的提示。
- `src/index.ts` 的 `endpoint` / `authHeader` 描述改为「自定义预设」；`preset` 描述去掉「本地不适用」。

## 未覆盖

- 没有用真实硅基流动密钥发起 embedding 请求；本票不断言网络可达性，只断言表单行为与保存语义。
- 「测试连接打到固定地址」由既有解析器单测覆盖（`tests/embedding-remote.spec.ts`，本票未改动解析器），未在宿主上重复验证。
- 字面密钥（`embedding.apiKey` 写在 profile 里）的紧凑行只有单测与代码审阅覆盖：UI 没有写入通道，宿主上无法构造该状态。
- 手机 dsh-go 只改了 schema 文案：宿主仍不支持按值条件隐藏（上游 #1569），原生表单会继续显示这两个字段。
- 桌面应用与其他 DSH 版本未测。
