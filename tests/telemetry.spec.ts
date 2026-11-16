/**
 * The telemetry surface the browser half consumes.
 *
 * The route is the only supported way for a third-party bundle to push live
 * state into the UI (the Remote event whitelist is compile-time), so its
 * payload shape and its privacy properties are contract: counts and one-line
 * summaries only, and a locked/missing store must degrade instead of throwing.
 */
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { Session, SessionId } from '@deepseek-ai/dsh-session'
import { BASELINE_CLOSE, BASELINE_OPEN, estimateTokens, renderCompartment, type Compartment } from '../src/core/compartments.ts'
import { messageCompositionOf, openStores } from '../src/index.ts'
import { createTelemetryService, normalizeMessageComposition } from '../src/dsh/telemetry.ts'

const cleanups: Array<() => void> = []
afterEach(() => {
  for (const cleanup of cleanups.splice(0).reverse()) cleanup()
})

function fixture(): { stores: ReturnType<typeof openStores>; dir: string } {
  const dir = mkdtempSync(join(tmpdir(), 'mc-telemetry-'))
  cleanups.push(() => rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 40 }))
  const stores = openStores(dir)
  cleanups.push(() => stores.close())
  const now = Date.now()
  stores.appendJournal({ at: now - 2_000, level: 'info', kind: 'boot', summary: 'adapter booted' })
  stores.appendJournal({
    at: now - 1_000, level: 'info', kind: 'pass', summary: 'execute at 71%',
    data: { decision: 'execute', tokensBefore: 91_000, tokensAfter: 74_500 },
  })
  stores.appendJournal({
    at: now - 500, level: 'info', kind: 'memory-recall', summary: 'recalled 40 memories',
    data: { rows: 40 },
  })
  stores.appendJournal({ at: now - 100, level: 'error', kind: 'error', summary: 'historian failed' })
  return { stores, dir }
}

/** A minimal ServerResponse stand-in that records what was written. */
function fakeResponse(): {
  status?: number
  headers?: Record<string, string>
  body: string
  writeHead(status: number, headers?: Record<string, string>): void
  write(chunk: string): void
  end(chunk?: string): void
  on(): void
} {
  const res = {
    status: undefined as number | undefined,
    headers: undefined as Record<string, string> | undefined,
    body: '',
    writeHead(status: number, headers?: Record<string, string>) {
      res.status = status
      res.headers = headers
    },
    write(chunk: string) {
      res.body += chunk
    },
    end(chunk?: string) {
      if (chunk !== undefined) res.body += chunk
    },
    on() {
      /* no close event in the fake */
    },
  }
  return res
}

