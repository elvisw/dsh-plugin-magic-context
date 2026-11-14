/**
 * The agent tools — Magic Context's ctx_reduce / ctx_expand onto the DSH
 * tool registry.
 *
 * The tool CONSTRUCTOR is resolved in this order:
 *  1. `config.defineTool` — host glue that resolved `@deepseek-ai/dsh-tools`
 *     natively (tests, in-tree glue);
 *  2. a dynamic `import('@deepseek-ai/dsh-tools')` — the normal path: the
 *     package is a hard dependency, so every install shape resolves it.
 *
 * When neither resolves, apply() aborts the mount loudly: the ctx_* tools are
 * the only entry for the agent's reduce marks, so a boot without them must not
 * half-run. (The former local `defineTool` reimplementation is gone — it was
 * reachable only while the harness packages were peers; they are pinned
 * dependencies now.)
 *
 * Semantics follow Magic Context's discipline: ctx_reduce only QUEUES marks
 * (a landing is a priced bust, so it waits for the execute band in pre-step
 * — never origins its own); ctx_expand RETURNS the original content as a new
 * tool result read from the persisted log (the old placeholder and its spent
 * tag stay untouched — contract D1, #13 A).
 */
import type { ContentBlock } from '@deepseek-ai/dsh-llm'
import type { ToolRunContext } from '@deepseek-ai/dsh-tools'
import type { Journal } from '../core/journal.ts'
import type { MemoryWriter } from '../core/memory-write.ts'
import { parseTagRanges } from '../core/policy.ts'
import type { AdapterStores } from '../core/stores.ts'
import {
  enumerateSurfaceToolResults,
  originalContentOfToolCall,
  toolResultAt,
  type SurfaceToolNode,
  type ToolCallOriginal,
} from './seams.ts'

/** One authored tool parameter: the JSON-schema keywords this package uses. */
export interface LocalToolParameter {
  readonly type: string
  readonly required?: boolean
  readonly enum?: readonly string[]
  readonly items?: LocalToolParameter
  readonly description?: string
}

/**
 * The subset of `defineTool`'s option shape this package authors, generic over
 * the tool's validated arguments.
 *
 * Arguments are checked at the tool boundary — by {@link defineToolLocal}
 * below, or by the host's own `defineTool` when the profile supplies one — so
 * inside a tool body they carry the declared type instead of an implicit
 * `any`. `exec` is the host's own `ToolRunContext`: the runtime always passes a
 * real one, and the structural stand-in this used to declare
 * (`{ session: { id: string } }`) is not assignable to the branded `Session`
 * the seam functions take.
 */
export interface LocalToolOptions<A = Record<string, unknown>> {
  readonly name: string
  readonly description: string
  readonly parameters: Record<string, LocalToolParameter>
  readonly output: {
    readonly schema: { readonly type: 'json' }
    readonly render: (args: A, value: unknown) => ContentBlock[]
  }
  readonly execute: (args: A, exec: ToolRunContext) => Promise<unknown>
}

/**
 * The call shape both tool builders answer to.
 *
 * `defineToolLocal` is a faithful subset of the host's `defineTool`, and the
 * host's builder accepts a wider option type; this names the subset the call
 * sites author, so they keep their contextual types. The seam used to read
 * `(options: never) => unknown`, which kept the two casts quiet but denied
 * every call site its parameter types — three "not assignable to never" errors
 * and twelve implicit-`any` errors that only appeared once the host types
 * became resolvable.
 */
export type LocalDefineTool = <A>(options: LocalToolOptions<A>) => unknown

export interface ToolBridgeDeps {
  readonly stores: AdapterStores
  /** Resolved constructor: `config.defineTool` or the dynamic import. Required — apply() fails loud without one. */
  readonly defineTool: LocalDefineTool
  /** Validation-period activity journal (optional). */
  readonly journal?: Journal
}

/** Probe for the loading-mode diagnostics: resolves the dynamic-import constructor. */
export function resolveDefineTool(): Promise<ToolBridgeDeps['defineTool']> {
  // The host builder takes its own (wider) option type; the seam names the
  // subset we author, so the call sites keep their parameter types.
  return import('@deepseek-ai/dsh-tools').then(module => module.defineTool as LocalDefineTool)
}

interface TagVerdict {
  readonly tag: number
  readonly ok: boolean
  readonly reason?: string
}

/**
 * The session id, when the host supplied a run context. A tool must never
 * throw because the context is missing (a host may call it bare): the memory
 * tool then answers without a session and leaves the recall decision to the
 * host's callback.
 */
function sessionIdOf(
  exec: { readonly agent?: { readonly session: { readonly id: string } } } | undefined,
): string | undefined {
  return exec?.agent?.session.id
}

function ackText(lines: string[]): ContentBlock[] {
  return [{ type: 'text', text: lines.join('\n') }]
}

/** One `ctx_expand` request after argument validation (contract Q3/D4). */
type ExpandRequest =
  | { readonly kind: 'tags'; readonly tags: readonly number[] }
  | { readonly kind: 'message'; readonly message: number }
  | { readonly reason: string }

