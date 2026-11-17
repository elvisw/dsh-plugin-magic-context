/**
 * T22 — `/ctx-wrapup` runs on the next pre-step through the normal execute
 * lane. The command only queues; this test drives the real listener with a
 * fake historian and asserts the manual trigger, publish and pass row.
 */
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { Session, SessionId } from '@deepseek-ai/dsh-session'
import { ToolCallId, createAssistantMessage, createToolResultMessage } from '@deepseek-ai/dsh-llm'
import { openStores } from '../src/index.ts'
import type { AdapterStores } from '../src/core/stores.ts'
import { enumerateSurfaceNodes } from '../src/dsh/seams.ts'
import { preStepListener, type PreStepDeps } from '../src/dsh/pre-step.ts'
import { ReduceNudgeTracker } from '../src/dsh/reduce-guidance.ts'
import { SearchHintTracker } from '../src/dsh/search-hint.ts'
import {
  readWrapupMarker,
  planWrapupCommand,
  planWrapupRange,
  writeWrapupMarker,
} from '../src/dsh/wrapup-command.ts'
import { scriptLlm } from './helpers/llm-fake.ts'

const NOW = 1_700_000_000_000

function digest(): string {
  return JSON.stringify({
    summary: { p1: 'P1 detail', p2: 'P2', p3: 'P3', p4: 'P4' },
    importance: 77,
    facts: [{ category: 'CONSTRAINTS', content: 'never delete the memory database' }],
    events: ['tried X, failed because Y'],
  })
}

function draft() {
  return {
    tiers: { p1: 'P1 detail', p2: 'P2', p3: 'P3', p4: 'P4' },
    importance: 77,
    facts: [],
    events: [],
  }
}

function context(): { dataDir: string; stores: AdapterStores; session: Session } {
  const dataDir = mkdtempSync(join(tmpdir(), 'mc-wrapup-pre-'))
  return { dataDir, stores: openStores(dataDir), session: Session.create(SessionId('s1')) }
}

function dispose(context: { dataDir: string; stores: AdapterStores }): void {
  try {
    context.stores.close()
  } finally {
    rmSync(context.dataDir, { recursive: true, force: true })
  }
}

function appendUser(session: Session, text: string): void {
  session.append('user/message', {
    id: `mc-wrapup-user-${Math.random().toString(36).slice(2)}`,
    role: 'user',
    content: [{ type: 'text', text }],
    source: { kind: 'user' },
  } as never, { surfaceOp: 'append' })
}

function appendToolPair(session: Session): void {
  session.append('assistant/message', {
    turn: 1,
    step: 1,
    message: createAssistantMessage({
      content: [
        { type: 'text', text: 'calling read' },
        { type: 'tool-call', id: ToolCallId('call_a'), name: 'read', arguments: '{}' },
      ],
      provider: 'mock',
      model: 'mock',
    }),
    stream: [],
  } as never, { surfaceOp: 'append' })
  session.append('tool/result', {
    turn: 1,
    step: 1,
    message: createToolResultMessage({
      callId: ToolCallId('call_a'),
      content: [{ type: 'text', text: 'SECRET TOOL OUTPUT' }],
      isError: false,
    }),
  } as never, { surfaceOp: 'append' })
}

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

function deps(
  stores: AdapterStores,
  journal: ReturnType<typeof journalStub>,
  llm: ReturnType<typeof scriptLlm>['llm'],
): PreStepDeps {
  return {
    ctx: { logger: { info: () => undefined, warn: () => undefined, error: () => undefined } },
    config: { reduceGuidance: false, historianEnabled: true },
    stores,
    journal: journal as unknown as PreStepDeps['journal'],
    llm,
    reduceTracker: new ReduceNudgeTracker(),
    lane: {
      visibleMemoryIdsBySession: new Map(),
      searchForSession: async () => [],
    },
    projects: { seenIdentities: new Set(), sessionIdentity: new Map() },
    seenSessions: new Set(),
    activePolicy: () => ({
      executeThreshold: 100,
      forceThreshold: 100,
      baselineTokens: 2_000,
      ttlMs: 999_999_999,
      historianProtectedNodes: 0,
      historianMinNodes: 0,
      historianMinBudgetTokens: 0,
    }),
    searchHints: new SearchHintTracker(),
  } as unknown as PreStepDeps
}

