/**
 * T23: the optional dsh-go registration, feed lifecycle and action bridge.
 *
 * These specs use a structural fake of the released v1 service, so they pin
 * the host contract (ids, scoped feeds, cancel functions, deferred actions)
 * without importing the phone bridge or the browser half.
 */
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  attachOptionalGoNative,
  installVolatileDisarm,
  registerGoNative,
  type GoNativeCaps,
  type GoNativeDeferred,
  type GoNativePanelDefinition,
  type GoNativeScope,
  type GoNativeService,
} from '../src/dsh/go-native.ts'
import {
  GO_CONTEXT_PANEL_ID,
  GO_EMBEDDING_PANEL_ID,
  GO_STRIP_ID,
} from '../src/dsh/go-view.ts'
import { openEmbeddingLane, type EmbeddingLane, type EmbeddingStatus } from '../src/dsh/embedding-lane.ts'
import type { MagicContextDshConfig } from '../src/dsh/config.ts'
import { createTelemetryService } from '../src/dsh/telemetry.ts'
import { openStores } from '../src/core/stores.ts'

const ENV_NAME = 'MC_T23_GO_KEY'
const dirs: string[] = []
afterEach(() => {
  vi.useRealTimers()
  while (dirs.length > 0) {
    try {
      rmSync(dirs.pop()!, { recursive: true, force: true, maxRetries: 5, retryDelay: 40 })
    } catch {
      /* never mask the assertion */
    }
  }
})

function tempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'mc-go-native-'))
  dirs.push(dir)
  return dir
}

function status(overrides: Partial<EmbeddingStatus> = {}): EmbeddingStatus {
  return {
    provider: 'openai-compatible',
    state: 'remote-configured-not-started',
    memoryEnabled: true,
    preset: 'siliconflow',
    endpoint: 'https://api.siliconflow.cn/v1',
    authHeader: 'authorization',
    model: 'fixture-embed-a',
    dimensions: 16,
    keyEnv: ENV_NAME,
    keyPresent: true,
    target: 'embedding-remote:abc',
    coverage: { total: 3, covered: 1, missing: 2 },
    progress: { processed: 1, total: 3, failures: 0 },
    ...overrides,
  }
}

function fakeLane(overrides: Partial<EmbeddingLane> = {}): EmbeddingLane {
  return {
    status: vi.fn(() => status()),
    localEmbedder: vi.fn(() => undefined),
    providerKind: vi.fn(() => 'openai-compatible'),
    isRemote: vi.fn(() => true),
    localTargetModelId: vi.fn(() => 'local'),
    targetModelId: vi.fn(() => 'embedding-remote:abc'),
    dimensions: vi.fn(() => 16),
    remoteQueryModelId: vi.fn(() => null),
    remoteWritable: vi.fn(() => false),
    models: vi.fn(async () => ({ ok: true, models: ['fixture-embed-a', 'fixture-embed-b'] })),
    probe: vi.fn(async () => ({ ok: true, model: 'fixture-embed-a', dimensions: 16, latencyMs: 10 })),
    start: vi.fn(async () => ({ ok: true })),
    pause: vi.fn(() => ({ ok: true })),
    resume: vi.fn(() => ({ ok: true })),
    disarm: vi.fn(() => ({ ok: true })),
    rebuildState: vi.fn(() => ({ state: 'running' as const, targetIdentity: 'embedding-remote:abc' })),
    hasRebuildState: vi.fn(() => true),
    setRunner: vi.fn(),
    embedPassages: vi.fn(async () => []),
    embedQuery: vi.fn(async () => null),
    afterBackfill: vi.fn(),
    handle: vi.fn(),
    ...overrides,
  }
}

class FakeBridge implements GoNativeService {
  readonly strips = new Map<string, Parameters<GoNativeService['strip']>[1]>()
  readonly panels = new Map<string, GoNativePanelDefinition>()
  readonly handlers = new Map<string, Parameters<NonNullable<GoNativeService['on']>>[1]>()
  readonly disposed: string[] = []
  readonly refreshed: string[] = []

