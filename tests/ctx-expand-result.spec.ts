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
import {
  ToolCallId,
  createAssistantMessage,
  createToolResultMessage,
  type ContentBlock,
} from '@deepseek-ai/dsh-llm'
import type { ToolRunContext } from '@deepseek-ai/dsh-tools'
import { estimateTokens } from '../src/core/compartments.ts'
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

type ExpandArgs = {
  readonly tag?: string
  readonly tags?: string
  readonly message?: string
  readonly start?: string
  readonly end?: string
  readonly verbose?: boolean | string
}
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
  journal?: unknown,
): Promise<{ result: unknown; content: ContentBlock[]; text: string; refused: TagVerdict[] }> {
  const tool = captureTool<ExpandArgs>(defineTool => defineCtxExpandTool({
    stores,
    defineTool,
    ...(journal === undefined ? {} : { journal: journal as never }),
  }))
  const result = await tool.execute(args, execOf(session))
  const content = tool.output.render(args, result)
  return {
    result,
    content,
    text: textOf(content),
    refused: (result as { refused?: TagVerdict[] }).refused ?? [],
  }
}

function expectMessageFailure(
  expanded: { readonly result: unknown },
  reason: string,
): void {
  const payload = expanded.result as {
    readonly ok?: boolean
    readonly restored?: number[]
    readonly refused?: TagVerdict[]
    readonly content?: unknown
    readonly reason?: string
  }
  expect(payload.ok).toBe(false)
  expect(payload.restored).toEqual([])
  expect(payload.refused).toEqual([])
  expect(payload.content).toBeUndefined()
  expect(payload.reason).toBe(reason)
}

