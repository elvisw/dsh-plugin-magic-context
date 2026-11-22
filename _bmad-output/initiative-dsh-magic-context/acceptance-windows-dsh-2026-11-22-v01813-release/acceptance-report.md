# 0.18.13 发布记录

## 版本内容

`0.18.13` 只包含 T40（提交 `5b4c181`）：

- 「加载模型」移到 `模型 ID` 字段旁（原卡片底部动作行）
- 「加载模型」/「测试连接」不再隐式保存配置；有未保存修改时保持可见但禁用，并提示「先保存当前修改，再执行远程操作。」
- 新增「撤销未保存更改」，只清未保存修改（含密钥输入框里未保存的文字）

## 与 0.18.12 的产物差异

`evidence/pack-compare.json`（脚本 `compare_01813.py`，本地候选与 registry 上的 `0.18.12` 逐成员比对）：

| 项 | 值 |
|---|---|
| 成员数 | 71 → 71（无新增、无删除） |
| 变化成员 | `package.json`、`README.md`、`README.zh-CN.md`、`lib/client.js` |
| `lib/index.js` | 逐字节未变 |
| `vendor/**` | 逐字节未变 |
| 非预期变化 | 无 |

`lib/client.js` 变化来自 T40 的设置页改动；`lib/index.js` 未变，所以 T40 的隔离宿主 gate（51 步 0 失败）就是这批客户端字节对应的验收，无需重跑产品门禁。

候选包：`elvisw-dsh-magic-context-0.18.13.tgz`，4,082,248 B / 71 成员，SHA-256 `39160ef9ea678e9bc9ec963e709dac11821537cef4285f3f006301437bae65cc`。

## 发布结果

| 项 | 值 |
|---|---|
| npm `latest` | `0.18.13`（`dist-tags.bootstrap` 仍是 `0.0.0-bootstrap.0`） |
| 发布 tag | `v0.18.13` → `ff7c3e369a6d53a35ba749572c4a4d05802e5f2b`，与 registry `gitHead` 一致 |
| Release workflow | `44980337849`：typecheck / test / build / i18n / inspect / publish 全绿 |
| registry tarball | 4,082,248 B，SHA-256 `39160ef9ea678e9bc9ec963e709dac11821537cef4285f3f006301437bae65cc` |
| 与本地候选 | 逐字节相同（`evidence/registry.json` 的 `byteIdentical: true`） |
| 下载字节重算 | SHA-512/base64 `onC5WAmiQrRySogAsJ6ID5VvLeAP/W+rWLBG8GBorO7bXzrvlNG2vO+Nf0B6dcq/FAH+mDBqhWPvAs97aoJUcw==` 与 `dist.integrity` 一致；SHA-1 `955706f93a9ea86def96a653e130c7dff32c268f` 与 `dist.shasum` 一致 |
| Provenance | 两条 attestation：`npm/attestation publish/v0.1` 与 `slsa.dev/provenance/v1`（`evidence/provenance.json`） |

## 日常 profile

`dsh plugin --profile web add @elvisw/dsh-magic-context@0.18.13` 成功，`~/.dsh/profiles/web/package.json` 的依赖为 `0.18.13`，安装后 `lib/client.js` 的 SHA-256 与仓库构建产物一致（`8cb09cdf…6aa84f`）。`dsh --profile web --dump-config` 确认 `magic-context-dsh` 行、historian `reasoningEffort: low`、`registerCompactionEngine: true` 均在；dump 含主目录路径，已脱敏为 `<home>`。

需要重启宿主会话才会加载新版本。

## 门禁

- `npm test -- --maxWorkers=4`：85 文件 / 1057 用例通过
- `npm run typecheck`、`npm run check:i18n`、`npm run build`：全部 exit 0
- 产品字节变更只有 `lib/client.js`，对应 T40 的隔离宿主 gate（`acceptance-windows-dsh-t40-decoupled-embedding-actions/`，51 步 0 失败 0 console error）