  strip(id: string, data: Parameters<GoNativeService['strip']>[1]): unknown {
    this.strips.set(id, data)
    return () => { this.disposed.push(`strip:${id}`) }
  }

  panel(id: string, definition: GoNativePanelDefinition): unknown {
    this.panels.set(id, definition)
    return () => { this.disposed.push(`panel:${id}`) }
  }

  on(id: string, handler: Parameters<NonNullable<GoNativeService['on']>>[1]): unknown {
    this.handlers.set(id, handler)
    return () => { this.disposed.push(`on:${id}`) }
  }

  refresh(id: string): void {
    this.refreshed.push(id)
  }
}

function startActionOf(bridge: FakeBridge, locale = 'zh-CN'): string {
  const view = bridge.panels.get(GO_EMBEDDING_PANEL_ID)!.view({}, { locale })
  let found: string | undefined
  const walk = (node: unknown): void => {
    if (node === null || typeof node !== 'object') return
    if (Array.isArray(node)) { for (const child of node) walk(child); return }
    const row = node as Record<string, unknown>
    if (row.type === 'confirm' && typeof row.id === 'string') found = row.id
    for (const value of Object.values(row)) walk(value)
  }
  walk(view)
  expect(found).toBeDefined()
  return found!
}

function dispatchOf(bridge: FakeBridge): Parameters<NonNullable<GoNativeService['on']>>[1] {
  const handler = bridge.handlers.get(GO_EMBEDDING_PANEL_ID)
  expect(handler).toBeDefined()
  return handler!
}

function fakeTelemetry(data: Record<string, unknown> = {}): { summary: ReturnType<typeof vi.fn> } {
  return {
    summary: vi.fn((sessionId?: string) => sessionId === undefined
      ? { scope: 'global', ...data }
      : { scope: 'session', sessionId, ...data }),
  }
}

