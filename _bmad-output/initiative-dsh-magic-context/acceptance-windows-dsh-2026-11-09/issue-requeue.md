## 发生了什么 / What happened

在 Windows 的隔离 profile 中，对未修改的 npm 发行包 `dsh-plugin-magic-context@0.11.1` 做真实 DSH 验收，发现同一工具输出在首次回收、恢复后，再次 `ctx_reduce` 虽返回 Queued，却不再实际回收。

**这不是原文丢失**：第二次回收没有发生，原文仍在当前上下文。影响是再次回收失效，以及工具成功回执与实际状态不一致。

> 2026-11-10 补充核实：这是 **插件 `dsh-plugin-magic-context@0.11.1` 的原位恢复语义下**的缺陷，不是原版 Magic Context 的缺陷，也不是要求原版对已回收的旧 tag 重复回收。这里的 `0.11.1` 是插件版本；实验使用的 DSH 宿主版本为 `0.2.2-rc.1`。建议优先考虑对齐原版：读取原始历史并作为新的工具结果返回，不改写旧占位符。下面区分现有缺陷证据与建议的新语义。

## 环境

- Windows，Node.js `v24.21.0`
- DSH 宿主 `0.2.2-rc.1`，插件 `dsh-plugin-magic-context@0.11.1`
- 真实 headless DSH + DeepSeek API，未使用模拟模型
- 独立 profile、会话库及插件 dataDir；未修改目标插件源码
- 本场景 `historianEnabled: false`，`policy.executeThreshold: 0`（加速回收）；后台 maintenance、embedding/vector 回填关闭

## 复现步骤 / Reproduction steps

### 为什么这里再次回收同一 tag 有意义

原版与 DSH 适配器的 `ctx_expand` 行为不同：

| 实现 | 展开时发生什么 | 后续要回收什么 |
|---|---|---|
| 原版已核查的 OpenCode 实现 | 读取原始历史，作为本次 `ctx_expand` 的工具结果返回，不把旧占位符替换成原文 | 新返回内容对应的新工具结果 tag；旧 tag 仍指向已回收项 |
| 插件 `dsh-plugin-magic-context@0.11.1` | 使用原文替换当前上下文中的旧占位符，保留原工具调用身份；本次工具回复仅是 `Restored in full: …` 状态确认 | 已恢复原节点仍对应旧 tag，因此现有语义下再次回收旧 tag 是有效请求 |

插件源码中，`ctx_expand` 调用 `replaceToolResultContent(session, placeholder.seq, original)`。该 helper 使用 `surfaceOp: { op: 'replace', startSeq: targetSeq, endSeq: targetSeq }`，保留原消息身份字段，替换当前上下文的同一位置；不是仅把原文放进本次工具回复。

真实宿主事件已核实（仅合成测试的序号，不含会话正文）：

```text
event 21：原始工具结果，tag 1
event 31：drop 占位符，surfaceOp = replace(21, 21)
event 37：恢复原文，surfaceOp = replace(31, 31)
```

三者先后占据同一上下文位置（索引 6）；21 与 37 的工具调用 ID、完整 content 均一致。第二次 reduce 后仍是 37，未出现第二次 drop。

固定版本参考：

