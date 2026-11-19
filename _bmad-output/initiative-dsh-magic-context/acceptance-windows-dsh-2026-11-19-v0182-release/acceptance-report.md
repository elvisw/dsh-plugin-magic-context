# 0.18.2 release

Date: 2026-11-19
Version: `@elvisw/dsh-magic-context@0.18.2`
Previous: `0.18.1`

## What is in it

Documentation only, finishing T27:

- both READMEs now say the plugin drops tool output on its own at the 85% force band, what the
  protected window covers, the class order, the provider-overflow path, and the guidance
  thresholds (the fact the T26 rewrite dropped);
- `docs/glossary.md` gains `强制带（force band）` and `受保护窗口`;
- `docs/configuration.md` explains what `forceThreshold` starts and what it does not govern.

No source change.

## Gate

| Step | Result | Evidence |
|---|---|---|
| Product source diff since `v0.18.1` | empty (`git diff v0.18.1..HEAD -- src tests scripts package.json`) | recorded before packaging |
| `npm run build` | clean | `evidence/build.txt` |
| `npm pack` | 71 files, 4,068,953 bytes | `evidence/npm-pack.txt` |
| Delta against the published 0.18.1 | 3 members changed: both READMEs and `package.json`; `package/lib/**` and `package/vendor/**` byte-identical | `evidence/pack-compare-0181.json` |

Candidate SHA-256: `b144e0eb3390ea14d29a7a8a525bad63d949785f61e1e08d74ee3bf598ec4de9`.

## What was not re-run, and why

- **No `npm test`, typecheck or i18n check.** `git diff v0.18.1..HEAD -- src tests scripts` is
  empty, so the tests that passed on 0.18.1 (85 files / 1052 cases) cover the same source tree.
- **No host gate, no UI gate.** `package/lib/client.js` and `vendor/**` are byte-identical to
  0.18.1.
- **No registry install smoke.** 0.18.1's smoke installed the same `lib/index.js` bytes
  (`fc0995e0…402c`); the only runtime-visible difference in 0.18.2 is `package.json`'s version
  string. Registry identity is checked below instead.

## Publication

| Item | Value |
|---|---|
| Tag | `v0.18.2` on `1aa1248` |
| Workflow | `44490718207` — success |
| npm `latest` | `0.18.2` |
| `dist.shasum` | `530deaa80f013664f2a038ec9e61ec76014a9c88` (matches the local pack) |
| `dist.integrity` | `sha512-gQJlJiyWHRPnB…JdCew==`, recomputed from the downloaded bytes |
| Registry tarball | 4,068,953 bytes, byte-identical to the local pack (`evidence/registry.json`) |

Registry metadata took about a minute to appear after the workflow finished; that is
propagation, confirmed by polling rather than assumed.

## Follow-up

Upgrade the daily `web` profile to 0.18.2 so the settings page and README match what is
installed.
