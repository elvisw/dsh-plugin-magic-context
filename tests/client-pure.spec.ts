/**
 * The client's pure functions, pinned under node (no browser, no React).
 *
 * The panel's number/text formatters are its display contract — `compactTok`
 * exists because a bare five-digit token number used to be possible, and the
 * scope bug where `recordOf` referenced a component-scoped helper briefly
 * unmounted the whole pill subtree. These were only assertable through the
 * `__diagnostics` seat against the real bundle; this spec loads the shipped
 * client the same way the records-check script does (module shell + stub
 * React) and pins the formatting rules.
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const CLIENT = fileURLToPath(new URL('../src/client/index.js', import.meta.url))
const CLIENT_SOURCE = readFileSync(CLIENT, 'utf8')
const PACKAGE_JSON = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as { name: string }

let definition: { id?: string; factory?: (require: (name: string) => unknown) => Record<string, unknown> } | null = null
const window = { __ModuleLoader__: { load: (def: unknown) => { definition = def as typeof definition } } }
// eslint-disable-next-line @typescript-eslint/no-implied-eval
new Function('window', CLIENT_SOURCE)(window)
const factory = definition?.factory
if (typeof factory !== 'function') throw new Error('client bundle did not register a module')

const stubReact = {
  createElement: () => null,
  useState: (initial: unknown) => [initial, () => {}],
  useEffect: () => {},
  useRef: () => ({ current: null }),
}
const api = factory((name) => {
  if (name === 'react') return stubReact
  throw new Error('unexpected require: ' + name)
}) as {
  __diagnostics: {
    PKG_NAME: string
    compactTok: (value: unknown) => string
    fmtInt: (value: unknown) => string
    spanOf: (value: unknown) => string
    timeShort: (value: unknown) => string
    trimSummary: (summary: unknown) => Record<string, unknown>
    countRecentErrors: (recent: readonly unknown[], now: number) => number
    errorRecentMs: number
    recordOf: (event: unknown) => { category: string; text: string; detail: string; summary?: string } | null
    recordsOf: (rows: readonly unknown[]) => Array<{ category: string; text: string; detail: string; count: number }>
    recordCategories: Record<string, { icon: string; labelKey: string; tone: string }>
    dictionaryKeys: () => { zh: string[]; en: string[] }
    dictionaries: { zh: Record<string, string>; en: Record<string, string> }
    createModelCatalog: () => {
      attach: (context: unknown) => void
      getSnapshot: () => {
        status: string
        groups: Array<{
          id: string
          models: Array<{ id: string; name: string; reasoning?: { efforts: Array<{ id: string; name?: string }>; defaultEffort?: string } }>
        }>
        error: string | null
      }
      subscribe: (listener: () => void) => () => void
      load: () => Promise<void>
    }
    routePairOps: (
      providerText: string,
      modelText: string,
      providerPath: string[],
      modelPath: string[],
    ) => Array<{ op: string; path: string[]; value?: string }>
    settingsCopyKeys: () => string[]
    settingsSeats: string[]
    fieldSpecs: Array<{ path: string[]; kind: string; labelKey: string; hintKey: string }>
    fieldSections: () => Array<{
      id: string
      titleKey: string
      descKey: string
      common: Array<{ path: string[]; kind: string; labelKey: string; hintKey: string }>
      advanced: Array<{ path: string[]; kind: string; labelKey: string; hintKey: string }>
    }>
    layoutOf: (spec: { path: string[] }) => { section: string; placement: string }
    settingsSummary: (snapshot: unknown, status: unknown) => {
      ready: boolean
      policy: { execute: string; force: string }
      historian: { enabled: boolean; effort: string }
      vector: { kind: string; model: string }
      rebuild: { state: string; covered: number | null; total: number | null; missing: number | null; local: boolean }
    }
    embeddingActionState: (input: Record<string, unknown>) => Record<string, { hidden: boolean; disabled: boolean }> & { remote: boolean }
    embeddingStatusFlags: (status: unknown) => {
      keyPresent: boolean
      memoryEnabled: boolean
      dimensionsUnsupported: boolean
    }
    embeddingFieldVisible: (key: string, provider: string, keySource?: string, presetOwnsTransport?: boolean) => boolean
    normalizeEmbeddingPreset: (value: unknown) => string
    normalizeEndpointText: (value: unknown) => string
    embeddingPresetOwnsTransport: (preset: unknown, endpoint: unknown, authHeader: unknown) => boolean
    SILICONFLOW_ENDPOINT: string
    embeddingModelFieldMode: (input: {
      provider?: string
      models?: unknown
      value?: string
      manual?: boolean
      picker?: boolean
    }) => string
    embeddingModelSelectValue: (value: unknown, models: unknown) => string
    embeddingProbeResultText: (result: unknown) => {
      ok: boolean
      key?: string
      segments?: Array<{ text?: string; key?: string; params?: Record<string, string> }>
      code?: string
    }
    embeddingVerdictText: (verdict: unknown, translate: (key: string, params?: Record<string, string>) => string) => string
    embeddingNetworkFailure: (error: unknown) => string
    embeddingModelTargetKey: (input: { provider?: string; preset?: string; endpoint?: string; apiKeyEnv?: string }) => string
    EMBEDDING_ERROR_KEYS: Record<string, string>
    MANUAL_MODEL_VALUE: string
    embeddingKeyRowState: (input: {
      savedRef?: string
      refDirty?: boolean
      writable?: boolean
      credentialsAvailable?: boolean
      status?: unknown
      busy?: boolean
    }) => {
      savedRef: string
      source: string
      labelKey: string
      blockedKey: string
      canWrite: boolean
      clearVisible: boolean
      keyPresent: boolean
    }
    embeddingStateKeys: Record<string, string>
    reasoningEffortsOf: (
      groups: Array<{ id: string; models: Array<{ id: string; name?: string; reasoning?: unknown }> }>,
      provider: string,
      model: string,
    ) => { kind: string; efforts: Array<{ id: string; name?: string }>; defaultEffort?: string }
    effortSelectionOf: (options: Array<{ id: string; name?: string }>, current: string) => { mode: string; value: string }
    effortPlanOps: (
      path: string[],
      draft: { clear?: boolean; text?: string } | undefined,
    ) => { ops: Array<{ op: string; path: string[]; value?: string }>; blocked: boolean }
    effortDraftOf: (input: {
      baseValue?: string
      stored?: string
      draft?: { clear?: boolean; text?: string }
      customOpen?: boolean
      options?: Array<{ id: string; name?: string }>
    }) => { mode: string; value: string; displayValue: string; customOpen: boolean; cleared: boolean }
    EFFORT_CUSTOM_SENTINEL: string
  }
}

const { compactTok, fmtInt, spanOf, trimSummary, countRecentErrors, errorRecentMs } = api.__diagnostics

describe('compactTok — the one token-scale formatter', () => {
  it('keeps small counts bare, k-scale with one decimal, M-scale likewise', () => {
    expect(compactTok(912)).toBe('912')
    expect(compactTok(1_234)).toBe('1.2k')
    expect(compactTok(125_000)).toBe('125k')
    expect(compactTok(100_000)).toBe('100k')
    expect(compactTok(1_200_000)).toBe('1.2M')
    expect(compactTok(12_000_000)).toBe('12M')
    expect(compactTok(1_000_000)).toBe('1M')
  })
  it('refuses to format a non-number into digits', () => {
    expect(compactTok(undefined)).toBe('')
    expect(compactTok(null)).toBe('')
    expect(compactTok(Number.NaN)).toBe('')
    expect(compactTok('125000')).toBe('')
  })
})

describe('fmtInt — the one counting formatter', () => {
  it('adds thousands separators and never prints decimals', () => {
    expect(fmtInt(912)).toBe('912')
    expect(fmtInt(7_189)).toBe('7,189')
    expect(fmtInt(1_366_348)).toBe('1,366,348')
    expect(fmtInt(42.6)).toBe('43')
  })
  it('refuses non-numbers', () => {
    expect(fmtInt(undefined)).toBe('')
    expect(fmtInt(Number.NaN)).toBe('')
  })
})

describe('spanOf — durations', () => {
  it('ms below one second, one-decimal seconds above', () => {
    expect(spanOf(135)).toBe('135ms')
    expect(spanOf(999.6)).toBe('1000ms')
    expect(spanOf(9_700)).toBe('9.7s')
  })
  it('empty when the Host sent no number', () => {
    expect(spanOf(undefined)).toBe('')
  })
})

describe('recordCategories — the panel table is the single source', () => {
  it('every category the client can emit exists in its own table', () => {
    const rows = [
      { at: 1, level: 'info', kind: 'memory-promote', summary: 'promoted 2 facts', data: { promoted: 2 } },
      { at: 2, level: 'info', kind: 'memory-recall', summary: 'recalled 40 project memories', data: { rows: 40 } },
      { at: 3, level: 'info', kind: 'compartment-published', summary: 'published §C1§', data: { id: 'C1' } },
      { at: 4, level: 'info', kind: 'baseline', summary: 'baseline HARD rebuild (epoch 3)', data: { mode: 'hard', epoch: 3 } },
      { at: 5, level: 'warn', kind: 'emergency-reclaim', summary: 'emergency reclaim', data: { dropped: 3 } },
      { at: 6, level: 'error', kind: 'historian', summary: 'historian run failed (invalid-output)', data: { phase: 'failed', kind: 'invalid-output', reason: 'x' } },
      { at: 7, level: 'info', kind: 'maintenance', summary: 'maintenance: expired 0 · verified 1', data: { verified: 1 } },
      { at: 8, level: 'warn', kind: 'maintenance', summary: 'maintenance: verify call failed', data: {} },
      { at: 9, level: 'info', kind: 'tool-call', summary: 'ctx_memory', data: { action: 'write' } },
      { at: 10, level: 'info', kind: 'drop-landed', summary: 'landed 3 drop(s)', data: { count: 3 } },
      { at: 11, level: 'error', kind: 'error', summary: 'boom', data: {} },
    ]
    const { recordsOf, recordCategories, dictionaryKeys } = api.__diagnostics
    const records = recordsOf(rows)
    expect(records.length).toBeGreaterThan(4)
    for (const record of records) {
      // The records-check script used to keep a hand-copied table; it drifted
      // when `maintain` was added and crashed on a category it did not know.
      expect(Object.keys(recordCategories)).toContain(record.category)
    }
    // The seven shipped roles, each renderable (icon + a label the zh dictionary knows).
    for (const role of ['write', 'read', 'reclaim', 'drop', 'maintain', 'archive', 'error']) {
      expect(Object.keys(recordCategories)).toContain(role)
    }
    const zhKeys = dictionaryKeys().zh
    for (const entry of Object.values(recordCategories)) {
      expect(typeof entry.icon).toBe('string')
      expect(zhKeys).toContain(entry.labelKey)
    }
  })
})

describe('tool-call records — the reclamation lane the panel used to drop', () => {
  const { recordOf } = api.__diagnostics

  it('ctx_reduce becomes a drop row carrying both counts', () => {
    const row = recordOf({
      at: 1,
      level: 'info',
      kind: 'tool-call',
      summary: 'ctx_reduce: queued 2, refused 1',
      data: { tool: 'ctx_reduce', requested: [1, 2, 3], queued: [1, 2], refused: [{ tag: 3, reason: 'already dropped' }], ms: 12 },
    })
    expect(row).not.toBeNull()
    expect(row!.category).toBe('drop')
    expect(row!.text).toBe('回收入队')
    expect(row!.detail).toContain('入队 2')
    expect(row!.detail).toContain('被拒 1')
    expect(row!.detail).toContain('12ms')
  })

  it('ctx_expand becomes an archive row and stays quiet when nothing was refused', () => {
    const row = recordOf({
      at: 2,
      level: 'info',
      kind: 'tool-call',
      summary: 'ctx_expand: restored 1, refused 0',
      data: { tool: 'ctx_expand', requested: [7], restored: [7], refused: [], ms: 4 },
    })
    expect(row).not.toBeNull()
    expect(row!.category).toBe('archive')
    expect(row!.text).toBe('恢复原文')
    expect(row!.detail).toContain('恢复 1')
    expect(row!.detail).not.toContain('被拒')
  })

  it('renders a range read as a read row, not a restore', () => {
    const row = recordOf({
      at: 2,
      level: 'info',
      kind: 'tool-call',
      summary: 'ctx_expand: read 4 event(s)',
      data: { tool: 'ctx_expand', locator: 'range', events: [20, 24, 26, 28], skipped: 5, ms: 6 },
    })
    expect(row).not.toBeNull()
    expect(row!.category).toBe('read')
    expect(row!.text).toBe('读取上下文')
    expect(row!.detail).toContain('4 个事件')
    expect(row!.detail).toContain('跳过 5')
    expect(row!.detail).not.toContain('恢复')
  })

  it('renders a range refusal as a read row without restored detail', () => {
    const row = recordOf({
      at: 2,
      level: 'info',
      kind: 'tool-call',
      summary: 'ctx_expand: read 0 events (refused)',
      data: { tool: 'ctx_expand', locator: 'range', start: '9', end: '2', events: [], skipped: 0, reason: 'start must not be greater than end', ms: 1 },
    })
    expect(row).not.toBeNull()
    expect(row!.category).toBe('read')
    expect(row!.text).toBe('读取上下文')
    expect(row!.detail).not.toContain('恢复')
  })

  it('records a message-locator restore with the resolved tag', () => {
    const row = recordOf({
      at: 2,
      level: 'info',
      kind: 'tool-call',
      summary: 'ctx_expand: restored 1, refused 0',
      data: { tool: 'ctx_expand', requested: [], message: 21, restored: [1], refused: [], ms: 5 },
    })
    expect(row).not.toBeNull()
    expect(row!.category).toBe('archive')
    expect(row!.detail).toContain('恢复 1')
    expect(row!.detail).not.toContain('被拒')
  })

  it('ctx_memory search reads as a read row with its hit count', () => {
    const row = recordOf({
      at: 3,
      level: 'info',
      kind: 'tool-call',
      summary: 'ctx_memory search: 3 result(s)',
      data: { tool: 'ctx_memory', action: 'search', hits: 3, ms: 8, ok: true },
    })
    expect(row).not.toBeNull()
    expect(row!.category).toBe('read')
    expect(row!.text).toBe('检索记忆')
    expect(row!.detail).toContain('检索')
    expect(row!.detail).toContain('命中 3')
  })

  it('keeps the write/read branches and still ignores an unmodelled action', () => {
    expect(recordOf({ kind: 'tool-call', data: { tool: 'ctx_memory', action: 'write' } })!.category).toBe('write')
    expect(recordOf({ kind: 'tool-call', data: { tool: 'ctx_memory', action: 'list' } })!.category).toBe('read')
    expect(recordOf({ kind: 'tool-call', data: { tool: 'ctx_memory', action: 'not-an-action' } })).toBeNull()
  })
})

describe('trimSummary — the badge whitelist', () => {
  it('passes the acted-on numbers through the num() gate', () => {
    const trimmed = trimSummary({
      scope: 'session',
      adapter: { schemaVersion: 6, engine: 'mc', toolsMode: 'rw' },
      project: { identity: 'git:93eea8cdeebd2eb57f476137abf32fa0c42cd3f5', memories: 42 },
      health: {
        journalRows: 10,
        errorsSinceBoot: 0,
        lastPressure: 26,
        lastTokens: 103_000,
        lastContextWindow: 400_000,
        memoryStats: { verified: 34, unverified: 7 },
        maintenanceLast: { at: 1, expired: 0, verified: 3, updated: 0, archived: 0 },
      },
    })
    expect(trimmed.scope).toBe('session')
    // The shipped Host half names it toolsMode (contract sketch said tools).
    expect(trimmed.tools).toBe('rw')
    expect(trimmed.errorsSinceBoot).toBe(0)
    expect(trimmed.lastPressure).toBe(26)
    expect(trimmed.lastTokens).toBe(103_000)
    expect(trimmed.projectMemories).toBe(42)
    expect(trimmed.memoryStats).toEqual({ verified: 34, unverified: 7 })
    expect(trimmed.maintenanceLast).toMatchObject({ verified: 3 })
    expect(typeof trimmed.projectIdentity).toBe('string')
    expect((trimmed.projectIdentity as string).length).toBeGreaterThan(0)
  })

  it('defaults the scope and drops non-numeric noise instead of rendering it', () => {
    const trimmed = trimSummary({
      health: { lastPressure: '26%', errorsSinceBoot: null, memoryStats: 'garbage' },
    })
    expect(trimmed.scope).toBe('global')
    expect(trimmed.engine).toBe('unknown')
    // A string pressure must NOT render as a percentage of nothing.
    expect(trimmed.lastPressure).toBeUndefined()
    // errorsSinceBoot is a raw passthrough (the red-pill reader) — null stays null.
    expect(trimmed.errorsSinceBoot).toBeNull()
    expect(trimmed.memoryStats).toBeUndefined()
  })
})

/**
 * The pill's red state. It used to ride `errorsSinceBoot`, which on 2026-10-11
 * kept the badge red through 21.5 h of uptime over five provider-side stream
 * failures (all `level: 'error'`, all already classified and retried by the
 * adapter) while the panel showed its green "connected" header — the two
 * surfaces disagreed. The window is what makes them agree, so both ends of it
 * are pinned here: a fresh error still reddens the badge, an old one never does.
 */