/**
 * Resolve `tag` (canonical, single), `tags` (deprecated multi-tag alias), or
 * `message` (DSH log event seq; T3). A tag pair where either side is empty
 * counts as absent, so `{tag: ''}` reads as "nothing asked" rather than as
 * tag 0. `message` is present whenever the host supplied the field; invalid
 * values are refused, never trimmed into a valid number.
 */
function expandRequest(args: {
  readonly tag?: string
  readonly tags?: string
  readonly message?: string
}): ExpandRequest {
  const tag = typeof args.tag === 'string' ? args.tag.trim() : ''
  const tags = typeof args.tags === 'string' ? args.tags.trim() : ''
  if (tag !== '' && tags !== '') return { reason: 'pass either tag or tags, not both' }
  // An empty optional string is how a host often spells "unset" (tag/tags do
  // the same above). Ignore it only when another locator is present; alone it
  // is still an invalid `message`, not a silent fall-through to "no tag".
  if (args.message !== undefined && args.message !== '') {
    if (tag !== '' || tags !== '') {
      return { reason: 'pass either tag, tags, or message, not more than one' }
    }
    if (typeof args.message !== 'string' || !/^(?:0|[1-9]\d*)$/.test(args.message)) {
      return { reason: 'message must be a non-negative decimal integer string' }
    }
    const seq = Number(args.message)
    if (!Number.isSafeInteger(seq)) {
      return { reason: `"${args.message}" is outside the safe integer range` }
    }
    return { kind: 'message', message: seq }
  }
  if (tag === '' && tags === '') {
    if (args.message !== undefined) {
      return { reason: 'message must be a non-negative decimal integer string' }
    }
    return { reason: 'no tag given (pass tag: "N")' }
  }
  const source = tag !== '' ? tag : tags
  // Request order is the payload order (contract D4/Q3): "9,2" restores 9
  // first. Only this path keeps it; `ctx_reduce` stays ascending.
  const parsed = parseTagRanges(source, { preserveOrder: true })
  if (parsed.length === 0) return { reason: `"${source}" names no tag number` }
  if (tag !== '' && parsed.length !== 1) {
    return { reason: `"${source}" is not a single tag number (use tags for several)` }
  }
  return { kind: 'tags', tags: parsed }
}

/** The post-`getTag` gate shared by the tag and message locators. */
function restoreResolvedTag(
  deps: ToolBridgeDeps,
  sessionId: string,
  tag: number,
  original: ToolCallOriginal,
): { readonly content: ContentBlock[] } | { readonly reason: string } {
  const state = deps.stores.dropState(sessionId, tag)
  if (state === 'pending') return { reason: 'not dropped yet' }
  if (original.kind === 'missing-event') return { reason: 'tag no longer available' }
  // A landed drop has a placeholder event in the log; an emergency drop
  // bypassed the queue but left the same placeholder behind. The guard is
  // sound because the post-execute hook prefixes EVERY tagged tool result, so
  // an unprefixed, placeholder-shaped event can only be a drop.
  if (state !== 'landed' && original.droppedTag === undefined) {
    return { reason: 'not dropped' }
  }
  if (original.kind === 'missing-source') return { reason: 'raw source unavailable' }
  return { content: original.content }
}

/** One payload per restored tag, in request order (contract D4/Q3). */
function joinExpandPayloads(payloads: readonly (readonly ContentBlock[])[]): ContentBlock[] | undefined {
  if (payloads.length === 0) return undefined
  const blocks: ContentBlock[] = []
  for (const [index, content] of payloads.entries()) {
    // The separator is a block so non-text payloads are carried through
    // unchanged; a text-only projection reads `p1\n\n---\n\np2`.
    if (index > 0) blocks.push({ type: 'text', text: '\n\n---\n\n' })
    blocks.push(...content)
  }
  return blocks
}

