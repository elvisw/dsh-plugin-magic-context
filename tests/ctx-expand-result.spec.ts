/**
 * #13 A — result-return `ctx_expand` (contract D1/D4/D5, ticket E1–E4).
 *
 * `ctx_expand` returns the persisted original as a NEW tool result; the old
 * `[dropped §N§]` placeholder and its spent tag stay untouched. A spent tag is
 * refused by `ctx_reduce` from durable state (`already dropped` / `already
 * queued`), never from whether a placeholder happens to be live.
 *
 * These cases drive the real tool definitions, the real seam read, and a real
 * Session + on-disk store — only the host's tool loop (and therefore the
 * post-execute tagger) is simulated, explicitly, by applying `tagToolResultContent`
 * with `tagPrefix` the way index.ts does.
 */
import { createHash } from 'node:crypto'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { describe, expect, it } from 'vitest'
import { Session, SessionId, type SessionSeq } from '@deepseek-ai/dsh-session'
import { ToolCallId, createToolResultMessage, type ContentBlock } from '@deepseek-ai/dsh-llm'
import type { ToolRunContext } from '@deepseek-ai/dsh-tools'
import type { AdapterStores } from '../src/core/stores.ts'
import { openStores } from '../src/index.ts'
import { tagPrefix } from '../src/core/tagger.ts'
import {
  dropPlaceholderContent,
  replaceToolResultContent,
  tagToolResultContent,
} from '../src/dsh/seams.ts'
import {
  defineCtxExpandTool,
  defineCtxReduceTool,
  type LocalDefineTool,
  type LocalToolOptions,
} from '../src/dsh/tool-bridge.ts'

interface TagVerdict {
  readonly tag: number
  readonly ok: boolean
  readonly reason?: string
}

type ExpandArgs = { readonly tag?: string; readonly tags?: string }
type ReduceArgs = { readonly drop: string }

interface TestContext {
  readonly dataDir: string
  readonly stores: AdapterStores
  readonly session: Session
}

function context(sessionId: string): TestContext {
  const dataDir = mkdtempSync(join(tmpdir(), 'mc-expand-'))
  return { dataDir, stores: openStores(dataDir), session: Session.create(SessionId(sessionId)) }
}

function dispose(context: TestContext): void {
  try {
    context.stores.close()
  } finally {
    rmSync(context.dataDir, { recursive: true, force: true })
  }
}

/** Capture the tool definition the bridge registers. */
function captureTool<A>(register: (defineTool: LocalDefineTool) => unknown): LocalToolOptions<A> {
  let captured: LocalToolOptions<A> | undefined
  const defineTool = (<T>(options: LocalToolOptions<T>) => {
    captured = options as unknown as LocalToolOptions<A>
    return options
  }) as LocalDefineTool
  register(defineTool)
  if (captured === undefined) throw new Error('the bridge registered no tool definition')
  return captured
}

const execOf = (session?: Session): ToolRunContext =>
  (session === undefined ? {} : { agent: { session } }) as unknown as ToolRunContext

/** The text projection, the same shape a provider sees. */
const textOf = (blocks: readonly ContentBlock[]): string =>
  blocks.map(block => block.type === 'text' ? block.text : '').join('')

const sha256 = (text: string): string => createHash('sha256').update(text).digest('hex')

async function expand(
  stores: AdapterStores,
  session: Session | undefined,
  args: ExpandArgs,
): Promise<{ result: unknown; content: ContentBlock[]; text: string; refused: TagVerdict[] }> {
  const tool = captureTool<ExpandArgs>(defineTool => defineCtxExpandTool({ stores, defineTool }))
  const result = await tool.execute(args, execOf(session))
  const content = tool.output.render(args, result)
  return {
    result,
    content,
    text: textOf(content),
    refused: (result as { refused?: TagVerdict[] }).refused ?? [],
  }
}

async function reduce(
  stores: AdapterStores,
  session: Session | undefined,
  drop: string,
): Promise<{ result: unknown; text: string; refused: TagVerdict[] }> {
  const tool = captureTool<ReduceArgs>(defineTool => defineCtxReduceTool({ stores, defineTool }))
  const result = await tool.execute({ drop }, execOf(session))
  const content = tool.output.render({ drop }, result)
  return {
    result,
    text: textOf(content),
    refused: (result as { refused?: TagVerdict[] }).refused ?? [],
  }
}

