# 引用语义核查：指定竞品 [1]–[9]

核查日 2026-11-09。范围锁定：`research-context-plugin-landscape.md` 中由 [1]–[9] 支持的事实；[10]–[21] 由另一独立核查负责，本文不涉及。本文结论仅基于已读材料，未再发起网络请求。方法：读取报告、`digests/named-competitor.md`、`digests/named-verification.md`，并按固定 SHA 取回 README、PARITY、`tests/phase1.spec.ts`、CHANGELOG 原文。未安装、未运行插件，未执行测试。

## 总判

未发现把 mock 测试、CI 或发行记录直接写成“本机运行成功”的致命断言。报告总体保留了“源码支持 / 作者自述 / 发行证据 ≠ 运行验证”的分层。发现 1 处能力表述过宽、1 处引文缺号，以及若干把作者文档写成“已交付/已实现”的措辞需要降级。Windows、任意历史恢复、跨会话恢复均被正确写成“未验证/未证明”，没有写成“不存在/不可用”。

## Findings

### F1 [高] “计量机制未移植”过宽

- 原句：报告第 32 行“完整Dreamer、部分自动回收及计量机制未移植。[8]”
- 来源：`PARITY.md` §C 表格写明 `tokenizer calibration, image token estimate, decision calibration | absent | accounting is chars/4 (src/core/compartments.ts:59); image-heavy sessions are underestimated`；README 的 `Known limits` 也写明 `Historian triggering and budgeting use chars/4 estimates, not a real tokenizer`。
- 判定：部分支持，但“计量机制”不准确。适配器仍有 chars/4 计量、压力调度与紧急回收；缺的是精确 tokenizer、图像 token 估算及校准。应改为“精确 tokenizer/图像计量未移植”或“计量校准未移植”。同句“部分自动回收”建议点名 `watermark age reclaim`（PARITY §C 明确该项 absent）。
- 影响：现措辞会被读成“完全没有计量/自动回收”，与来源不符。

### F2 [中] GitHub release 页陈述没有对应编号

- 原句：第 29 行“GitHub release页仍显示早期v0.9.0，不能据此忽略npm后续版本。[1][7][9]”
- 来源：[1] 是 npm registry（版本/gitHead），[7] 是 CI run，[9] 是 CHANGELOG；三者都不能证明 release 页当前显示什么。`named-competitor.md` C1 另引 `https://github.com/wk544863858/dsh-plugin-magic-context/releases/tag/v0.9.0`，但报告来源表未列该 URL。
- 判定：事实有摘要证据，但编号引用不成立。应在来源表增加 release 页条目，或删去“GitHub release页仍显示……”；只保留 npm 0.11.1 与 changelog/CI 的支撑。
- 同句其余部分支持：[1] 的 0.11.1/gitHead；[9] 的 0.11.1 日期 2026-11-07；[7] 的同日 CI success（本次核查记录）。

### F3 [中] “已经覆盖/已交付/已实现/已有”把作者文档说得像运行/交付证明

- 原句：
  - 第 21 行“它已经覆盖可逆工具回收、Historian、持久记忆与基础UI。[1][2][3][8]”
  - 第 31 行“已交付范围广于我们尚未实施的阶段0：作者文档列出……”
  - 第 49 行“作者已实现四层带外摘要与发布”
  - 第 54 行“作者已有配置卡和遥测”
- 来源：README/CHANGELOG 是作者文档；[3][4] 只支持工具恢复源码；[1] 只是发行元数据。`named-verification.md` 明确“没有独立运行证据；承重能力 unverified/medium”，且“本次未下载 tarball，也未验证其内容与 gitHead 的对应关系”。
- 判定：Historian、持久记忆、UI、遥测的产品范围有 README 直接文字支持，但没有本次运行或独立验收。“已经覆盖/已交付/已实现”应降为“源码与作者文档显示/声称”；第 21 行的 [1] 不应作为能力证据。建议保留“可逆工具回收”的源码/测试限定，其余三项标注“作者自述，未独立运行”。
- 注：报告的来源表和证据分级已写“作者自述/medium”，所以这是正文措辞与自设口径不一致，不是完全无依据。

### F4 [中低] “测试支持/mock集成测试”容易被读成测试已通过

- 原句：第 30 行“核心闭环有源码和测试支持……集成测试使用真实DSH agent loop和MockAdapter，断言原正文→占位符→原正文。[3][4][5]”；第 47 行“有源码和mock集成测试”。
- 来源：`tests/phase1.spec.ts` 本次只读代码，未执行；它确实启动真实 `AgentLoop`/`SessionStore`，但 LLM 是 `MockAdapter`，不是真实模型或桌面宿主；测试只覆盖单会话、当前 surface 的 queued→placeholder→expand 与 emergency，不含重启、Historian 遮蔽、跨会话。
- 判定：机制描述支持，测试边界也基本正确；但“测试支持”可被读成“测试通过”。建议正文改为“有测试代码覆盖（本次未执行；MockAdapter 非真实模型）”，不要只把“本次未执行”放在来源表。
- 这不算把 mock 当运行证明；第 47 行已明确“mock”，第 86 行也说“mock测试不等于完整端到端验收”。

