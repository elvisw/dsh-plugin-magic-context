---
id: 35
type: story
title: "Support DSH 0.2.2-rc.5 in the declared host versions"
parent: initiative-dsh-magic-context
covers: [package.json, package-lock.json, README.md, README.zh-CN.md, CHANGELOG.md, _bmad-output/initiative-dsh-magic-context/acceptance-windows-dsh-2026-11-21-t35-rc5-support/]
after: [34]
refined: false
hitl: true
risk: medium
---

# Support DSH 0.2.2-rc.5 in the declared host versions

## Description

T34 proved a repackaged 0.18.8 candidate (version and engines.dsh only) loads and works on DSH 0.2.2-rc.5 once the version gate allows it; the shipped declaration still lists only 0.2.1-rc.1 and 0.2.2-rc.1, so rc.5 skips the released package. Add the exact rc.5 entry without dropping the older ones, ship it as a patch release, and cover the installer path T34 did not test.

## Requirements

Verify: package.json engines.dsh keeps both existing entries and adds exactly 0.2.2-rc.5; the packed tarball differs from registry 0.18.8 only in package.json (version and engines.dsh) and the two READMEs, with lib and vendor byte-identical; an isolated DSH 0.2.2-rc.5 install through dsh plugin add accepts the patch version without an exact-version exemption, loads the plugin row and opens the settings section, with DSH_HOME, user directories and npm/pnpm write targets asserted inside the root; README and CHANGELOG say the version is declared and verified only on Windows Web. No source or test bytes change, so no product test matrix is rerun.

## References

- parent — _bmad-output/initiative-dsh-magic-context/initiative-dsh-magic-context.md

## Notes

- Decision: 2026-11-21 — 只追加精确 `0.2.2-rc.5`，保留 `0.2.1-rc.1` 与 `0.2.2-rc.1`；README 写「已声明、Windows Web 已验证」，不扩大成其他宿主。
- First ticket validation: NEEDS CHANGES on tarball member scope, candidate provenance and installer isolation; plan amended accordingly before implementation.