describe('telemetry service', () => {
  it('summarises adapter state, health and the recent tail', () => {
    const { stores } = fixture()
    const service = createTelemetryService({
      stores,
      meta: () => ({ engine: 'disabled-by-config', memory: 'ok schema v94', toolsMode: 'dynamic-import' }),
      startedAt: Date.now() - 60_000,
    })
    cleanups.push(() => service.close())

    const summary = service.summary() as {
      adapter: Record<string, unknown>
      health: Record<string, number>
      recent: Array<{ kind: string }>
    }
    expect(summary.adapter.engine).toBe('disabled-by-config')
    expect(summary.adapter.toolsMode).toBe('dynamic-import')
    expect(summary.health.journalRows).toBe(4)
    expect(summary.health.passes24h).toBe(1)
    expect(summary.health.errors24h).toBe(1)
    expect(summary.health.memoriesRecalled).toBe(40)
    expect(summary.recent.map(entry => entry.kind)).toEqual(['boot', 'pass', 'memory-recall', 'error'])
    // Privacy: no message content, no file paths in the payload.
    expect(JSON.stringify(summary)).not.toContain('C:\\')
  })

  it('serves JSON on /summary and 404s unknown routes', () => {
    const { stores } = fixture()
    const service = createTelemetryService({ stores, meta: () => ({}) })
    cleanups.push(() => service.close())

    const ok = fakeResponse()
    service.handle({ url: '/mc-telemetry/summary', method: 'GET' }, ok)
    expect(ok.status).toBe(200)
    expect(ok.headers?.['content-type']).toContain('application/json')
    expect(JSON.parse(ok.body)).toHaveProperty('health')

    const missing = fakeResponse()
    service.handle({ url: '/mc-telemetry/nope', method: 'GET' }, missing)
    expect(missing.status).toBe(404)
  })

  it('hands memoryStats the SAME project identity the header reports', () => {
    const { stores } = fixture()
    // A recall row is the header's own source for `project.identity`.
    stores.appendJournal({
      at: Date.now(), level: 'info', kind: 'memory-recall', summary: 'recalled 12 memories',
      data: { rows: 12, identity: 'git:aaaa1111bbbb2222cccc3333dddd4444eeee5555' },
      sessionId: 'session-x',
    })
    const seen: Array<{ sessionId?: string; identity?: string }> = []
    const service = createTelemetryService({
      stores,
      meta: () => ({}),
      memoryStats: (sessionId?: string, identity?: string) => {
        seen.push({ ...sessionId === undefined ? {} : { sessionId }, ...identity === undefined ? {} : { identity } })
        return { total: 12, verified: 3, unverified: 9 }
      },
    })
    cleanups.push(() => service.close())

    const summary = service.summary() as { project: { identity?: string }, health: { memoryStats?: Record<string, number> } }
    expect(summary.project.identity).toBe('git:aaaa1111bbbb2222cccc3333dddd4444eeee5555')
    // The KPI was asked about exactly that project (the 2026-10-08 mismatch:
    // the header showed git:93eea8… while the totals belonged to another one).
    expect(seen).toEqual([{ identity: 'git:aaaa1111bbbb2222cccc3333dddd4444eeee5555' }])
    expect(summary.health.memoryStats).toEqual({ total: 12, verified: 3, unverified: 9 })

    // A scoped request carries its session through, plus that scope's identity.
    seen.length = 0
    service.summary('session-x')
    expect(seen[0]?.sessionId).toBe('session-x')
    expect(seen[0]?.identity).toBe('git:aaaa1111bbbb2222cccc3333dddd4444eeee5555')
  })

  it('streams a snapshot then new journal entries as SSE frames', async () => {
    const { stores } = fixture()
    const service = createTelemetryService({ stores, meta: () => ({}), pollMs: 20 })
    cleanups.push(() => service.close())

    const res = fakeResponse()
    service.handle({ url: '/mc-telemetry/events', method: 'GET' }, res)
    expect(res.headers?.['content-type']).toContain('text/event-stream')
    expect(res.body).toContain('event: snapshot')
    expect(service.openStreams).toBe(1)

    // A new event reaches the stream, and only once.
    stores.appendJournal({ at: Date.now(), level: 'info', kind: 'memory-promote', summary: 'promoted 2 facts' })
    await new Promise(resolve => setTimeout(resolve, 80))
    expect(res.body).toContain('event: journal')
    expect(res.body).toContain('memory-promote')
    expect(res.body.match(/memory-promote/g)?.length).toBe(1)
  })

  it('adds the v2 composition and section fields for a session', () => {
    const { stores } = fixture()
    stores.appendJournal({
      at: Date.now(), level: 'info', kind: 'memory-recall', summary: 'recalled 8 memories',
      data: { rows: 8, estTokens: 3_000, identity: 'git:aaaa' }, sessionId: 'session-v2',
    })
    stores.appendJournal({
      at: Date.now(), level: 'info', kind: 'profile-recall', summary: 'recalled profile',
      data: { estTokens: 1_000 }, sessionId: 'session-v2',
    })
    stores.allocateTag('session-v2', { kind: 'tool-result', callId: 'call-not-pending' }, Date.now())
    stores.queueDrop('session-v2', 7, Date.now())
    const service = createTelemetryService({
      stores,
      meta: () => ({}),
      adapterVersion: () => '9.9.9',
      policy: () => ({ executeThreshold: 70, forceThreshold: 85 }),
      projection: () => ({ contextBreakdown: { systemTokens: 12_000, toolsTokens: 8_000, messageTokens: 33_000 } }),
      messageComposition: () => ({
        conversation: 14_000, toolCalls: 9_000, compartments: 6_000, memories: 3_000, profile: 1_000,
      }),
      historian: () => ({ running: true, compartments: 3, coveredTokens: 42_000, lastPublishedAt: 1_763_299_080_000 }),
      surface: () => ({ tagged: 48, dropped: 12, reclaimableTokens: 6_800 }),
      memoryStats: () => ({ total: 12, verified: 3, unverified: 9 }),
    })
    cleanups.push(() => service.close())

    const summary = service.summary('session-v2') as { health: Record<string, unknown> }
    expect(summary.health.adapterVersion).toBe('9.9.9')
    expect(summary.health.policy).toEqual({ executeThreshold: 70, forceThreshold: 85 })
    expect(summary.health.contextBreakdown).toEqual({ systemTokens: 12_000, toolsTokens: 8_000, messageTokens: 33_000 })
    expect(summary.health.messageComposition).toEqual({
      conversation: 14_000, toolCalls: 9_000, compartments: 6_000,
      memories: 3_000, profile: 1_000, other: 0, residualTokens: 0,
    })
    expect(summary.health.historian).toEqual({
      running: true, compartments: 3, coveredTokens: 42_000, lastPublishedAt: 1_763_299_080_000,
    })
    expect(summary.health.queue).toEqual({ pendingDrops: 1, tags: [7] })
    expect(summary.health.memory).toEqual({ total: 12, injected: 8, estTokens: 3_000, profileEstTokens: 1_000 })
    expect(summary.health.surface).toEqual({ tagged: 48, dropped: 12, reclaimableTokens: 6_800 })
  })

  it('keeps missing projection, finished sessions and global scope honest', () => {
    const { stores } = fixture()
    const service = createTelemetryService({
      stores,
      meta: () => ({}),
      projection: () => undefined,
      historian: () => undefined,
      surface: () => undefined,
    })
    cleanups.push(() => service.close())

    const scoped = service.summary('session-finished') as { health: Record<string, unknown> }
    expect(scoped.health.contextBreakdown).toBeNull()
    expect(scoped.health.messageComposition).toBeNull()
    expect(scoped.health.historian).toBeNull()
    expect(scoped.health.queue).toEqual({ pendingDrops: 0, tags: [] })
    expect(scoped.health.memory).toBeNull()
    expect(scoped.health.surface).toBeNull()

    const global = service.summary() as { health: Record<string, unknown> }
    for (const key of ['contextBreakdown', 'messageComposition', 'historian', 'queue', 'memory', 'surface']) {
      expect(global.health).not.toHaveProperty(key)
    }
  })

  it('returns null for zero message tokens and scales an over-limit composition', () => {
    const { stores } = fixture()
    const service = createTelemetryService({
      stores,
      meta: () => ({}),
      projection: () => ({ contextBreakdown: { systemTokens: 1, toolsTokens: 2, messageTokens: 10 } }),
      messageComposition: () => ({ conversation: 8, toolCalls: 8, compartments: 0, memories: 0, profile: 0 }),
    })
    cleanups.push(() => service.close())

    const over = service.summary('session-over') as { health: { messageComposition: Record<string, number> } }
    expect(over.health.messageComposition.conversation).toBe(5)
    expect(over.health.messageComposition.toolCalls).toBe(5)
    expect(over.health.messageComposition.residualTokens).toBe(6)
    expect(over.health.messageComposition.other).toBe(0)
    const total = ['conversation', 'toolCalls', 'compartments', 'memories', 'profile', 'other']
      .reduce((sum, key) => sum + over.health.messageComposition[key], 0)
    expect(total).toBeLessThanOrEqual(10)

    const rounded = createTelemetryService({
      stores,
      meta: () => ({}),
      projection: () => ({ contextBreakdown: { systemTokens: 0, toolsTokens: 0, messageTokens: 2 } }),
      messageComposition: () => ({ conversation: 1, toolCalls: 1, compartments: 1 }),
    })
    cleanups.push(() => rounded.close())
    const roundedHealth = (rounded.summary('session-rounded') as { health: { messageComposition: Record<string, number> } })
      .health.messageComposition
    const roundedTotal = ['conversation', 'toolCalls', 'compartments', 'memories', 'profile', 'other']
      .reduce((sum, key) => sum + roundedHealth[key], 0)
    expect(roundedTotal).toBeLessThanOrEqual(2)

    const tight = createTelemetryService({
      stores,
      meta: () => ({}),
      projection: () => ({ contextBreakdown: { systemTokens: 0, toolsTokens: 0, messageTokens: 1 } }),
      messageComposition: () => ({ conversation: 1, toolCalls: 1 }),
    })
    cleanups.push(() => tight.close())
    const tightHealth = (tight.summary('session-tight') as { health: { messageComposition: Record<string, number> } })
      .health.messageComposition
    const tightTotal = ['conversation', 'toolCalls', 'compartments', 'memories', 'profile', 'other']
      .reduce((sum, key) => sum + tightHealth[key], 0)
    expect(tightTotal).toBeLessThanOrEqual(1)
    expect(Object.values(tightHealth).some(value => value > 0)).toBe(true)

    const residualOnly = createTelemetryService({
      stores,
      meta: () => ({}),
      projection: () => ({ contextBreakdown: { systemTokens: 0, toolsTokens: 0, messageTokens: 10 } }),
      messageComposition: () => ({}),
    })
    cleanups.push(() => residualOnly.close())
    const residual = residualOnly.summary('session-residual') as { health: { messageComposition: Record<string, number> } }
    expect(residual.health.messageComposition).toEqual({
      conversation: null, toolCalls: null, compartments: null, memories: null,
      profile: null, other: 10, residualTokens: 0,
    })

    const zero = createTelemetryService({
      stores,
      meta: () => ({}),
      projection: () => ({ contextBreakdown: { systemTokens: 0, toolsTokens: 0, messageTokens: 0 } }),
      messageComposition: () => ({ conversation: 1 }),
    })
    cleanups.push(() => zero.close())
    expect((zero.summary('session-zero') as { health: { messageComposition: unknown } }).health.messageComposition).toBeNull()

    const noSource = createTelemetryService({
      stores,
      meta: () => ({}),
      projection: () => ({ contextBreakdown: { systemTokens: 1, toolsTokens: 2, messageTokens: 10 } }),
      messageComposition: () => undefined,
    })
    cleanups.push(() => noSource.close())
    expect((noSource.summary('session-no-source') as { health: { messageComposition: unknown } }).health.messageComposition).toBeNull()

    const policyThrows = createTelemetryService({
      stores,
      meta: () => ({}),
      policy: () => { throw new Error('policy unavailable') },
      projection: () => undefined,
    })
    cleanups.push(() => policyThrows.close())
    const failOpen = policyThrows.summary('session-policy') as { health: Record<string, unknown> }
    expect(failOpen.health.policy).toBeUndefined()
    expect(failOpen.health.messageComposition).toBeNull()
  })

  it('does not trust an explicit other value from the caller', () => {
    expect(normalizeMessageComposition({ other: 100 }, 10)).toEqual({
      conversation: null, toolCalls: null, compartments: null, memories: null,
      profile: null, other: 10, residualTokens: 0,
    })
    expect(normalizeMessageComposition({ other: 0 }, 10)).toEqual({
      conversation: null, toolCalls: null, compartments: null, memories: null,
      profile: null, other: 10, residualTokens: 0,
    })
    expect(normalizeMessageComposition({ conversation: 1, other: 100 }, 10)).toEqual({
      conversation: 1, toolCalls: null, compartments: null, memories: null,
      profile: null, other: 9, residualTokens: 0,
    })
    expect(normalizeMessageComposition({ conversation: 1, residualTokens: 500 }, 10))
      .toMatchObject({ residualTokens: 0 })
  })

  it('classifies the live surface without double-counting the baseline', () => {
    const now = Date.now()
    const session = Session.create(SessionId('mc-telemetry-composition'))
    const baseline = `${BASELINE_OPEN}\n<compartment-delta>\n${'x'.repeat(400)}\n</compartment-delta>\n${BASELINE_CLOSE}\n\nhello user words`
    const userSeq = session.append('user/message', {
      id: 'u1',
      role: 'user',
      content: [{ type: 'text', text: baseline }],
      source: { kind: 'user' },
    } as never, { surfaceOp: 'append' }).seq
    session.append('tool/result', {
      message: {
        id: 'r1',
        role: 'tool',
        toolCallId: 'call-1',
        content: [{ type: 'text', text: 'tool output' }],
      },
    } as never, { surfaceOp: 'append' })

    const live = {
      sessionId: 'mc-telemetry-composition',
      compartmentId: 1,
      createdAt: now,
      coveredStartSeq: userSeq,
      coveredEndSeq: userSeq,
      coveredSeqs: [userSeq],
      coveredTokens: 100,
      baselineEpoch: 1,
      tiers: { p1: 'compartment p1', p2: 'p2', p3: 'p3', p4: 'p4' },
      importance: 50,
      facts: [],
      events: [],
      landedEventSeq: userSeq,
    } satisfies Compartment
    const stale = { ...live, compartmentId: 2, landedEventSeq: 9999 }
    const retired = { ...live, compartmentId: 3, landedReason: 'superseded-entrants' }

    const result = messageCompositionOf(session, [live, stale, retired], now, 12, 34)
    expect(result.conversation).toBe(estimateTokens('hello user words'))
    expect(result.conversation).toBeLessThan(estimateTokens(baseline))
    expect(result.toolCalls).toBe(estimateTokens('tool output'))
    expect(result.compartments).toBe(estimateTokens(renderCompartment(live, now)))
    expect(result.memories).toBe(12)
    expect(result.profile).toBe(34)
    expect(result.other).toBeNull()
    expect(result.residualTokens).toBe(0)
  })
})
