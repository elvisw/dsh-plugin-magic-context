# 0.18.1 release

Date: 2026-11-19
Version: `@elvisw/dsh-magic-context@0.18.1`
Previous: `0.18.0` (published 2026-11-18)

## What is in it

Two changes, neither of which touches the engine:

1. **README rewrite (T26).** Both READMEs rewritten for readers; new `docs/glossary.md`;
   the risk-flag section now answers the market scanner's four flags with measured numbers.
   Not shipped in the tarball (`files` excludes `docs/`), but the two READMEs are.
2. **Native form enum fix.** `embedding.provider`, `embedding.preset`, `embedding.authHeader`
   and `journal.level` were `z.string()` in the config schema, so the dsh-go phone form
   rendered them as text boxes. The phone only renders a picker for a `union` whose members
   are all `const`. All four are now unions of constants with per-option zh/en labels.

## Behaviour change to be aware of

A value outside those four enums now fails config validation at load instead of passing
through. Previously `embedding.provider: 'openai'` (a typo) silently behaved as `local`;
it now reports `expected "local" | "openai-compatible" | "off" but got "openai"`. This is
recorded in the CHANGELOG. The TypeScript interface in `src/dsh/config.ts` already declared
these unions — the schema was simply looser than the type.

## Gate

Run on the working tree before packaging.

| Step | Result | Evidence |
|---|---|---|
| `npm test -- --maxWorkers=4` | 85 files / 1052 tests passed | `evidence/unit-test.txt` |
| `npm run typecheck` | clean | `evidence/typecheck.txt` |
| `npm run check:i18n` | ALL PASS | `evidence/i18n.txt` |
| `npm run build` | clean | `evidence/build.txt` |
| `npm pack` | 71 files | `evidence/npm-pack.txt` |

Candidate: `elvisw-dsh-magic-context-0.18.1.tgz`, 4,067,232 bytes,
SHA-256 `59b14c16faac65e64f349a725ab24dd2f7011ee243e90647df84e0148e1cff3b`.

## Delta against the published 0.18.0

`evidence/pack-compare-0180.json` — 71 members in both, nothing added or removed, four
members changed:

| Member | Why |
|---|---|
| `package/README.md` | rewrite |
| `package/README.zh-CN.md` | rewrite |
| `package/lib/index.js` | the four enum schemas |
| `package/package.json` | version |

`package/lib/client.js` and `package/vendor/**` are byte-identical, which is why the
settings UI needed no re-verification of its 45-step gate.

## What was not re-verified

- **No host gate.** The changed library code is the config schema; the browser client and
  the vendor payload are byte-identical to 0.18.0, whose Web gate passed. Re-running the
  T21 UI gate would exercise unchanged bytes.
- **No phone check before publishing.** The schema JSON shape is asserted by a unit test
  (`tests/config-schema.spec.ts`, "declares every enum field as a union of constants"),
  which is the same data the phone parses. The real-device confirmation is a two-minute
  manual check after install, and is listed as the follow-up below.
- **Not verified on iOS.** dsh-go has no public iOS build.

## Follow-up after publishing

Install 0.18.1 on the Android device, restart the local engine, open
Settings → Plugins → Installed → Magic Context → Configure, and confirm the four fields
render as pickers: 向量服务, 服务预设, 认证头, 日志级别.