/** Append one tagged tool result exactly as the post-execute hook spells it. */
function seedResult(context: TestContext, callId: string, body: string): { tag: number; seq: SessionSeq } {
  const tag = context.stores.allocateTag(context.session.id, { kind: 'tool-result', callId }, Date.now())
  const seq = context.session.append('tool/result', {
    turn: 1,
    step: 1,
    message: createToolResultMessage({
      callId: ToolCallId(callId),
      content: tagToolResultContent([{ type: 'text', text: body }], tagPrefix, tag),
      isError: false,
    }),
  }, { surfaceOp: 'append' }).seq
  return { tag, seq }
}

/** Replace the node with the production placeholder and mark the drop landed. */
function landDrop(context: TestContext, callId: string, tag: number, seq: SessionSeq): SessionSeq {
  const placeholder = replaceToolResultContent(context.session, seq, dropPlaceholderContent(tag))
  context.stores.queueDrop(context.session.id, tag, Date.now())
  context.stores.markDropLanded(context.session.id, tag, placeholder)
  return placeholder
}

/** The raw `pending_drops` row, read straight from the database file. */
function pendingRow(dataDir: string, sessionId: string, tag: number): {
  queued_at: number
  landed_event_seq: number | null
} | undefined {
  const db = new DatabaseSync(join(dataDir, 'dsh-magic-context.db'))
  try {
    return db.prepare(
      'SELECT queued_at, landed_event_seq FROM pending_drops WHERE session_id = ? AND tag_number = ?',
    ).get(sessionId, tag) as { queued_at: number; landed_event_seq: number | null } | undefined
  } finally {
    db.close()
  }
}

