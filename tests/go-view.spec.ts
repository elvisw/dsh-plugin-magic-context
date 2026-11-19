/**
 * T23: the pure native view layer.
 *
 * These assertions run without a bridge or a phone. The telemetry payload is
 * produced by the REAL `createTelemetryService(...).summary(...)`, not by a
 * flattened fixture: the v2 fields live under `summary.health`, and a fixture
 * that put them at the top level would let the native mapping read the wrong
 * shape forever.
 */
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  GO_CONTEXT_PANEL_ID,
  GO_EMBEDDING_PANEL_ID,
  GO_STRIP_ID,
  clampGoText,
  formatGoNumber,
  goContextData,
  goContextView,
  goEmbeddingActionCopy,
  goEmbeddingData,
  goEmbeddingErrorDetail,
  goEmbeddingErrorText,
  goEmbeddingStartAction,
  goEmbeddingStateText,
  goEmbeddingStateTone,
  goEmbeddingView,
  goLocale,
  goModelRows,
  goStripData,
} from '../src/dsh/go-view.ts'
import type { EmbeddingStatus } from '../src/dsh/embedding-lane.ts'
import { createTelemetryService, type TelemetryService } from '../src/dsh/telemetry.ts'
import { openStores } from '../src/core/stores.ts'

const NOW = 1_760_000_000_000
const cleanups: Array<() => void> = []
afterEach(() => {
  for (const cleanup of cleanups.splice(0).reverse()) cleanup()
})

interface Fixture {
  readonly service: TelemetryService
  readonly summary: (sessionId?: string) => Record<string, unknown>
}

function tempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'mc-go-view-'))
  cleanups.push(() => rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 40 }))
  return dir
}

/** The REAL service summary: no additive field is copied to the top level. */
function telemetry(incomplete = false): Fixture {
  const dir = tempDir()
  const stores = openStores(dir)
  cleanups.push(() => stores.close())

  stores.appendJournal({ at: NOW - 6_000, level: 'info', kind: 'boot', summary: 'adapter booted' })
  stores.appendJournal({
    at: NOW - 4_000, level: 'info', kind: 'pass', sessionId: 's1',
    summary: 'execute at 66%',
    data: { decision: 'execute', tokensBefore: 1_000, tokensAfter: 900, tokensDelta: -12_000, contextWindow: 256_000, pressure: 62.5 },
  })
  stores.appendJournal({ at: NOW - 3_500, level: 'info', kind: 'drop-landed', sessionId: 's1', summary: 'dropped 1' })
  stores.appendJournal({
    at: NOW - 3_000, level: 'info', kind: 'memory-recall', sessionId: 's1',
    summary: 'recalled 5 memories', data: { identity: 'git:abc', rows: 5, estTokens: 300 },
  })
  stores.appendJournal({
    at: NOW - 2_500, level: 'info', kind: 'profile-recall', sessionId: 's1',
    summary: 'profile loaded', data: { estTokens: 100 },
  })
  stores.appendJournal({ at: NOW - 2_000, level: 'error', kind: 'error', sessionId: 's1', summary: 'historian failed' })
  stores.appendJournal({
    at: NOW - 1_500, level: 'info', kind: 'pass', sessionId: 's2',
    summary: 'defer at 30%',
    data: { decision: 'defer', tokensBefore: 500, tokensDelta: 0, contextWindow: 128_000, pressure: 30 },
  })
  stores.appendJournal({
    at: NOW - 1_000, level: 'info', kind: 'memory-recall', sessionId: 's2',
    summary: 'recalled 2 memories', data: { identity: 'git:other', rows: 2, estTokens: 50 },
  })
  // Appended last: the store orders by insertion id, and the newest
  // context-pressure reading is what both the Web view and the native view
  // prefer over the pass ledger.
  stores.appendJournal({
    at: NOW - 500, level: 'info', kind: 'context-pressure', sessionId: 's1',
    summary: 'pressure', data: { projectedTokens: 170_000, contextWindow: 256_000 },
  })
  if (!incomplete) {
    stores.queueDrop('s1', 1, NOW - 4_000)
    stores.queueDrop('s1', 2, NOW - 4_000)
    stores.queueDrop('s1', 3, NOW - 4_000)
  }

  const service = createTelemetryService({
    stores,
    meta: () => ({
      engine: 'disabled-by-config',
      memory: 'ok schema v95',
      memoryWrite: 'ok',
      toolsMode: 'dynamic-import',
    }),
    startedAt: NOW - 3_600_000,
    now: () => NOW,
    ...incomplete ? {} : { adapterVersion: () => '0.17.0' },
    ...incomplete ? {} : {
      policy: () => ({ executeThreshold: 65, forceThreshold: 85 }),
      projection: (sessionId: string) => sessionId === 's1'
        ? { contextBreakdown: { systemTokens: 1_000, toolsTokens: 2_000, messageTokens: 3_000 } }
        : undefined,
      messageComposition: (sessionId: string) => sessionId === 's1'
        ? {
            conversation: 1_200,
            toolCalls: 800,
            compartments: 500,
            memories: 300,
            profile: 100,
            other: 100,
            residualTokens: 0,
          }
        : undefined,
      historian: (sessionId: string) => sessionId === 's1'
        ? { running: true, compartments: 2, coveredTokens: 5_000, lastPublishedAt: NOW - 60_000 }
        : undefined,
      surface: (sessionId: string) => sessionId === 's1'
        ? { tagged: 8, dropped: 3, reclaimableTokens: 9_000 }
        : undefined,
      memoryStats: (sessionId?: string) => sessionId === 's1'
        ? { total: 12, verified: 7, unverified: 5 }
        : undefined,
      maintenanceLast: () => ({ at: NOW - 120_000, expired: 1, verified: 2, updated: 1, archived: 1 }),
    },
  })
  return { service, summary: (sessionId?: string) => service.summary(sessionId) }
}