describe('optional registration and surface lifecycle', () => {
  it('renders current controls before a data subscriber exists', () => {
    const bridge = new FakeBridge()
    let current = status({
      state: 'remote-unprobed', target: null, dimensions: null, coverage: null,
      progress: { processed: null, total: null, failures: null },
    })
    const off = registerGoNative(bridge, {
      telemetry: fakeTelemetry(),
      embedding: fakeLane({ status: () => current }),
    })
    const panel = bridge.panels.get(GO_EMBEDDING_PANEL_ID)!
    const actionIds = (): unknown[] => {
      const view = panel.view({}, { locale: 'zh-CN' })
      return (view.children as Array<Record<string, unknown>>)
        .filter(node => node.type === 'actions')
        .flatMap(node => (node.items as Array<Record<string, unknown>>).map(item => item.action))
    }
    // The released host may build a view before starting its first data feed.
    // Never rely on a refresh delivered before its subscriber is attached.
    expect(actionIds()).toEqual(['models', 'probe'])
    current = status({ provider: 'local', state: 'local-ready', target: null })
    expect(actionIds()).toEqual([])
    current = status({ state: 'remote-unprobed', target: null, dimensions: null })
    expect(actionIds()).toEqual(['models', 'probe'])
    off()
  })

  it('local/off advertises no remote controls and starts no paid work', () => {
    const bridge = new FakeBridge()
    const lane = fakeLane({
      status: vi.fn(() => status({
        provider: 'local',
        state: 'local',
        target: null,
        coverage: null,
        model: 'local',
        dimensions: null,
      })),
    })
    registerGoNative(bridge, { telemetry: fakeTelemetry(), embedding: lane, pollMs: 60_000 })
    const emit = vi.fn()
    bridge.panels.get(GO_EMBEDDING_PANEL_ID)!.data!({}, emit, { locale: 'en-US' })
    const data = emit.mock.calls[0]![0] as Record<string, unknown>
    expect(data.remote).toBe(false)
    expect(data.startHint).toBeNull()
    expect(data.startAction).toBeNull()
    expect(data.rebuildEnabled).toBe(false)
    const view = JSON.stringify(bridge.panels.get(GO_EMBEDDING_PANEL_ID)!.view({}, { locale: 'en-US' }))
    expect(view).not.toMatch(/"actions"|"confirm"|"options"|Models/)
    expect(lane.models).not.toHaveBeenCalled()
    expect(lane.probe).not.toHaveBeenCalled()
    expect(lane.start).not.toHaveBeenCalled()
  })

  it('registers exactly one strip and two unique panels, and display starts no paid work', () => {
    const bridge = new FakeBridge()
    const lane = fakeLane()
    const telemetry = fakeTelemetry()
    registerGoNative(bridge, { telemetry, embedding: lane, pollMs: 1_000 })

    expect([...bridge.strips.keys()]).toEqual([GO_STRIP_ID])
    expect([...bridge.panels.keys()]).toEqual([GO_CONTEXT_PANEL_ID, GO_EMBEDDING_PANEL_ID])
    expect(lane.models).not.toHaveBeenCalled()
    expect(lane.probe).not.toHaveBeenCalled()
    expect(lane.start).not.toHaveBeenCalled()
    expect(lane.pause).not.toHaveBeenCalled()
    expect(lane.resume).not.toHaveBeenCalled()

    // A view may read local status to expose controls, but must not invoke
    // their network/paid actions merely by displaying them.
    const view = bridge.panels.get(GO_EMBEDDING_PANEL_ID)!.view({ sessionId: 's1' }, { locale: 'zh-CN' })
    expect(JSON.stringify(view)).toContain('"action":"models"')
    expect(lane.models).not.toHaveBeenCalled()
    expect(lane.probe).not.toHaveBeenCalled()
    expect(lane.start).not.toHaveBeenCalled()
  })

  it('stops every feed timer at the bridge cancel function and at remount', () => {
    vi.useFakeTimers()
    const bridge = new FakeBridge()
    const telemetry = fakeTelemetry()
    const close = vi.fn()
    const sharedTelemetry = { ...telemetry, close }
    const lane = fakeLane()
    const dispose = registerGoNative(bridge, { telemetry: sharedTelemetry, embedding: lane, pollMs: 1_000 })

    const strip = bridge.strips.get(GO_STRIP_ID)!
    const scope: GoNativeScope = { sessionId: 's1' }
    const caps: GoNativeCaps = { locale: 'zh-CN' }
    const emit = vi.fn()
    const cancel = strip(scope, emit, caps) as () => void
    expect(emit).toHaveBeenCalledTimes(1)
    vi.advanceTimersByTime(2_500)
    expect(emit).toHaveBeenCalledTimes(3)

    cancel()
    vi.advanceTimersByTime(5_000)
    expect(emit).toHaveBeenCalledTimes(3)

    // A second subscription still works, then the parent dispose removes it.
    const emit2 = vi.fn()
    const contextData = bridge.panels.get(GO_CONTEXT_PANEL_ID)!.data!
    contextData(scope, emit2, caps)
    expect(emit2).toHaveBeenCalledTimes(1)
    dispose()
    vi.advanceTimersByTime(5_000)
    expect(emit2).toHaveBeenCalledTimes(1)
    expect(bridge.disposed).toEqual([
      `strip:${GO_STRIP_ID}`,
      `panel:${GO_CONTEXT_PANEL_ID}`,
      `on:${GO_EMBEDDING_PANEL_ID}`,
      `panel:${GO_EMBEDDING_PANEL_ID}`,
    ])
    // The native half never owns the shared telemetry service.
    expect(close).not.toHaveBeenCalled()
  })

  it('uses the shared parent telemetry and strict session scope', () => {
    const bridge = new FakeBridge()
    const telemetry = fakeTelemetry()
    registerGoNative(bridge, { telemetry, embedding: fakeLane(), pollMs: 60_000 })
    const emit = vi.fn()
    bridge.panels.get(GO_CONTEXT_PANEL_ID)!.data!({ sessionId: 's1' }, emit, { locale: 'zh-CN' })
    expect(telemetry.summary).toHaveBeenCalledWith('s1')

    const globalEmit = vi.fn()
    bridge.panels.get(GO_CONTEXT_PANEL_ID)!.data!({}, globalEmit, { locale: 'zh-CN' })
    expect(telemetry.summary).toHaveBeenCalledWith(undefined)
    const global = globalEmit.mock.calls[0]![0] as Record<string, unknown>
    expect(global.scope).toBe('global')
  })

  it('loads on a host without the bridge and ignores a callback without the service', () => {
    const calls: Array<{ names: string[]; callback: (scope: { dshGo?: GoNativeService }) => unknown }> = []
    const ctx = {
      inject: (names: string[], callback: (scope: { dshGo?: GoNativeService }) => unknown) => {
        calls.push({ names, callback })
      },
    }
    expect(() => attachOptionalGoNative(ctx, {
      telemetry: fakeTelemetry(),
      embedding: fakeLane(),
    })).not.toThrow()
    expect(calls[0]!.names).toEqual(['dshGo'])
    // The bridge-less path never invokes the callback; a structural callback
    // called without the service must also be a no-op.
    expect(() => calls[0]!.callback({})).not.toThrow()
  })
})

