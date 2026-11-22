# T39 复现步骤

## 0. 前置（脚本不自带，需本机已存在）

| 依赖 | 路径 |
|---|---|
| Node | `C:\Users\elvis\AppData\Local\Author Software\nvm\installs\v24.21.0\node.exe` |
| DSH 宿主 | `%TEMP%\opencode\t35-rc5-root2\host\node_modules\@deepseek-ai\dsh\lib\bin.js`（`0.2.2-rc.5`） |
| Playwright | `C:\Users\elvis\node_modules\.deno\playwright@1.63.0\node_modules\playwright`（`chromium` + `msedge` 通道） |

这三项写死在 `run_t39_host.py` / `prepare_t39.py` / `t39_ui_gate.cjs` 里，换机器需要改路径。

## 1. 构建、测试与打包

```powershell
npm run typecheck
npm run check:i18n
npm run build
npm test -- --maxWorkers=4
npm pack --pack-destination $env:TEMP\opencode\t39-pack
```

产物 `elvisw-dsh-magic-context-0.18.11.tgz`，SHA-256
`10c464a26a51350294f1fdf84a864b8c7d037ac6e26cd8a24c399edb70b66063`。

## 2. 隔离宿主 + 门禁

```powershell
python _bmad-output/initiative-dsh-magic-context/acceptance-windows-dsh-t39-model-picker-and-probe-feedback/run_t39_host.py
```

脚本会：

1. 起一个本地假 OpenAI 兼容嵌入服务（16 维，三个模型，`fixture-bad-auth` 固定返回 401）；
2. 在 `%TEMP%\opencode\dsh-mc-t39-<时间戳>` 建全新根，`DSH_HOME` / `HOME` / `USERPROFILE` /
   `XDG_*` / `TEMP` / `APPDATA` / `LOCALAPPDATA` 与 pnpm、npm 缓存全指向它；
3. 剔除 `SILICONFLOW_API_KEY` / `OPENAI_API_KEY` / `ANTHROPIC_API_KEY`，只给 `DEEPSEEK_API_KEY`
   注入哨兵值 `t39-gate-sentinel-not-a-real-key`（不是凭据；只为跳过首启的「开始使用」对话框）；
4. 用 DSH `0.2.2-rc.5` 引导 `t39` profile 并装入本地 tarball，patch 指向假端点、`model: ''`；
5. 启动宿主，用 Playwright 跑 `t39_ui_gate.cjs`；
6. 结果写 `root/evidence/ui-gate.json`，截图写 `root/screenshots/`，*不*自动复制回本目录。

## 3. 通过标准

- `ui-gate.json` 的 `steps` 共 33 条，`failures` 与 `errors` 都为空；
- `evidence/unit-test.txt` 显示 85 文件 / 1056 用例通过；
- `evidence/typecheck.txt` 与 `evidence/i18n.txt` 的 `exit=0`。

## 4. 已知副作用

宿主会用哨兵密钥向 `https://api.deepseek.com/models` 发一次目录请求，返回 401 后使用内置目录；
`evidence/server-log.txt` 有该行，本票不依赖其结果。

## 5. 清理

```powershell
Remove-Item -Recurse -Force $env:TEMP\opencode\dsh-mc-t39-*, $env:TEMP\opencode\t39-fake, $env:TEMP\opencode\t39-pack
```

宿主与假服务由脚本在结束时终止；两者都只绑定 `127.0.0.1`。