describe('countRecentErrors — the pill answers "is anything wrong NOW"', () => {
  const now = 1_800_000_000_000

  it('counts an error inside the window', () => {
    expect(countRecentErrors([{ at: now - 60_000, level: 'error', kind: 'historian' }], now)).toBe(1)
  })

  it('the 21.5 h regression: old errors no longer redden the badge', () => {
    // The live shape that produced "MC · 10 err" beside a green panel.
    const stale = Array.from({ length: 10 }, (_, index) => ({ at: now - (index + 1) * 3_600_000, level: 'error' }))
    expect(countRecentErrors(stale, now)).toBe(0)
  })

  it('the window edge is inclusive and one millisecond older is not', () => {
    expect(countRecentErrors([{ at: now - errorRecentMs, level: 'error' }], now)).toBe(1)
    expect(countRecentErrors([{ at: now - errorRecentMs - 1, level: 'error' }], now)).toBe(0)
  })

  it('only level=error counts — info and warn rows never redden it', () => {
    expect(countRecentErrors([
      { at: now - 1_000, level: 'info' },
      { at: now - 1_000, level: 'warn' },
      { at: now - 1_000, level: 'error' },
      { at: now - 1_000, level: 'error' },
    ], now)).toBe(2)
  })

  it('a malformed row is skipped, never counted and never thrown on', () => {
    expect(countRecentErrors([
      null, undefined, {}, { at: 'yesterday', level: 'error' }, { level: 'error' }, { at: now, level: 42 },
    ], now)).toBe(0)
    expect(countRecentErrors(undefined as unknown as readonly unknown[], now)).toBe(0)
    expect(countRecentErrors('nope' as unknown as readonly unknown[], now)).toBe(0)
  })
})