export function defineCtxReduceTool(deps: ToolBridgeDeps): unknown {
  const defineTool = deps.defineTool
  return defineTool<{ readonly drop: string }>({
    name: 'ctx_reduce',
    description:
      'Mark conversation items you no longer need so their tokens are reclaimed. '
        + 'Pass tag IDs you saw on tool outputs: drop: "3-5, 1, 9". '
        + 'Marks are queued and land when the context manager opens its reclaim band; '
        + 'dropped tool outputs become `[dropped §N§]` placeholders. Nothing is lost: '
        + 'ctx_expand returns any original as a new result (the placeholder stays dropped).',
    parameters: { drop: { type: 'string', required: true } },
    output: {
      schema: { type: 'json' },
      render: (_args, value) => {
        const payload = value as { queued?: number[]; refused?: TagVerdict[] }
        const lines: string[] = []
        const queued = payload.queued ?? []
        // A count, not a list (MC 0.49.1 parity): the tags came from the agent's
        // own surface, so echoing them back is pure noise, and the noise grows
        // linearly with the batch. Refusals stay per-tag: each one is an
        // actionable failure the agent must not retry blindly.
        if (queued.length > 0) {
          lines.push(`Queued ${String(queued.length)} ${queued.length === 1 ? 'tag' : 'tags'} for reclaim.`)
        }
        for (const refused of payload.refused ?? []) {
          lines.push(`§${refused.tag}§ not queued: ${refused.reason ?? 'unavailable'}.`)
        }
        if (lines.length === 0) lines.push('Nothing queued.')
        return ackText(lines)
      },
    },
    async execute(args, exec) {
      const startedAt = Date.now()
      const sessionId = sessionIdOf(exec)
      if (sessionId === undefined) return { ok: false, queued: [], refused: [], reason: 'no-session' }
      const requested = parseTagRanges(args.drop)
      const nodes = enumerateSurfaceToolResults(exec.agent!.session, callId =>
        deps.stores.getTag(sessionId, { kind: 'tool-result', callId }))
      const queued: number[] = []
      const refused: TagVerdict[] = []
      const now = Date.now()
      for (const tag of requested) {
        // Durable lifecycle first (#13 A): a spent tag stays refused even when
        // its placeholder has left the live surface (historian publication), and
        // a queued tag is refused explicitly as `already queued` rather than
        // being written again.
        const state = deps.stores.dropState(sessionId, tag)
        if (state === 'landed') {
          refused.push({ tag, ok: false, reason: 'already dropped' })
          continue
        }
        if (state === 'pending') {
          refused.push({ tag, ok: false, reason: 'already queued' })
          continue
        }
        const node: SurfaceToolNode | undefined = nodes.find(candidate => candidate.tagNumber === tag)
        if (node === undefined) {
          refused.push({ tag, ok: false, reason: 'no such tool-output tag on the current surface' })
          continue
        }
        if (node.isPlaceholder) {
          // A drop the emergency band performed never entered the queue, so its
          // durable state is still `none`; the live placeholder is the record.
          refused.push({ tag, ok: false, reason: 'already dropped' })
          continue
        }
        deps.stores.queueDrop(sessionId, tag, now)
        queued.push(tag)
      }
      deps.journal?.info('tool-call', `ctx_reduce: queued ${String(queued.length)}, refused ${String(refused.length)}`, {
        tool: 'ctx_reduce',
        requested,
        queued,
        refused: refused.map(entry => ({ tag: entry.tag, reason: entry.reason })),
        ms: Date.now() - startedAt,
      }, sessionId)
      return { ok: true, queued, refused }
    },
  })
}

