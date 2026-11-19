# 0.18.3 release

Date: 2026-11-19
Version: `@elvisw/dsh-magic-context@0.18.3`
Previous: `0.18.2`

## What is in it

Documentation only, finishing T28: both READMEs no longer teach the reader to name tag numbers.
*Common tasks* now states that reclaim is not the reader's job (the model stamps what it has
finished with; the force band drops at 85%), and the restore path is described as the model's own
`ctx_expand` call when it needs a result it already consumed. The tools/commands split says which
side calls what, and `registerTools` / `registerStatusCommand` left the README (still in
`docs/configuration.md`). Two dangling references to the deleted example were fixed, and the
"changes since upstream" bullet is now self-contained.

No source change.

## Gate

| Step | Result | Evidence |
|---|---|---|
| Product source diff since `v0.18.2` | empty | `evidence/source-diff-since-0182.txt` |
| `npm run build` | clean | `evidence/build.txt` |
| `npm pack` | 71 files, 4,068,932 bytes | `evidence/npm-pack.txt` |
| Delta against the published 0.18.2 | 3 members changed: both READMEs and `package.json`; `package/lib/**` and `package/vendor/**` byte-identical | `evidence/pack-compare-0182.json` |
| README lint (T27/T28 copy) | 82 checks, 0 failures | `evidence/` in the T27 directory (`lint-after-t28.json`) |
| README link check (T28 copy) | 100 targets, 0 failures on the second run (first run: 2 transient failures fetching the CI badge, status 0) | `evidence/` in the T27 directory (`link-check-t28.json`) |

Candidate SHA-256: `8c3fb53e15ab43c9b7e28fbe2ff40ed164c2d16b8affaa0f9ad1fd2554e35596`.

## What was not re-run, and why

- **No `npm test` / typecheck / i18n.** `git diff v0.18.2..HEAD -- src tests scripts` is empty.
- **No host or UI gate.** `package/lib/client.js` and `vendor/**` are byte-identical to 0.18.2.

## Publication

| Item | Value |
|---|---|
| Tag | `v0.18.3` |
| npm `latest` | `0.18.3` |
| Registry tarball | byte-identical to the local pack |

(Values confirmed after the workflow completes.)
