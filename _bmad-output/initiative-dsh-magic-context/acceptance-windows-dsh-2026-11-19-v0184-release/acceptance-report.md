# 0.18.4 release

Date: 2026-11-19
Version: `@elvisw/dsh-magic-context@0.18.4`
Previous: `0.18.3`

## What is in it

Documentation only, closing T29. Both READMEs now carry a plain-language statement at the end of
*Provenance and license*:

- the software is provided "as is", with no warranty, as MIT says; it rewrites conversation
  history and drops tool output by design and keeps memories in local SQLite files, so back up;
  the maintainer is not liable for data loss, provider charges, or other damages;
- lawful use is the reader's responsibility — nothing here grants permission to break the law,
  and the reader should follow their local laws;
- model providers, embedding endpoints and other applications have their own terms and billing;
  the paragraphs are a summary, not legal advice, and `LICENSE` is the operative text.

No product source change.

## Gate

| Step | Result | Evidence |
|---|---|---|
| Product source diff since `v0.18.3` | empty | `evidence/source-diff-since-0183.txt` |
| `npm run build` | clean | `evidence/build.txt` |
| `npm pack` | 71 files, 4,069,578 bytes | `evidence/npm-pack.txt` |
| Delta against 0.18.3 | package/README.md, package/README.zh-CN.md, package/package.json; `package/lib/**` and `package/vendor/**` byte-identical | `evidence/pack-compare-0183.json` |
| README lint | 82 checks, 0 failures | T27 evidence dir (`lint-after-t29.json`) |
| README link check | 100 targets, 0 failures (first attempt: 2 transient failures on the CI badge, status 0) | T27 evidence dir (`link-check-t29.json`) |
| Disclaimer review | PASS, no Critical; one wording fix applied (中文「提供商费用」) | T29 plan, "Review outcome" |

Candidate SHA-256: `f98772680ca48126cfe21bfa5e663aa345204dd1a33e8c50136969c8169e2b51`.

## What was not re-run, and why

- **No `npm test` / typecheck / i18n.** `git diff v0.18.3..HEAD -- src tests scripts` is empty.
- **No host or UI gate.** `package/lib/client.js` and `vendor/**` are byte-identical to 0.18.3.

## Publication

| Item | Value |
|---|---|
| Tag | `v0.18.4` |
| npm `latest` | `0.18.4` |
| Registry tarball | compared against the local pack |

(Confirmed after the workflow completes.)