describe('real telemetry → native feed integration', () => {
  it('renders the actual createTelemetryService summary and keeps missing sources unknown', () => {
    const root = tempDir()
    const stores = openStores(root)
    try {
      const now = Date.now()
      stores.appendJournal({
        at: now - 2_000, level: 'info', kind: 'pass', sessionId: 's1',
        summary: 'execute', data: { decision: 'execute', tokensBefore: 100, tokensDelta: -50, pressure: 66, contextWindow: 250_000 },
      })
      stores.appendJournal({
        at: now - 500, level: 'info', kind: 'context-pressure', sessionId: 's1',
        summary: 'pressure', data: { projectedTokens: 170_000, contextWindow: 250_000 },
      })
      stores.queueDrop('s1', 1, now - 1_000)

      const service = createTelemetryService({
        stores,
        meta: () => ({}),
        startedAt: now - 3_600_000,
        now: () => now,
        policy: () => ({ executeThreshold: 65, forceThreshold: 85 }),
        projection: () => ({ contextBreakdown: { systemTokens: 10, toolsTokens: 20, messageTokens: 30 } }),
        historian: () => ({ running: false, compartments: 0, coveredTokens: 0, lastPublishedAt: null }),
      })
      const bridge = new FakeBridge()
      registerGoNative(bridge, { telemetry: service, embedding: fakeLane(), pollMs: 60_000 })

      const emit = vi.fn()
      bridge.panels.get(GO_CONTEXT_PANEL_ID)!.data!({ sessionId: 's1' }, emit, { locale: 'zh-CN' })
      const data = emit.mock.calls[0]![0] as Record<string, unknown>
      expect(data).toMatchObject({
        scope: 'session',
        pressure: '68%',
        tokens: '170,000 / 250,000',
        pending: '1',
        system: '10',
        tools: '20',
        messages: '30',
        historianRunning: '空闲',
      })

      const globalEmit = vi.fn()
      bridge.panels.get(GO_CONTEXT_PANEL_ID)!.data!({}, globalEmit, { locale: 'zh-CN' })
      const global = globalEmit.mock.calls[0]![0] as Record<string, unknown>
      expect(global.scope).toBe('global')
      expect(global.conversation).toBeUndefined()
      expect(global.passes).toBe('1')

      // A service without the optional sources: missing policy is not green,
      // missing historian is not idle, and the empty queue is a known zero.
      const bareStores = openStores(tempDir())
      try {
        const bare = createTelemetryService({ stores: bareStores, meta: () => ({}), startedAt: now - 1_000, now: () => now })
        bareStores.appendJournal({
          at: now - 100, level: 'info', kind: 'context-pressure', sessionId: 's1',
          summary: 'pressure', data: { projectedTokens: 170_000, contextWindow: 250_000 },
        })
        const bareBridge = new FakeBridge()
        registerGoNative(bareBridge, { telemetry: bare, embedding: fakeLane(), pollMs: 60_000 })
        const bareEmit = vi.fn()
        bareBridge.panels.get(GO_CONTEXT_PANEL_ID)!.data!({ sessionId: 's1' }, bareEmit, { locale: 'zh-CN' })
        const bareData = bareEmit.mock.calls[0]![0] as Record<string, unknown>
        expect(bareData).toMatchObject({
          pressure: '68%',
          pressureTone: 'muted',
          pending: '0',
          historianRunning: null,
          memoryTotal: null,
        })
      } finally {
        bareStores.close()
      }
    } finally {
      stores.close()
    }
  })
})