/**
 * The maintenance verify picker reads the host model catalog
 * (`remote.session.modelCatalog()`) — the only durable source of the
 * provider/model pairs the profile configured. Two failure modes are pinned:
 * a broken catalog must leave the fields usable (plain text), and a missing
 * catalog RPC must never throw on the card.
 */
describe('createModelCatalog — the verify-pin picker source', () => {
  const READY = {
    ok: true,
    value: {
      groups: [
        { id: 'corp-a', models: [{ id: 'fast', name: 'Fast' }, { id: 'deep' }] },
        { id: 'corp-b', models: [{ id: 'tiny', name: 'Tiny' }] },
      ],
    },
  }
  /** Let the load/refresh promise chain settle without a timer. */
  const settle = async () => {
    for (let index = 0; index < 6; index += 1) await Promise.resolve()
  }
  interface StubContext {
    remote: {
      session: { modelCatalog: () => Promise<unknown> }
      $on: (event: string, handler: () => void) => () => void
    }
    on: (event: string, handler: () => void) => () => void
    effect: (factory: () => () => void) => () => void
    fire: (event: string) => void
    calls: () => number
  }
  const stubContext = (responses: unknown[]): StubContext => {
    let calls = 0
    const handlers = new Map<string, () => void>()
    return {
      remote: {
        session: { modelCatalog: () => Promise.resolve(responses[Math.min(calls++, responses.length - 1)]) },
        $on: (event, handler) => {
          handlers.set(event, handler)
          return () => { handlers.delete(event) }
        },
      },
      on: (event, handler) => {
        handlers.set('ctx:' + event, handler)
        return () => { handlers.delete('ctx:' + event) }
      },
      effect: (factory) => factory(),
      fire: (event) => { handlers.get(event)?.() },
      calls: () => calls,
    }
  }
  const catalogFrom = () => api.__diagnostics.createModelCatalog()

  it('loads the configured providers and models in host order', async () => {
    const catalog = catalogFrom()
    catalog.attach(stubContext([READY]))
    await settle()
    const state = catalog.getSnapshot()
    expect(state.status).toBe('ready')
    expect(state.groups.map((group) => group.id)).toEqual(['corp-a', 'corp-b'])
    expect(state.groups[0]?.models.map((model) => model.id)).toEqual(['fast', 'deep'])
    // A model without a display name falls back to its id.
    expect(state.groups[0]?.models[1]?.name).toBe('deep')
  })

  it('keeps each model reasoning metadata, dropping malformed rows', async () => {
    const catalog = catalogFrom()
    catalog.attach(stubContext([{
      ok: true,
      value: {
        groups: [{
          id: 'corp-a',
          models: [{
            id: 'fast',
            name: 'Fast',
            reasoning: {
              efforts: [{ id: 'off' }, { id: 'low', name: 'Low' }, { id: 'low' }, null, { id: '' }],
              defaultEffort: 'low',
            },
          }, { id: 'plain' }],
        }],
      },
    }]))
    await settle()
    const models = catalog.getSnapshot().groups[0]?.models
    expect(models?.[0]?.reasoning).toEqual({ efforts: [{ id: 'off' }, { id: 'low', name: 'Low' }], defaultEffort: 'low' })
    expect(models?.[1]?.reasoning).toBeUndefined()
  })

  it('keeps the fields usable when the host answers with an error', async () => {
    const catalog = catalogFrom()
    catalog.attach(stubContext([{ ok: false, error: { message: 'catalog unavailable' } }]))
    await settle()
    const state = catalog.getSnapshot()
    expect(state.status).toBe('error')
    expect(state.error).toBe('catalog unavailable')
    expect(state.groups).toEqual([])
  })

  it('stays on plain text (idle, no throw) when the shell exposes no catalog', () => {
    const catalog = catalogFrom()
    expect(() => catalog.attach({ effect: () => () => {} })).not.toThrow()
    expect(catalog.getSnapshot().status).toBe('idle')
  })

  it('re-reads on llm/models-updated, so a provider edit reaches the picker', async () => {
    const next = {
      ok: true,
      value: { groups: [{ id: 'corp-c', models: [{ id: 'new-model', name: 'New' }] }] },
    }
    const context = stubContext([READY, next])
    const catalog = catalogFrom()
    let notifications = 0
    const off = catalog.subscribe(() => { notifications += 1 })
    catalog.attach(context)
    await settle()
    expect(catalog.getSnapshot().groups[0]?.id).toBe('corp-a')
    context.fire('llm/models-updated')
    await settle()
    expect(catalog.getSnapshot().groups[0]?.id).toBe('corp-c')
    expect(notifications).toBeGreaterThan(1)
    off()
    expect(context.calls()).toBe(2)
  })

  it('treats a malformed catalog as empty, never as a crash', async () => {
    const catalog = catalogFrom()
    catalog.attach(stubContext([{
      ok: true,
      value: {
        groups: [
          null,
          {},
          { id: '', models: [] },
          { id: 'x', models: [null, { id: 42 }, { id: 'ok-model' }] },
        ],
      },
    }]))
    await settle()
    const state = catalog.getSnapshot()
    expect(state.status).toBe('ready')
    expect(state.groups.map((group) => group.id)).toEqual(['x'])
    expect(state.groups[0]?.models.map((model) => model.id)).toEqual(['ok-model'])
  })
})