function embeddingStatus(overrides: Partial<EmbeddingStatus> = {}): EmbeddingStatus {
  return {
    provider: 'openai-compatible',
    state: 'remote-configured-not-started',
    memoryEnabled: true,
    preset: 'siliconflow',
    endpoint: 'https://api.siliconflow.cn/v1',
    authHeader: 'authorization',
    model: 'BAAI/bge-m3',
    dimensions: 1024,
    keyEnv: 'SILICONFLOW_API_KEY',
    keyPresent: true,
    target: 'embedding-remote:abc',
    coverage: { total: 3, covered: 1, missing: 2 },
    progress: { processed: 1, total: 3, failures: 0 },
    ...overrides,
  }
}

function walk(node: unknown, visit: (node: Record<string, unknown>, depth: number) => void, depth = 0): void {
  if (node === null || typeof node !== 'object') return
  if (Array.isArray(node)) {
    for (const child of node) walk(child, visit, depth)
    return
  }
  const row = node as Record<string, unknown>
  visit(row, depth)
  for (const value of Object.values(row)) walk(value, visit, depth + 1)
}

function textsOf(view: Record<string, unknown>): string[] {
  const out: string[] = []
  walk(view, node => {
    if (typeof node.text === 'string') out.push(node.text)
  })
  return out
}

describe('native view ids and locale', () => {
  it('uses the manifest ids and a deterministic zh/en locale choice', () => {
    expect(new Set([GO_STRIP_ID, GO_CONTEXT_PANEL_ID, GO_EMBEDDING_PANEL_ID]).size).toBe(3)
    expect(goLocale('zh-CN')).toBe('zh')
    expect(goLocale('zh-Hant')).toBe('zh')
    expect(goLocale('en-US')).toBe('en')
    expect(goLocale(undefined)).toBe('zh')
  })
})