### F5 [低] “公开CI仅ubuntu-latest”超出已读范围

- 原句：第 33 行“公开CI仅ubuntu-latest＋Node22/24”。
- 来源：[6] 只指向 `.github/workflows/ci.yml`；`named-verification.md` #4 明确“本次仅抽查摘要所引 CI 文件，未穷尽所有工作流或私人测试记录”；CHANGELOG 另提 `.github/workflows/release.yml`。
- 判定：已读的 `ci.yml` 是 ubuntu-latest + Node 22/24，支持；但“公开CI仅”是全称。改为“已核查的 ci.yml 仅……”或“公开测试工作流（本次已读）……”。Windows 结论“未证明可用，也未证明不可用”仍成立。

### F6 [低] “never breaks the live prefix”不是逐字引文；“实现”归因偏强

- 原句：第 37 行“README的‘never breaks the live prefix’不应解释成永久缓存命中。其配置和实现同时承认回收落地是受控的priced bust。[2][3]”
- 来源：README 原文是“none of it ever breaks the live KV-cache prefix”（导语）和“never a spontaneous prefix bust”（工具表）；“priced bust”原文在 README 的 `ctx_reduce` 行：“landing is a priced bust that waits for the reclaim band, never spontaneous”。
- 判定：语义正确，但引号内不是原文；“配置和实现同时承认”中的“实现”本次只从 [3] 读到工具入口/恢复，未从 [3] 取得 execute-band 调度证据。建议改为“README 明确说明……”，去掉“配置和实现”或补引 pre-step/policy；不要把 README 的叙述写成源码已证明的调度。
- 此为引文精度问题，不影响“不是永久缓存命中”的结论。

## 已核对且无需改动的支持关系

- [1] npm latest=0.11.1、gitHead=93ef5fe4a06a2c05f53e6a6225346919e860d74e；[7] 同 SHA CI success；[9] 0.11.1 日期 2026-11-07：支持第 29 行发行/CI 部分。发行记录不等于安装/运行成功，报告第 84 行已写明。
- [3][4][5]：`ctx_reduce` 只入队；`ctx_expand(tags)` 在当前 surface 找占位符，沿 `sourceEventSeqs` 取原始 `tool/result` content，replace，不重跑工具、不生成摘要；phase1 代码断言原文→占位符→原文。支持第 30、47 行机制部分。未执行测试，不能写成通过。
- [2]：四层 Historian、项目 SQLite、FTS+本地向量、共享域、维护 tick、设置卡/遥测、默认不接管 compaction-basic、启用时需禁用 compaction-basic：README 直接支持。仍是作者文档。
- [8]：自有 corpus、legacy `context.db` 不开、无存储兼容义务；full dreamer 仅 tick slice；watermark age reclaim、tokenizer/image/decision calibration、edit-marker 等未移植：PARITY 直接支持。第 32 行只需把“计量机制”收窄。
- [6]：已读 `ci.yml` 仅 ubuntu-latest、Node 22/24；无 Windows runner。Windows 未验证，不是已证明不可用；报告第 33、60、85 行处理正确。
- 负向边界：第 32/38/50/52/53 行用“未见于已读接口/未确认/不在已读 phase1 测试范围”，没有把“未确认”写成“不存在”；第 38 行明确任意 message/range、跨会话、Historian 遮蔽后恢复均未证明；第 53 行明确“未确认不能写成绝不存在”。这与 `named-verification.md` 的边界一致。

## 结论与需降级处

1. 必须改：第 32 行“计量机制未移植”改为“精确 tokenizer/图像计量未移植”；“部分自动回收”最好点名 watermark age reclaim。
2. 必须补/删：第 29 行 GitHub release 页陈述补来源或删去。
3. 建议降级：第 21/31/49/54 行“已经覆盖/已交付/已实现/已有”改为“源码与作者文档显示/声称”；第 21 行移除 [1] 的能力归因。
4. 建议限定：第 30/47 行“测试支持”改为“测试代码存在，本次未执行，MockAdapter 非真实模型”；第 33 行“公开CI仅”改为“已读 ci.yml 仅”。
5. 未覆盖：未下载 npm tarball、未安装/运行、未执行测试、未做 Windows/重启/Historian 遮蔽/跨会话实测；未核查 [1]–[9] 之外的新增竞品；未审计作者私有测试或其他工作流。以上均不能由本次证据下结论。