/**
 * A route pin is a PAIR on both sides of the seam (`liveRoute` on the host,
 * `maintenance-wiring.ts` for the verify lane). The card must never write a
 * half-filled pair: a provider without its model (or vice versa) reads as "no
 * pin" on the host, so a half write would silently leave a stale model behind.
 */
describe('client package identity', () => {
  it('registers under the package.json name', () => {
    expect(definition?.id).toBe(PACKAGE_JSON.name)
    expect(api.__diagnostics.PKG_NAME).toBe(PACKAGE_JSON.name)
  })
})

describe('routePairOps — the pin-pair write semantics', () => {
  const PROVIDER = ['maintenance', 'verifyProvider']
  const MODEL = ['maintenance', 'verifyModel']
  const pair = () => api.__diagnostics.routePairOps

  it('writes both halves when both are set', () => {
    expect(pair()('corp', 'flash', PROVIDER, MODEL)).toEqual([
      { op: 'set', path: ['maintenance', 'verifyProvider'], value: 'corp' },
      { op: 'set', path: ['maintenance', 'verifyModel'], value: 'flash' },
    ])
  })

  it('clears BOTH halves when either side is empty ("Auto" and half pins)', () => {
    const expected = [
      { op: 'unset', path: ['maintenance', 'verifyProvider'] },
      { op: 'unset', path: ['maintenance', 'verifyModel'] },
    ]
    expect(pair()('', 'flash', PROVIDER, MODEL)).toEqual(expected)
    expect(pair()('corp', '', PROVIDER, MODEL)).toEqual(expected)
    expect(pair()('', '', PROVIDER, MODEL)).toEqual(expected)
  })

  it('returns fresh path arrays, so a render cannot mutate the field definitions', () => {
    const first = pair()('corp', 'flash', PROVIDER, MODEL)[0]!.path
    expect(first).not.toBe(PROVIDER)
    first.push('extra')
    expect(PROVIDER).toEqual(['maintenance', 'verifyProvider'])
  })
})