describe('result-return expand', () => {
  it('returns the original payload as a new result and leaves the old placeholder dropped', async () => {
    const ctx = context('mc-expand-happy')
    try {
      const seeded = seedResult(ctx, 'call-1', 'echo:tool one')
      expect(seeded.tag).toBe(1)
      const placeholderSeq = landDrop(ctx, 'call-1', 1, seeded.seq)

      const expanded = await expand(ctx.stores, ctx.session, { tag: '1' })
      expect(expanded.refused).toEqual([])
      expect((expanded.result as { restored?: number[] }).restored).toEqual([1])
      // The bridge returns the stored content verbatim (its old §1§ marker
      // included); the adapter's post-execute hook adds the outer §N§.
      expect(expanded.text).toBe('§1§ echo:tool one')

      const tagged = tagToolResultContent(expanded.content, tagPrefix, 2)
      const taggedText = textOf(tagged)
      expect(taggedText).toBe('§2§ §1§ echo:tool one')
      expect(taggedText.match(/§\d+§/g)).toHaveLength(2)
      // Criterion 2: removing the complete outer marker yields the original
      // stored content byte-for-byte.
      expect(sha256(taggedText.replace(/^§\d+§ /, ''))).toBe(sha256('§1§ echo:tool one'))

      // The old placeholder event is immutable and still on the surface.
      expect(ctx.session.surface.nodes).toContain(placeholderSeq)
      const placeholder = ctx.session.snapshotEvents().find(event => event.seq === placeholderSeq)
      expect(placeholder?.type).toBe('tool/result')
      expect((placeholder as { data: { message: { content: ContentBlock[] } } }).data.message.content)
        .toEqual([{ type: 'text', text: '[dropped §1§]' }])
      // The old tag stays spent and no new drop row was created.
      expect(ctx.stores.dropState(ctx.session.id, 1)).toBe('landed')
      expect(ctx.stores.listPendingDrops(ctx.session.id)).toEqual([])
    } finally {
      dispose(ctx)
    }
  })

  it('accepts the deprecated single-value tags alias identically', async () => {
    const ctx = context('mc-expand-alias-single')
    try {
      const seeded = seedResult(ctx, 'call-1', 'echo:alias')
      landDrop(ctx, 'call-1', seeded.tag, seeded.seq)
      const expanded = await expand(ctx.stores, ctx.session, { tags: '1' })
      expect(expanded.text).toBe('§1§ echo:alias')
    } finally {
      dispose(ctx)
    }
  })

  it('joins a multi-tag alias payload in request order with the separator and one new tag', async () => {
    const ctx = context('mc-expand-multi')
    try {
      const first = seedResult(ctx, 'call-1', 'first payload')
      landDrop(ctx, 'call-1', first.tag, first.seq)
      const second = seedResult(ctx, 'call-2', 'second payload')
      landDrop(ctx, 'call-2', second.tag, second.seq)
      expect([first.tag, second.tag]).toEqual([1, 2])

      const expanded = await expand(ctx.stores, ctx.session, { tags: '1,2' })
      expect(expanded.refused).toEqual([])
      expect((expanded.result as { restored?: number[] }).restored).toEqual([1, 2])
      expect(expanded.text).toBe('§1§ first payload\n\n---\n\n§2§ second payload')

      // The host tags the combined result once.
      const tagged = tagToolResultContent(expanded.content, tagPrefix, 3)
      expect(textOf(tagged).match(/^§3§ /)).not.toBeNull()
      expect(textOf(tagged).match(/\n\n---\n\n/)).not.toBeNull()
    } finally {
      dispose(ctx)
    }
  })

  it('keeps request order for the multi-tag alias (2 before 1)', async () => {
    const ctx = context('mc-expand-order')
    try {
      const first = seedResult(ctx, 'call-1', 'first payload')
      landDrop(ctx, 'call-1', first.tag, first.seq)
      const second = seedResult(ctx, 'call-2', 'second payload')
      landDrop(ctx, 'call-2', second.tag, second.seq)
      expect([first.tag, second.tag]).toEqual([1, 2])

      const expanded = await expand(ctx.stores, ctx.session, { tags: '2,1' })
      expect(expanded.refused).toEqual([])
      expect((expanded.result as { restored?: number[] }).restored).toEqual([2, 1])
      expect(expanded.text).toBe('§2§ second payload\n\n---\n\n§1§ first payload')
    } finally {
      dispose(ctx)
    }
  })

  it('allows partial success for the multi-tag alias and lists each refusal', async () => {
    const ctx = context('mc-expand-partial')
    try {
      const seeded = seedResult(ctx, 'call-1', 'kept payload')
      landDrop(ctx, 'call-1', seeded.tag, seeded.seq)

      const expanded = await expand(ctx.stores, ctx.session, { tags: '1,9' })
      expect((expanded.result as { restored?: number[] }).restored).toEqual([1])
      expect(expanded.refused).toEqual([{ tag: 9, ok: false, reason: 'no such tag' }])
      expect(expanded.text).toContain('§1§ kept payload')
      expect(expanded.text).toContain('§9§ not restored: no such tag.')
    } finally {
      dispose(ctx)
    }
  })

  it('does not require the placeholder to be live: a shadowed one still expands', async () => {
    const ctx = context('mc-expand-shadowed')
    try {
      const seeded = seedResult(ctx, 'call-1', 'historian covered')
      const placeholderSeq = landDrop(ctx, 'call-1', seeded.tag, seeded.seq)
      // Simulate a publish/historian replacement covering the placeholder, so
      // no live surface node carries the tag any more.
      ctx.session.append('user/message', {
        id: 'mc-compacted',
        role: 'user',
        content: [{ type: 'text', text: '[compacted §C0§]' }],
        source: { kind: 'magic-context', form: 'notice', summary: 'compacted' },
      } as never, {
        surfaceOp: { op: 'replace', startSeq: placeholderSeq, endSeq: placeholderSeq },
        sourceEventSeqs: [placeholderSeq],
      })

      const expanded = await expand(ctx.stores, ctx.session, { tag: '1' })
      expect(expanded.refused).toEqual([])
      expect(expanded.text).toBe('§1§ historian covered')
    } finally {
      dispose(ctx)
    }
  })

  it('still expands a node dropped by the emergency band (no pending row)', async () => {
    const ctx = context('mc-expand-emergency')
    try {
      const seeded = seedResult(ctx, 'call-1', 'emergency payload')
      // Emergency drops replace the node directly and never touch the queue.
      replaceToolResultContent(ctx.session, seeded.seq, dropPlaceholderContent(seeded.tag))
      expect(ctx.stores.dropState(ctx.session.id, seeded.tag)).toBe('none')

      const expanded = await expand(ctx.stores, ctx.session, { tag: '1' })
      expect(expanded.refused).toEqual([])
      expect(expanded.text).toBe('§1§ emergency payload')
    } finally {
      dispose(ctx)
    }
  })
})