- [插件 ctx_expand：原位替换及状态回执](https://github.com/wk544863858/dsh-plugin-magic-context/blob/93ef5fe4a06a2c05f53e6a6225346919e860d74e/src/dsh/tool-bridge.ts)
- [插件 replaceToolResultContent：surface replace 与身份保留](https://github.com/wk544863858/dsh-plugin-magic-context/blob/93ef5fe4a06a2c05f53e6a6225346919e860d74e/src/dsh/seams.ts)

### 插件当前原位恢复语义下的复现

1. 在新会话读取一个无敏感内容的小文件，取得工具结果 tag，例如 `1`。
2. 调用 `ctx_reduce {"drop":"1"}`，推进到回收实际落地，确认当前上下文出现 `[dropped §1§]`。
3. 调用 `ctx_expand {"tags":"1"}`，确认 **插件将原文恢复到原节点位置**，而非仅返回一份原文副本。
4. 再次调用 `ctx_reduce {"drop":"1"}`，并推进管理拍。
5. 观察当前上下文和宿主事件，再调用 `ctx_expand {"tags":"1"}`。

实际：第二次 reduce 仍显示 Queued，但整段实验只有一次 drop；末次 expand 返回：

```text
not restored: no dropped item carries this tag
```

此处 expand 拒绝只是第二次 drop 未发生的结果，不代表原文被删除。

期望（仅针对现有原位恢复语义）：已恢复的内容重新入队后，应再次成为 pending，并在满足回收条件时落地为占位符。若改为下述原版语义，这个“再次回收旧 tag”的期望便不再适用。

## 最小存储层复现

此复现用于佐证插件 `dsh-plugin-magic-context@0.11.1` 现有原位恢复路径的状态问题，不是要求采用新语义后继续满足同一 requeue 流程。

下面是已运行复现脚本的便携形式。在插件根目录（已构建 `lib/`）保存为 `repro-requeue.mjs`，运行 `node repro-requeue.mjs`。仅创建临时测试库，不接触日常数据库，也不需要模型凭据。

```js
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openStores } from './lib/core/stores.js';

const store = openStores(mkdtempSync(join(tmpdir(), 'mc-requeue-')));
const sessionId = 'synthetic-requeue-test';
try {
  store.queueDrop(sessionId, 1, 1);
  assert.deepEqual(store.listPendingDrops(sessionId), [1]);
  store.markDropLanded(sessionId, 1, 10);
  // ctx_expand 同样用 markDropLanded 记录恢复事件。
  store.markDropLanded(sessionId, 1, 20);
  store.queueDrop(sessionId, 1, 2);
  const pending = store.listPendingDrops(sessionId);
  console.log({ expected_pending: [1], actual_pending: pending });
  assert.deepEqual(pending, [1]);
} finally {
  store.close();
}
```

插件 `dsh-plugin-magic-context@0.11.1` 的实测输出为 `expected_pending: [1], actual_pending: []`，断言失败、退出码 1。宿主复现与存储层复现相互印证；实验检查过实际安装文件与 npm 包提取文件逐字节相同。

## 原因定位与建议

`src/core/stores.ts` 中，`queueDrop` 的冲突更新仅修改 `queued_at`，没有清空已有 `landed_event_seq`；而 `listPendingDrops` 仅查询 `landed_event_seq IS NULL`。恢复路径 `src/dsh/tool-bridge.ts` 又会通过 `markDropLanded` 写入恢复事件序号，因此重新入队后仍被 pending 查询排除。

### 优先建议：对齐原版的结果返回语义

建议让 `ctx_expand` **独立读取原始历史，将所需原文作为本次工具结果返回**，而不是替换旧占位符。原文内容的保真与旧上下文位置的还原是两回事，前者不必依赖后者。

期望的新行为：

1. 旧 tag `1` 对应的原节点继续保持已回收状态；展开不把它重新写回当前上下文，也不将其队列记录视作一次新的 drop/restore。
2. 返回的原文属于本次 `ctx_expand` 工具结果，由现有工具结果标记机制赋予新的 tag，例如 `N`；需要再次回收这份内容时，调用 `ctx_reduce {"drop":"N"}`，**不是再次 reduce `1`**。
3. 对已经回收的旧 tag 再次 reduce，可明确返回 already dropped/no-op，而不是声称它重新进入待回收队列。
4. 恢复定位应读取持久化原始历史，不以旧占位符仍可见为前提；这样也能与 #14 的“Historian 发布后独立检索原文”方向统一。此处是建议，不声称改成返回结果就自动解决了归档定位。
5. 调整工具说明与回归测试，明确“取回内容”和“撤销回收”不是同一操作，并验证新返回内容的标记与再次回收路径。

原版依据（固定提交 `17801ffd2f9635af1abae893e37914359110f2c1`；源码与测试核查，未另行运行原版验收）：

- [tools.ts](https://github.com/cortexkit/magic-context/blob/17801ffd2f9635af1abae893e37914359110f2c1/packages/plugin/src/tools/ctx-expand/tools.ts)：将历史读取结果作为工具返回值；支持 tag、消息序号、范围等路径。
- [render.ts](https://github.com/cortexkit/magic-context/blob/17801ffd2f9635af1abae893e37914359110f2c1/packages/plugin/src/tools/ctx-expand/render.ts)：TS tag 路径查持久化索引，再按原消息与工具调用 ID 读取内容，不扫描当前占位符来做原位替换。
- [Rust 模式边界测试](https://github.com/cortexkit/magic-context/blob/17801ffd2f9635af1abae893e37914359110f2c1/packages/plugin/src/tools/ctx-expand/rust-mode-tag.test.ts)：该模式明确拒绝 tag 查询并保留消息序号路径。因此建议对齐的是“独立读取、结果返回”的语义，不是宣称原版所有模式都支持旧 tag。

### 若暂时保留原位恢复

则仍需修正现有重新入队状态转换，补充 `drop → 原位 restore → requeue → drop → restore` 的存储层与真实宿主回归测试，并保持重复排队的幂等语义。这是兼容现有设计的修复方向，不与优先建议混为同一个验收契约。

尚未实现或验证任何修复；以上区分了当前可复现缺陷与可供维护者选择的语义改进。

## 相关 journal 与公开披露

未附完整 journal/会话归档；上面仅摘录无敏感内容的结果与状态，结论来自宿主事件及当前上下文核验，不依赖模型自述成功。

- [x] 已搜索现有 issue，未找到相同问题。
- [x] 本文不含密钥、私人会话正文、记忆库内容或本机绝对路径，理解内容将公开。