describe('settings information architecture (T21)', () => {
  const { fieldSpecs, fieldSections, layoutOf, settingsSummary, embeddingActionState, embeddingStatusFlags, embeddingFieldVisible, embeddingKeyRowState, embeddingStateKeys, normalizeEmbeddingPreset, normalizeEndpointText, embeddingPresetOwnsTransport, SILICONFLOW_ENDPOINT, embeddingModelFieldMode, embeddingModelSelectValue, embeddingProbeResultText, EMBEDDING_ERROR_KEYS, MANUAL_MODEL_VALUE } = api.__diagnostics

  it('gives every field exactly one section and one placement', () => {
    const sections = fieldSections()
    expect(sections.map((section) => section.id)).toEqual([
      'general', 'historian', 'journal', 'embedding', 'maintenance',
    ])
    const placed = sections.flatMap((section) => [
      ...section.common.map((spec) => ({ key: spec.path.join('.'), section: section.id, placement: 'common' })),
      ...section.advanced.map((spec) => ({ key: spec.path.join('.'), section: section.id, placement: 'advanced' })),
    ])
    expect(placed).toHaveLength(35)
    expect(new Set(placed.map((entry) => entry.key)).size).toBe(35)
    expect(new Set(fieldSpecs.map((spec) => spec.path.join('.')))).toEqual(new Set(placed.map((entry) => entry.key)))
    for (const spec of fieldSpecs) {
      const layout = layoutOf(spec)
      expect(layout.section).toBe(placed.find((entry) => entry.key === spec.path.join('.'))?.section)
      expect(layout.placement).toBe(placed.find((entry) => entry.key === spec.path.join('.'))?.placement)
    }
  })

  it('keeps the embedding API key as a write-only field beside its reference', () => {
    const embedding = fieldSections().find((section) => section.id === 'embedding')
    expect(embedding).toBeDefined()
    expect(embedding.common.map((spec) => spec.path.join('.'))).toContain('embedding.apiKeyEnv')
    expect(embedding.common.map((spec) => spec.path.join('.'))).toContain('embedding.apiKey')
    expect(embedding.advanced.map((spec) => spec.path.join('.'))).not.toContain('embedding.apiKey')
    expect(fieldSpecs.find((spec) => spec.path.join('.') === 'embedding.apiKey')?.kind).toBe('secret')
  })

  it('keeps the advanced groups on the sections the design names', () => {
    const sections = fieldSections()
    expect(sections.find((section) => section.id === 'general')?.advanced.map((spec) => spec.path.join('.'))).toEqual([
      'policy.baselineTokens', 'policy.memoryBudgetTokens', 'policy.memoryLimit',
    ])
    expect(sections.find((section) => section.id === 'embedding')?.advanced.map((spec) => spec.path.join('.'))).toEqual([
      'embedding.authHeader', 'embedding.dimensions', 'embedding.queryInstruction',
      'embedding.documentPrefix', 'embedding.timeoutMs', 'embedding.queryTimeoutMs', 'embedding.batchSize',
    ])
    expect(layoutOf({ path: ['embedding', 'queryInstruction'] })).toEqual({ section: 'embedding', placement: 'advanced' })
    expect(layoutOf({ path: ['policy', 'executeThreshold'] })).toEqual({ section: 'general', placement: 'common' })
  })

  it('renders the ten real remote states, not an invented off state', () => {
    expect(Object.keys(embeddingStateKeys).sort()).toEqual([
      'local', 'remote-configured-not-started', 'remote-error', 'remote-migrating',
      'remote-off', 'remote-paused', 'remote-ready', 'remote-target-missing',
      'remote-unprobed', 'rollback-local',
    ].sort())
  })

  it('builds the four summary metrics and keeps unknown values empty', () => {
    const snapshot = {
      status: 'ready',
      value: {
        policy: { executeThreshold: 65, forceThreshold: 85 },
        historianEnabled: true,
        historian: { reasoningEffort: 'low' },
      },
    }
    const status = {
      provider: 'openai-compatible',
      state: 'remote-configured-not-started',
      model: 'BAAI/bge-m3',
      coverage: { covered: 0, total: 12 },
      dimensions: 1024,
    }
    expect(settingsSummary(snapshot, status)).toMatchObject({
      ready: true,
      policy: { execute: '65', force: '85' },
      historian: { enabled: true, effort: 'low' },
      vector: { kind: 'remote', model: 'BAAI/bge-m3' },
      rebuild: { state: 'remote-configured-not-started', covered: 0, total: 12, missing: 12, local: false },
    })
    const empty = settingsSummary({ status: 'ready', value: {} }, null)
    expect(empty.policy).toEqual({ execute: '', force: '' })
    expect(empty.historian).toEqual({ enabled: false, effort: '' })
    expect(empty.vector.kind).toBe('unknown')
    expect(empty.rebuild.state).toBe('')

    const local = settingsSummary(
      { status: 'ready', value: {} },
      { provider: 'local', state: 'local', model: 'local', coverage: { covered: 2, total: 2 } },
    )
    expect(local.vector).toEqual({ kind: 'local', model: '' })
    expect(local.rebuild).toMatchObject({ state: 'local', local: true, covered: 2, total: 2 })
    const rolledBack = settingsSummary(
      { status: 'ready', value: {} },
      { provider: 'local', state: 'rollback-local', model: 'local', coverage: { covered: 0, total: 2 } },
    )
    expect(rolledBack.vector.kind).toBe('local')
    expect(rolledBack.rebuild.local).toBe(true)
  })

  it('keeps remote actions behind saved-model/endpoint preconditions', () => {
    const base = {
      state: 'remote-configured-not-started', dirty: false, writable: true, busy: false,
      model: 'BAAI/bge-m3', endpointResolvable: true, total: 12, probeOk: true,
    }
    const ready = embeddingActionState(base)
    expect(ready.remote).toBe(true)
    expect(ready.load.disabled).toBe(false)
    expect(ready.test.disabled).toBe(false)
    expect(ready.start.disabled).toBe(false)

    const dirty = embeddingActionState({ ...base, dirty: true })
    expect(dirty.load.disabled).toBe(false)
    expect(dirty.test.disabled).toBe(false)
    expect(dirty.start.disabled).toBe(true)
    expect(dirty.rollback.disabled).toBe(true)
    expect(ready.rollback.hidden).toBe(true)

    const missingEndpoint = embeddingActionState({ ...base, endpointResolvable: false })
    expect(missingEndpoint.load.disabled).toBe(true)
    expect(missingEndpoint.test.disabled).toBe(true)

    const noMemory = embeddingActionState({ ...base, total: 0 })
    expect(noMemory.start.disabled).toBe(true)

    const noKey = embeddingActionState({ ...base, keyPresent: false })
    expect(noKey.load.disabled).toBe(true)
    expect(noKey.test.disabled).toBe(true)
    expect(noKey.start.disabled).toBe(true)

    const memoryOff = embeddingActionState({ ...base, memoryEnabled: false })
    expect(memoryOff.load.disabled).toBe(true)
    expect(memoryOff.test.disabled).toBe(true)
    expect(memoryOff.start.disabled).toBe(true)

    const dimensionsUnsupported = embeddingActionState({ ...base, dimensionsUnsupported: true })
    expect(dimensionsUnsupported.start.disabled).toBe(true)

    expect(embeddingStatusFlags({ keyPresent: false, keyEnv: '' })).toEqual({
      keyPresent: true, memoryEnabled: true, dimensionsUnsupported: false,
    })
    expect(embeddingStatusFlags({ keyPresent: false, keyEnv: 'MISSING_KEY' })).toEqual({
      keyPresent: false, memoryEnabled: true, dimensionsUnsupported: false,
    })
    expect(embeddingStatusFlags({ lastError: 'dimensions-unsupported', memoryEnabled: false })).toEqual({
      keyPresent: true, memoryEnabled: false, dimensionsUnsupported: true,
    })
    expect(embeddingStatusFlags({ keyPresent: false, keyEnv: '', keyEnvInvalid: true })).toEqual({
      keyPresent: false, memoryEnabled: true, dimensionsUnsupported: false,
    })

    // T31: the local and off paths read none of the twelve remote fields, so the
    // card hides them. Only `openai-compatible` shows them, and the provider row
    // itself is always visible.
    const remoteOnly = [
      'embedding.preset', 'embedding.endpoint', 'embedding.model', 'embedding.apiKeyEnv',
      'embedding.apiKey', 'embedding.authHeader', 'embedding.dimensions',
      'embedding.queryInstruction', 'embedding.documentPrefix', 'embedding.timeoutMs',
      'embedding.queryTimeoutMs', 'embedding.batchSize',
    ]
    for (const key of remoteOnly) {
      expect(embeddingFieldVisible(key, 'local'), `${key} local`).toBe(false)
      expect(embeddingFieldVisible(key, 'off'), `${key} off`).toBe(false)
      expect(embeddingFieldVisible(key, 'openai-compatible'), `${key} remote`).toBe(true)
    }
    expect(embeddingFieldVisible('embedding.provider', 'local')).toBe(true)
    expect(embeddingFieldVisible('embedding.provider', 'off')).toBe(true)
    // The runtime lowercases the provider; a hand-edited value must not flip the
    // card into hiding everything the remote path needs.
    expect(embeddingFieldVisible('embedding.endpoint', 'OpenAI-Compatible')).toBe(true)
    expect(embeddingFieldVisible('embedding.endpoint', ' LOCAL ')).toBe(false)
    // T37: local/off keeps no key input. A stored credential keeps one clear
    // row; a literal key gets a state line with no action.
    expect(embeddingFieldVisible('embedding.apiKey', 'local', 'credential')).toBe(true)
    expect(embeddingFieldVisible('embedding.apiKey', 'off', 'credential')).toBe(true)
    expect(embeddingFieldVisible('embedding.apiKey', 'local', 'literal')).toBe(true)
    expect(embeddingFieldVisible('embedding.apiKey', 'local', 'environment')).toBe(false)
    expect(embeddingFieldVisible('embedding.apiKey', 'local', 'none')).toBe(false)
    expect(embeddingFieldVisible('embedding.endpoint', 'local', 'credential')).toBe(false)

    // T37: the SiliconFlow preset owns the endpoint and auth header only when
    // nothing non-default is saved; otherwise both stay visible because the
    // resolver still uses the saved value.
    for (const key of ['embedding.endpoint', 'embedding.authHeader']) {
      expect(embeddingFieldVisible(key, 'openai-compatible', 'none', true), `${key} owned`).toBe(false)
      expect(embeddingFieldVisible(key, 'openai-compatible', 'none', false), `${key} override`).toBe(true)
    }
    expect(embeddingFieldVisible('embedding.model', 'openai-compatible', 'none', true)).toBe(true)
    expect(embeddingFieldVisible('embedding.apiKey', 'openai-compatible', 'none', true)).toBe(true)

    // Preset normalisation must agree with resolveEmbeddingConfig: an empty or
    // unknown value is not "custom" by accident.
    expect(normalizeEmbeddingPreset('')).toBe('siliconflow')
    expect(normalizeEmbeddingPreset(undefined)).toBe('siliconflow')
    expect(normalizeEmbeddingPreset(' SiliconFlow ')).toBe('siliconflow')
    expect(normalizeEmbeddingPreset('custom')).toBe('custom')
    expect(normalizeEmbeddingPreset('openai')).toBe('custom')
    // Endpoint comparison drops a trailing slash or /embeddings, as the resolver does.
    expect(normalizeEndpointText(' https://api.siliconflow.cn/v1/ ')).toBe(SILICONFLOW_ENDPOINT)
    expect(normalizeEndpointText('https://api.siliconflow.cn/v1/embeddings')).toBe(SILICONFLOW_ENDPOINT)
    expect(normalizeEndpointText(null)).toBe('')
    expect(SILICONFLOW_ENDPOINT).toBe('https://api.siliconflow.cn/v1')
    expect(embeddingPresetOwnsTransport('siliconflow', '', '')).toBe(true)
    expect(embeddingPresetOwnsTransport('', 'https://api.siliconflow.cn/v1/embeddings', 'Authorization')).toBe(true)
    expect(embeddingPresetOwnsTransport('siliconflow', 'https://mirror.example/v1', 'authorization')).toBe(false)
    expect(embeddingPresetOwnsTransport('siliconflow', '', 'api-key')).toBe(false)
    expect(embeddingPresetOwnsTransport('custom', '', '')).toBe(false)
    // The resolver keeps `endpoint: ''` for a value that only trims to slashes,
    // so the form must not claim the preset address there.
    expect(embeddingPresetOwnsTransport('siliconflow', '/', '')).toBe(false)
    expect(embeddingPresetOwnsTransport('siliconflow', '//', '')).toBe(false)
    expect(embeddingPresetOwnsTransport('siliconflow', '/embeddings', '')).toBe(false)
    // Non-embedding keys are untouched by the rule.
    expect(embeddingFieldVisible('policy.executeThreshold', 'local')).toBe(true)
    // Every remote-only key in the schema is covered by the list above.
    const embeddingKeys = fieldSpecs
      .map((spec) => spec.path.join('.'))
      .filter((key) => key.startsWith('embedding.') && key !== 'embedding.provider')
    expect([...embeddingKeys].sort()).toEqual([...remoteOnly].sort())

    const keyBase = {
      savedRef: 'SILICONFLOW_API_KEY', refDirty: false, writable: true,
      credentialsAvailable: true, status: { keyPresent: false, keySource: 'none' }, busy: false,
    }
    expect(embeddingKeyRowState(keyBase).canWrite).toBe(true)
    expect(embeddingKeyRowState({ ...keyBase, writable: false }).blockedKey).toBe('settings.embedding.readOnly')
    expect(embeddingKeyRowState({ ...keyBase, refDirty: true }).blockedKey).toBe('settings.embedding.keySaveFirst')
    expect(embeddingKeyRowState({ ...keyBase, savedRef: '' }).blockedKey).toBe('settings.embedding.keyRefRequired')
    expect(embeddingKeyRowState({ ...keyBase, savedRef: 'bad-name' }).blockedKey).toBe('settings.embedding.keyInvalidRef')
    expect(embeddingKeyRowState({ ...keyBase, credentialsAvailable: false }).blockedKey).toBe('settings.embedding.keyUnavailable')
    expect(embeddingKeyRowState({ ...keyBase, status: null }).blockedKey).toBe('settings.embedding.working')
    expect(embeddingKeyRowState({ ...keyBase, busy: true }).blockedKey).toBe('settings.embedding.keyBusy')
    expect(embeddingKeyRowState({
      ...keyBase, status: { keyPresent: true, keySource: 'credential' },
    })).toMatchObject({ labelKey: 'settings.embedding.keyCredential', clearVisible: true, canWrite: true })
    expect(embeddingKeyRowState({
      ...keyBase, status: { keyPresent: true, keySource: 'environment' },
    })).toMatchObject({ labelKey: 'settings.embedding.keyEnvironment', clearVisible: false })
    expect(embeddingKeyRowState({
      ...keyBase, status: { keyPresent: false, keySource: 'none', keyEnv: '' },
    })).toMatchObject({ labelKey: 'settings.embedding.noAuth', clearVisible: false })
    expect(embeddingKeyRowState({
      ...keyBase, status: { keyPresent: false, keySource: 'none', keyEnv: '', keyEnvInvalid: true },
    })).toMatchObject({ labelKey: 'settings.embedding.keyInvalidRef', canWrite: true })

    const migrating = embeddingActionState({ ...base, state: 'remote-migrating' })
    expect(migrating.start.hidden).toBe(true)
    expect(migrating.pause.hidden).toBe(false)
    expect(migrating.load.disabled).toBe(true)
    expect(migrating.test.disabled).toBe(true)
    expect(migrating.rollback.disabled).toBe(true)

    const paused = embeddingActionState({ ...base, state: 'remote-paused' })
    expect(paused.start.hidden).toBe(true)
    expect(paused.resume.hidden).toBe(false)
    expect(paused.load.disabled).toBe(true)
    expect(paused.test.disabled).toBe(true)

    const local = embeddingActionState({ ...base, state: 'local' })
    expect(local.remote).toBe(false)
    expect(local.load.hidden).toBe(true)
    expect(local.test.hidden).toBe(true)
    expect(local.start.hidden).toBe(true)

    // T38: a draft switch to remote exposes Load right away (Save and load),
    // while Test waits for a model and Start waits for the saved state.
    const draftRemote = embeddingActionState({ ...base, state: 'local', remoteDraft: true, model: '' })
    expect(draftRemote.remote).toBe(false)
    expect(draftRemote.load.hidden).toBe(false)
    expect(draftRemote.load.disabled).toBe(false)
    expect(draftRemote.test.hidden).toBe(false)
    expect(draftRemote.test.disabled).toBe(true)
    expect(draftRemote.start.hidden).toBe(true)
    const draftRemoteModel = embeddingActionState({ ...base, state: 'local', remoteDraft: true })
    expect(draftRemoteModel.test.disabled).toBe(false)
  })

  it('picks the model in the model field and never invents a selection', () => {
    const base = {
      provider: 'openai-compatible', preset: 'custom', models: ['a/embed', 'b/embed'] as string[], value: '',
    }
    // An empty value with a chosen preset is a select that carries an explicit
    // empty option, so it never draws an id the store does not hold.
    expect(embeddingModelFieldMode(base)).toBe('select')
    expect(embeddingModelSelectValue('', base.models)).toBe('')
    expect(embeddingModelSelectValue('not/loaded', base.models)).toBe('')
    expect(embeddingModelSelectValue('b/embed', base.models)).toBe('b/embed')

    // A loaded value stays a picker; an outside value defaults to text and only
    // becomes a picker when the reader asks for it.
    expect(embeddingModelFieldMode({ ...base, value: 'a/embed' })).toBe('select')
    expect(embeddingModelFieldMode({ ...base, value: 'old/model' })).toBe('text')
    expect(embeddingModelFieldMode({ ...base, value: 'old/model', picker: true })).toBe('select')

    // No preset: no service is chosen, so the field is always a text input and
    // the picker never appears — not even on an explicit request.
    expect(embeddingModelFieldMode({ ...base, preset: '' })).toBe('text')
    expect(embeddingModelFieldMode({ ...base, preset: '   ' })).toBe('text')
    expect(embeddingModelFieldMode({ ...base, preset: '', picker: true })).toBe('text')
    expect(embeddingModelFieldMode({ ...base, preset: undefined })).toBe('text')

    // No list, local provider, or manual mode: text.
    expect(embeddingModelFieldMode({ ...base, models: [] })).toBe('text')
    expect(embeddingModelFieldMode({ ...base, provider: 'local' })).toBe('text')
    expect(embeddingModelFieldMode({ ...base, value: 'a/embed', manual: true })).toBe('text')
    // Manual mode wins over an explicit picker request.
    expect(embeddingModelFieldMode({ ...base, manual: true, picker: true })).toBe('text')

    // The sentinel must never be a value the card could save.
    expect(MANUAL_MODEL_VALUE.startsWith('__mc_')).toBe(true)
    expect(base.models.includes(MANUAL_MODEL_VALUE)).toBe(false)
  })

  it('reports the connection test with a localised verdict', () => {
    const ok = embeddingProbeResultText({ ok: true, model: 'a/embed', dimensions: 1024, latencyMs: 42 })
    expect(ok.ok).toBe(true)
    expect(ok.key).toBe('settings.embedding.probeResultOk')
    expect(ok.segments).toEqual([
      { text: 'a/embed' },
      { key: 'settings.embedding.dimensions', params: { value: '1024' } },
      { key: 'settings.embedding.probeLatency', params: { value: '42' } },
    ])
    // A missing dimension or latency is omitted, never rendered as `null`.
    expect(embeddingProbeResultText({ ok: true, model: 'a/embed' }).segments)
      .toEqual([{ text: 'a/embed' }])
    expect(embeddingProbeResultText({ ok: true }).key).toBe('settings.embedding.probeResultBare')
    expect(embeddingProbeResultText({ ok: true, latencyMs: 7 }).segments)
      .toEqual([{ key: 'settings.embedding.probeLatency', params: { value: '7' } }])

    const { embeddingVerdictText } = api.__diagnostics
    const render = (key: string, params?: Record<string, string>) => {
      const template = api.__diagnostics.dictionaries.zh[key] ?? key
      return Object.entries(params ?? {}).reduce((text, [name, value]) => text.replace('{' + name + '}', value), template)
    }
    const line = embeddingVerdictText(
      { ok: true, key: 'settings.embedding.probeResultOk', segments: ok.segments as never },
      render,
    )
    expect(line).toBe('连接成功 · a/embed · 1024 维 · 42 ms')
    expect(embeddingVerdictText({ ok: false }, render)).toBe('')

    const failure = embeddingProbeResultText({ ok: false, error: 'auth-failed' })
    expect(failure).toEqual({ ok: false, code: 'auth-failed', key: 'settings.embedding.error.authFailed' })
    // An unknown code keeps the raw string for the caller's fallback.
    expect(embeddingProbeResultText({ ok: false, error: 'weird-new-code' }))
      .toEqual({ ok: false, code: 'weird-new-code', key: undefined })
    // A missing payload still produces a usable verdict rather than throwing.
    expect(embeddingProbeResultText(null).ok).toBe(false)

    // Every code the lane and provider can emit has copy in both languages.
    const dict = api.__diagnostics.dictionaries
    const laneCodes = [
      'missing-key', 'invalid-key-env', 'auth-failed', 'rate-limited', 'model-not-found', 'bad-request',
      'server-error', 'timeout', 'network', 'invalid-response', 'invalid-json', 'dimensions-unsupported',
      'dimensions-changed', 'model-substituted', 'input-too-long', 'response-too-large', 'probe-failed',
      'models-failed', 'probe-required', 'model-required', 'endpoint-required', 'invalid-endpoint',
      'blocked-endpoint', 'endpoint-query', 'endpoint-userinfo', 'dns-failed', 'not-remote', 'memory-disabled',
      'busy', 'target-changed', 'cancelled', 'not-ready', 'cache-write-failed', 'state-write-failed',
      'already-running', 'paused', 'not-paused', 'already-paused', 'not-running', 'already-complete',
      'coverage-missing',
    ]
    for (const code of laneCodes) {
      const key = EMBEDDING_ERROR_KEYS[code]
      expect(key, `${code} mapped`).toBeTruthy()
      expect(dict.zh[key], `${code} zh`).toBeTruthy()
      expect(dict.en[key], `${code} en`).toBeTruthy()
    }
  })

  it('drops a loaded list when its target changes and classifies fetch failures', () => {
    const { embeddingNetworkFailure, embeddingModelTargetKey } = api.__diagnostics
    const base = { provider: 'openai-compatible', preset: 'custom', endpoint: 'http://127.0.0.1:1/v1', apiKeyEnv: 'K' }
    const key = embeddingModelTargetKey(base)
    expect(key).toBe(embeddingModelTargetKey({ ...base }))
    // Whitespace alone does not change the target.
    expect(embeddingModelTargetKey({ ...base, endpoint: '  http://127.0.0.1:1/v1 ' })).toBe(key)
    // Each of the four inputs is part of the identity.
    expect(embeddingModelTargetKey({ ...base, provider: 'local' })).not.toBe(key)
    expect(embeddingModelTargetKey({ ...base, preset: 'siliconflow' })).not.toBe(key)
    expect(embeddingModelTargetKey({ ...base, endpoint: 'http://127.0.0.1:2/v1' })).not.toBe(key)
    expect(embeddingModelTargetKey({ ...base, apiKeyEnv: 'OTHER' })).not.toBe(key)
    // A missing input is the empty string, never `undefined`.
    expect(embeddingModelTargetKey({})).toBe('\u0000\u0000\u0000')
    expect(embeddingModelTargetKey(null)).toBe('\u0000\u0000\u0000')

    // A browser network error reads as 网络不可达; a body that is not JSON reads
    // as 响应格式无效; neither echoes the browser message.
    expect(embeddingNetworkFailure(new TypeError('Failed to fetch'))).toBe('network')
    expect(embeddingNetworkFailure(new Error('Unexpected token < in JSON at position 0'))).toBe('invalid-response')
    expect(embeddingNetworkFailure(new SyntaxError('Unexpected end of JSON input'))).toBe('invalid-response')
    expect(embeddingNetworkFailure('plain string')).toBe('network')
    const dict = api.__diagnostics.dictionaries
    expect(dict.zh[EMBEDDING_ERROR_KEYS.network]).toBe('网络不可达')
    expect(dict.zh[EMBEDDING_ERROR_KEYS['invalid-response']]).toBe('响应格式无效')
  })

  it('registers only the top-level Settings seat and no legacy Plugins seats', () => {
    const { settingsSeats, PKG_NAME } = api.__diagnostics
    expect(settingsSeats).toEqual(['settings.section'])
    expect(PKG_NAME).toBe(PACKAGE_JSON.name)
    expect(CLIENT_SOURCE).not.toMatch(/plugins\.item/)
    expect(CLIENT_SOURCE).not.toMatch(/plugins\.row\.config/)
    expect(CLIENT_SOURCE).not.toMatch(/ROW_CONFIG_KEY/)
  })
})