describe('the old tag is a durable no-op for ctx_reduce', () => {
  it('refuses a landed tag as already dropped, even with no live placeholder', async () => {
    const ctx = context('mc-expand-landed-noop')
    try {
      const seeded = seedResult(ctx, 'call-1', 'spent payload')
      const placeholderSeq = landDrop(ctx, 'call-1', seeded.tag, seeded.seq)
      // A publish covers the placeholder: durable state is the only record.
      ctx.session.append('user/message', {
        id: 'mc-compacted-2',
        role: 'user',
        content: [{ type: 'text', text: '[compacted §C1§]' }],
        source: { kind: 'magic-context', form: 'notice', summary: 'compacted' },
      } as never, {
        surfaceOp: { op: 'replace', startSeq: placeholderSeq, endSeq: placeholderSeq },
        sourceEventSeqs: [placeholderSeq],
      })

      const reduced = await reduce(ctx.stores, ctx.session, '1')
      expect(reduced.refused).toEqual([{ tag: 1, ok: false, reason: 'already dropped' }])
      expect(reduced.text).toBe('§1§ not queued: already dropped.')
      expect(ctx.stores.listPendingDrops(ctx.session.id)).toEqual([])
      expect(ctx.stores.dropState(ctx.session.id, 1)).toBe('landed')
    } finally {
      dispose(ctx)
    }
  })

  it('refuses a pending tag as already queued and leaves the row untouched', async () => {
    const ctx = context('mc-expand-pending-noop')
    try {
      const seeded = seedResult(ctx, 'call-1', 'queued payload')
      ctx.stores.queueDrop(ctx.session.id, seeded.tag, 1_000)
      const before = pendingRow(ctx.dataDir, ctx.session.id, 1)
      expect(before).toEqual({ queued_at: 1_000, landed_event_seq: null })

      const reduced = await reduce(ctx.stores, ctx.session, '1')
      expect(reduced.refused).toEqual([{ tag: 1, ok: false, reason: 'already queued' }])
      expect(reduced.text).toBe('§1§ not queued: already queued.')
      expect(pendingRow(ctx.dataDir, ctx.session.id, 1)).toEqual(before)
    } finally {
      dispose(ctx)
    }
  })

  it('still queues an active tag (the queue/land path is not removed)', async () => {
    const ctx = context('mc-expand-active-queue')
    try {
      seedResult(ctx, 'call-1', 'active payload')
      const reduced = await reduce(ctx.stores, ctx.session, '1')
      expect(reduced.refused).toEqual([])
      expect(reduced.text).toBe('Queued 1 tag for reclaim.')
      expect(ctx.stores.dropState(ctx.session.id, 1)).toBe('pending')
    } finally {
      dispose(ctx)
    }
  })
})

describe('the new tag lifecycle', () => {
  it('drops the expand result and expands it again from its own new tag', async () => {
    const ctx = context('mc-expand-lifecycle')
    try {
      const first = seedResult(ctx, 'call-original', 'echo:tool one')
      landDrop(ctx, 'call-original', first.tag, first.seq)

      const expandedOne = await expand(ctx.stores, ctx.session, { tag: '1' })
      // The adapter tags the expand result, which the host then logs as a new
      // tool/result for the ctx_expand call.
      const firstNewContent = tagToolResultContent(expandedOne.content, tagPrefix, 2)
      expect(textOf(firstNewContent)).toBe('§2§ §1§ echo:tool one')
      const newTag = ctx.stores.allocateTag(
        ctx.session.id,
        { kind: 'tool-result', callId: 'call-expand-one' },
        Date.now(),
      )
      expect(newTag).toBe(2)
      const newSeq = ctx.session.append('tool/result', {
        turn: 2,
        step: 1,
        message: createToolResultMessage({
          callId: ToolCallId('call-expand-one'),
          content: firstNewContent,
          isError: false,
        }),
      }, { surfaceOp: 'append' }).seq

      // Drop §2§ through the normal queue, then land it.
      expect((await reduce(ctx.stores, ctx.session, '2')).refused).toEqual([])
      landDrop(ctx, 'call-expand-one', 2, newSeq)
      expect(ctx.stores.dropState(ctx.session.id, 2)).toBe('landed')

      const expandedTwo = await expand(ctx.stores, ctx.session, { tag: '2' })
      expect(expandedTwo.refused).toEqual([])
      const secondNewContent = tagToolResultContent(expandedTwo.content, tagPrefix, 3)
      // Removing the SECOND result's outer §3§ yields the STORED content of the
      // first result (its own outer §2§ included) — the plan's storage rule.
      expect(sha256(textOf(secondNewContent).replace(/^§\d+§ /, '')))
        .toBe(sha256(textOf(firstNewContent)))
      // Stripping every leading allocator marker recovers the one payload.
      const payloadOf = (text: string): string => text.replace(/^(?:§\d+§ )+/, '')
      expect(payloadOf(textOf(secondNewContent))).toBe('echo:tool one')
      expect(payloadOf(textOf(firstNewContent))).toBe('echo:tool one')
    } finally {
      dispose(ctx)
    }
  })
})

