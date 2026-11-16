# Reproduce — T16 compaction scope

This ticket is copy/documentation only. Run from the repository root.

## 1. Read the scope

- `src/client/index.js`: `settings.field.registerCompactionEngine.hint` (zh/en)
- `src/index.ts`, `src/dsh/config.ts`: comment-only scope qualifiers
- `cordis.patch.yml`: package header comment
- `README.md`: compaction bullets, capability table, configuration warning,
  upstream issue link
- `README.zh-CN.md`: the same sections in Chinese
- `docs/dsh-plugin-settings-ui-contract.md`: §5 `Compaction takeover scope`
- `CHANGELOG.md`: `[Unreleased] → Changed`

## 2. Gates

```powershell
npm test
npm run typecheck
npm run check:i18n
npm run build
git diff --check
```

Expected: 77 files / 922 tests; typecheck, i18n and build pass; only CRLF
warnings from `git diff --check`.

## 3. Scope checks

```powershell
rg -n "flat/headless|agent preset|桌面端|Desktop" README.md README.zh-CN.md docs/dsh-plugin-settings-ui-contract.md src/client/index.js
rg -n "先禁用宿主压缩行|disable the host compaction row first" src tests README.md README.zh-CN.md docs
rg -n "issues/16|issue #16" README.md README.zh-CN.md docs/dsh-plugin-settings-ui-contract.md CHANGELOG.md
```

The second command must return no hit outside the test's negative assertion.
The third must find the upstream issue link in all four documents.

## 4. What not to expect

- No profile patch writer, no `compaction-basic` editing, no
  `ctx.loader.update`.
- No host browser gate for this ticket; T13's Settings gate remains the card
  rendering evidence.
- No release or version bump.

The acceptance report and evidence logs are in this directory.