describe('settings copy — every field key is dictionary-backed', () => {
  const { settingsCopyKeys, fieldSpecs } = api.__diagnostics

  it('derives a label and hint key for every field spec', () => {
    expect(fieldSpecs).toHaveLength(35)
    for (const spec of fieldSpecs) {
      expect(settingsCopyKeys()).toContain(spec.labelKey)
      expect(settingsCopyKeys()).toContain(spec.hintKey)
    }
  })

  it('has no duplicate keys and carries the form/picker copy', () => {
    const keys = settingsCopyKeys()
    expect(new Set(keys).size).toBe(keys.length)
    expect(keys).toContain('settings.summary.notReady')
    expect(keys).toContain('settings.form.invalidNumber')
    expect(keys).toContain('settings.effort.customCurrent')
    expect(keys).toContain('settings.route.notInCatalog')
    expect(keys).toContain('settings.embedding.start')
    expect(keys).toContain('settings.embedding.state.ready')
    expect(keys).toContain('settings.embedding.provider.remote')
  })

  it('exposes provider/preset/auth selects with dictionary-backed options', () => {
    const selects = fieldSpecs.filter((spec) => spec.kind === 'select')
    expect(selects.map((spec) => spec.path.join('.')).sort()).toEqual([
      'embedding.authHeader',
      'embedding.preset',
      'embedding.provider',
    ])
    for (const spec of selects) {
      const options = (spec as unknown as { options?: Array<{ labelKey: string }> }).options ?? []
      expect(options.length).toBeGreaterThan(0)
      for (const option of options) expect(settingsCopyKeys()).toContain(option.labelKey)
    }
  })

  it('every key resolves in both dictionaries', () => {
    const { dictionaryKeys } = api.__diagnostics
    const catalog = dictionaryKeys()
    for (const key of settingsCopyKeys()) {
      expect(catalog.zh).toContain(key)
      expect(catalog.en).toContain(key)
    }
  })

  it('scopes registerCompactionEngine to flat/headless hosts', () => {
    const { dictionaries } = api.__diagnostics
    const key = 'settings.field.registerCompactionEngine.hint'
    const zh = dictionaries.zh[key]
    const en = dictionaries.en[key]
    expect(zh).toContain('flat/headless')
    expect(zh).toContain('agent preset')
    expect(zh).toContain('桌面端')
    expect(zh).toContain('compaction-basic')
    expect(zh).toMatch(/根/)
    expect(zh).toContain('Web')
    expect(en).toContain('flat/headless')
    expect(en).toContain('agent preset')
    expect(en).toMatch(/desktop/i)
    expect(en).toContain('compaction-basic')
    expect(en).toContain('root')
    expect(en).toContain('Web')
    expect(zh).not.toContain('先禁用宿主压缩行')
    expect(en).not.toContain('disable the host compaction row first')
  })

  it('field specs carry dictionary keys instead of hardcoded copy', () => {
    for (const spec of fieldSpecs) {
      expect(spec).not.toHaveProperty('label')
      expect(spec).not.toHaveProperty('hint')
    }
    expect(CLIENT_SOURCE).not.toMatch(/spec\.(label|hint)\b/)
  })

  it('the card render path reads its copy through t(...)', () => {
    const start = CLIENT_SOURCE.indexOf('function makeCard')
    const end = CLIENT_SOURCE.indexOf('The telemetry badge')
    expect(start).toBeGreaterThan(-1)
    expect(end).toBeGreaterThan(start)
    const card = CLIENT_SOURCE.slice(start, end)
    // A literal reintroduction must fail even when the matching dictionary key
    // still exists, which is exactly the unused-key + hardcoded-English hole.
    for (const literal of ["'Save'", "'Reset'", "'Invalid'", "'Not a number'", "'Default'", "'Custom…'", "'Auto —"]) {
      expect(card).not.toContain(literal)
    }
    expect(card).toContain('formLabels(t)')
    expect(card).toContain('settingsValueLabels(t)')
    for (const key of ['settings.effort.default', 'settings.route.autoSession']) {
      expect(card).toContain(`t('${key}'`)
    }
    const formStart = CLIENT_SOURCE.indexOf('function formLabels')
    const valueStart = CLIENT_SOURCE.indexOf('function settingsValueLabels')
    const formCopy = CLIENT_SOURCE.slice(formStart, valueStart)
    const valueCopy = CLIENT_SOURCE.slice(valueStart, CLIENT_SOURCE.indexOf('function readPath'))
    for (const key of ['settings.form.save', 'settings.form.saving']) expect(formCopy).toContain(`t('${key}')`)
    for (const key of ['settings.form.reset', 'settings.form.invalid']) expect(valueCopy).toContain(`t('${key}')`)
  })
})

