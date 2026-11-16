# Settings redesign — static wireframes

These are layout wireframes, not visual comps. All colors, type and radii come from `DESIGN.md` and DSH alias tokens. Behavior, states and button visibility come from `EXPERIENCE.md`; if this file disagrees, `EXPERIENCE.md` wins.

## Wide (≥ 760px)

```text
┌─ Magic Context ─────────────────────────────────────────────────────────────┐
│ 回收策略        Historian       向量空间        重建                         │
│ 65% / 85%       开 · low        本地            未启用                       │
├─────────────────────────────────────────────────────────────────────────────┤
│ 常规   Historian   Journal   向量检索   维护与诊断                          │
├─────────────────────────────────────────────────────────────────────────────┤
│ 常规                                                                        │
│ 决定什么时候回收、什么时候强制回收。                                        │
│                                                                             │
│ 执行阈值                          强制阈值                                 │
│ [ 65                          ]   [ 85                          ]          │
│ 达到该压力后开始回收              达到该压力后强制回收                      │
│                                                                             │
│ 假定窗口                          回收 TTL                                 │
│ [ 128k                        ]   [ 300s                        ]          │
│                                                                             │
│ 保护结果条数                                                               │
│ [ 8                           ]                                              │
│                                                                             │
│ ▸ 高级（baseline / memory budget / memory limit）                           │
│                                                                             │
├─────────────────────────────────────────────────────────────────────────────┤
│ Historian                                                    [开]            │
│ 用哪个模型写历史摘要、何时触发。                                            │
│                                                                             │
│ 生成路由                          推理强度                                 │
│ [ Auto — 先选择 provider   ▾ ]   [ Default (model decides)     ▾ ]        │
│                                                                             │
│ ▸ 高级（节点数、token 上限、timeout）                                       │
│                                                                             │
├─────────────────────────────────────────────────────────────────────────────┤
│ Journal                                                                     │
│ 决定是否保留操作日志、保留多久。                                            │
│                                                                             │
│ [x] 启用 Journal                 保留天数                                  │
│                                  [ 14                          ]           │
│                                                                             │
│ ▸ 高级（文本镜像）                                                          │
│                                                                             │
├─────────────────────────────────────────────────────────────────────────────┤
│ 向量检索                                              [未开始重建]          │
│ 本地优先；远程 provider 需要显式开始重建。                                   │
│                                                                             │
│ 向量提供方                         服务预设                                 │
│ [ OpenAI 兼容 API          ▾ ]   [ 硅基流动                  ▾ ]          │
│                                                                             │
│ 接口地址                                                                    │
│ [ https://api.siliconflow.cn/v1                                            ]│
│                                                                             │
│ 模型 ID                             API Key 环境变量                        │
│ [ BAAI/bge-m3              ]       [ SILICONFLOW_API_KEY                   ]│
│                                                                             │
│ 状态: 未开始重建 · BAAI/bge-m3 · 1024d · 0/12 条可检索记忆                  │
│ API Key: 已配置 (SILICONFLOW_API_KEY)                                      │
│ [刷新] [加载模型] [测试连接]   [开始重建向量]   [回滚到本地]                │
│                                                                             │
│ ▸ 高级（认证头、维度覆盖、前缀、超时、批大小）                              │
│                                                                             │
├─────────────────────────────────────────────────────────────────────────────┤
│ 维护与诊断                                                                  │
│ 维护路由 / 压缩引擎开关 / 复制 /ctx-status                                  │
│                                                                             │
├─────────────────────────────────────────────────────────────────────────────┤
│ 3 项未保存                                                                  │
│                                      host footer: [重置]   [保存]           │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Narrow (< 560px)

```text
┌─ Magic Context ───────────────────────────────┐
│ 回收策略              65% / 85%               │
│ Historian             开 · low                │
│ 向量空间              本地                    │
│ 重建                  未启用                  │
├───────────────────────────────────────────────┤
│ 常规  Historian  Journal  向量检索  维护 →    │
├───────────────────────────────────────────────┤
│ 向量检索                         [未开始重建] │
│                                               │
│ 向量提供方                                    │
│ [ OpenAI 兼容 API                  ▾ ]        │
│                                               │
│ 服务预设                                      │
│ [ 硅基流动                          ▾ ]        │
│                                               │
│ 接口地址                                      │
│ [ https://api.siliconflow.cn/v1              ]│
│                                               │
│ 模型 ID                                       │
│ [ BAAI/bge-m3                                ]│
│                                               │
│ API Key 环境变量                              │
│ [ SILICONFLOW_API_KEY                        ]│
│                                               │
│ ▸ 高级                                        │
│                                               │
│ 状态: 未开始重建 · 1024d · 0/12               │
│ [刷新] [加载模型] [测试连接]                  │
│ [开始重建向量]                                │
│ [回滚到本地]                                  │
├───────────────────────────────────────────────┤
│ 3 项未保存                                    │
│                         host footer: [重置] [保存] │
└───────────────────────────────────────────────┘
```

## Section behavior

See `EXPERIENCE.md`. The jump row scrolls and never filters or unmounts sections; advanced is closed by default; the status strip never covers the last field.