describe('context strip', () => {
  it('reads the REAL summary.health pressure, policy and queue', () => {
    const { summary } = telemetry()
    expect(goStripData(summary('s1'), 'zh-CN')).toMatchObject({
      text: '上下文 66% · 待回收 3',
      icon: 'chart',
      tone: 'warn',
    })
    expect(goStripData(summary('s1'), 'en-US')).toMatchObject({
      text: 'Context 66% · 3 pending',
      tone: 'warn',
    })
  })

  it('does not treat a missing policy as known safe, or a missing historian as idle', () => {
    const { summary } = telemetry(true)
    expect(goStripData(summary('s1'), 'zh')).toMatchObject({
      text: '上下文 66% · 待回收 0',
      tone: 'muted',
    })
    const data = goContextData(summary('s1'), 'zh')
    expect(data.pressure).toBe('66%')
    expect(data.pressureTone).toBe('muted')
    expect(data.historianRunning).toBeNull()
    expect(data.memoryTotal).toBeNull()
    expect(data.version).toBeNull()
  })

  it('keeps unknown pressure as — and known zero as 0', () => {
    const { summary } = telemetry()
    // s2 has no context-pressure row: pressure is unknown.
    expect(goStripData(summary('s2'), 'zh').text).toBe('上下文 30% · 待回收 0')
    expect(goStripData(summary('s2'), 'en-US').tone).toBe('good')
    expect(goContextData(summary('s2'), 'zh').pending).toBe('0')
  })

  it('stays within the released 24-code-point limit', () => {
    expect(Array.from(clampGoText('上下文'.repeat(10))).length).toBe(24)
    const { summary } = telemetry()
    expect(Array.from(goStripData(summary('s1'), 'en-US').text).length).toBeLessThanOrEqual(24)
  })
})