describe('refusals are named and never fabricate content', () => {
  it('refuses an active tag as not dropped', async () => {
    const ctx = context('mc-expand-active')
    try {
      seedResult(ctx, 'call-1', 'never dropped')
      const expanded = await expand(ctx.stores, ctx.session, { tag: '1' })
      expect(expanded.refused).toEqual([{ tag: 1, ok: false, reason: 'not dropped' }])
      expect(expanded.text).toBe('§1§ not restored: not dropped.')
      expect((expanded.result as { content?: unknown }).content).toBeUndefined()
    } finally {
      dispose(ctx)
    }
  })

  it('refuses a pending tag as not dropped yet', async () => {
    const ctx = context('mc-expand-pending')
    try {
      const seeded = seedResult(ctx, 'call-1', 'pending drop')
      ctx.stores.queueDrop(ctx.session.id, seeded.tag, Date.now())
      const expanded = await expand(ctx.stores, ctx.session, { tag: '1' })
      expect(expanded.refused).toEqual([{ tag: 1, ok: false, reason: 'not dropped yet' }])
      expect((expanded.result as { content?: unknown }).content).toBeUndefined()
    } finally {
      dispose(ctx)
    }
  })

  it('refuses an unknown tag as no such tag', async () => {
    const ctx = context('mc-expand-unknown')
    try {
      const expanded = await expand(ctx.stores, ctx.session, { tag: '7' })
      expect(expanded.refused).toEqual([{ tag: 7, ok: false, reason: 'no such tag' }])
    } finally {
      dispose(ctx)
    }
  })

  it('refuses a non-tool target as not a tool-result tag', async () => {
    const ctx = context('mc-expand-non-tool')
    try {
      ctx.stores.allocateTag(ctx.session.id, { kind: 'user-message', messageId: 'm-1' }, Date.now())
      const expanded = await expand(ctx.stores, ctx.session, { tag: '1' })
      expect(expanded.refused).toEqual([{ tag: 1, ok: false, reason: 'not a tool-result tag' }])
    } finally {
      dispose(ctx)
    }
  })

  it('refuses a tag cleaned with its message as tag no longer available', async () => {
    const ctx = context('mc-expand-cleaned')
    try {
      // The tag row survives (pruning is T5), but the call's event does not.
      ctx.stores.allocateTag(ctx.session.id, { kind: 'tool-result', callId: 'call-gone' }, Date.now())
      ctx.stores.queueDrop(ctx.session.id, 1, Date.now())
      ctx.stores.markDropLanded(ctx.session.id, 1, 3)
      const expanded = await expand(ctx.stores, ctx.session, { tag: '1' })
      expect(expanded.refused).toEqual([{ tag: 1, ok: false, reason: 'tag no longer available' }])
    } finally {
      dispose(ctx)
    }
  })

  it('refuses a placeholder whose original source is gone as raw source unavailable', async () => {
    const ctx = context('mc-expand-no-source')
    try {
      // A placeholder citing a non-tool event: no full-fidelity original exists.
      const source = ctx.session.append('user/message', {
        id: 'mc-source',
        role: 'user',
        content: [{ type: 'text', text: 'not a tool result' }],
        source: { kind: 'user' },
      } as never, { surfaceOp: 'append' }).seq
      ctx.session.append('tool/result', {
        turn: 1,
        step: 1,
        message: createToolResultMessage({
          callId: ToolCallId('call-lost'),
          content: dropPlaceholderContent(1),
          isError: false,
        }),
      }, { surfaceOp: 'append', sourceEventSeqs: [source] })
      ctx.stores.allocateTag(ctx.session.id, { kind: 'tool-result', callId: 'call-lost' }, Date.now())
      ctx.stores.queueDrop(ctx.session.id, 1, Date.now())
      ctx.stores.markDropLanded(ctx.session.id, 1, 1)

      const expanded = await expand(ctx.stores, ctx.session, { tag: '1' })
      expect(expanded.refused).toEqual([{ tag: 1, ok: false, reason: 'raw source unavailable' }])
      expect((expanded.result as { content?: unknown }).content).toBeUndefined()
    } finally {
      dispose(ctx)
    }
  })

  it('refuses a tag owned by another session as cross-session', async () => {
    const ctx = context('mc-expand-other')
    try {
      ctx.stores.allocateTag('session-owner', { kind: 'tool-result', callId: 'owned' }, Date.now())
      const expanded = await expand(ctx.stores, ctx.session, { tag: '1' })
      expect(expanded.refused).toEqual([{ tag: 1, ok: false, reason: 'cross-session tag' }])
    } finally {
      dispose(ctx)
    }
  })

  it('reads a typo in a numbered session as no such tag, not cross-session', async () => {
    const ctx = context('mc-expand-typo')
    try {
      // This session owns tag 1, so its numbering is live; another session's
      // tag 9 must not relabel a typo here as a foreign handle.
      const seeded = seedResult(ctx, 'call-1', 'mine')
      landDrop(ctx, 'call-1', seeded.tag, seeded.seq)
      ctx.stores.allocateTag('session-owner', { kind: 'tool-result', callId: 'owned' }, Date.now())
      for (let index = 2; index <= 9; index += 1) {
        ctx.stores.allocateTag('session-owner', { kind: 'tool-result', callId: `owned-${String(index)}` }, Date.now())
      }
      expect(ctx.stores.tagSessions(9)).toEqual(['session-owner'])

      const expanded = await expand(ctx.stores, ctx.session, { tag: '9' })
      expect(expanded.refused).toEqual([{ tag: 9, ok: false, reason: 'no such tag' }])
      expect(expanded.text).toBe('§9§ not restored: no such tag.')
    } finally {
      dispose(ctx)
    }
  })

  it('refuses without a session', async () => {
    const ctx = context('mc-expand-no-session')
    try {
      const expanded = await expand(ctx.stores, undefined, { tag: '1' })
      expect(expanded.refused).toEqual([])
      expect((expanded.result as { reason?: string }).reason).toBe('no-session')
      expect(expanded.text).toBe('ctx_expand refused: no-session.')
    } finally {
      dispose(ctx)
    }
  })

  it('validates the tag/tags pair', async () => {
    const ctx = context('mc-expand-shape')
    try {
      const both = await expand(ctx.stores, ctx.session, { tag: '1', tags: '1' })
      expect(both.text).toContain('pass either tag or tags, not both')
      const neither = await expand(ctx.stores, ctx.session, {})
      expect(neither.text).toContain('no tag given')
      const range = await expand(ctx.stores, ctx.session, { tag: '1-2' })
      expect(range.text).toContain('is not a single tag number')
      const empty = await expand(ctx.stores, ctx.session, { tags: 'x,y' })
      expect(empty.text).toContain('names no tag number')
    } finally {
      dispose(ctx)
    }
  })
})

