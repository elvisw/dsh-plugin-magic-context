/**
 * #15 — `/ctx-flush` is a marker + next-preStep landing lane.
 *
 * The command itself never edits the surface: it marks only current-session
 * pending drops. The landing helper is the same one the management pass uses,
 * so these tests assert both the marker/receipt semantics and the exact
 * placeholder mutation, including the unmarked row that must stay pending.
 */
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { Session, SessionId, type SessionSeq } from '@deepseek-ai/dsh-session'
import { ToolCallId, createToolResultMessage } from '@deepseek-ai/dsh-llm'
import { openStores } from '../src/index.ts'
import type { AdapterStores } from '../src/core/stores.ts'
import { tagPrefix } from '../src/core/tagger.ts'
import { estimateTokens } from '../src/core/compartments.ts'
import { tagToolResultContent } from '../src/dsh/seams.ts'
import { landPendingDrops } from '../src/dsh/drop-landing.ts'
import { planFlushCommand } from '../src/dsh/flush-command.ts'
import { preStepListener, type PreStepDeps } from '../src/dsh/pre-step.ts'
import { ReduceNudgeTracker } from '../src/dsh/reduce-guidance.ts'
import { SearchHintTracker } from '../src/dsh/search-hint.ts'

const NOW = 1_700_000_000_000

interface TestContext {
  readonly dataDir: string
  readonly stores: AdapterStores
  readonly session: Session
}

function context(sessionId = 's1'): TestContext {
  const dataDir = mkdtempSync(join(tmpdir(), 'mc-flush-'))
  return { dataDir, stores: openStores(dataDir), session: Session.create(SessionId(sessionId)) }
}

function dispose(context: TestContext): void {
  try {
    context.stores.close()
  } finally {
    rmSync(context.dataDir, { recursive: true, force: true })
  }
}

function seedResult(context: TestContext, callId: string, body: string): number {
  const tag = context.stores.allocateTag(context.session.id, { kind: 'tool-result', callId }, NOW)
  context.session.append('tool/result', {
    turn: 1,
    step: 1,
    message: createToolResultMessage({
      callId: ToolCallId(callId),
      content: tagToolResultContent([{ type: 'text', text: body }], tagPrefix, tag),
      isError: false,
    }),
  }, { surfaceOp: 'append' })
  return tag
}

function textAt(context: TestContext, seq: SessionSeq): string {
  const event = context.session.snapshotEvents().find(candidate => candidate.seq === seq)
  const message = event?.type === 'tool/result' ? event.data.message : undefined
  return message?.content.map(block => block.type === 'text' ? block.text : '').join('') ?? ''
}

function resultTexts(context: TestContext): string[] {
  return context.session.snapshotEvents()
    .filter(event => event.type === 'tool/result')
    .map(event => event.data.message.content
      .map(block => block.type === 'text' ? block.text : '')
      .join(''))
}

