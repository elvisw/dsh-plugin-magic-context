# 0.18.14 发布记录

## 版本内容

`0.18.14` 只包含 T41（提交 `2a10ad1`、`48ebd66`）：

- 「加载模型」/「测试连接」被禁用时，原因直接写在按钮旁边（未保存修改、未配置 API Key、接口地址为空、
  记忆关闭、有远程操作在途、迁移已暂停、只读），并可被读屏通过 `aria-describedby` 念出。
- 原因是「未保存修改」时，原因行内提供**保存**按钮（读者主动点击，不是隐式保存）。
- 模型 ID 提示语说明操作顺序：先点「加载模型」拉取列表，再从中选择；列表里没有的模型可直接填写。

## 与 0.18.13 的产物差异

`evidence/pack-compare.json`（本地候选与 registry 上的 `0.18.13` 逐成员比对）：

| 项 | 值 |
|---|---|
| 成员数 | 71 → 71（无新增、无删除） |
| 变化成员 | `package.json`、`README.md`、`README.zh-CN.md`、`lib/client.js` |
| `lib/index.js` | 逐字节未变 |
| `vendor/**` | 逐字节未变 |
| 非预期变化 | 无 |

`lib/client.js` 的变化来自 T41 的设置页改动；`lib/index.js` 未变，因此 T41 的隔离宿主 gate
（23 步 0 失败）与 T40 回归（51 步 0 失败，同一 tarball）就是这批客户端字节对应的验收。

候选包：`elvisw-dsh-magic-context-0.18.14.tgz`，4,083,343 B / 71 成员，
SHA-256 `15d837b87af4aef98266b3b9445fdbcae38eca05fafc213211d39a35b102a60d`。

## 门禁

- `npm test -- --maxWorkers=4`：85 文件 / 1059 用例通过
- `npm run typecheck`、`npm run check:i18n`、`npm run build`：全部 exit 0
- 产品字节变更只有 `lib/client.js`，对应 T41 与 T40 的隔离宿主 gate（见
  `acceptance-windows-dsh-t41-switch-and-load-probe/`）

## 未验证

- 未用真实硅基流动密钥验证「加载模型」；假服务只验证协议与鉴权头。
- npm 页面与 dsh-go 市场条目的版本更新由各自流程负责，本记录不含它们的核验。