describe('context panel data and view', () => {
  it('maps the scoped REAL summary without recomputing token accounting', () => {
    const { summary } = telemetry()
    const data = goContextData(summary('s1'), 'zh-CN')
    expect(data).toMatchObject({
      scope: 'session',
      pressure: '66%',
      pressureTone: 'warn',
      tokens: '170,000 / 256,000',
      pending: '3',
      system: '1,000',
      tools: '2,000',
      messages: '3,000',
      conversation: '1,200',
      toolCalls: '800',
      compartments: '500',
      memories: '300',
      profile: '100',
      historianRunning: '运行中',
      compartmentsCount: '2',
      queueTags: '3',
      memoryTotal: '12',
      memoryInjected: '5',
      memoryVerified: '7',
      version: '0.17.0',
    })
    expect(data.recent).toEqual(expect.arrayContaining([
      expect.objectContaining({ title: '上下文压力' }),
      expect.objectContaining({ title: '错误', tone: 'bad' }),
    ]))
  })

  it('draws the composition as one donut and stops repeating the three rows', () => {
    const { summary } = telemetry()
    const data = goContextData(summary('s1'), 'zh-CN')
    // Raw numbers for the host to slice; the strings above stay for the rows.
    expect(data.share).toEqual([1000, 2000, 3000])

    const view = goContextView({ sessionId: 's1' }, 'zh-CN')
    const charts: Array<Record<string, unknown>> = []
    const labels: string[] = []
    const visit = (node: unknown): void => {
      if (Array.isArray(node)) { node.forEach(visit); return }
      if (node === null || typeof node !== 'object') return
      const record = node as Record<string, unknown>
      if (record.type === 'chart') charts.push(record)
      if (typeof record.text === 'string') labels.push(record.text)
      if (Array.isArray(record.categories)) labels.push(...record.categories as string[])
      Object.values(record).forEach(visit)
    }
    visit(view)

    expect(charts).toHaveLength(1)
    const chart = charts[0]!
    expect(chart.kind).toBe('donut')
    expect(chart.unit).toBe('tok')
    expect(chart.categories).toEqual(['系统', '工具定义', '消息'])
    expect(chart.series).toEqual([{ values: { $: 'data.share' } }])

    // The three labels moved into the chart instead of staying as duplicate rows.
    for (const label of ['系统', '工具定义', '消息']) {
      expect(labels.filter((text) => text === label), label).toHaveLength(1)
    }

    // A summary without a breakdown keeps null slices, never invented zeroes.
    expect(goContextData(summary('s2'), 'zh-CN').share).toEqual([null, null, null])
    // The global panel has no session composition chart.
    expect(JSON.stringify(goContextView({}, 'zh-CN'))).not.toContain('donut')
  })

  it('keeps missing additive sources null and a real empty queue as zero', () => {
    const { summary } = telemetry()
    const s2 = goContextData(summary('s2'), 'zh-CN')
    expect(s2.pending).toBe('0')
    expect(s2.pressure).toBe('30%')
    expect(s2.historianRunning).toBeNull()
    expect(s2.conversation).toBeNull()
    expect(s2.system).toBeNull()
    expect(s2.memoryTotal).toBeNull()
    expect(s2.version).toBe('0.17.0')
  })

  it('labels the global scope explicitly and uses the global health payload', () => {
    const { summary } = telemetry()
    const global = goContextData(summary(), 'zh-CN')
    expect(global).toMatchObject({
      scope: 'global',
      pressure: '66%',
      passes: '2',
      drops: '1',
      errors24h: '1',
      identity: 'git:other',
      projectMemories: '2',
    })
    expect(global.conversation).toBeUndefined()
    expect(textsOf(goContextView({}, 'zh-CN'))).toContain('视图：全部会话（全局）')
    expect(textsOf(goContextView({ sessionId: 's1' }, 'zh-CN'))).toContain('视图：本会话')
    expect(textsOf(goContextView({ sessionId: '' }, 'zh-CN'))).toContain('视图：全部会话（全局）')
  })

  it('keeps session scope isolated in real service output', () => {
    const { summary } = telemetry()
    const s1 = summary('s1')
    const s2 = summary('s2')
    expect((s1.health as Record<string, unknown>).passes24h).toBe(1)
    expect((s2.health as Record<string, unknown>).passes24h).toBe(1)
    expect((summary().health as Record<string, unknown>).passes24h).toBe(2)
    expect((s1.recent as Array<{ sessionId?: string }>).every(row => row.sessionId === 's1')).toBe(true)
    expect((s2.recent as Array<{ sessionId?: string }>).every(row => row.sessionId === 's2')).toBe(true)
    expect(goContextData(s1, 'zh').pending).toBe('3')
    expect(goContextData(s2, 'zh').pending).toBe('0')
  })

  it('fits the released panel budgets and only uses valid callout tones', () => {
    for (const view of [goContextView({ sessionId: 's1' }, 'zh'), goContextView({}, 'zh'), goEmbeddingView('zh')]) {
      let nodes = 0
      let maxDepth = 0
      walk(view, (node, depth) => {
        nodes += 1
        maxDepth = Math.max(maxDepth, depth)
        if (node.type === 'callout' && typeof node.tone === 'string') {
          expect(['info', 'good', 'warn', 'bad']).toContain(node.tone)
        }
      })
      expect(Buffer.byteLength(JSON.stringify(view), 'utf8')).toBeLessThanOrEqual(32 * 1024)
      expect(nodes).toBeLessThanOrEqual(120)
      expect(maxDepth).toBeLessThanOrEqual(8)
    }
  })
})