describe('/ctx-flush command', () => {
  it('marks only the current session and reports requested/already/pendingNext', () => {
    const ctx = context()
    try {
      ctx.stores.queueDrop('s1', 1, NOW)
      ctx.stores.queueDrop('s1', 2, NOW)
      ctx.stores.queueDrop('s2', 9, NOW)

      const first = planFlushCommand(ctx.stores, 's1')
      expect(first).toMatchObject({ kind: 'success', requested: 2, alreadyRequested: 0, pendingNext: 2 })
      expect(first.text).toContain('requested 2')
      expect(first.text).toContain('processed 0')
      expect(first.text).toContain('Changes take effect on the next message')
      expect(ctx.stores.listFlushRequestedDrops('s1')).toEqual([1, 2])
      expect(ctx.stores.listFlushRequestedDrops('s2')).toEqual([])
      // The command must not land anything: both rows are still pending.
      expect(ctx.stores.listPendingDrops('s1')).toEqual([1, 2])

      const again = planFlushCommand(ctx.stores, 's1')
      expect(again).toMatchObject({ kind: 'success', requested: 0, alreadyRequested: 2, pendingNext: 2 })
      expect(again.text).toContain('already marked 2')
    } finally {
      dispose(ctx)
    }
  })

  it('is a success no-op on an empty queue and an error without a session', () => {
    const ctx = context()
    try {
      const empty = planFlushCommand(ctx.stores, 's1')
      expect(empty).toMatchObject({ kind: 'success', requested: 0, pendingNext: 0 })
      expect(empty.text).toContain('nothing to flush')
      expect(planFlushCommand(ctx.stores, undefined)).toMatchObject({ kind: 'error', requested: 0 })
      expect(planFlushCommand(ctx.stores, '')).toMatchObject({ kind: 'error', requested: 0 })
    } finally {
      dispose(ctx)
    }
  })

  it('treats a row landed between the read and the UPDATE as a success no-op', () => {
    const ctx = context()
    try {
      let first = true
      const racing = new Proxy(ctx.stores, {
        get(target, property, receiver) {
          if (property === 'listPendingDrops') return () => [1]
          if (property === 'listFlushRequestedDrops') return () => []
          if (property === 'requestFlush') {
            return () => {
              if (first) {
                first = false
                return 0
              }
              return 0
            }
          }
          return Reflect.get(target, property, receiver)
        },
      }) as AdapterStores
      const result = planFlushCommand(racing, 's1')
      expect(result).toMatchObject({ kind: 'success', requested: 0, alreadyRequested: 0 })
      expect(result.text).toContain('nothing to flush')
    } finally {
      dispose(ctx)
    }
  })

  it('keeps the requested count when the follow-up queue read fails', () => {
    const ctx = context()
    try {
      let reads = 0
      const broken = new Proxy(ctx.stores, {
        get(target, property, receiver) {
          if (property === 'listPendingDrops') return () => [1]
          if (property === 'listFlushRequestedDrops') {
            return () => {
              reads += 1
              if (reads === 1) return []
              throw new Error('read failed')
            }
          }
          if (property === 'requestFlush') return () => 1
          return Reflect.get(target, property, receiver)
        },
      }) as AdapterStores
      const result = planFlushCommand(broken, 's1')
      expect(result).toMatchObject({ kind: 'error', requested: 1, alreadyRequested: 0 })
      expect(result.pendingNext).toBeUndefined()
      expect(result.text).toContain('marker written for 1')
    } finally {
      dispose(ctx)
    }
  })

  it('fails closed when the store was closed', () => {
    const ctx = context()
    try {
      ctx.stores.queueDrop('s1', 1, NOW)
      ctx.stores.close()
      const result = planFlushCommand(ctx.stores, 's1')
      expect(result).toMatchObject({ kind: 'error', requested: 0, alreadyRequested: 0 })
      expect(result.pendingNext).toBeUndefined()
      expect(result.text).toContain('store is closed')
    } finally {
      rmSync(ctx.dataDir, { recursive: true, force: true })
    }
  })

  it('does not carry a marker onto a re-queued landed row', () => {
    const ctx = context()
    try {
      ctx.stores.queueDrop('s1', 3, NOW)
      ctx.stores.requestFlush('s1')
      ctx.stores.markDropLanded('s1', 3, 10)
      expect(ctx.stores.listFlushRequestedDrops('s1')).toEqual([])
      // The #13 A state machine keeps a landed row spent; queueDrop refreshes
      // queued_at but must never carry the old marker into a future attempt.
      ctx.stores.queueDrop('s1', 3, NOW + 1)
      expect(ctx.stores.dropState('s1', 3)).toBe('landed')
      expect(ctx.stores.listPendingDrops('s1')).toEqual([])
      expect(ctx.stores.listFlushRequestedDrops('s1')).toEqual([])
    } finally {
      dispose(ctx)
    }
  })

  it('keeps the marker across a store close/reopen', () => {
    const dir = mkdtempSync(join(tmpdir(), 'mc-flush-restart-'))
    try {
      const first = openStores(dir)
      first.queueDrop('s1', 4, NOW)
      expect(planFlushCommand(first, 's1').kind).toBe('success')
      first.close()

      const second = openStores(dir)
      expect(second.listFlushRequestedDrops('s1')).toEqual([4])
      expect(second.listPendingDrops('s1')).toEqual([4])
      second.close()
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})

function journalStub() {
  const calls: Array<{ level: string; kind: string; summary: string; data?: unknown }> = []
  return {
    calls,
    info: (kind: string, summary: string, data?: unknown) => {
      calls.push({ level: 'info', kind, summary, data })
    },
    warn: (kind: string, summary: string, data?: unknown) => {
      calls.push({ level: 'warn', kind, summary, data })
    },
    error: (kind: string, summary: string, data?: unknown) => {
      calls.push({ level: 'error', kind, summary, data })
    },
  }
}

function preStepDeps(stores: AdapterStores, journal: ReturnType<typeof journalStub>): PreStepDeps {
  return {
    ctx: { logger: { info: () => undefined, warn: () => undefined, error: () => undefined } },
    config: { reduceGuidance: false },
    stores,
    journal: journal as unknown as PreStepDeps['journal'],
    llm: undefined,
    reduceTracker: new ReduceNudgeTracker(),
    lane: {
      visibleMemoryIdsBySession: new Map(),
      searchForSession: async () => [],
    },
    projects: { seenIdentities: new Set(), sessionIdentity: new Map() },
    seenSessions: new Set(),
    activePolicy: () => ({ executeThreshold: 100, forceThreshold: 100, ttlMs: 999999999 }),
    searchHints: new SearchHintTracker(),
  } as unknown as PreStepDeps
}

describe('preStep flush lane', () => {
  it('lands a marked drop before the pressure decision and records stale pressure', async () => {
    const ctx = context()
    try {
      const tag = seedResult(ctx, 'call-1', 'body one')
      ctx.stores.queueDrop('s1', tag, NOW)
      ctx.stores.requestFlush('s1')
      const journal = journalStub()
      const listener = preStepListener(preStepDeps(ctx.stores, journal))
      const payload = {
        messages: [],
        turn: 1,
        step: 1,
        signal: new AbortController().signal,
        agent: { session: ctx.session },
      }
      const outcome = await listener(payload as never, async () => ({ kind: 'enter', messages: [] }))
      expect(outcome.kind).toBe('enter')
      expect(ctx.stores.dropState('s1', tag)).toBe('landed')
      expect(ctx.stores.listPendingDrops('s1')).toEqual([])
      expect(ctx.stores.listFlushRequestedDrops('s1')).toEqual([])
      expect(resultTexts(ctx)).toContain(`[dropped §${String(tag)}§]`)
      expect(journal.calls.some(call => call.kind === 'pass' && call.data !== undefined
        && (call.data as { pressureStale?: boolean }).pressureStale === true)).toBe(true)
    } finally {
      dispose(ctx)
    }
  })

  it('keeps stale pressure and the replaced tag on a durable-write failure', async () => {
    const ctx = context()
    try {
      const tag = seedResult(ctx, 'call-1', 'body one')
      ctx.stores.queueDrop('s1', tag, NOW)
      ctx.stores.requestFlush('s1')
      const broken = new Proxy(ctx.stores, {
        get(target, property, receiver) {
          if (property === 'markDropLanded') {
            return () => {
              throw new Error('durable write failed')
            }
          }
          return Reflect.get(target, property, receiver)
        },
      }) as AdapterStores
      const journal = journalStub()
      const listener = preStepListener(preStepDeps(broken, journal))
      const payload = {
        messages: [],
        turn: 1,
        step: 1,
        signal: new AbortController().signal,
        agent: { session: ctx.session },
      }
      const outcome = await listener(payload as never, async () => ({ kind: 'enter', messages: [] }))
      expect(outcome.kind).toBe('enter')
      expect(resultTexts(ctx)).toContain(`[dropped §${String(tag)}§]`)
      expect(ctx.stores.listFlushRequestedDrops('s1')).toEqual([tag])
      expect(journal.calls.some(call => call.kind === 'error'
        && JSON.stringify(call.data).includes(`"replacedTags":[${String(tag)}]`))).toBe(true)
      expect(journal.calls.some(call => call.kind === 'pass' && call.data !== undefined
        && (call.data as { pressureStale?: boolean }).pressureStale === true)).toBe(true)
    } finally {
      dispose(ctx)
    }
  })
})

describe('flush landing helper', () => {
  it('lands exactly the marked tags, leaves an unmarked pending row alone', () => {
    const ctx = context()
    try {
      const one = seedResult(ctx, 'call-1', 'body one')
      const two = seedResult(ctx, 'call-2', 'body two')
      ctx.stores.queueDrop('s1', one, NOW)
      ctx.stores.queueDrop('s1', two, NOW)
      ctx.stores.requestFlush('s1')
      // Simulate a later ctx_reduce whose row is pending but NOT marked.
      ctx.stores.clearFlushRequests('s1', [two])

      const landing = landPendingDrops({
        session: ctx.session,
        sessionId: 's1',
        stores: ctx.stores,
        tags: ctx.stores.listFlushRequestedDrops('s1'),
      })
      expect(landing).toMatchObject({ landed: [one], already: [], skipped: [] })
      expect(ctx.stores.dropState('s1', one)).toBe('landed')
      expect(ctx.stores.dropState('s1', two)).toBe('pending')
      expect(ctx.stores.listPendingDrops('s1')).toEqual([two])
      expect(ctx.stores.listFlushRequestedDrops('s1')).toEqual([])

      const visible = ctx.session.surface.nodes.map(seq => textAt(ctx, seq))
      expect(visible).toContain(`[dropped §${String(one)}§]`)
      expect(visible).toContain('§2§ body two')
    } finally {
      dispose(ctx)
    }
  })

  it('estimates the landed token count from the original text, not the placeholder', () => {
    const ctx = context()
    try {
      const one = seedResult(ctx, 'call-1', 'body one with enough text to estimate')
      ctx.stores.queueDrop('s1', one, NOW)
      ctx.stores.requestFlush('s1')
      const rows: Array<{ readonly data?: Record<string, unknown> }> = []
      const journal = {
        info: (_kind: string, _summary: string, data?: Record<string, unknown>) => {
          rows.push({ data })
        },
      } as never
      const landing = landPendingDrops({
        session: ctx.session,
        sessionId: 's1',
        stores: ctx.stores,
        tags: [one],
        journal,
      })
      expect(landing.landed).toEqual([one])
      // The placeholder is shorter, so `> 0` would not prove the original was
      // sampled; pin the exact estimate of the tagged body.
      expect(rows[0]?.data?.estTokens).toBe(estimateTokens(`${tagPrefix(one)}body one with enough text to estimate`))
    } finally {
      dispose(ctx)
    }
  })

  it('reports a replacement before a failing durable write', () => {
    const ctx = context()
    try {
      const one = seedResult(ctx, 'call-1', 'body one')
      ctx.stores.queueDrop('s1', one, NOW)
      ctx.stores.requestFlush('s1')
      const replaced: number[] = []
      const broken = new Proxy(ctx.stores, {
        get(target, property, receiver) {
          if (property === 'markDropLanded') {
            return () => {
              throw new Error('durable write failed')
            }
          }
          return Reflect.get(target, property, receiver)
        },
      }) as AdapterStores
      expect(() => landPendingDrops({
        session: ctx.session,
        sessionId: 's1',
        stores: broken,
        tags: [one],
        onReplaced: tag => replaced.push(tag),
      })).toThrow('durable write failed')
      expect(replaced).toEqual([one])
      const visible = ctx.session.surface.nodes.map(seq => textAt(ctx, seq))
      expect(visible).toContain(`[dropped §${String(one)}§]`)
    } finally {
      dispose(ctx)
    }
  })

  it('reports a missing live node as skipped and does not mark it landed', () => {
    const ctx = context()
    try {
      const one = seedResult(ctx, 'call-1', 'body one')
      ctx.stores.queueDrop('s1', one, NOW)
      ctx.stores.queueDrop('s1', 99, NOW)
      ctx.stores.requestFlush('s1')

      const landing = landPendingDrops({
        session: ctx.session,
        sessionId: 's1',
        stores: ctx.stores,
        tags: ctx.stores.listFlushRequestedDrops('s1'),
      })
      expect(landing).toMatchObject({ landed: [one], already: [], skipped: [99] })
      expect(ctx.stores.dropState('s1', 99)).toBe('pending')
    } finally {
      dispose(ctx)
    }
  })

  it('marks an already-live placeholder landed without replacing it again', () => {
    const ctx = context()
    try {
      const one = seedResult(ctx, 'call-1', 'body one')
      ctx.stores.queueDrop('s1', one, NOW)
      ctx.stores.requestFlush('s1')
      const first = landPendingDrops({
        session: ctx.session,
        sessionId: 's1',
        stores: ctx.stores,
        tags: [one],
      })
      expect(first.landed).toEqual([one])
      const surfaceLength = ctx.session.surface.nodes.length
      // A defensive second call sees the placeholder: it reports `already` and
      // must not append a new node.
      const second = landPendingDrops({
        session: ctx.session,
        sessionId: 's1',
        stores: ctx.stores,
        tags: [one],
      })
      expect(second).toMatchObject({ landed: [], already: [one], skipped: [] })
      expect(ctx.session.surface.nodes).toHaveLength(surfaceLength)
    } finally {
      dispose(ctx)
    }
  })
})
