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

let definition: { factory?: (require: (name: string) => unknown) => Record<string, unknown> } | null = null
const window = { __ModuleLoader__: { load: (def: unknown) => { definition = def as typeof definition } } }
// eslint-disable-next-line @typescript-eslint/no-implied-eval
new Function('window', readFileSync(CLIENT, 'utf8'))(window)
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
    createModelCatalog: () => {
      attach: (context: unknown) => void
      getSnapshot: () => {
        status: string
        groups: Array<{ id: string; models: Array<{ id: string; name: string }> }>
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