function expectRangeFailure(expanded: { readonly result: unknown }, reason: string): void {
  const payload = expanded.result as {
    readonly ok?: boolean
    readonly locator?: string
    readonly reason?: string
    readonly restored?: unknown
    readonly refused?: unknown
    readonly content?: unknown
  }
  expect(payload.ok).toBe(false)
  expect(payload.locator).toBe('range')
  expect(payload.reason).toBe(reason)
  expect('restored' in payload).toBe(false)
  expect('refused' in payload).toBe(false)
  expect(payload.content).toBeUndefined()
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

function appendUser(context: TestContext, text: string): SessionSeq {
  return context.session.append('user/message', {
    id: `mc-range-user-${Math.random().toString(36).slice(2)}`,
    role: 'user',
    content: [{ type: 'text', text }],
    source: { kind: 'user' },
  } as never, { surfaceOp: 'append' }).seq
}

function appendAssistant(context: TestContext, content: ContentBlock[]): SessionSeq {
  return context.session.append('assistant/message', {
    turn: 1,
    step: 1,
    message: createAssistantMessage({ content, provider: 'mock', model: 'mock' }),
    stream: [],
  }, { surfaceOp: 'append' }).seq
}

function appendToolCall(context: TestContext, callId: string, name: string): SessionSeq {
  return context.session.append('tool/call', {
    turn: 1,
    step: 1,
    callId: ToolCallId(callId),
    name,
    arguments: '{"path":"x"}',
  }).seq
}

function appendAttempt(context: TestContext): SessionSeq {
  return context.session.append('assistant/attempt', {
    turn: 1,
    step: 1,
    stream: [],
  }).seq
}

function appendSystem(context: TestContext, text: string): SessionSeq {
  return context.session.append('system/message', {
    turn: 1,
    step: 1,
    message: { role: 'system', content: [{ type: 'text', text }] },
  } as never, { surfaceOp: 'append' }).seq
}

function appendCheckpoint(context: TestContext, text: string): SessionSeq {
  return context.session.append('user/message', {
    id: `mc-range-checkpoint-${Math.random().toString(36).slice(2)}`,
    role: 'user',
    content: [{ type: 'text', text }],
    source: { kind: 'compact-checkpoint' },
  } as never, { surfaceOp: 'append' }).seq
}

function appendNotice(context: TestContext, text: string): SessionSeq {
  return context.session.append('user/message', {
    id: `mc-range-notice-${Math.random().toString(36).slice(2)}`,
    role: 'user',
    content: [{ type: 'text', text }],
    source: { kind: 'magic-context', form: 'notice', summary: 'plain notice' },
  } as never, { surfaceOp: 'append' }).seq
}

function appendCompactedUser(context: TestContext, text: string): SessionSeq {
  return context.session.append('user/message', {
    id: `mc-range-compacted-${Math.random().toString(36).slice(2)}`,
    role: 'user',
    content: [{ type: 'text', text }],
    source: { kind: 'user' },
  } as never, { surfaceOp: 'append' }).seq
}

function appendDeveloper(context: TestContext, text: string): SessionSeq {
  return context.session.append('developer/message', {
    turn: 1,
    step: 1,
    message: { role: 'developer', content: [{ type: 'text', text }] },
  } as never, { surfaceOp: 'append' }).seq
}

function appendToolResult(context: TestContext, callId: string, text: string): SessionSeq {
  return context.session.append('tool/result', {
    turn: 1,
    step: 1,
    message: createToolResultMessage({
      callId: ToolCallId(callId),
      content: [{ type: 'text', text }],
      isError: false,
    }),
  }, { surfaceOp: 'append' }).seq
}

/** Simulate a publish/compaction replacement, leaving the target shadowed. */
function shadowEvent(context: TestContext, target: SessionSeq, text = '[compacted §C1§]'): SessionSeq {
  return context.session.append('user/message', {
    id: `mc-range-shadow-${Math.random().toString(36).slice(2)}`,
    role: 'user',
    content: [{ type: 'text', text }],
    source: { kind: 'magic-context', form: 'notice', summary: 'compacted' },
  } as never, {
    surfaceOp: { op: 'replace', startSeq: target, endSeq: target },
    sourceEventSeqs: [target],
  }).seq
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

/**
 * #14's deleted-tag fixture: the adapter no longer exposes a time-based
 * `pruneTags` API, so the test deletes exactly one target row. Never an
 * unqualified `DELETE FROM tags`.
 */
function deleteToolTagRow(dataDir: string, sessionId: string, callId: string): void {
  const db = new DatabaseSync(join(dataDir, 'dsh-magic-context.db'))
  try {
    db.prepare(
      "DELETE FROM tags WHERE session_id = ? AND target_kind = 'tool-result' AND target_id = ?",
    ).run(sessionId, callId)
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

describe('message locator', () => {
  it('resolves the original and placeholder seqs after a simulated publish', async () => {
    const ctx = context('mc-expand-message-publish')
    try {
      const seeded = seedResult(ctx, 'call-1', 'message payload')
      expect(seeded.seq).toBe(0)
      const placeholderSeq = landDrop(ctx, 'call-1', seeded.tag, seeded.seq)
      // Simulate the publish replacement; the original and placeholder events
      // stay in the log, but neither is a live surface node.
      const compactedSeq = ctx.session.append('user/message', {
        id: 'mc-message-compacted',
        role: 'user',
        content: [{ type: 'text', text: '[compacted §C1§]' }],
        source: { kind: 'magic-context', form: 'notice', summary: 'compacted' },
      } as never, {
        surfaceOp: { op: 'replace', startSeq: placeholderSeq, endSeq: placeholderSeq },
        sourceEventSeqs: [placeholderSeq],
      }).seq

      const byOriginal = await expand(ctx.stores, ctx.session, { message: String(seeded.seq) })
      expect(byOriginal.refused).toEqual([])
      expect((byOriginal.result as { restored?: number[] }).restored).toEqual([1])
      expect(byOriginal.text).toBe('§1§ message payload')

      const byPlaceholder = await expand(ctx.stores, ctx.session, { message: String(placeholderSeq) })
      expect(byPlaceholder.refused).toEqual([])
      expect((byPlaceholder.result as { restored?: number[] }).restored).toEqual([1])
      expect(byPlaceholder.text).toBe('§1§ message payload')

      const byCompactedNode = await expand(ctx.stores, ctx.session, { message: String(compactedSeq) })
      expectMessageFailure(byCompactedNode, 'not a tool-result message')

      expect(ctx.stores.dropState(ctx.session.id, 1)).toBe('landed')
      expect(ctx.stores.listPendingDrops(ctx.session.id)).toEqual([])
    } finally {
      dispose(ctx)
    }
  })

  it('refuses active and pending items through the same drop gate', async () => {
    const ctx = context('mc-expand-message-state')
    try {
      const active = seedResult(ctx, 'call-active', 'active payload')
      const activeExpand = await expand(ctx.stores, ctx.session, { message: String(active.seq) })
      expectMessageFailure(activeExpand, 'not dropped')

      ctx.stores.queueDrop(ctx.session.id, active.tag, Date.now())
      const pendingExpand = await expand(ctx.stores, ctx.session, { message: String(active.seq) })
      expectMessageFailure(pendingExpand, 'not dropped yet')
      expect(ctx.stores.dropState(ctx.session.id, active.tag)).toBe('pending')
    } finally {
      dispose(ctx)
    }
  })

  it('expands an emergency drop through its call-level placeholder evidence', async () => {
    const ctx = context('mc-expand-message-emergency')
    try {
      const seeded = seedResult(ctx, 'call-emergency', 'emergency message payload')
      replaceToolResultContent(ctx.session, seeded.seq, dropPlaceholderContent(seeded.tag))
      expect(ctx.stores.dropState(ctx.session.id, seeded.tag)).toBe('none')

      const expanded = await expand(ctx.stores, ctx.session, { message: String(seeded.seq) })
      expect(expanded.refused).toEqual([])
      expect(expanded.text).toBe('§1§ emergency message payload')
      expect(ctx.stores.dropState(ctx.session.id, seeded.tag)).toBe('none')
      expect(ctx.stores.listPendingDrops(ctx.session.id)).toEqual([])
    } finally {
      dispose(ctx)
    }
  })

  it('names unknown, non-tool, untagged, deleted-tag, and missing-source failures', async () => {
    const unknownCtx = context('mc-expand-message-unknown')
    try {
      const unknown = await expand(unknownCtx.stores, unknownCtx.session, { message: '999' })
      expectMessageFailure(unknown, 'no such message')

      const other = Session.create(SessionId('mc-expand-message-other'))
      other.append('user/message', {
        id: 'mc-other',
        role: 'user',
        content: [{ type: 'text', text: 'other session event' }],
        source: { kind: 'user' },
      } as never, { surfaceOp: 'append' })
      const foreign = await expand(unknownCtx.stores, unknownCtx.session, { message: '0' })
      expectMessageFailure(foreign, 'no such message')
    } finally {
      dispose(unknownCtx)
    }

    const nonToolCtx = context('mc-expand-message-non-tool')
    try {
      const seq = nonToolCtx.session.append('user/message', {
        id: 'mc-not-tool',
        role: 'user',
        content: [{ type: 'text', text: 'not a tool result' }],
        source: { kind: 'user' },
      } as never, { surfaceOp: 'append' }).seq
      const nonTool = await expand(nonToolCtx.stores, nonToolCtx.session, { message: String(seq) })
      expectMessageFailure(nonTool, 'not a tool-result message')
    } finally {
      dispose(nonToolCtx)
    }

    const untaggedCtx = context('mc-expand-message-untagged')
    try {
      const seq = untaggedCtx.session.append('tool/result', {
        turn: 1,
        step: 1,
        message: createToolResultMessage({
          callId: ToolCallId('call-untagged'),
          content: [{ type: 'text', text: 'no tag row' }],
          isError: false,
        }),
      }, { surfaceOp: 'append' }).seq
      const untagged = await expand(untaggedCtx.stores, untaggedCtx.session, { message: String(seq) })
      expectMessageFailure(untagged, 'not a tool-result tag')
    } finally {
      dispose(untaggedCtx)
    }

    const deletedCtx = context('mc-expand-message-deleted-tag')
    try {
      const seeded = seedResult(deletedCtx, 'call-deleted', 'deleted tag payload')
      landDrop(deletedCtx, 'call-deleted', seeded.tag, seeded.seq)
      deleteToolTagRow(deletedCtx.dataDir, deletedCtx.session.id, 'call-deleted')
      expect(deletedCtx.stores.getTag(deletedCtx.session.id, {
        kind: 'tool-result',
        callId: 'call-deleted',
      })).toBeUndefined()
      const deleted = await expand(deletedCtx.stores, deletedCtx.session, { message: String(seeded.seq) })
      expectMessageFailure(deleted, 'tag no longer available')
    } finally {
      dispose(deletedCtx)
    }

    const noSourceCtx = context('mc-expand-message-no-source')
    try {
      const source = noSourceCtx.session.append('user/message', {
        id: 'mc-message-source',
        role: 'user',
        content: [{ type: 'text', text: 'not a tool result' }],
        source: { kind: 'user' },
      } as never, { surfaceOp: 'append' }).seq
      const placeholderSeq = noSourceCtx.session.append('tool/result', {
        turn: 1,
        step: 1,
        message: createToolResultMessage({
          callId: ToolCallId('call-message-lost'),
          content: dropPlaceholderContent(1),
          isError: false,
        }),
      }, { surfaceOp: 'append', sourceEventSeqs: [source] }).seq
      noSourceCtx.stores.allocateTag(noSourceCtx.session.id, {
        kind: 'tool-result',
        callId: 'call-message-lost',
      }, Date.now())
      noSourceCtx.stores.queueDrop(noSourceCtx.session.id, 1, Date.now())
      noSourceCtx.stores.markDropLanded(noSourceCtx.session.id, 1, placeholderSeq)
      const noSource = await expand(noSourceCtx.stores, noSourceCtx.session, { message: String(placeholderSeq) })
      expectMessageFailure(noSource, 'raw source unavailable')
    } finally {
      dispose(noSourceCtx)
    }
  })

  it('validates message syntax and locator exclusivity', async () => {
    const ctx = context('mc-expand-message-shape')
    try {
      for (const message of ['', '-1', '1,2', '1-2', ' 1', '1 ', '01', '+1', 'abc']) {
        const expanded = await expand(ctx.stores, ctx.session, { message })
        expect(expanded.text).toContain('message must be a non-negative decimal integer string')
      }
      const zero = await expand(ctx.stores, ctx.session, { message: '0' })
      expectMessageFailure(zero, 'no such message')
      const unsafe = await expand(ctx.stores, ctx.session, { message: '999999999999999999999999' })
      expect(unsafe.text).toContain('outside the safe integer range')

      const withTag = await expand(ctx.stores, ctx.session, { tag: '1', message: '1' })
      expect(withTag.text).toContain('pass either tag, tags, or message')
      const withTags = await expand(ctx.stores, ctx.session, { tags: '1', message: '1' })
      expect(withTags.text).toContain('pass either tag, tags, or message')
      const bothTags = await expand(ctx.stores, ctx.session, { tag: '1', tags: '1', message: '1' })
      expect(bothTags.text).toContain('pass either tag or tags, not both')

      // An empty optional string is "unset" when another locator is present.
      const emptyWithTag = await expand(ctx.stores, ctx.session, { tag: '1', message: '' })
      expect(emptyWithTag.text).toContain('no such tag')
      expect(emptyWithTag.text).not.toContain('not more than one')
      const emptyWithTags = await expand(ctx.stores, ctx.session, { tags: '1', message: '' })
      expect(emptyWithTags.text).toContain('no such tag')
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

      const byMessage = await expand(ctx.stores, undefined, { message: '1' })
      expectMessageFailure(byMessage, 'no-session')
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

describe('range locator', () => {
  it('validates bounds, presence, filler, and locator precedence', async () => {
    const ctx = context('mc-expand-range-parse')
    try {
      appendUser(ctx, 'live zero')
      const failures: Array<[ExpandArgs, string]> = [
        [{ start: '1' }, 'pass both start and end (DSH log event seq, inclusive)'],
        [{ start: '', end: '1' }, 'pass both start and end (DSH log event seq, inclusive)'],
        [{ start: '3', end: '1' }, 'start must not be greater than end'],
        [{ start: '01', end: '2' }, 'start must be a non-negative decimal integer string'],
        [{ start: '-1', end: '2' }, 'start must be a non-negative decimal integer string'],
        [{ start: '1.5', end: '2' }, 'start must be a non-negative decimal integer string'],
        [{ start: ' 1', end: '2' }, 'start must be a non-negative decimal integer string'],
        [{ start: '+1', end: '2' }, 'start must be a non-negative decimal integer string'],
        [{ start: '9007199254740992', end: '9007199254740992' }, 'start must be a non-negative decimal integer string'],
        [{ start: '1', end: '2', tag: '1' }, 'pass either tag, tags, message, or start/end, not more than one'],
        [{ start: '1', end: '2', tags: '1' }, 'pass either tag, tags, message, or start/end, not more than one'],
        [{ start: '1', end: '2', message: '1' }, 'pass either tag, tags, message, or start/end, not more than one'],
        [{ start: '1', end: '2', tag: '1', tags: '2' }, 'pass either tag, tags, message, or start/end, not more than one'],
        [{ start: '1', end: '2', verbose: 'yes' }, 'verbose must be a boolean'],
        [{ verbose: true }, 'verbose requires start and end'],
      ]
      for (const [args, reason] of failures) {
        expectRangeFailure(await expand(ctx.stores, ctx.session, args), reason)
      }
      const badVerbose = await expand(ctx.stores, ctx.session, { tag: '1', verbose: 'yes' })
      expect(badVerbose.text).toContain('verbose must be a boolean')

      // The zero/zero filler is ignored when a tag locator is present; a
      // genuine zero/zero range alone remains a range.
      const filler = await expand(ctx.stores, ctx.session, { tag: '1', start: '0', end: '0' })
      expect(filler.text).toContain('no such tag')
      expect(filler.text).not.toContain('pass either')
      const realZero = await expand(ctx.stores, ctx.session, { start: '0', end: '0' })
      expect((realZero.result as { ok?: boolean }).ok).toBe(true)
      expect(realZero.text).toContain('already on the live surface')
      const zeroVerbose = await expand(ctx.stores, ctx.session, { start: '0', end: '0', verbose: true })
      expect(zeroVerbose.text).toContain('already on the live surface')

      // Empty message/tag strings are absent when a range is present.
      expectRangeFailure(
        await expand(ctx.stores, ctx.session, { message: '', start: '1', end: '2' }),
        'no readable events in range 1-2',
      )
      expectRangeFailure(
        await expand(ctx.stores, ctx.session, { tag: '', start: '1', end: '2' }),
        'no readable events in range 1-2',
      )
      const emptyMessage = await expand(ctx.stores, ctx.session, { message: '' })
      expect(emptyMessage.text).toContain('message must be a non-negative decimal integer string')
      const ignoredVerbose = await expand(ctx.stores, ctx.session, { tag: '1', verbose: true })
      expect(ignoredVerbose.text).toContain('no such tag')
      expect(ignoredVerbose.text).not.toContain('verbose')
    } finally {
      dispose(ctx)
    }
  })

  it('renders user, assistant tool-call, and tool result once in ascending order', async () => {
    const ctx = context('mc-expand-range-render')
    try {
      const user = appendUser(ctx, 'hello range')
      const assistant = appendAssistant(ctx, [
        { type: 'reasoning', text: 'internal reasoning must not enter the transcript' },
        { type: 'text', text: 'checking the file' },
        { type: 'tool-call', id: ToolCallId('call-1'), name: 'read', arguments: '{"path":"x"}' },
      ])
      const call = appendToolCall(ctx, 'call-1', 'read')
      const result = appendToolResult(ctx, 'call-1', 'result body')
      shadowEvent(ctx, user)

      const expanded = await expand(ctx.stores, ctx.session, {
        start: String(user),
        end: String(result),
      })
      const payload = expanded.result as {
        ok?: boolean
        locator?: string
        events?: number[]
        content?: ContentBlock[]
      }
      expect(payload.ok).toBe(true)
      expect(payload.locator).toBe('range')
      expect(payload.events).toEqual([user, assistant, result])
      expect(payload.content?.every(block => block.type === 'text')).toBe(true)
      expect(expanded.text).toContain(`Events ${String(user)}-${String(result)} (3 events, 1 skipped):`)
      expect(expanded.text).toContain(`[${String(user)}] user/message`)
      expect(expanded.text).toContain('hello range')
      expect(expanded.text).toContain(`[${String(assistant)}] assistant/message`)
      expect(expanded.text).toContain('checking the file')
      expect(expanded.text).toContain(`[${String(assistant)}] tool call read (call-1)`)
      expect(expanded.text).toContain('{"path":"x"}')
      expect(expanded.text.match(/tool call read/g)).toHaveLength(1)
      expect(expanded.text).toContain(`[${String(result)}] tool/result read (call-1)`)
      expect(expanded.text).toContain('result body')
      expect(expanded.text).not.toContain('[compacted')
      expect(expanded.text).not.toContain('[tool-call]')
      expect(expanded.text).not.toContain('internal reasoning')
      expect('restored' in (expanded.result as object)).toBe(false)
      expect(expanded.text).not.toContain('assistant/attempt')
      // The standalone tool/call is counted as skipped, never rendered twice.
      expect(call).toBeGreaterThan(assistant)
    } finally {
      dispose(ctx)
    }
  })

  it('falls back to raw tool-call arguments when JSON parsing fails', async () => {
    const ctx = context('mc-expand-range-raw-args')
    try {
      const user = appendUser(ctx, 'raw args')
      const assistant = appendAssistant(ctx, [
        { type: 'tool-call', id: ToolCallId('call-raw'), name: 'read', arguments: 'not-json {' },
      ])
      shadowEvent(ctx, user)
      const expanded = await expand(ctx.stores, ctx.session, {
        start: String(user),
        end: String(assistant),
      })
      expect(expanded.text).toContain('not-json {')
    } finally {
      dispose(ctx)
    }
  })

  it('lets a range result be tagged, reduced, landed and expanded again', async () => {
    const ctx = context('mc-expand-range-lifecycle')
    try {
      const seeded = seedResult(ctx, 'call-range-life', 'lifecycle body')
      const placeholder = landDrop(ctx, 'call-range-life', seeded.tag, seeded.seq)
      shadowEvent(ctx, placeholder)
      const range = await expand(ctx.stores, ctx.session, {
        start: String(seeded.seq),
        end: String(Number(placeholder) + 1),
      })
      const rangeTag = ctx.stores.allocateTag(
        ctx.session.id,
        { kind: 'tool-result', callId: 'call-range-result' },
        Date.now(),
      )
      const rangeSeq = ctx.session.append('tool/result', {
        turn: 1,
        step: 1,
        message: createToolResultMessage({
          callId: ToolCallId('call-range-result'),
          content: tagToolResultContent(range.content, tagPrefix, rangeTag),
          isError: false,
        }),
      }, { surfaceOp: 'append' }).seq
      expect((await reduce(ctx.stores, ctx.session, String(rangeTag))).text).toContain(
        `Queued 1 tag for reclaim.`,
      )
      landDrop(ctx, 'call-range-result', rangeTag, rangeSeq)
      const again = await expand(ctx.stores, ctx.session, { tag: String(rangeTag) })
      expect(again.text).toContain('lifecycle body')
      expect(again.text).toContain('[dropped §1§]')
    } finally {
      dispose(ctx)
    }
  })

  it('counts excluded events as skipped but never seq gaps', async () => {
    const ctx = context('mc-expand-range-skipped')
    try {
      const user = appendUser(ctx, 'first')
      appendAttempt(ctx)
      appendToolCall(ctx, 'call-x', 'read')
      appendSystem(ctx, 'system-only instruction')
      appendCheckpoint(ctx, 'checkpoint body')
      appendNotice(ctx, 'plain plugin notice')
      appendCompactedUser(ctx, '[compacted §C9§]')
      appendDeveloper(ctx, 'developer instruction')
      appendUser(ctx, 'second')
      shadowEvent(ctx, user)

      const expanded = await expand(ctx.stores, ctx.session, {
        start: String(user),
        end: '100',
      })
      expect(expanded.text).toContain(`Events ${String(user)}-100 (2 events, 8 skipped):`)
      expect(expanded.text).toContain('first')
      expect(expanded.text).toContain('second')
      expect(expanded.text).not.toContain('assistant/attempt')
      expect(expanded.text).not.toContain('tool/call')
      expect(expanded.text).not.toContain('system-only instruction')
      expect(expanded.text).not.toContain('checkpoint body')
      expect(expanded.text).not.toContain('plain plugin notice')
      expect(expanded.text).not.toContain('developer instruction')
      expect(expanded.text).not.toContain('[compacted')
    } finally {
      dispose(ctx)
    }
  })

  it('treats start=end as one inclusive event and keeps dropped placeholders literal', async () => {
    const ctx = context('mc-expand-range-single')
    try {
      const seeded = seedResult(ctx, 'call-range-drop', 'drop body')
      const placeholder = landDrop(ctx, 'call-range-drop', seeded.tag, seeded.seq)
      shadowEvent(ctx, placeholder)
      const exact = await expand(ctx.stores, ctx.session, {
        start: String(placeholder),
        end: String(placeholder),
      })
      expect(exact.text).toContain(`Events ${String(placeholder)}-${String(placeholder)} (1 events, 0 skipped):`)
      expect(exact.text).toContain('[dropped §1§]')
      expect(exact.text).not.toContain('drop body')

      const whole = await expand(ctx.stores, ctx.session, {
        start: String(seeded.seq),
        end: String(Number(placeholder) + 1),
      })
      expect(whole.text).toContain('drop body')
      expect(whole.text).toContain('[dropped §1§]')
      expect(whole.text).not.toContain('Content restored')
    } finally {
      dispose(ctx)
    }
  })

  it('journals range reads and live-surface reads without restore fields', async () => {
    const ctx = context('mc-expand-range-journal')
    try {
      const rows: unknown[][] = []
      const journal = { info: (...args: unknown[]) => { rows.push(args) } }
      const user = appendUser(ctx, 'journal live')
      const live = await expand(ctx.stores, ctx.session, { start: String(user), end: String(user) }, journal)
      expect(live.text).toContain('already on the live surface')
      expect(rows).toHaveLength(1)
      expect(rows[0]![0]).toBe('tool-call')
      expect(rows[0]![1]).toContain('ctx_expand: read 0 events (live surface)')
      expect((rows[0]![2] as { liveSurface?: boolean }).liveSurface).toBe(true)

      shadowEvent(ctx, user)
      const raw = await expand(ctx.stores, ctx.session, { start: String(user), end: String(user) }, journal)
      expect(raw.text).toContain('(1 events, 0 skipped)')
      expect(rows).toHaveLength(2)
      expect(rows[1]![1]).toContain('ctx_expand: read 1 event(s)')
      const data = rows[1]![2] as { locator?: string; events?: number[]; restored?: unknown }
      expect(data.locator).toBe('range')
      expect(data.events).toEqual([user])
      expect('restored' in data).toBe(false)
    } finally {
      dispose(ctx)
    }
  })

  it('returns a live-surface sentence instead of rereading live events', async () => {
    const ctx = context('mc-expand-range-live')
    try {
      const user = appendUser(ctx, 'already live')
      const expanded = await expand(ctx.stores, ctx.session, {
        start: String(user),
        end: String(user),
      })
      const payload = expanded.result as {
        ok?: boolean
        locator?: string
        events?: number[]
        restored?: unknown
        content?: ContentBlock[]
      }
      expect(payload.ok).toBe(true)
      expect(payload.locator).toBe('range')
      expect(payload.events).toEqual([])
      expect('restored' in payload).toBe(false)
      expect(expanded.text).toBe(
        `Events ${String(user)}-${String(user)} are already on the live surface; no raw history was read.`,
      )
      expect(payload.content).toHaveLength(1)
    } finally {
      dispose(ctx)
    }
  })

  it('bounds verbose previews and keeps full bodies out of the transcript', async () => {
    const ctx = context('mc-expand-range-verbose')
    try {
      const longUser = `user-${'x'.repeat(300)}`
      const longAssistant = `assistant-${'y'.repeat(250)}`
      const user = appendUser(ctx, longUser)
      const assistant = appendAssistant(ctx, [
        { type: 'text', text: longAssistant },
        { type: 'tool-call', id: ToolCallId('call-v'), name: 'read', arguments: '{"path":"v"}' },
      ])
      const result = appendToolResult(ctx, 'call-v', `result-${'z'.repeat(250)}`)
      shadowEvent(ctx, user)

      const expanded = await expand(ctx.stores, ctx.session, {
        start: String(user),
        end: String(result),
        verbose: true,
      })
      expect(expanded.text).toContain('(verbose; 3 events, 0 skipped)')
      expect(expanded.text).toContain('  • [text] result-')
      expect(expanded.text).toContain('  • [text]')
      expect(expanded.text).toContain('  • [tool-call] read (call-v)')
      expect(expanded.text).not.toContain(longUser)
      expect(expanded.text).not.toContain(longAssistant)
      expect(expanded.text).toContain('Recover a full dropped tool result with tag or message.')
      for (const part of expanded.text.split('\n').filter(line => line.includes('• [text]'))) {
        expect(Array.from(part.slice(part.indexOf(']') + 2)).length).toBeLessThanOrEqual(200)
      }
    } finally {
      dispose(ctx)
    }
  })

  it('truncates an oversized first event and stays inside the 15k budget', async () => {
    const ctx = context('mc-expand-range-budget')
    try {
      const user = appendUser(ctx, `huge-${'Q'.repeat(80_000)}`)
      shadowEvent(ctx, user)
      const expanded = await expand(ctx.stores, ctx.session, {
        start: String(user),
        end: String(user + 1),
      })
      expect(expanded.text).toContain('[event truncated]')
      expect(expanded.text).toContain(`Event ${String(user)} truncated at the budget`)
      expect(expanded.text).toContain('narrow start/end')
      expect(expanded.text).not.toContain('Call again with start=')
      expect(estimateTokens(expanded.text)).toBeLessThanOrEqual(15_000)
    } finally {
      dispose(ctx)
    }
  })

  it('truncates ordinary multi-event ranges and keeps verbose on the continuation', async () => {
    const ctx = context('mc-expand-range-continuation')
    try {
      const first = appendUser(ctx, 'small first event')
      const second = appendUser(ctx, `large-${'B'.repeat(70_000)}`)
      shadowEvent(ctx, first)
      shadowEvent(ctx, second)
      const expanded = await expand(ctx.stores, ctx.session, {
        start: String(first),
        end: String(second),
      })
      expect(expanded.text).toContain(
        `Truncated at event ${String(first)} (budget: ~15000 estimated tokens). Call again with start=${String(Number(first) + 1)} end=${String(second)}.`,
      )
      expect(expanded.text).not.toContain('verbose=true')
      expect(estimateTokens(expanded.text)).toBeLessThanOrEqual(15_000)

      const manyBlocks = Array.from({ length: 400 }, (_, index) => ({
        type: 'text' as const,
        text: `block ${String(index)} ${'x'.repeat(190)}`,
      }))
      const blocks = ctx.session.append('user/message', {
        id: 'mc-range-many-blocks',
        role: 'user',
        content: manyBlocks,
        source: { kind: 'user' },
      } as never, { surfaceOp: 'append' }).seq
      shadowEvent(ctx, blocks)
      const verbose = await expand(ctx.stores, ctx.session, {
        start: String(first),
        end: String(blocks),
        verbose: true,
      })
      expect(verbose.text).toMatch(
        new RegExp(`Truncated at event \\d+ \\(budget: ~15000 estimated tokens\\)\\. Call again with start=\\d+ end=${String(blocks)} verbose=true\\.`),
      )
    } finally {
      dispose(ctx)
    }
  })

  it('treats both empty range strings as a range error, not a tag payload', async () => {
    const ctx = context('mc-expand-range-empty')
    try {
      const expanded = await expand(ctx.stores, ctx.session, { start: '', end: '' })
      expectRangeFailure(expanded, 'start and end must both be provided')
    } finally {
      dispose(ctx)
    }
  })

  it('has no separate event-count cap', async () => {
    const ctx = context('mc-expand-range-count')
    try {
      const seqs: SessionSeq[] = []
      for (let index = 0; index < 70; index += 1) seqs.push(appendUser(ctx, `event ${String(index)}`))
      shadowEvent(ctx, seqs[0]!)
      const last = seqs[seqs.length - 1]!
      const expanded = await expand(ctx.stores, ctx.session, {
        start: String(seqs[0]),
        end: String(Number(last) + 1),
      })
      expect(expanded.text).toContain('(70 events, 1 skipped)')
      expect(expanded.text).toContain(`[${String(last)}] user/message`)
      expect(expanded.text).toContain('event 69')
      const verbose = await expand(ctx.stores, ctx.session, {
        start: String(seqs[0]),
        end: String(Number(last) + 1),
        verbose: true,
      })
      expect(verbose.text).toContain('(verbose; 70 events, 1 skipped)')
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
      let originalSeq: SessionSeq
      let placeholderSeq: SessionSeq
      try {
        const tag = first.allocateTag(session.id, { kind: 'tool-result', callId: 'call-1' }, Date.now())
        originalSeq = session.append('tool/result', {
          turn: 1,
          step: 1,
          message: createToolResultMessage({
            callId: ToolCallId('call-1'),
            content: tagToolResultContent([{ type: 'text', text: 'restart payload' }], tagPrefix, tag),
            isError: false,
          }),
        }, { surfaceOp: 'append' }).seq
        placeholderSeq = replaceToolResultContent(session, originalSeq, dropPlaceholderContent(tag))
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

        const byOriginal = await expand(second, replayed, { message: String(originalSeq) })
        expect(byOriginal.text).toBe('§1§ restart payload')
        const byPlaceholder = await expand(second, replayed, { message: String(placeholderSeq) })
        expect(byPlaceholder.text).toBe('§1§ restart payload')
        expect(second.dropState(session.id, 1)).toBe('landed')
        expect(second.listPendingDrops(session.id)).toEqual([])
      } finally {
        second.close()
      }
    } finally {
      rmSync(dataDir, { recursive: true, force: true })
    }
  })
})