describe('reasoningEffortsOf — the catalog-backed effort options', () => {
  const { reasoningEffortsOf } = api.__diagnostics
  const groups = (efforts: unknown, defaultEffort?: string) => [{
    id: 'deepseek-official',
    models: [{
      id: 'deepseek-flash',
      name: 'DeepSeek Flash',
      reasoning: efforts === undefined ? undefined : { efforts, ...(defaultEffort === undefined ? {} : { defaultEffort }) },
    }],
  }]

  it('keeps host order and advertisement exactly (no medium for flash)', () => {
    const result = reasoningEffortsOf(groups([
      { id: 'off', name: 'Off' },
      { id: 'low', name: 'Low' },
      { id: 'high', name: 'High' },
      { id: 'max', name: 'Max' },
    ], 'low'), 'deepseek-official', 'deepseek-flash')
    expect(result.kind).toBe('ready')
    expect(result.efforts.map((effort) => effort.id)).toEqual(['off', 'low', 'high', 'max'])
    expect(result.efforts.some((effort) => effort.id === 'medium')).toBe(false)
    expect(result.defaultEffort).toBe('low')
  })

  it('includes medium when the model advertises it', () => {
    const result = reasoningEffortsOf(groups([{ id: 'low' }, { id: 'medium' }, { id: 'high' }]),
      'deepseek-official', 'deepseek-flash')
    expect(result.efforts.map((effort) => effort.id)).toEqual(['low', 'medium', 'high'])
  })

  it('drops malformed and duplicate efforts, and the custom sentinel', () => {
    const result = reasoningEffortsOf(groups([
      null,
      { id: '' },
      { id: 42 },
      { id: 'low' },
      { id: 'low', name: 'duplicate' },
      { id: '__custom__' },
      { id: 'high', name: 'High', description: 'more thinking' },
    ]), 'deepseek-official', 'deepseek-flash')
    expect(result.kind).toBe('ready')
    expect(result.efforts).toEqual([{ id: 'low' }, { id: 'high', name: 'High', description: 'more thinking' }])
  })

  it('reports auto, missing and none distinctly', () => {
    expect(reasoningEffortsOf(groups([{ id: 'low' }]), '', 'deepseek-flash')).toEqual({ kind: 'auto', efforts: [] })
    expect(reasoningEffortsOf(groups([{ id: 'low' }]), 'deepseek-official', '')).toEqual({ kind: 'auto', efforts: [] })
    expect(reasoningEffortsOf(groups([{ id: 'low' }]), 'nope', 'deepseek-flash')).toEqual({ kind: 'missing', efforts: [] })
    expect(reasoningEffortsOf(groups([]), 'deepseek-official', 'deepseek-flash')).toEqual({ kind: 'none', efforts: [] })
    expect(reasoningEffortsOf(groups(undefined), 'deepseek-official', 'deepseek-flash')).toEqual({ kind: 'none', efforts: [] })
  })
})