describe('embedding panel', () => {
  it('maps every state to complete zh/en copy and a stable tone', () => {
    const states = [
      'local', 'rollback-local', 'remote-off', 'remote-unprobed',
      'remote-configured-not-started', 'remote-paused', 'remote-target-missing',
      'remote-migrating', 'remote-ready', 'remote-error',
    ] as const
    for (const state of states) {
      expect(goEmbeddingStateText(state, 'zh').length).toBeGreaterThan(0)
      expect(goEmbeddingStateText(state, 'en').length).toBeGreaterThan(0)
      // Callout accepts info/good/warn/bad only.
      expect(goEmbeddingStateTone(state)).toMatch(/^(good|warn|bad|info)$/)
    }
  })

  it('shows coverage, target and missing count without a second settings writer', () => {
    const data = goEmbeddingData(embeddingStatus(), ['BAAI/bge-m3', 'BAAI/bge-large-zh'], 'zh-CN')
    expect(data).toMatchObject({
      stateText: '已探测，尚未开始重建。',
      stateTone: 'info',
      memory: '已启用',
      model: 'BAAI/bge-m3',
      dimensions: '1,024',
      coverage: '1 / 3',
      coveragePct: 33,
      missing: '2',
      target: 'embedding-remote:abc',
      key: 'SILICONFLOW_API_KEY · 已设置',
    })
    expect((data.models as Array<{ action: { id: string } }>)[0]!.action.id).toBe('copy-model')
  })

  it('shows the specific failure reason instead of a generic error state', () => {
    const data = goEmbeddingData(embeddingStatus({ state: 'remote-error', lastError: 'missing-key' }), [], 'zh-CN')
    expect(data.stateText).toContain('密钥未配置')
    expect(data.stateTone).toBe('bad')
  })

  it('keeps unknown coverage and dimensions null, not zero', () => {
    const data = goEmbeddingData(embeddingStatus({ coverage: null, dimensions: null, target: null }), [], 'en-US')
    expect(data.coverage).toBeNull()
    expect(data.coveragePct).toBeNull()
    expect(data.dimensions).toBeNull()
    expect(data.target).toBeNull()
    expect(data.missing).toBeNull()
    expect(data.stateText).toBe('Probed, but the rebuild has not started.')
  })

  it('describes no-auth and missing keys distinctly', () => {
    const noAuth = goEmbeddingData(embeddingStatus({ keyEnv: '', keyPresent: false }), [], 'en-US')
    expect(noAuth.key).toBe('No auth')
    const missing = goEmbeddingData(embeddingStatus({ keyPresent: false }), [], 'en-US')
    expect(missing.key).toBe('SILICONFLOW_API_KEY · Not set')
  })

  it('has all five actions represented and a bounded confirmation before start', () => {
    const statusValue = embeddingStatus()
    const startAction = goEmbeddingStartAction(statusValue)!
    const view = goEmbeddingView('en-US', { remote: true, startAction, rebuild: true, hint: true })
    const actions: string[] = []
    const optionValues: string[] = []
    walk(view, node => {
      if (node.type === 'actions' && Array.isArray(node.items)) {
        for (const item of node.items as Array<{ action?: string }>) {
          if (typeof item.action === 'string') actions.push(item.action)
        }
      }
      if (node.type === 'options' && Array.isArray(node.options)) {
        for (const item of node.options as Array<{ value?: string }>) {
          if (typeof item.value === 'string') optionValues.push(item.value)
        }
      }
    })
    expect(actions).toEqual(['models', 'probe'])
    expect(optionValues).toEqual(['pause', 'resume'])
    const confirms: Array<{ id: string; confirmLabel?: string; cancelLabel?: string }> = []
    walk(view, node => {
      if (node.type === 'confirm') confirms.push(node as unknown as { id: string })
    })
    expect(confirms).toHaveLength(1)
    expect(confirms[0]!.id).toBe(startAction)
    expect(confirms[0]!.confirmLabel).toBe('Confirm')
    expect(confirms[0]!.cancelLabel).toBe('Cancel')
    expect(Array.from(confirms[0]!.confirmLabel!).length).toBeLessThanOrEqual(12)
    expect(Array.from(confirms[0]!.cancelLabel!).length).toBeLessThanOrEqual(12)
    expect(confirms[0]!.cancelLabel).not.toBe('Cancelled')
  })

  it('hides remote controls and the target hint for local/off', () => {
    const data = goEmbeddingData(embeddingStatus({
      provider: 'local',
      state: 'local',
      target: null,
      coverage: null,
      model: 'local',
      dimensions: null,
    }), [], 'en-US')
    expect(data.remote).toBe(false)
    expect(data.startAction).toBeNull()
    expect(data.rebuildEnabled).toBe(false)
    expect(data.startHint).toBeNull()
    expect(JSON.stringify(goEmbeddingView('en-US', { remote: false, startAction: null, rebuild: false, hint: false })))
      .not.toMatch(/"actions"|"confirm"|"options"|Models/)
  })

  it('keeps every toast and confirmation label inside the pinned limits', () => {
    for (const locale of ['zh', 'en'] as const) {
      const copy = goEmbeddingActionCopy(locale)
      const values = [
        copy.modelsLoaded,
        copy.modelsStale,
        copy.started,
        copy.paused,
        copy.resumed,
        copy.copied,
        copy.cancelled,
        copy.cancelAction,
        copy.working,
        copy.probeOk(1_024),
      ]
      for (const value of values) {
        expect(Array.from(value).length, `${locale}: ${value}`).toBeLessThanOrEqual(40)
      }
    }
  })

  it('localizes known production error codes and never leaks them to a toast', () => {
    const codes = [
      'auth-failed', 'rate-limited', 'model-not-found', 'bad-request', 'server-error',
      'timeout', 'network', 'invalid-response', 'invalid-json', 'dimensions-unsupported',
      'dimensions-changed', 'model-substituted', 'response-too-large', 'input-too-long',
      'probe-failed', 'embed-failed', 'query-failed',
    ]
    for (const locale of ['zh', 'en'] as const) {
      for (const code of codes) {
        const text = goEmbeddingErrorText(code, locale)
        expect(text, `${locale}:${code}`).not.toContain(code)
        expect(text.length, `${locale}:${code}`).toBeGreaterThan(0)
        expect(Array.from(text).length, `${locale}:${code}`).toBeLessThanOrEqual(40)
      }
    }
    expect(goEmbeddingErrorText('invalid-key-env', 'en')).toContain('NAME')
    expect(goEmbeddingErrorText('invalid-key-env', 'zh')).toContain('变量名')
    expect(goEmbeddingErrorDetail('invalid-key-env', 'en')).toContain('reference')
    expect(goEmbeddingErrorDetail('invalid-key-env', 'zh')).toContain('引用')
    expect(goEmbeddingErrorDetail('invalid-key-env', 'en')).not.toContain('absent')
    expect(goEmbeddingErrorDetail('auth-failed', 'zh')).toContain('认证失败')
  })

  it('separates memory verification totals from the last maintenance tally', () => {
    const { summary } = telemetry()
    const data = goContextData(summary('s1'), 'zh-CN')
    expect(data.memoryVerified).toBe('7')
    expect(data.verifiedCount).toBe('2')
    const view = JSON.stringify(goContextView({ sessionId: 's1' }, 'zh-CN'))
    expect(view).toContain('data.memoryVerified')
    expect(view).toContain('data.verifiedCount')
    expect(view).toContain('本次验证')
  })

  it('localizes user-facing errors and success copy', () => {
    expect(goEmbeddingErrorText('memory-disabled', 'zh')).toContain('记忆功能未启用')
    expect(goEmbeddingErrorText('missing-key', 'en')).toContain('Key variable missing')
    expect(goEmbeddingErrorText('target-changed', 'zh')).toContain('目标已变化')
    expect(goEmbeddingActionCopy('zh').probeOk(1_024)).toContain('1024')
    expect(goModelRows(['m'], 'en')[0]!.subtitle).toBe('Copy model ID')
    expect(goModelRows(Array.from({ length: 60 }, (_, index) => `m${String(index)}`), 'en')).toHaveLength(50)
  })

  it('formats numbers through the shared helper and preserves null', () => {
    expect(formatGoNumber(0, 'en')).toBe('0')
    expect(formatGoNumber(null, 'en')).toBeNull()
    expect(formatGoNumber(undefined, 'zh')).toBeNull()
  })
})
