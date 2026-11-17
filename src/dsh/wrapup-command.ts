/**
 * `/ctx-wrapup` — queue a manual live-history compaction for the next
 * pre-step. The command never calls the model and never mutates the surface;
 * the forced pass owns the historian, drop landing, wire repair and publish so
 * it can reuse the normal execute inputs (route/effort, memories, profile and
 * baseline watermarks).
 */
import type { Context } from '@deepseek-ai/cordis'
import type { Session } from '@deepseek-ai/dsh-session'
import type { AdapterStores } from '../core/stores.ts'
import { errText } from '../core/types.ts'
import type { SurfaceNode } from './seams.ts'
import {
  historianSpanBounds,
  isHistorianSkippableNode,
} from './historian.ts'
import { enumerateSurfaceNodes } from './seams.ts'

type CommandRegistrar = {
  register(definition: {
    name: string
    description: string
    input?: { hint: string }
    handler: (invocation: {
      readonly rawInput?: string
      readonly agent?: { readonly session?: Session }
    }) => { kind: 'success'; text?: string } | { kind: 'error'; text: string }
  }): unknown
}

export const WRAPUP_DEFAULT_KEEP = 20
export const WRAPUP_MAX_KEEP = 1000
export const WRAPUP_MAX_ATTEMPTS = 3

export interface WrapupMarker {
  readonly keep: number
  readonly requestedAt: number
  readonly attempts: number
  readonly compartmentIds: readonly number[]
  /** Counts captured when the compartment ID was stored, for the pass row. */
  readonly retainedEligible?: number
  readonly compactedEntries?: number
}

export interface WrapupRange {
  readonly prefix: readonly SurfaceNode[]
  readonly retained: readonly SurfaceNode[]
  readonly retainedEligible: number
  /** Physical surface entries in the compacted prefix (not the eligible subset). */
  readonly compactedEntries: number
}

export function wrapupMarkerKey(sessionId: string): string {
  return `wrapup_request:${sessionId}`
}

function validKeep(value: unknown): value is number {
  return typeof value === 'number'
    && Number.isSafeInteger(value)
    && value >= 1
    && value <= WRAPUP_MAX_KEEP
}

function validCompartmentIds(value: unknown): value is number[] {
  return Array.isArray(value)
    && value.every(id => typeof id === 'number' && Number.isSafeInteger(id) && id > 0)
}

/**
 * Read the marker. Anything outside the closed schema is treated as absent:
 * `keep` must be in range and `requestedAt` must be a finite number because
 * adoption uses it to distinguish a pre-existing compartment.
 */
export function readWrapupMarker(
  stores: AdapterStores,
  sessionId: string,
): WrapupMarker | undefined {
  const raw = stores.getMeta(wrapupMarkerKey(sessionId))
  if (raw === undefined || raw === '') return undefined
  try {
    const parsed = JSON.parse(raw) as unknown
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
      stores.setMeta(wrapupMarkerKey(sessionId), '')
      return undefined
    }
    const row = parsed as Record<string, unknown>
    if (
      !validKeep(row.keep)
      || typeof row.requestedAt !== 'number'
      || !Number.isFinite(row.requestedAt)
      || typeof row.attempts !== 'number'
      || !Number.isSafeInteger(row.attempts)
      || row.attempts < 0
      || !validCompartmentIds(row.compartmentIds)
      || (row.retainedEligible !== undefined
        && (typeof row.retainedEligible !== 'number'
          || !Number.isSafeInteger(row.retainedEligible)
          || row.retainedEligible < 0))
      || (row.compactedEntries !== undefined
        && (typeof row.compactedEntries !== 'number'
          || !Number.isSafeInteger(row.compactedEntries)
          || row.compactedEntries < 0))
    ) {
      stores.setMeta(wrapupMarkerKey(sessionId), '')
      return undefined
    }
    return {
      keep: row.keep,
      requestedAt: row.requestedAt,
      attempts: row.attempts,
      compartmentIds: row.compartmentIds,
      ...row.retainedEligible === undefined ? {} : { retainedEligible: row.retainedEligible as number },
      ...row.compactedEntries === undefined ? {} : { compactedEntries: row.compactedEntries as number },
    }
  } catch {
    stores.setMeta(wrapupMarkerKey(sessionId), '')
    return undefined
  }
}