describe('a unit-level restart reads the same original', () => {
  it('resolves a landed tag after the adapter reopens at the same data directory', async () => {
    const dataDir = mkdtempSync(join(tmpdir(), 'mc-expand-restart-'))
    const session = Session.create(SessionId('mc-expand-restart'))
    try {
      const first = openStores(dataDir)
      let placeholderSeq: SessionSeq
      try {
        const tag = first.allocateTag(session.id, { kind: 'tool-result', callId: 'call-1' }, Date.now())
        const seq = session.append('tool/result', {
          turn: 1,
          step: 1,
          message: createToolResultMessage({
            callId: ToolCallId('call-1'),
            content: tagToolResultContent([{ type: 'text', text: 'restart payload' }], tagPrefix, tag),
            isError: false,
          }),
        }, { surfaceOp: 'append' }).seq
        placeholderSeq = replaceToolResultContent(session, seq, dropPlaceholderContent(tag))
        first.queueDrop(session.id, tag, Date.now())
        first.markDropLanded(session.id, tag, placeholderSeq)
      } finally {
        first.close()
      }

      // A new adapter instance over the same data directory, reading a log
      // replayed from the first session's events — not the live in-memory one.
      const replayed = Session.create(session.id, session.snapshotEvents())
      const second = openStores(dataDir)
      try {
        const expanded = await expand(second, replayed, { tag: '1' })
        expect(expanded.refused).toEqual([])
        expect(expanded.text).toBe('§1§ restart payload')
        expect(second.dropState(session.id, 1)).toBe('landed')
      } finally {
        second.close()
      }
    } finally {
      rmSync(dataDir, { recursive: true, force: true })
    }
  })
})
