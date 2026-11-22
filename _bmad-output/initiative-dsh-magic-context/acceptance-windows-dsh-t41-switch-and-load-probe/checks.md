# T41 本地检查记录

这份文件记录本票在终端实际跑过的检查与当时观察到的结果。**原始 stdout 没有归档**，所以下面的数字只能作为实施者的记录，不能像 `ui-gate.json` 那样被独立复核。

| 命令 | 结果 |
|---|---|
| `npx vitest run tests/client-pure.spec.ts` | 1 file passed，64 tests passed |
| `npm test -- --maxWorkers=4` | 85 files passed，1059 tests passed |
| `npm run typecheck` | exit 0（`tsc --noEmit` 无输出） |
| `npm run check:i18n` | `ALL PASS` |
| `npm run build` | exit 0（`copy-client` 写入 `lib/client.js`） |

`provenance.json` 里记录的 `lib/client.js` 哈希就是这次 build 的产物；宿主 gate 安装的 tarball 由同一批字节打出。

如需复核，重跑上述命令即可；本文不作为验收证据，验收证据见 `evidence/`。