describe('embedding actions over the existing lane', () => {
  it('loads models through a deferred result, copies ids, and forwards cancellation', async () => {
    const bridge = new FakeBridge()
    const lane = fakeLane()
    registerGoNative(bridge, { telemetry: fakeTelemetry(), embedding: lane, pollMs: 60_000 })
    const dispatch = dispatchOf(bridge)
    const deferred = dispatch({}, { action: 'models', locale: 'zh-CN' }) as GoNativeDeferred
    expect(deferred.pending.label).toBe('处理中')
    const signal = new AbortController().signal
    const effects = await deferred.result(signal)
    expect(lane.models).toHaveBeenCalledWith({ signal })
    expect(Array.isArray(effects)).toBe(true)
    const patch = (effects as Array<Record<string, unknown>>)[1]!.patch as Record<string, unknown>
    expect((patch.models as Array<{ title: string }>).map(row => row.title)).toEqual([
      'fixture-embed-a',
      'fixture-embed-b',
    ])
    expect(await dispatch({}, { action: 'copy-model', locale: 'en-US', value: { model: 'fixture-embed-a' } }))
      .toMatchObject({ copy: 'fixture-embed-a', toast: 'Copied' })
  })

  it('invalidates retained model rows and copy actions when the provider config changes', async () => {
    const bridge = new FakeBridge()
    let current = status()
    const lane = fakeLane({ status: vi.fn(() => current) })
    registerGoNative(bridge, { telemetry: fakeTelemetry(), embedding: lane, pollMs: 60_000 })
    const dispatch = dispatchOf(bridge)
    const deferred = dispatch({}, { action: 'models', locale: 'zh-CN' }) as GoNativeDeferred
    await deferred.result(undefined)

    const emit = vi.fn()
    const data = bridge.panels.get(GO_EMBEDDING_PANEL_ID)!.data!
    data({}, emit, { locale: 'zh-CN' })
    const rows = (emit.mock.calls[0]![0] as Record<string, unknown>).models as Array<{ title: string }>
    expect(rows.map(row => row.title)).toEqual(['fixture-embed-a', 'fixture-embed-b'])

    // Endpoint/model/key changes invalidate the retained feed; no reload runs.
    current = status({ endpoint: 'https://api.example.com/v1' })
    const nextEmit = vi.fn()
    data({}, nextEmit, { locale: 'zh-CN' })
    expect((nextEmit.mock.calls[0]![0] as Record<string, unknown>).models).toEqual([])
    expect(lane.models).toHaveBeenCalledTimes(1)
    expect(await dispatch({}, { action: 'copy-model', locale: 'zh-CN', value: { model: 'fixture-embed-a' } }))
      .toMatchObject({ toast: '模型列表已过期' })
    expect(lane.probe).not.toHaveBeenCalled()
  })

  it('reports a target change instead of patching stale models', async () => {
    const bridge = new FakeBridge()
    const lane = fakeLane({
      models: vi.fn(async () => ({ ok: false, error: 'target-changed' })),
    })
    registerGoNative(bridge, { telemetry: fakeTelemetry(), embedding: lane, pollMs: 60_000 })
    const deferred = dispatchOf(bridge)({}, { action: 'models', locale: 'zh-CN' }) as GoNativeDeferred
    const effects = await deferred.result(undefined)
    expect(effects).toEqual({ toast: '目标已变化，请重试' })
  })

  it('requires an explicit confirmation before start and never bypasses the lane guard', async () => {
    const bridge = new FakeBridge()
    const lane = fakeLane()
    registerGoNative(bridge, { telemetry: fakeTelemetry(), embedding: lane, pollMs: 60_000 })
    const dispatch = dispatchOf(bridge)
    bridge.panels.get(GO_EMBEDDING_PANEL_ID)!.data!({}, vi.fn(), { locale: 'en-US' })
    const confirm = startActionOf(bridge, 'en-US')
    expect(await dispatch({}, { action: confirm, locale: 'en-US', value: {} })).toMatchObject({ toast: 'Cancelled' })
    expect(lane.start).not.toHaveBeenCalled()
    expect(await dispatch({}, { action: confirm, locale: 'en-US', value: { confirmed: true } }))
      .toMatchObject({ toast: 'Rebuild started' })
    expect(lane.start).toHaveBeenCalledTimes(1)
  })

  it('binds Start to the rendered confirmation even after an intervening poll', async () => {
    const bridge = new FakeBridge()
    let target = 'embedding-remote:first'
    let missing = 2
    const lane = fakeLane({
      status: vi.fn(() => status({ target, coverage: { total: 5, covered: 3, missing } })),
    })
    registerGoNative(bridge, { telemetry: fakeTelemetry(), embedding: lane, pollMs: 60_000 })
    const dispatch = dispatchOf(bridge)
    const emit = vi.fn()
    const data = bridge.panels.get(GO_EMBEDDING_PANEL_ID)!.data!
    data({}, emit, { locale: 'zh-CN' })
    const oldConfirm = startActionOf(bridge)
    // A poll advances the feed and re-renders for the new target; the old
    // confirmation id must still be rejected, not silently rebound.
    target = 'embedding-remote:second'
    missing = 4
    data({}, emit, { locale: 'zh-CN' })
    const newConfirm = startActionOf(bridge)
    expect(newConfirm).not.toBe(oldConfirm)
    expect(await dispatch({}, { action: oldConfirm, locale: 'zh-CN', value: { confirmed: true } }))
      .toMatchObject({ toast: '目标已变化，请重试' })
    expect(lane.start).not.toHaveBeenCalled()
  })

  it('rejects a static start action but keeps lane refusal priority for a stale dynamic one', async () => {
    const bridge = new FakeBridge()
    const lane = fakeLane({
      status: vi.fn(() => status()),
      start: vi.fn(async () => ({ ok: false, error: 'memory-disabled' })),
      pause: vi.fn(() => ({ ok: false, error: 'not-running' })),
      resume: vi.fn(() => ({ ok: true })),
    })
    registerGoNative(bridge, { telemetry: fakeTelemetry(), embedding: lane, pollMs: 60_000 })
    const dispatch = dispatchOf(bridge)
    bridge.panels.get(GO_EMBEDDING_PANEL_ID)!.data!({}, vi.fn(), { locale: 'zh-CN' })
    const confirm = startActionOf(bridge)
    // A static action id is outside the supported dynamic-confirm surface.
    expect(await dispatch({}, { action: 'start', locale: 'zh-CN', value: { confirmed: true } }))
      .toMatchObject({ toast: '当前状态不允许' })
    expect(lane.start).not.toHaveBeenCalled()
    // The reached dynamic id still goes to the lane; its authoritative
    // provider/memory refusal wins.
    expect(await dispatch({}, { action: confirm, locale: 'zh-CN', value: { confirmed: true } }))
      .toMatchObject({ toast: '记忆功能未启用' })
    expect(lane.start).toHaveBeenCalledTimes(1)
  })

  it('keeps the lane provider refusal for an inapplicable dynamic start', async () => {
    const bridge = new FakeBridge()
    const lane = fakeLane({
      status: vi.fn(() => status({
        provider: 'local',
        state: 'local',
        target: null,
        coverage: null,
        model: 'local',
        dimensions: null,
      })),
      start: vi.fn(async () => ({ ok: false, error: 'not-remote' })),
    })
    registerGoNative(bridge, { telemetry: fakeTelemetry(), embedding: lane, pollMs: 60_000 })
    expect(await dispatchOf(bridge)({}, { action: 'start:deadbeef', locale: 'zh-CN', value: { confirmed: true } }))
      .toMatchObject({ toast: '仅远程模式支持' })
    expect(lane.start).toHaveBeenCalledTimes(1)
  })

  it('maps pause/resume refusals to the existing state machine', async () => {
    const bridge = new FakeBridge()
    const lane = fakeLane({
      pause: vi.fn(() => ({ ok: false, error: 'not-running' })),
      resume: vi.fn(() => ({ ok: true })),
    })
    registerGoNative(bridge, { telemetry: fakeTelemetry(), embedding: lane, pollMs: 60_000 })
    const dispatch = dispatchOf(bridge)
    bridge.panels.get(GO_EMBEDDING_PANEL_ID)!.data!({}, vi.fn(), { locale: 'zh-CN' })
    expect(await dispatch({}, { action: 'rebuild', locale: 'en-US', value: { value: 'pause' } }))
      .toMatchObject({ toast: 'No rebuild is running' })
    expect(await dispatch({}, { action: 'rebuild', locale: 'en-US', value: { value: 'resume' } }))
      .toMatchObject({ toast: 'Resumed' })
    expect(lane.pause).toHaveBeenCalledTimes(1)
    expect(lane.resume).toHaveBeenCalledTimes(1)
  })
})