export function writeWrapupMarker(stores: AdapterStores, sessionId: string, marker: WrapupMarker): void {
  stores.setMeta(wrapupMarkerKey(sessionId), JSON.stringify(marker))
}

export function clearWrapupMarker(stores: AdapterStores, sessionId: string): void {
  stores.setMeta(wrapupMarkerKey(sessionId), '')
}

export function parseWrapupKeep(raw: string | undefined): number | string {
  const text = (raw ?? '').trim()
  if (text.length === 0) return WRAPUP_DEFAULT_KEEP
  if (!/^\d+$/.test(text)) {
    return `Magic Context: /ctx-wrapup takes an integer 1..${String(WRAPUP_MAX_KEEP)} (messages/entries to keep).`
  }
  const keep = Number(text)
  if (!validKeep(keep)) {
    return `Magic Context: /ctx-wrapup takes an integer 1..${String(WRAPUP_MAX_KEEP)} (messages/entries to keep).`
  }
  return keep
}

function blocksWrapupMiddle(
  node: SurfaceNode,
  covered: ReadonlySet<number>,
  baselineNodeSeq?: number,
): boolean {
  if (node.role === 'system' || node.seq === baselineNodeSeq || covered.has(node.seq)) return true
  // [dropped §N§] is allowed: the forced pass lands drops before the historian,
  // so the digest may legitimately see that placeholder. Compacted/checkpoint
  // spans are already claimed by another compartment and must not be re-digested.
  return /^\[(?:compacted|checkpoint) §/.test(node.text.trim())
}

/**
 * Select the prefix to compact and the tail to retain. `keep` counts eligible
 * surface entries; the final cut is the historian's tool-pairing boundary.
 */
export function planWrapupRange(input: {
  readonly nodes: readonly SurfaceNode[]
  readonly keep: number
  readonly covered: ReadonlySet<number>
  readonly baselineNodeSeq?: number
}): WrapupRange | undefined {
  const { nodes, keep, covered, baselineNodeSeq } = input
  if (!validKeep(keep) || nodes.length === 0) return undefined
  const eligibleFromTail: number[] = []
  for (let index = nodes.length - 1; index >= 0; index -= 1) {
    const node = nodes[index] as SurfaceNode
    if (!isHistorianSkippableNode(node, covered, baselineNodeSeq)) eligibleFromTail.push(index)
  }
  if (eligibleFromTail.length <= keep) return undefined
  // The (keep + 1)-th eligible entry from the tail is the last compacted node.
  const pivot = eligibleFromTail[keep]
  if (pivot === undefined) return undefined
  const fallbackCut = pivot + 1
  let cut = fallbackCut
  // Prefer a user-message boundary so the retained tail begins at a turn. The
  // pairing trim below remains authoritative when it moves this cut.
  for (let index = cut - 1; index > 0; index -= 1) {
    if ((nodes[index] as SurfaceNode).role === 'user') {
      cut = index
      break
    }
  }
  if (cut <= 0) return undefined
  let bounds = historianSpanBounds({
    nodes,
    start: 0,
    cut,
    covered,
    ...baselineNodeSeq === undefined ? {} : { baselineNodeSeq },
  })
  if (bounds === undefined && cut !== fallbackCut) {
    // A leading orphan tool result can make the user-preferred cut empty after
    // the head skip. The raw pivot cut is still a valid boundary; use it
    // rather than reporting a bogus "nothing to wrap".
    bounds = historianSpanBounds({
      nodes,
      start: 0,
      cut: fallbackCut,
      covered,
      ...baselineNodeSeq === undefined ? {} : { baselineNodeSeq },
    })
  }
  if (bounds === undefined) return undefined
  const prefix = nodes.slice(bounds.start, bounds.cut)
  if (prefix.length === 0) return undefined
  for (const node of prefix) {
    if (blocksWrapupMiddle(node, covered, baselineNodeSeq)) return undefined
  }
  const retained = nodes.slice(bounds.cut)
  const retainedEligible = retained
    .filter(node => !isHistorianSkippableNode(node, covered, baselineNodeSeq))
    .length
  if (retainedEligible < keep) return undefined
  return {
    prefix,
    retained,
    retainedEligible,
    compactedEntries: prefix.length,
  }
}

export interface WrapupReceipt {
  readonly kind: 'success' | 'error'
  readonly text: string
  readonly keep?: number
  readonly retainedEligible?: number
  readonly compactedEntries?: number
}

/**
 * Command-side planning: validate the argument, refuse a pending request, and
 * write the durable marker. No model call, no surface mutation.
 */
export function planWrapupCommand(
  stores: AdapterStores,
  sessionId: string | undefined,
  rawInput: string | undefined,
  nodes: readonly SurfaceNode[] | undefined,
): WrapupReceipt {
  if (sessionId === undefined || sessionId === '') {
    return { kind: 'error', text: 'Magic Context: no active session; nothing to wrap.' }
  }
  if (stores.closed) {
    return { kind: 'error', text: 'Magic Context: the store is closed; nothing was changed.' }
  }
  const keep = parseWrapupKeep(rawInput)
  if (typeof keep === 'string') return { kind: 'error', text: keep }
  let marker: WrapupMarker | undefined
  try {
    marker = readWrapupMarker(stores, sessionId)
  } catch (error) {
    return {
      kind: 'error',
      text: `Magic Context: could not read the wrapup request: ${errText(error)}; nothing was changed.`,
    }
  }
  if (marker !== undefined) {
    return {
      kind: 'error',
      text: 'Magic Context: a wrapup request is already pending for this session; wait for the next pre-step.',
    }
  }
  const covered = stores.coveredSeqs(sessionId)
  const baselineNodeSeq = stores.baselineState(sessionId)?.nodeSeq
  const plan = nodes === undefined
    ? undefined
    : planWrapupRange({ nodes, keep, covered, ...baselineNodeSeq === undefined ? {} : { baselineNodeSeq } })
  if (nodes !== undefined && plan === undefined) {
    return {
      kind: 'success',
      text: `Magic Context: nothing to wrap — no eligible span can be compacted with keep ${String(keep)} on the current surface.`,
      keep,
    }
  }
  try {
    writeWrapupMarker(stores, sessionId, {
      keep,
      requestedAt: Date.now(),
      attempts: 0,
      compartmentIds: [],
    })
  } catch (error) {
    return {
      kind: 'error',
      text: `Magic Context: could not queue the wrapup request: ${errText(error)}; nothing was changed.`,
    }
  }
  const span = plan === undefined
    ? `keep ${String(keep)}`
    : `keep ${String(keep)}, retain ~${String(plan.retainedEligible)} eligible entries, compact ${String(plan.compactedEntries)} entries`
  return {
    kind: 'success',
    text: `Magic Context: wrapup queued (${span}). It runs on the next pre-step; the current request is unchanged. The historian spends tokens then.`,
    keep,
    ...plan === undefined
      ? {}
      : { retainedEligible: plan.retainedEligible, compactedEntries: plan.compactedEntries },
  }
}

export function registerCtxWrapupCommand(
  ctx: Context,
  deps: { readonly stores: AdapterStores },
): void {
  const commands = (ctx as unknown as { get(name: string): unknown }).get('commands') as
    | CommandRegistrar
    | undefined
  if (commands === undefined) {
    ctx.logger.warn('magic-context dsh adapter: commands service not mounted; /ctx-wrapup unavailable')
    return
  }
  commands.register({
    name: 'ctx-wrapup',
    description: 'Magic Context: compact the live history tail on the next pre-step, keeping the newest N eligible entries.',
    input: { hint: '[messages_to_keep]' },
    handler: (invocation) => {
      const session = invocation.agent?.session
      const receipt = planWrapupCommand(
        deps.stores,
        session?.id,
        invocation.rawInput,
        session === undefined ? undefined : enumerateSurfaceNodes(session),
      )
      return receipt.kind === 'success'
        ? { kind: 'success', text: receipt.text }
        : { kind: 'error', text: receipt.text }
    },
  })
}