describe('/ctx-wrapup pre-step pass', () => {
  it('queues, runs one manual historian, publishes and records the wrapup pass row', async () => {
    const ctx = context()
    try {
      for (let index = 0; index < 6; index += 1) appendUser(ctx.session, `message ${String(index + 1)}`)
      ctx.session.append('request/context', {
        provider: 'mock',
        model: 'mock',
        contextWindow: 128_000,
      } as never)
      const queued = planWrapupCommand(ctx.stores, 's1', '2', enumerateSurfaceNodes(ctx.session))
      expect(queued.kind).toBe('success')
      const fake = scriptLlm([digest()])
      const journal = journalStub()
      const listener = preStepListener(deps(ctx.stores, journal, fake.llm))
      const outcome = await listener({
        messages: [],
        turn: 1,
        step: 1,
        signal: new AbortController().signal,
        agent: { session: ctx.session },
      } as never, async () => ({ kind: 'enter', messages: [] }))
      expect(outcome.kind).toBe('enter')
      expect(fake.calls).toHaveLength(1)
      const compartments = ctx.stores.listCompartments('s1')
      expect(compartments).toHaveLength(1)
      expect(compartments[0]?.landedEventSeq).toBeDefined()
      expect(ctx.session.snapshotEvents().some(event =>
        event.type === 'user/message' && JSON.stringify(event.data).includes('[compacted §C1§]'))).toBe(true)
      const pass = journal.calls.find(call => call.kind === 'pass')
      expect(pass?.data).toMatchObject({
        decision: 'execute',
        reason: 'wrapup-pending',
        wrapup: {
          compartmentId: 1,
          trigger: 'manual',
          retainedEligible: 3,
          compactedEntries: 3,
        },
      })
      expect(readWrapupMarker(ctx.stores, 's1')).toBeUndefined()
      expect(journal.calls.find(call => call.kind === 'historian'
        && call.summary.includes('manual run started'))?.data).toMatchObject({ trigger: 'manual' })
      expect(journal.calls.some(call => call.kind === 'wrapup'
        && call.summary.includes('manual historian stored'))).toBe(true)
    } finally {
      dispose(ctx)
    }
  })

  it('adopts a stored compartment only when its covered span matches the pending plan', async () => {
    const ctx = context()
    try {
      for (let index = 0; index < 6; index += 1) appendUser(ctx.session, `adopt ${String(index + 1)}`)
      ctx.session.append('request/context', {
        provider: 'mock',
        model: 'mock',
        contextWindow: 128_000,
      } as never)
      const nodes = enumerateSurfaceNodes(ctx.session)
      const plan = planWrapupRange({ nodes, keep: 2, covered: new Set() })
      expect(plan).toBeDefined()
      const stored = ctx.stores.allocateCompartment('s1', draft(), {
        startSeq: plan!.prefix[0]!.seq,
        endSeq: plan!.prefix[plan!.prefix.length - 1]!.seq,
        seqs: plan!.prefix.map(node => node.seq),
        tokens: 12,
      }, 0, Date.now() + 1)
      writeWrapupMarker(ctx.stores, 's1', {
        keep: 2,
        requestedAt: Date.now() - 1_000,
        attempts: 0,
        compartmentIds: [],
      })
      const fake = scriptLlm([digest()])
      const journal = journalStub()
      const listener = preStepListener(deps(ctx.stores, journal, fake.llm))
      const outcome = await listener({
        messages: [],
        turn: 1,
        step: 1,
        signal: new AbortController().signal,
        agent: { session: ctx.session },
      } as never, async () => ({ kind: 'enter', messages: [] }))
      expect(outcome.kind).toBe('enter')
      expect(fake.calls).toHaveLength(0)
      expect(ctx.stores.listCompartments('s1').find(row => row.compartmentId === stored.compartmentId)?.landedEventSeq)
        .toBeDefined()
      expect(journal.calls.find(call => call.kind === 'pass')?.data).toMatchObject({
        wrapup: {
          compartmentId: stored.compartmentId,
          trigger: 'manual',
          retainedEligible: plan!.retainedEligible,
          compactedEntries: plan!.compactedEntries,
        },
      })
    } finally {
      dispose(ctx)
    }
  })

  it('does not adopt an unrelated compartment with a different span', async () => {
    const ctx = context()
    try {
      for (let index = 0; index < 6; index += 1) appendUser(ctx.session, `unrelated ${String(index + 1)}`)
      ctx.session.append('request/context', {
        provider: 'mock',
        model: 'mock',
        contextWindow: 128_000,
      } as never)
      const nodes = enumerateSurfaceNodes(ctx.session)
      const plan = planWrapupRange({ nodes, keep: 2, covered: new Set() })
      expect(plan).toBeDefined()
      ctx.stores.allocateCompartment('s1', draft(), {
        startSeq: nodes.at(-1)!.seq,
        endSeq: nodes.at(-1)!.seq,
        seqs: [nodes.at(-1)!.seq],
        tokens: 4,
      }, 0, Date.now() + 1)
      writeWrapupMarker(ctx.stores, 's1', {
        keep: 2,
        requestedAt: Date.now() - 1_000,
        attempts: 0,
        compartmentIds: [],
      })
      const fake = scriptLlm([digest()])
      const listener = preStepListener(deps(ctx.stores, journalStub(), fake.llm))
      await listener({
        messages: [],
        turn: 1,
        step: 1,
        signal: new AbortController().signal,
        agent: { session: ctx.session },
      } as never, async () => ({ kind: 'enter', messages: [] }))
      expect(fake.calls).toHaveLength(1)
    } finally {
      dispose(ctx)
    }
  })

  it('persists attempts and stops a marker that exceeded the cap without calling the model', async () => {
    const ctx = context()
    try {
      for (let index = 0; index < 5; index += 1) appendUser(ctx.session, `cap ${String(index + 1)}`)
      writeWrapupMarker(ctx.stores, 's1', {
        keep: 2,
        requestedAt: Date.now(),
        attempts: 3,
        compartmentIds: [],
      })
      const fake = scriptLlm([digest()])
      const listener = preStepListener(deps(ctx.stores, journalStub(), fake.llm))
      await listener({
        messages: [],
        turn: 1,
        step: 1,
        signal: new AbortController().signal,
        agent: { session: ctx.session },
      } as never, async () => ({ kind: 'enter', messages: [] }))
      expect(fake.calls).toHaveLength(0)
      expect(readWrapupMarker(ctx.stores, 's1')).toBeUndefined()
    } finally {
      dispose(ctx)
    }
  })

  it('lands pending drops before the manual historian plans its span', async () => {
    const ctx = context()
    try {
      for (let index = 0; index < 3; index += 1) appendUser(ctx.session, `before ${String(index + 1)}`)
      appendToolPair(ctx.session)
      for (let index = 0; index < 3; index += 1) appendUser(ctx.session, `after ${String(index + 1)}`)
      ctx.session.append('request/context', {
        provider: 'mock',
        model: 'mock',
        contextWindow: 128_000,
      } as never)
      const tag = ctx.stores.allocateTag('s1', { kind: 'tool-result', callId: 'call_a' }, Date.now())
      ctx.stores.queueDrop('s1', tag, Date.now())
      planWrapupCommand(ctx.stores, 's1', '2', enumerateSurfaceNodes(ctx.session))
      const fake = scriptLlm([digest()])
      const listener = preStepListener(deps(ctx.stores, journalStub(), fake.llm))
      await listener({
        messages: [],
        turn: 1,
        step: 1,
        signal: new AbortController().signal,
        agent: { session: ctx.session },
      } as never, async () => ({ kind: 'enter', messages: [] }))
      expect(fake.calls).toHaveLength(1)
      const replay = JSON.stringify(fake.calls[0]?.messages)
      expect(replay).toContain(`[dropped §${String(tag)}§]`)
      expect(replay).not.toContain('SECRET TOOL OUTPUT')
      expect(ctx.stores.listPendingDrops('s1')).toEqual([])
    } finally {
      dispose(ctx)
    }
  })

  it('does not start an automatic historian after the manual run fails', async () => {
    const ctx = context()
    try {
      for (let index = 0; index < 6; index += 1) appendUser(ctx.session, `fail ${String(index + 1)}`)
      ctx.session.append('request/context', {
        provider: 'mock',
        model: 'mock',
        contextWindow: 128_000,
      } as never)
      planWrapupCommand(ctx.stores, 's1', '2', enumerateSurfaceNodes(ctx.session))
      const fake = scriptLlm([new Error('provider down')])
      const journal = journalStub()
      const listener = preStepListener(deps(ctx.stores, journal, fake.llm))
      await listener({
        messages: [],
        turn: 1,
        step: 1,
        signal: new AbortController().signal,
        agent: { session: ctx.session },
      } as never, async () => ({ kind: 'enter', messages: [] }))
      expect(fake.calls).toHaveLength(1)
      const pass = journal.calls.find(call => call.kind === 'pass')
      expect(pass?.data).toMatchObject({ reason: 'wrapup-pending' })
      expect(journal.calls.some(call => call.kind === 'wrapup'
        && call.summary.includes('failed before publish'))).toBe(true)
    } finally {
      dispose(ctx)
    }
  })
})