function makeCorpus(path: string): void {
  const db = new DatabaseSync(path)
  try {
    db.exec(`
      CREATE TABLE memories(
        id INTEGER PRIMARY KEY,
        project_path TEXT NOT NULL,
        category TEXT NOT NULL,
        content TEXT NOT NULL,
        normalized_hash TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'active',
        expires_at INTEGER
      );
      CREATE TABLE memory_embeddings(
        memory_id INTEGER NOT NULL,
        embedding BLOB NOT NULL,
        model_id TEXT NOT NULL,
        PRIMARY KEY(memory_id, model_id)
      );
      INSERT INTO memories(id, project_path, category, content, normalized_hash, status)
        VALUES(1, 'git:alpha', 'ARCHITECTURE', 'memory 1', 'hash-1', 'active');
    `)
  } finally {
    db.close()
  }
}

function remoteConfig(): MagicContextDshConfig {
  return {
    embedding: {
      provider: 'openai-compatible',
      preset: 'custom',
      endpoint: 'http://127.0.0.1:9999/v1',
      authHeader: 'authorization',
      model: 'fixture-embed-a',
      apiKeyEnv: ENV_NAME,
      dimensions: 0,
      timeoutMs: 2_000,
      queryTimeoutMs: 500,
      batchSize: 2,
    },
  }
}