export function defineCtxExpandTool(deps: ToolBridgeDeps): unknown {
  const defineTool = deps.defineTool
  return defineTool<{ readonly tag?: string; readonly tags?: string; readonly message?: string }>({
    name: 'ctx_expand',
    description:
      'Restore previously dropped items in full. Pass tag: "3" — or the deprecated tags: "3, 7" alias. '
        + 'For a dropped item whose DSH log event seq is known, pass message: "21" (the original tool/result '
        + 'event or its `[dropped §N§]` placeholder; a `[compacted §C…§]` node is not accepted). The seq comes '
        + 'from the harness/UI/journal; the model normally sees only tags. '
        + 'The original content returns as this tool result; the old `[dropped §N§]` placeholder stays in place '
        + 'and its tag stays spent (drop the new result if you no longer need it).',
    parameters: {
      tag: { type: 'string', description: 'Canonical single tag, e.g. "3".' },
      tags: { type: 'string', description: 'Deprecated multi-tag alias, e.g. "3, 7".' },
      message: {
        type: 'string',
        description:
          'DSH log event seq of a dropped tool/result or its `[dropped §N§]` placeholder; '
            + 'not the original Magic Context message number; `[compacted §C…§]` is not accepted.',
      },
    },
    output: {
      schema: { type: 'json' },
      render: (_args, value) => {
        const payload = value as {
          restored?: number[]
          refused?: TagVerdict[]
          content?: ContentBlock[]
          reason?: string
        }
        const lines: string[] = []
        if (payload.reason !== undefined) lines.push(`ctx_expand refused: ${payload.reason}.`)
        for (const refused of payload.refused ?? []) {
          lines.push(`§${refused.tag}§ not restored: ${refused.reason ?? 'unavailable'}.`)
        }
        const content = payload.content ?? []
        if (content.length > 0) {
          // The payload IS the restored original. A partial multi-tag request
          // (deprecated `tags`) appends its refusals after the payload so a
          // successful single-tag result stays byte-identical to the original.
          return lines.length === 0
            ? [...content]
            : [...content, { type: 'text', text: `\n\n${lines.join('\n')}` }]
        }
        if (lines.length === 0) lines.push('Nothing restored.')
        return ackText(lines)
      },
    },
    async execute(args, exec) {
      const startedAt = Date.now()
      const sessionId = sessionIdOf(exec)
      if (sessionId === undefined) return { ok: false, restored: [], refused: [], reason: 'no-session' }
      const request = expandRequest(args)
      if ('reason' in request) {
        deps.journal?.info('tool-call', 'ctx_expand: restored 0, refused 0', {
          tool: 'ctx_expand',
          requested: [],
          restored: [],
          refused: [],
          reason: request.reason,
          ms: Date.now() - startedAt,
        }, sessionId)
        return { ok: false, restored: [], refused: [], reason: request.reason }
      }
      const session = exec.agent!.session
      if (request.kind === 'message') {
        const lookup = toolResultAt(session, request.message)
        if (lookup.kind === 'unknown') {
          deps.journal?.info('tool-call', 'ctx_expand: restored 0, refused 0', {
            tool: 'ctx_expand',
            requested: [],
            message: request.message,
            restored: [],
            refused: [],
            reason: 'no such message',
            ms: Date.now() - startedAt,
          }, sessionId)
          return { ok: false, restored: [], refused: [], reason: 'no such message' }
        }
        if (lookup.kind === 'not-tool-result') {
          deps.journal?.info('tool-call', 'ctx_expand: restored 0, refused 0', {
            tool: 'ctx_expand',
            requested: [],
            message: request.message,
            restored: [],
            refused: [],
            reason: 'not a tool-result message',
            ms: Date.now() - startedAt,
          }, sessionId)
          return { ok: false, restored: [], refused: [], reason: 'not a tool-result message' }
        }
        const original = originalContentOfToolCall(session, lookup.callId)
        const registeredTag = deps.stores.getTag(sessionId, { kind: 'tool-result', callId: lookup.callId })
        // A message may point at the original event while the same call also
        // has a placeholder; the call-level droppedTag is the evidence, not the
        // shape of the event the caller named.
        const callDroppedTag = original.kind === 'missing-event' ? undefined : original.droppedTag
        const tag = registeredTag ?? callDroppedTag
        if (tag === undefined) {
          deps.journal?.info('tool-call', 'ctx_expand: restored 0, refused 0', {
            tool: 'ctx_expand',
            requested: [],
            message: request.message,
            restored: [],
            refused: [],
            reason: 'not a tool-result tag',
            ms: Date.now() - startedAt,
          }, sessionId)
          return { ok: false, restored: [], refused: [], reason: 'not a tool-result tag' }
        }
        if (registeredTag === undefined) {
          deps.journal?.info('tool-call', 'ctx_expand: restored 0, refused 0', {
            tool: 'ctx_expand',
            requested: [],
            message: request.message,
            restored: [],
            refused: [],
            reason: 'tag no longer available',
            ms: Date.now() - startedAt,
          }, sessionId)
          return { ok: false, restored: [], refused: [], reason: 'tag no longer available' }
        }
        const outcome = restoreResolvedTag(deps, sessionId, tag, original)
        if ('reason' in outcome) {
          deps.journal?.info('tool-call', 'ctx_expand: restored 0, refused 0', {
            tool: 'ctx_expand',
            requested: [],
            message: request.message,
            restored: [],
            refused: [],
            reason: outcome.reason,
            ms: Date.now() - startedAt,
          }, sessionId)
          return { ok: false, restored: [], refused: [], reason: outcome.reason }
        }
        deps.journal?.info('tool-call', 'ctx_expand: restored 1, refused 0', {
          tool: 'ctx_expand',
          requested: [],
          message: request.message,
          restored: [tag],
          refused: [],
          ms: Date.now() - startedAt,
        }, sessionId)
        return { ok: true, restored: [tag], refused: [], content: outcome.content }
      }
      // Resolve the tag's persisted call identity — no live placeholder is
      // required, so a historian-published or restarted session reads the same
      // original from the log (contract D1.4, E4).
      const records = new Map(deps.stores.listTags(sessionId).map(record => [record.tagNumber, record]))
      const restored: number[] = []
      const refused: TagVerdict[] = []
      const payloads: ContentBlock[][] = []
      for (const tag of request.tags) {
        const record = records.get(tag)
        if (record === undefined) {
          // Tag numbers are per-session (contract D5). The global index names a
          // foreign owner only when this session has no tag records at all: once
          // it holds any tag of its own, its numbering is live, so a number it
          // never used is a typo, not a handle from another session.
          const crossSession = records.size === 0
            && deps.stores.tagSessions(tag).some(other => other !== sessionId)
          refused.push({ tag, ok: false, reason: crossSession ? 'cross-session tag' : 'no such tag' })
          continue
        }
        if (record.target.kind !== 'tool-result') {
          refused.push({ tag, ok: false, reason: 'not a tool-result tag' })
          continue
        }
        const original = originalContentOfToolCall(session, record.target.callId)
        const outcome = restoreResolvedTag(deps, sessionId, tag, original)
        if ('reason' in outcome) {
          refused.push({ tag, ok: false, reason: outcome.reason })
          continue
        }
        payloads.push(outcome.content)
        restored.push(tag)
      }
      const content = joinExpandPayloads(payloads)
      deps.journal?.info('tool-call', `ctx_expand: restored ${String(restored.length)}, refused ${String(refused.length)}`, {
        tool: 'ctx_expand',
        requested: request.tags,
        restored,
        refused: refused.map(entry => ({ tag: entry.tag, reason: entry.reason })),
        ms: Date.now() - startedAt,
      }, sessionId)
      return { ok: true, restored, refused, ...content === undefined ? {} : { content } }
    },
  })
}

