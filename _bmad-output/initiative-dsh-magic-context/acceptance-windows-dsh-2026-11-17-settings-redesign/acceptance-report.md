# T21 Settings redesign — acceptance report

> Status: PASS (isolated Web gate). This report covers the T21 layout and action
> contract only. It is not a release, a real-vendor test or a daily-profile test.

## 1. Identity

| Item | Value |
|---|---|
| Ticket | T21 `story-settings-ui-redesign` |
| Package | `@elvisw/dsh-magic-context@0.15.0` (working tree; not published) |
| Candidate tarball | `%TEMP%\opencode\t21-pack\elvisw-dsh-magic-context-0.15.0.tgz` |
| Tarball SHA-256 | `5454554bf51e7d7c0b3a19e9e34fa2f95064c4ed97f4fe0d1b1a650080d950f0` |
| Tarball size / files | 4,054,369 bytes / 68 entries |
| Host | DSH `0.2.2-rc.1` Web, Node `24.21.0` |
| Isolated root | `%TEMP%\opencode\dsh-mc-t21-20261117-101827` |
| Gate | Playwright `1.63.0`, Chromium (msedge channel), 45 recorded steps |

The tarball was installed into a fresh profile; the daily `~/.dsh/profiles/web`
profile, its sessions and its plugin databases were not used.

## 2. What changed

The card is now one `settings.section` page:

- Four-metric summary strip: reclaim policy, Historian, vector space, rebuild.
- Five sections: 常规, 历史摘要, 日志, 向量检索, 维护与诊断.
- Jump row, advanced disclosures and a text-only status strip above the fixed
  host footer.
- The legacy `plugins.item` / `plugins.row.config` registrations, the
  `ROW_CONFIG_KEY` export and the plain-control fallback are removed.
- Dirty Load models/Test connection run one revision-fenced Save first and are
  labelled `保存并加载模型` / `保存并测试`; Start/Rollback require a clean form;
  Rollback calls `disarm` only after the accepted Save.
- Ten real remote states, Chinese/English copy and a 2s/15s polling cadence are
  preserved; Refresh is deduplicated; Pause/Resume do not depend on drafts.

The config schema, defaults, validation, revision-fenced Save, server routes and
package version are unchanged.

## 3. Gate result

`evidence/ui-gate.json`: **45 recorded steps, 0 failures, 0 console errors**.

| Area | Observed |
|---|---|
| Layout | Five `[data-mc-section]` blocks, one `[data-mc-summary]`, the expected Chinese section/summary labels are present; the jump row has five buttons and the 向量检索 button scrolls the embedding section into view; clicking the embedding advanced disclosure exposes its advanced fields |
| Save surface | Exactly one visible Save button in the host dialog; no in-card Save |
| Zero-memory start | Start disabled before any searchable memory was seeded |
| First-time dirty actions | Empty saved endpoint/model; typing values yields `保存并加载模型` and `保存并测试`; Save remains the only config writer |
| Model list | `保存并加载模型` saved then loaded `fixture-embed-a` / `fixture-embed-b` from the fake endpoint |
| Probe | `测试连接` wrote `16 维`, state `未开始重建`; `evidence/embedding-requests.jsonl` records the explicit probe (`embeddings`, 1 input) and no automatic request before it; Start was then enabled |
| Start | Confirmation showed `这会重新计算 3 条记忆`; Start became `迁移中` |
| Pause/resume | Both routes were clicked; state moved `迁移中` → `已暂停`, Load/Test were disabled while paused, and Resume was followed by `迁移中` or `已就绪` |
| Rollback | Confirmation first; no `disarm` before the mutation; POST mutate then POST `action=disarm`; status `已回滚到本地 · 本地` |
| Language | Chinese visible labels and `aria-label`s; English switched from General and the reopened card showed the English section titles |
| Narrow | 540px viewport; 常规, 历史摘要 and 向量检索 headings were checked, and the page has no horizontal scroll |
| Errors | Zero page/console errors |

Screenshots: `screenshots/01-summary-zh.png` … `06-narrow-en.png`.
The fake endpoint is a local simulation; no real vendor was called.

## 4. Not covered

- No real SiliconFlow/vendor request; the fixture returns fixed 16-dimensional
  vectors.
- The gate opened the card through the isolated Web host only; Desktop and
  dsh-go are not part of T21.
- No package publication, tag, version bump or daily-profile change.
- A host without `settings.section` or without the DSH primitives is source-
  checked to have no configuration card; that absence is not a browser scenario
  in this gate.