function response(body: unknown): Response {
  return new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } })
}

describe('local → remote volatile round trip', () => {
  it('disarms on a committed local/off change without a panel or status read, and never auto-starts on the way back', async () => {
    const root = tempDir()
    const corpus = join(root, 'memories.db')
    mkdirSync(root, { recursive: true })
    makeCorpus(corpus)
    const config = remoteConfig()
    let requests = 0
    const lane = openEmbeddingLane({
      config,
      corpusDbPath: corpus,
      dataDir: root,
      env: { [ENV_NAME]: 'test-key' },
      logger: { info: () => {}, warn: () => {} },
      fetchImpl: async () => {
        requests += 1
        return response({ model: 'fixture-embed-a', data: [{ embedding: Array.from({ length: 16 }, () => 0.1) }] })
      },
    })
    expect(await lane.probe()).toMatchObject({ ok: true })
    expect(await lane.start()).toEqual({ ok: true })
    expect(lane.hasRebuildState()).toBe(true)
    const statePath = join(root, 'embedding-rebuild.json')
    expect(existsSync(statePath)).toBe(true)
    const requestsAfterStart = requests

    const listeners = new Map<string, () => void>()
    const host = {
      on: (name: string, listener: () => void) => {
        listeners.set(name, listener)
        return () => { listeners.delete(name) }
      },
    }
    const off = installVolatileDisarm(host, lane, { warn: () => {} })
    expect([...listeners.keys()]).toEqual(['loader/volatile-update'])

    // The loader commits the reference first, then emits synchronously.
    config.embedding!.provider = 'local'
    listeners.get('loader/volatile-update')!()
    expect(existsSync(statePath)).toBe(false)

    // Back to the SAME remote tuple: no start, no new state, no probe.
    config.embedding!.provider = 'openai-compatible'
    listeners.get('loader/volatile-update')!()
    expect(existsSync(statePath)).toBe(false)
    expect(requests).toBe(requestsAfterStart)

    off()
    expect(listeners.size).toBe(0)
  })

  it('does not flip an already-local install to rollback-local when there is nothing to disarm', () => {
    const root = tempDir()
    const config = remoteConfig()
    config.embedding!.provider = 'local'
    const lane = openEmbeddingLane({
      config,
      corpusDbPath: join(root, 'memories.db'),
      dataDir: root,
      env: { [ENV_NAME]: 'test-key' },
      logger: { info: () => {}, warn: () => {} },
    })
    const listeners: Array<() => void> = []
    const host = { on: (_name: string, listener: () => void) => { listeners.push(listener); return () => {} } }
    installVolatileDisarm(host, lane)
    listeners[0]!()
    expect(lane.status().state).toBe('local')
  })
})

