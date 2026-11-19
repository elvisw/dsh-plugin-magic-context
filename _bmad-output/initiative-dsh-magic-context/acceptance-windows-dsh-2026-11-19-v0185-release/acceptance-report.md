# 0.18.5 release

Date: 2026-11-19
Version: `@elvisw/dsh-magic-context@0.18.5`
Previous: `0.18.4`

## What is in it

Documentation only, closing T30: the install section now names and links DeepSeek Harness
(`https://github.com/deepseek-ai/deepseek-harness`), and the Android section links the dsh-go
repository and its releases. The Android paragraph keeps 1.1.0 as the verified version and adds a
sentence that later dsh-go releases exist — the app is already at v1.2.0, and the panels have not
been tested there.

No product source change.

## Gate

| Step | Result | Evidence |
|---|---|---|
| Product source diff since `v0.18.4` | empty | `evidence/source-diff-since-0184.txt` |
| `npm run build` | clean | `evidence/build.txt` |
| `npm pack` | 71 files, 4,069,711 bytes | `evidence/npm-pack.txt` |
| Delta against 0.18.4 | package/README.md, package/README.zh-CN.md, package/package.json; `package/lib/**` and `package/vendor/**` byte-identical | `evidence/pack-compare-0184.json` |
| README lint | 82 checks, 0 failures | T27 evidence dir (`lint-after-t30.json`) |
| README link check | 14 unique external URLs (2 new), 0 failures | T27 evidence dir (`link-check-t30.json`) |

Candidate SHA-256: `1fb3dc6f7c0d701980509606e25290217d822b58b651d4994a49ce049200a184`.

## What was not re-run, and why

- **No `npm test` / typecheck / i18n.** `git diff v0.18.4..HEAD -- src tests scripts` is empty.
- **No host or UI gate.** `package/lib/client.js` and `vendor/**` are byte-identical to 0.18.4.

## Publication

| Item | Value |
|---|---|
| Tag | `v0.18.5` |
| npm `latest` | `0.18.5` |
| Registry tarball | compared against the local pack |

(Confirmed after the workflow completes.)
