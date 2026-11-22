# T39 复现步骤

## 1. 构建、测试与打包

```powershell
npm run typecheck
npm run check:i18n
npm run build
npm test -- --maxWorkers=4
npm pack --pack-destination $env:TEMP\opencode\t39-pack
```

产物 `elvisw-dsh-magic-context-0.18.11.tgz`，SHA-256
`1369f58f396a03b6f0089209a7f3a10651ba75af974529b9c2cb42e09b19a85e`。

## 2. 隔离宿主 + 门禁

```powershell
python _bmad-output/initiative-dsh-magic-context/acceptance-windows-dsh-t39-model-picker-and-probe-feedback/run_t39_host.py
```

脚本会：

1. 起一个本地假 OpenAI 兼容嵌入服务（16 维，三个模型，其中一个固定返回 401）；
2. 在 `%TEMP%\opencode\dsh-mc-t39-<时间戳>` 建全新根，`DSH_HOME` / `HOME` / `USERPROFILE` /
   `XDG_*` / `TEMP` 全指向它；
3. 用 DSH `0.2.2-rc.5` 引导 `t39` profile 并装入本地 tarball，patch 指向假端点、`model: ''`；
4. 启动宿主，用 Playwright 跑 `t39_ui_gate.cjs`；
5. 结果写 `evidence/ui-gate.json`，截图写 `screenshots/`。

## 3. 通过标准

- `ui-gate.json` 的 `steps` 共 29 条，`failures` 与 `errors` 都为空；
- `evidence/unit-test.txt` 显示 85 文件 / 1055 用例通过；
- `evidence/typecheck.txt` 与 `evidence/i18n.txt` 的 `exit=0`。

## 4. 清理

```powershell
Remove-Item -Recurse -Force $env:TEMP\opencode\dsh-mc-t39-*, $env:TEMP\opencode\t39-fake
```

宿主与假服务由脚本在结束时终止；端口只绑定 `127.0.0.1`。