describe('released v1 manifest', () => {
  it('declares unique ids, one strip, two panels and the released limits', () => {
    const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as {
      dshGo: {
        v: number
        title: Record<string, string>
        icon: string
        contributes: {
          'composer.strip': Array<{ id: string; panel?: string }>
          panels: Array<{ id: string; title: Record<string, string>; placement: string[] }>
        }
      }
    }
    const go = pkg.dshGo
    expect(go.v).toBe(1)
    expect(Buffer.byteLength(JSON.stringify(go), 'utf8')).toBeLessThanOrEqual(16 * 1024)
    expect(Object.keys(go.title)).toEqual(['zh', 'en'])
    expect(Buffer.byteLength(go.icon, 'utf8')).toBeLessThanOrEqual(32)
    const ids = [
      ...go.contributes['composer.strip'].map(entry => entry.id),
      ...go.contributes.panels.map(entry => entry.id),
    ]
    expect(ids).toEqual([GO_STRIP_ID, GO_CONTEXT_PANEL_ID, GO_EMBEDDING_PANEL_ID])
    expect(new Set(ids).size).toBe(ids.length)
    expect(go.contributes['composer.strip'][0]!.panel).toBe(GO_CONTEXT_PANEL_ID)
    for (const panel of go.contributes.panels) {
      expect(Object.keys(panel.title)).toEqual(['zh', 'en'])
      expect(Array.from(panel.title.zh!).length).toBeLessThanOrEqual(16)
      expect(Array.from(panel.title.en!).length).toBeLessThanOrEqual(16)
      expect(panel.placement).toContain('session.tab')
      expect(panel.placement).toContain('features')
    }
  })
})
