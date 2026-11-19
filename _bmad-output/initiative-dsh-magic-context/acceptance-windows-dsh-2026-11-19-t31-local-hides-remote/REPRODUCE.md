# T31 复现步骤

1. `npm run build`，然后 `npm pack --pack-destination %TEMP%\opencode\t31-pack`
   （本报告生成时的包：SHA-256 `25a9cdc949d38b98247436b9bd75a2e8f811a06a414a428f3165dc175efaf856`）。
2. `python run_t31_host.py`：起 fake embedding endpoint，建隔离根 `%TEMP%\opencode\dsh-mc-t31-<时间戳>`，
   写入 profile `t31`（`config.embedding.provider: local`），启动 DSH Web。
3. `node t31_ui_gate.cjs`：打开设置页，切中文，进入 Magic Context 卡片。
   - 默认本地：12 个字段全部不存在（含高级区的 authHeader / queryInstruction / documentPrefix / apiKey），
     页面出现「远程设置已隐藏」
   - 切到 OpenAI 兼容：上述字段与高级区恢复
   - 保存 endpoint 与 model，轮询 profile patch 直到出现
   - 在 endpoint 里输入一个未保存的值，切回本地 → 字段消失，保存后 patch 里没有该值
   - 再切回远程：endpoint 仍是已保存的值
4. 结果写在 `<root>/evidence/ui-gate.json`；本目录的 `evidence/` 与 `screenshots/` 是留档副本。

手机端不需要复现：本轮没有改宿主，schema 文案由 `tests/config-schema.spec.ts` 固定。