/**
 * `ctx_memory` — read/write access to the plugin's own corpus (memories.db).
 *
 * Reads (list/get) recall project memories, including domain-shared rows.
 * Writes (write/update/archive/merge) reproduce the corpus write contract —
 * normalized hash, dedup bump, mutation log — so every consumer keeps
 * agreeing about the same rows; every failure is a structured
 * `{ok:false, reason}` refusal, never a thrown error.
 */
export interface MemoryToolDeps {
  readonly defineTool: ToolBridgeDeps['defineTool']
  readonly journal?: Journal
  /**
   * Recall callback. The second argument is the tool's run context: a host that
   * scopes recall by `config.memory.project ?? session cwd` needs it, because
   * the request alone carries no session information. `request.identity` is the
   * identity this tool already resolved, so a host can also scope by that and
   * never inspect the context at all.
   */
  readonly recall?: (
    request: MemoryToolRecallRequest,
    exec?: MemoryToolRunContext,
  ) => {
    readonly lines: readonly string[]
    readonly digest: string
    /**
     * Ids of the memory rows this recall returned, when the host can report
     * them. `ctx_memory` then bumps `retrieval_count` for exactly those rows
     * (contract §9.1, Magic Context `search.ts:2258-2276`): explicit
     * agent-driven retrieval counts, automatic m[0]/m[1] surfacing does not.
     * Absent = no telemetry, which is always safe: the count is not correctness.
     */
    readonly ids?: readonly number[]
    /**
     * Why nothing could be recalled (fenced / unavailable store), when the host
     * knows. Reported only when the recall produced no lines, so a working store
     * never grows a reason; without it a fenced store would silently answer
     * `{ empty: true }` and the agent could not tell an empty pool from a
     * read-only downgrade.
     */
    readonly reason?: string
  } | undefined
  /**
   * Absent when memory writes are disabled: the tool then stays read-only.
   * Writes replicate Magic Context's storage contract instead of forking it,
   * and a module-managed project is never written directly.
   */
  readonly writer?: MemoryWriter
  /**
   * A2: the memory ids this session's injected block currently renders
   * (MC getVisibleMemoryIds). Absent = no suppression (fail-open).
   */
  readonly visibleMemoryIdsOf?: (exec?: MemoryToolRunContext) => ReadonlySet<number> | undefined
  /**
   * The hybrid memory search lane (MC ctx_search's memory half): FTS5 +
   * stored-vector cosine with MC's 0.7/0.3 fusion. Read-only — it works even
   * when `writer` is absent, and §9.1 counting applies to its returned ids.
   */
  readonly search?: (request: {
    readonly query: string
    readonly limit?: number
    readonly identity: string
    /** A2: memory ids already rendered in this session's injected block. */
    readonly visibleMemoryIds?: ReadonlySet<number>
    /** A3: created_at window, epoch ms (inclusive both ends). */
    readonly from?: number
    readonly to?: number
  }) => Promise<
    | {
      readonly ok: true
      readonly text: string
      readonly hits: readonly { readonly id: number }[]
    }
    | { readonly ok: false; readonly reason: string }
  >
  /** Resolves the session's `git:`/`dir:` identity for scoped writes. */
  readonly resolveIdentity?: (
    exec: { agent?: { session: { header: { cwd?: string } } } } | undefined,
  ) => string | undefined
  /**
   * Human approval for global-domain candidates (machine + org alike): raises
   * one `ctx.userQuestions` card per pending candidate and publishes only the
   * approved ones. Absent = not wired (headless): the action reports that and
   * touches no state.
   */
  readonly reviewGlobal?: (exec?: MemoryToolRunContext) => Promise<{ outcome: string; detail?: string }>
  /**
   * One-shot promotion (the `promote` action): enqueue one project memory into
   * a global domain's pending pool and IMMEDIATELY raise its approval card —
   * the human-judged lane with no recurrence gate, so a single fresh write can
   * be shared the moment the user asks for it. Absent = not wired: the action
   * reports that and touches no state.
   */
  readonly promoteGlobal?: (input: {
    readonly memoryId: number
    /** Short name (`machine`/`org`) or full `dir:global:*` identity; default org. */
    readonly domain?: string
  }, exec?: MemoryToolRunContext) => Promise<{ outcome: string; detail?: string }>
  /**
   * Resolves an EXPLICIT project spec (absolute path or `git:`/`dir:` identity)
   * to an identity — the `project` argument's resolver. DSH has no OpenCode-style
   * per-turn working directory, so cross-project facts can only be scoped by the
   * model naming the project; the same normalizer keeps every writer agreeing.
   */
  readonly resolveIdentityOf?: (spec: string) => string | undefined
}

