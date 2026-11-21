---
title: 'Support DSH 0.2.2-rc.5 in the declared host versions'
ticket: 35
created: '2026-11-21'
status: done
baseline_revision: '93a4f07a968c13ca29424f75e09448399df9011e'
route: full
route_source: pinned
risk: medium
review: quick
review_source: pinned
lenses_ran: []
review_loop_iteration: 0
context: []
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

让已发布的插件字节能在 DSH `0.2.2-rc.5` 上正常加载：把精确的 `0.2.2-rc.5` 加入 `engines.dsh`，保留原有 `0.2.1-rc.1` 与 `0.2.2-rc.1`，以补丁版发布，并补上 T34 没有覆盖的安装器路径。

## Boundaries & Constraints

**Always:** 只改兼容声明、版本号和相应文档；补丁包相对 registry `0.18.8` 只允许 `package.json`、`README.md`、`README.zh-CN.md` 三个成员变化，其中 `package.json` 只允许 `version` 与 `engines.dsh` 两个字段变化。安装验证使用新的隔离根，同时固定 `DSH_HOME`、`HOME`/`USERPROFILE`、`XDG_*` 与 npm/pnpm 的 cache/config/store，并逐项断言解析结果在根内。

**Never:** 不删除旧版本条目，不放宽到 `0.2.2` 全系列或 `^0.2.2`；不使用 `allow-version`；不改 `src/`、`tests/`、`lib/`、`vendor/`、`cordis.patch.yml`、`tools/`；不动日常安装或数据；未经用户明确授权不推送、不发版。

| 输入 | 预期 | 未达到时 |
|---|---|---|
| `package.json` | `engines.dsh` 为原有两项加精确 `0.2.2-rc.5` | 停止，不自行调整兼容范围 |
| 打出的补丁包 | 相对 registry `0.18.8` 只有 `package.json`（仅 `version`/`engines.dsh`）与两份 README 变化，`lib`/`vendor` 逐字节相同 | 出现其他成员或字段差异即停止 |
| `dsh plugin add` on `rc.5` | 无豁免安装成功、插件行加载、设置入口可打开 | 记录首个失败点，不把安装器失败写成兼容通过 |

</frozen-after-approval>

## Code Map

- `package.json`：`version` 与 `engines.dsh`；发布工作流要求 tag 等于版本、tagged commit 在 `main` 上。
- `README.md` / `README.zh-CN.md`：安装一节列出的支持版本。
- `CHANGELOG.md`：`0.18.9` 段落，只记兼容声明与验证结论。
- `_bmad-output/initiative-dsh-magic-context/acceptance-windows-dsh-t34-rc5/`：T34 的 rc.5 运行期证据，本票不重跑。
- `_bmad-output/initiative-dsh-magic-context/acceptance-windows-dsh-2026-11-21-t35-rc5-support/`：本票新增的候选比对与隔离安装证据。

## Tasks & Acceptance

- [x] 更新 `package.json` 的 `engines.dsh`（保留两项、追加精确 `0.2.2-rc.5`）、`README.md`/`README.zh-CN.md` 的版本声明（写「声明」并注明 rc.5 只在 Windows Web 验证）与 `CHANGELOG.md` 的 `0.18.9` 段落；版本号用 `npm version 0.18.9 --no-git-tag-version` 同步 `package-lock.json`。
- [x] `npm run build` 后 `npm pack` 出本地候选；用 T34 的成员比对脚本对比 registry `0.18.8` tarball，断言只允许的三个成员变化、`package.json` 只有两个字段变化、`lib`/`vendor` 逐字节相同。
- [x] 在新的隔离根内安装官方 `@deepseek-ai/dsh@0.2.2-rc.5`（`npm --prefix <root>/host …`），用 `<root>/host/node_modules/@deepseek-ai/dsh/lib/bin.js plugin --profile web add <绝对路径 tarball>` 安装候选；环境变量固定 `DSH_HOME`、`HOME`、`USERPROFILE`、`XDG_CONFIG_HOME`、`XDG_CACHE_HOME`、`XDG_DATA_HOME` 与 `npm_config_cache`/`userconfig`/`globalconfig`、pnpm store/config，并断言全部解析到根内且无 `allow-version`、无 `compatibility.json`；断言插件行加载、设置入口可打开。
- [x] 写 `acceptance-windows-dsh-2026-11-21-t35-rc5-support/` 报告并做一次独立只读复核；报告与证据关联后提交。发布（tag + npm publish）与发布后 registry 字节复核另需用户授权，届时再执行。

**Acceptance Criteria**

- 给定打包后的补丁包，`engines.dsh` 同时包含 `0.2.1-rc.1`、`0.2.2-rc.1` 与精确 `0.2.2-rc.5`；相对 registry `0.18.8` 只有 `package.json`（仅 `version`、`engines.dsh`）与两份 README 变化，`lib`/`vendor` 逐字节相同。
- 给定隔离的 `rc.5` 宿主，`dsh plugin add` 在未启用精确版本豁免时安装并加载该补丁包，插件设置入口可打开；隔离断言覆盖 `DSH_HOME`、用户目录变量与 npm/pnpm 写目标。
- 文档把 rc.5 写成「已声明、仅在 Windows Web 验证」，与 `package.json` 一致，且未把 T34 的单路径结论扩大成其他宿主或版本的兼容声明。

## Implementation Notes

- 2026-11-21：用户要求按 T34 结论继续，并把精确 `rc.5` 加入兼容声明、用补丁包补一次隔离安装检查。发布仍需单独授权。
- T34 已证明一个只改兼容声明与版本号的重打包候选（`0.18.8-t34.rc5.1`）在 `rc.5` 上运行正常（回收、取回原文、重启后检索、Web 设置入口）；registry 上的 `0.18.8` 本身在 `rc.5` 被拒载。本票不重跑该会话，只验证安装器路径与包差异，运行期结论按 `lib`/`vendor` 字节相同迁移，不声称 T34 测过发布包。
- 票面校验第一轮指出三处不可实现：README 也进 tarball、`release.yml` 会在 tagged commit 上重新 build（本地 pack 只是候选）、`--prefix` 属于 npm 而不是 `dsh plugin add`。已按建议改为显式允许三个成员变化、把隔离锁定到 `DSH_HOME` 与 npm/pnpm 写目标，并在发布后另做 registry 字节复核。

## Plan Change Log

## Review Triage Log

- 独立票面校验（`deepseek-v4.1-flash`）：NEEDS CHANGES。指出 README 也进 tarball 使「只差 package.json」不可成立、`release.yml` 会在 tag 上重新构建、`--prefix` 属于 npm 而不是 `dsh plugin add`。计划据此改为显式三成员白名单、`DSH_HOME`/用户目录/npm-pnpm 写目标断言、发布后另做 registry 复核。
- 独立报告审计（`deepseek-v4.1-flash`）：NEEDS CHANGES。六条全部落在报告与证据层：T34 provenance 写成发布包、pnpm/XDG 写目标缺证据、宿主 CLI 版本未入证据、主目录基线未说明是事故后、`package-lock.json` 未同步、候选与发布字节未区分。逐条修复后复校为 PASS，未发现新越界表述。

## Verification

- `git diff --check` 无错误；`src/`、`tests/`、`vendor/` 无变更，跑一次 `npm run build` 只为确认打包输入未变，不重跑产品测试矩阵。
- 包差异以逐成员比对为准；安装以真实 `dsh plugin add` 的退出状态、loader 行状态和设置入口渲染为准，不以 `--dump-config` 单独作证。
- 独立复核确认报告没有超出证据：区分「安装器接受」与「运行期兼容」，后者引用 T34。