describe('effortSelectionOf / effortPlanOps — stored values and writes', () => {
  const { effortSelectionOf, effortPlanOps, EFFORT_CUSTOM_SENTINEL } = api.__diagnostics
  const options = [{ id: 'off' }, { id: 'low' }, { id: 'high' }, { id: 'max' }]
  const PATH = ['historian', 'reasoningEffort']

  it('classifies default, advertised and unknown values without mutating them', () => {
    expect(effortSelectionOf(options, '')).toEqual({ mode: 'default', value: '' })
    expect(effortSelectionOf(options, 'low')).toEqual({ mode: 'value', value: 'low' })
    expect(effortSelectionOf(options, 'turbo')).toEqual({ mode: 'custom', value: 'turbo' })
    expect(EFFORT_CUSTOM_SENTINEL).toBe('__custom__')
  })

  it('Default and blank text unset; a listed or custom id sets exactly that string', () => {
    expect(effortPlanOps(PATH, { clear: true })).toEqual({
      ops: [{ op: 'unset', path: PATH }], blocked: false,
    })
    expect(effortPlanOps(PATH, { clear: false, text: '' })).toEqual({
      ops: [{ op: 'unset', path: PATH }], blocked: false,
    })
    expect(effortPlanOps(PATH, { clear: false, text: ' low ' })).toEqual({
      ops: [{ op: 'set', path: PATH, value: 'low' }], blocked: false,
    })
    expect(effortPlanOps(PATH, { clear: false, text: 'turbo' })).toEqual({
      ops: [{ op: 'set', path: PATH, value: 'turbo' }], blocked: false,
    })
    expect(effortPlanOps(PATH, undefined)).toEqual({ ops: [], blocked: false })
  })

  it('returns fresh paths so a save cannot mutate the field definition', () => {
    const first = effortPlanOps(PATH, { clear: false, text: 'low' }).ops[0]!.path
    expect(first).not.toBe(PATH)
    first.push('extra')
    expect(PATH).toEqual(['historian', 'reasoningEffort'])
  })
})

describe('effortDraftOf — the render-state seam', () => {
  const { effortDraftOf } = api.__diagnostics
  const options = [{ id: 'off' }, { id: 'low', name: 'Low' }, { id: 'high' }, { id: 'max' }]

  it('a staged Default wins over a non-empty base value', () => {
    expect(effortDraftOf({ baseValue: 'low', stored: 'low', draft: { clear: true }, customOpen: false, options }))
      .toMatchObject({ mode: 'default', value: '', customOpen: false, cleared: true })
  })

  it('an advertised stored value renders as the selected option', () => {
    expect(effortDraftOf({ baseValue: '', stored: 'low', customOpen: false, options }))
      .toMatchObject({ mode: 'value', value: 'low', displayValue: 'Low', customOpen: false, cleared: false })
  })

  it('an unknown stored id renders as Custom and is preserved', () => {
    expect(effortDraftOf({ baseValue: '', stored: 'turbo', customOpen: false, options }))
      .toMatchObject({ mode: 'custom', value: 'turbo', displayValue: 'turbo', customOpen: true, cleared: false })
  })

  it('Custom with empty text stays custom instead of snapping to Default', () => {
    expect(effortDraftOf({ baseValue: 'low', stored: 'low', customOpen: true, options }))
      .toMatchObject({ mode: 'custom', value: 'low', customOpen: true, cleared: false })
    expect(effortDraftOf({ baseValue: '', stored: '', customOpen: true, options }))
      .toMatchObject({ mode: 'custom', value: '', displayValue: '', customOpen: true, cleared: false })
  })

  it('draft text wins over stored and falls back to the base layer', () => {
    expect(effortDraftOf({ baseValue: 'low', stored: 'low', draft: { text: 'turbo' }, customOpen: false, options }))
      .toMatchObject({ mode: 'custom', value: 'turbo' })
    expect(effortDraftOf({ baseValue: 'low', stored: 'low', draft: { text: 'high' }, customOpen: false, options }))
      .toMatchObject({ mode: 'value', value: 'high' })
    expect(effortDraftOf({ baseValue: 'low', stored: '', customOpen: false, options }))
      .toMatchObject({ mode: 'value', value: 'low' })
    expect(effortDraftOf({ baseValue: '', stored: '', customOpen: false, options }))
      .toMatchObject({ mode: 'default', value: '', customOpen: false })
  })
})

describe('telemetry v2 copy — every new label is dictionary-backed', () => {
  const KEYS = [
    'bar.system', 'bar.tools', 'bar.messages', 'bar.aria', 'bar.unavailable',
    'composition.head', 'composition.unavailable', 'composition.conversation', 'composition.toolCalls',
    'composition.compartments', 'composition.memories', 'composition.profile',
    'composition.other', 'composition.lastInjection',
    'section.historian', 'section.memory', 'section.queue', 'section.maintenance',
    'section.hygiene', 'section.warnings',
    'historian.running', 'historian.idle', 'historian.line',
    'memory.line', 'queue.line', 'queue.empty',
    'maintenance.line', 'maintenance.never', 'hygiene.line',
    'warnings.residual', 'warnings.recent', 'warnings.none', 'footer.ctxStatus', 'panel.close',
  ]

  it('resolves every key in zh and en with no English fallback', () => {
    const { dictionaries, dictionaryKeys } = api.__diagnostics
    const catalog = dictionaryKeys()
    for (const key of KEYS) {
      expect(catalog.zh).toContain(key)
      expect(catalog.en).toContain(key)
      expect(dictionaries.zh[key]).not.toBe('')
      expect(dictionaries.en[key]).not.toBe('')
    }
    expect(dictionaries.zh['record.historianFailed']).toBe('历史摘要失败')
    expect(dictionaries.en['record.historianFailed']).toBe('Historian failed')
  })
})