/** What `ctx_memory` asks the host to recall (contract §11.6). */
export interface MemoryToolRecallRequest {
  readonly query?: string
  /** Row cap; the host applies its own policy limit when absent. */
  readonly limit?: number
  /**
   * The session's resolved project identity, when one could be resolved. Hosts
   * whose `recall` callback has no session access use this as the scope.
   */
  readonly identity?: string
}

/** The run-context surface `ctx_memory` reads (structural subset of ToolRunContext). */
export interface MemoryToolRunContext {
  readonly agent?: {
    readonly session: {
      readonly id?: string
      readonly header?: { readonly cwd?: string }
    }
  }
}

export function defineCtxMemoryTool(deps: MemoryToolDeps): unknown {
  const defineTool = deps.defineTool
  /**
   * The session's project identity, which every write must carry: Magic Context
   * only lets an agent mutate its own project's memories.
   */
  const identityFor = (exec: unknown): string | undefined => {
    try {
      return deps.resolveIdentity?.(exec as Parameters<NonNullable<MemoryToolDeps['resolveIdentity']>>[0])
    } catch {
      return undefined
    }
  }
  return defineTool<Record<string, unknown>>({
    name: 'ctx_memory',
    description:
      'Read and maintain the project memory store (shared with the other coding agents on this machine): '
        + 'durable facts, constraints, configuration values and naming rules. '
        + 'Actions: list (optionally with query), search (hybrid keyword+semantic retrieval over the pool, '
        + 'optionally bounded by from/to dates), '
        + 'get (by id), write (new memory), update (rewrite one), '
        + 'archive (retire one, optionally superseded by another), merge (fold duplicates into one), '
        + 'review_global (present pending global-domain candidates — the work and global audiences — to the user as '
        + 'approval cards, one at a time; an approved candidate is published into the shared domain), '
        + 'promote (memory_id + optional domain machine|org — machine is the GLOBAL domain every project on '
        + 'this machine sees, org is the WORK domain limited to its member projects: enqueue one project memory '
        + 'into that domain and IMMEDIATELY raise its approval card — approved publishes, rejected retires it for '
        + 'good; the human-judged lane with no recurrence gate, so a single fresh write can be shared '
        + 'right away). '
        + 'Writes are scoped to this project and deduplicated by normalized content. '
        + 'Every action accepts an optional project (an absolute path or git root): use it when the '
        + 'memory belongs to ANOTHER project than the one this session was opened in — reading a '
        + "project's memories or writing facts about it while you work on it from a different session.",
    parameters: {
      action: { type: 'string', enum: ['list', 'search', 'get', 'write', 'update', 'archive', 'merge', 'review_global', 'promote'] },
      query: { type: 'string' },
      limit: { type: 'integer' },
      from: { type: 'string' },
      to: { type: 'string' },
      id: { type: 'integer' },
      ids: { type: 'array', items: { type: 'integer' } },
      category: { type: 'string' },
      content: { type: 'string' },
      importance: { type: 'integer' },
      reason: { type: 'string' },
      superseded_by: { type: 'integer' },
      target_id: { type: 'integer' },
      project: { type: 'string' },
      memory_id: { type: 'integer' },
      domain: { type: 'string' },
    },
    output: {
      schema: { type: 'json' },
      render: (_args, value) => {
        const payload = value as {
          lines?: string[]
          digest?: string
          empty?: boolean
          reason?: string
          action?: string
          outcome?: string
          detail?: string
          /** `search` action: the rendered hits line. */
          search?: string
          /** `search` action: how many rows the query matched. */
          hits?: number
          memory?: { id: number; category: string; content: string; importance: number }
        }
        if (payload.reason !== undefined) return ackText([`Memory store unavailable: ${payload.reason}`])
        if (payload.search !== undefined) return ackText([String(payload.search)])
        if (payload.outcome !== undefined) {
          return ackText([payload.outcome, ...payload.detail === undefined ? [] : [payload.detail]])
        }
        if (payload.memory !== undefined) {
          return ackText([
            `Memory ${String(payload.memory.id)} [${payload.memory.category}] (importance ${String(payload.memory.importance)}):`,
            payload.memory.content,
          ])
        }
        if (payload.empty === true || payload.lines === undefined || payload.lines.length === 0) {
          return ackText(['No matching project memories.'])
        }
        return ackText([
          `Project memories (${String(payload.lines.length)} shown):`,
          ...payload.lines,
        ])
      },
    },
    async execute(args, exec) {
      const startedAt = Date.now()
      const sessionId = sessionIdOf(exec)
      const action = typeof args.action === 'string' ? args.action : 'list'
      // Effective scope: the session's project unless the model names another
      // one via `project`. An unresolvable spec is a structured refusal — the
      // model then knows the write/read did NOT happen under some guessed scope.
      const explicitProject = typeof args.project === 'string' && args.project.trim() !== ''
        ? args.project.trim()
        : undefined
      let identity = identityFor(exec)
      const finish = (payload: Record<string, unknown>): Record<string, unknown> => {
        const summary = payload.outcome
          ?? (payload.memory !== undefined
            ? `memory ${(payload.memory as { id: number }).id}`
            : payload.search !== undefined
              ? `search: ${String(payload.hits ?? 0)} result(s)`
              : `${String((payload.lines as string[] | undefined)?.length ?? 0)} line(s)`)
        deps.journal?.info('tool-call', `ctx_memory ${action}: ${String(summary)}`, {
          tool: 'ctx_memory',
          action,
          identity,
          ...explicitProject === undefined ? {} : { explicitProject },
          query: args.query,
          id: args.id,
          // The panel's read row shows the hit count (`detail.hits`); without it
          // a search record could only say "search".
          ...typeof payload.hits === 'number' ? { hits: payload.hits } : {},
          ms: Date.now() - startedAt,
          ok: typeof payload.ok === 'boolean' ? payload.ok : payload.reason === undefined,
        }, sessionId)
        return payload
      }
      if (explicitProject !== undefined) {
        let resolved: string | undefined
        if (explicitProject.startsWith('git:') || explicitProject.startsWith('dir:')) {
          resolved = explicitProject
        } else {
          try {
            resolved = deps.resolveIdentityOf?.(explicitProject)
          } catch {
            resolved = undefined
          }
        }
        if (resolved === undefined || resolved === '') {
          return finish({
            outcome: `project "${explicitProject}" could not be resolved to a project identity `
              + '(directory missing, or not inside a git repository and not an identity string). '
              + 'Nothing was read or written.',
            ok: false,
          })
        }
        identity = resolved
      }

      if (action === 'review_global') {
        if (deps.reviewGlobal === undefined) {
          return finish({ reason: 'global review is not wired in this host' })
        }
        const result = await deps.reviewGlobal(exec as MemoryToolRunContext)
        return finish(result)
      }

      if (action === 'promote') {
        if (deps.promoteGlobal === undefined) {
          return finish({ reason: 'global promotion is not wired in this host' })
        }
        if (typeof args.memory_id !== 'number' || !Number.isInteger(args.memory_id)) {
          return finish({
            outcome: 'promote needs an integer memory_id (the project memory to enqueue for approval). '
              + 'Nothing was promoted.',
            ok: false,
          })
        }
        const domain = typeof args.domain === 'string' && args.domain.trim() !== '' ? args.domain.trim() : undefined
        const result = await deps.promoteGlobal({ memoryId: args.memory_id, ...(domain === undefined ? {} : { domain }) },
          exec as MemoryToolRunContext)
        return finish(result)
      }

      if (action === 'list' || (action === 'get' && args.id === undefined)) {
        const recall = deps.recall
        if (recall === undefined) {
          return finish({ reason: 'memory recall is not wired in this host' })
        }
        // The run context goes to the host alongside the request: a host whose
        // recall callback scopes by `config.memory.project ?? session cwd` has
        // no other way to see the session (index.ts), and `identity` is the
        // identity this tool already resolved for the same purpose. The two
        // model-supplied fields are narrowed here: `args` is the validated
        // argument record, and a `query`/`limit` of the wrong type must not
        // reach the host's recall as a non-string / non-number.
        const query = typeof args.query === 'string' ? args.query : undefined
        const limit = typeof args.limit === 'number' ? args.limit : undefined
        const result = recall({
          ...query === undefined ? {} : { query },
          ...limit === undefined ? {} : { limit },
          ...identity === undefined ? {} : { identity },
        }, exec as MemoryToolRunContext)
        if (result === undefined) return finish({ empty: true })
        // A store the host could not read at all (fenced schema, unreadable file)
        // must say so: `{ empty: true }` would read as "your project has no
        // memories", which is a different fact.
        if (result.lines.length === 0 && result.reason !== undefined) {
          return finish({ reason: result.reason })
        }
        // Retrieval telemetry (contract §9.1): the agent explicitly searched here,
        // so the rows it received are counted. Telemetry is never correctness, so
        // a fenced / authority-blocked / failing store is swallowed and the agent
        // still gets its lines. An automatic injection path must NOT reach here.
        const recalledIds = result.ids
        if (recalledIds !== undefined && recalledIds.length > 0 && identity !== undefined) {
          try {
            deps.writer?.recordRetrieval({ identity, ids: [...recalledIds] })
          } catch {
            // never fail a read because a counter could not be bumped
          }
        }
        return finish({ lines: [...result.lines], digest: result.digest })
      }

      if (action === 'search') {
        const query = typeof args.query === 'string' ? args.query.trim() : ''
        if (query.length === 0) return finish({ outcome: 'search needs a query.' })
        if (deps.search === undefined) {
          return finish({ reason: 'memory search is not wired in this host' })
        }
        if (identity === undefined) {
          return finish({ reason: 'no project identity could be resolved for this session' })
        }
        // A3: `from`/`to` accept an ISO date (YYYY-MM-DD, local midnight /
        // end-of-day) or epoch milliseconds; invalid values are ignored.
        const parseBound = (raw: unknown, endOfDay: boolean): number | undefined => {
          if (typeof raw === 'number' && Number.isFinite(raw)) return raw
          if (typeof raw !== 'string') return undefined
          const ms = Date.parse(/^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : raw)
          if (Number.isNaN(ms)) return undefined
          return endOfDay ? ms + 24 * 3600 * 1000 - 1 : ms
        }
        const from = parseBound(args.from, false)
        const to = parseBound(args.to, true)
        const visibleMemoryIds = deps.visibleMemoryIdsOf?.(exec)
        const outcome = await deps.search({
          query,
          ...args.limit === undefined ? {} : { limit: args.limit as number },
          identity,
          ...visibleMemoryIds === undefined ? {} : { visibleMemoryIds },
          ...from === undefined ? {} : { from },
          ...to === undefined ? {} : { to },
        })
        if (!outcome.ok) return finish({ reason: outcome.reason })
        // Retrieval telemetry (contract §9.1): an explicit search counts, in
        // MC only through ctx_search — the same rule, same call shape.
        if (outcome.hits.length > 0) {
          try {
            deps.writer?.recordRetrieval({ identity, ids: outcome.hits.map(hit => hit.id) })
          } catch {
            // never fail a read because a counter could not be bumped
          }
        }
        return finish({ search: outcome.text, hits: outcome.hits.length })
      }

      // Every remaining action writes (or reads one row by id) and needs the
      // writer plus a resolved identity.
      const writer = deps.writer
      if (writer === undefined) {
        return finish({ reason: 'memory writes are disabled (memory.enabled / memory.write)' })
      }
      if (identity === undefined) {
        return finish({ reason: 'no project identity could be resolved for this session' })
      }

      if (action === 'get') {
        const row = writer.getMemory(identity, args.id as number)
        if (row === undefined) return finish({ outcome: `No memory ${String(args.id)} in this project.` })
        // Contract §9.1: a single-row get does NOT count as a retrieval — only
        // explicit list/query searches do (MC search.ts:2258-2281: "a row read
        // is not a search"). Pinned by memory-retrieval-wiring.spec.ts.
        return finish({
          memory: { id: row.id, category: row.category, content: row.content, importance: row.importance ?? 50 },
        })
      }
      if (action === 'write') {
        if (typeof args.content !== 'string' || typeof args.category !== 'string') {
          return finish({ outcome: 'write needs both category and content.' })
        }
        const result = writer.writeMemory({
          identity,
          category: args.category,
          content: args.content,
          ...args.importance === undefined ? {} : { importance: args.importance as number },
          ...sessionId === undefined ? {} : { sessionId },
        })
        if (!result.ok) return finish({ outcome: `write refused (${result.reason}).`, detail: result.detail })
        return finish({
          outcome: result.created === false
            ? `Already known (memory ${String(result.id)}, seen ${String(result.seenCount ?? 0)} times).`
            : `Saved as memory ${String(result.id)} [${args.category}].`,
        })
      }
      if (action === 'update') {
        if (args.id === undefined || typeof args.content !== 'string') {
          return finish({ outcome: 'update needs id and content.' })
        }
        const result = writer.updateMemory({
          identity,
          id: args.id as number,
          content: args.content,
          ...args.category === undefined ? {} : { category: args.category as string },
          ...args.importance === undefined ? {} : { importance: args.importance as number },
        })
        if (!result.ok) return finish({ outcome: `update refused (${result.reason}).`, detail: result.detail })
        return finish({ outcome: `Updated memory ${String(result.id)}.` })
      }
      if (action === 'archive') {
        if (args.id === undefined) return finish({ outcome: 'archive needs id.' })
        const result = writer.archiveMemory({
          identity,
          id: args.id as number,
          ...args.reason === undefined ? {} : { reason: args.reason as string },
          ...args.superseded_by === undefined ? {} : { supersededBy: args.superseded_by as number },
        })
        if (!result.ok) return finish({ outcome: `archive refused (${result.reason}).`, detail: result.detail })
        return finish({ outcome: `Archived memory ${String(result.id)}.` })
      }
      if (action === 'merge') {
        const target = (args.target_id ?? args.id) as number | undefined
        const sources = (args.ids ?? []) as number[]
        if (target === undefined || sources.length === 0 || typeof args.content !== 'string') {
          return finish({ outcome: 'merge needs target_id, ids and the merged content.' })
        }
        const result = writer.mergeMemory({
          identity,
          targetId: target,
          sourceIds: sources,
          content: args.content,
          ...args.category === undefined ? {} : { category: args.category as string },
        })
        if (!result.ok) return finish({ outcome: `merge refused (${result.reason}).`, detail: result.detail })
        return finish({
          outcome: `Merged ${String(result.superseded.length)} row(s) into memory ${String(result.id)}.`,
        })
      }
      return finish({ outcome: `Unknown action "${action}".` })
    },
  })
}
