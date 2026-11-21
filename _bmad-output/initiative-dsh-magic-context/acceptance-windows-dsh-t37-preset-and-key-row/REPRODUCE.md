# T37 复现步骤

## 1. 构建与打包

```powershell
npm run typecheck
npm run build
npm test -- --maxWorkers=4
npm pack --pack-destination $env:TEMP\opencode\t37-pack
```

产物 `elvisw-dsh-magic-context-0.18.9.tgz`，SHA-256
`214385d7a58582f014a1e658098f696d2cbd968fca69eb75566982d3157f13bc`。

## 2. 隔离宿主 + 门禁

```powershell
python _bmad-output/initiative-dsh-magic-context/acceptance-windows-dsh-t37-preset-and-key-row/run_t37_host.py
```

脚本会：

1. 在 `%TEMP%\opencode\dsh-mc-t37-<时间戳>` 建全新根，`DSH_HOME` / `HOME` / `USERPROFILE` /
   `XDG_*` / `TEMP` 都指向它；
2. 用 DSH `0.2.2-rc.5` 引导 `t37`（本地，无密钥）与 `t37b`（远程 + 硅基流动 + 非默认地址）两个 profile，
   把本地 tarball 装进去；
3. 启动两个宿主，用 Playwright 跑 `t37_ui_gate.cjs`；
4. 结果写到 `evidence/ui-gate.json`，截图写到 `screenshots/`。

## 3. 通过标准

- `ui-gate.json` 的 `steps` 共 31 条、`failures` 与 `errors` 都为空；
- `evidence/unit-test.txt` 显示 85 文件 / 1053 用例通过；
- `evidence/typecheck.txt` 与 `evidence/i18n.txt` 退出码 0。

## 4. 清理

```powershell
Remove-Item -Recurse -Force $env:TEMP\opencode\dsh-mc-t37-*
```

两个宿主进程由脚本在结束时终止；端口只绑定 `127.0.0.1`。
