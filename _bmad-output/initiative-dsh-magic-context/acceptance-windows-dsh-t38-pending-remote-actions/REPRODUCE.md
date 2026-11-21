# T38 复现步骤

## 1. 构建与打包

```powershell
npm run typecheck
npm run build
npm test -- --maxWorkers=4
npm pack --pack-destination $env:TEMP\opencode\t38-pack
```

产物 `elvisw-dsh-magic-context-0.18.10.tgz`，SHA-256
`8d2f54cd80ca6e37ccbcd0581f49e1da3035498d66e39066bd023eb0d1db73b6`。

## 2. 修复前复现

`run_t38_probe.py` 启动一个 provider=local 的隔离宿主，把 provider 切到远程但**不保存**，
打印向量卡片里的按钮集合；然后保存，再打印一次。输出在 `evidence/repro-before-fix.json`：

- 未保存：没有「加载模型」「测试连接」；
- 保存后：两者出现。

## 3. 门禁

```powershell
python _bmad-output/initiative-dsh-magic-context/acceptance-windows-dsh-t38-pending-remote-actions/run_t38_host.py
```

脚本在 `%TEMP%\opencode\dsh-mc-t38-<时间戳>` 建全新根（`DSH_HOME` / `HOME` / `USERPROFILE` /
`XDG_*` / `TEMP` 都指向它），启动本地假嵌入端点，装本地 tarball，跑 `t38_ui_gate.cjs`。

通过标准：`evidence/ui-gate.json` 共 14 步、`failures` 与 `errors` 为空；
`evidence/unit-test.txt` 为 85 文件 / 1053 用例。
