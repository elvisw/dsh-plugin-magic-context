/**
 * `/ctx-flush` — manual queue flush for the current session. The command only
 * writes a durable marker; the next `preStep` lands the marked drops through
 * the same helper as the automatic execute band. DSH has no separate
 * injection-cache object to invalidate: the next request is assembled from the
 * mutated session surface.
 */
import type { Context } from '@deepseek-ai/cordis'
import type { AdapterStores } from '../core/stores.ts'
import { errText } from '../core/types.ts'

/** Narrowed registration surface (keeps the package typecheck standalone). */
type CommandRegistrar = {
  register(definition: {
    name: string
    description: string
    handler: (invocation: {
      readonly agent?: { readonly session?: { readonly id?: string } }
    }) => { kind: 'success'; text?: string } | { kind: 'error'; text: string }
  }): unknown
}

export interface FlushReceipt {
  readonly kind: 'success' | 'error'
  readonly text: string
  /** Rows newly marked by this call. */
  readonly requested: number
  /** Rows already marked before this call. */
  readonly alreadyRequested: number
  /** Upper bound of still-pending rows; undefined when the store failed. */
  readonly pendingNext?: number
  readonly tags: number[]
}

function formatTags(tags: readonly number[]): string {
  const shown = tags.slice(0, 8).map(tag => `§${String(tag)}§`)
  return tags.length > 8 ? `${shown.join(', ')}, …` : shown.join(', ')
}

function plan(stores: AdapterStores, sessionId: string): FlushReceipt {
  const pending = stores.listPendingDrops(sessionId)
  const markedBefore = new Set(stores.listFlushRequestedDrops(sessionId))
  const alreadyRequested = markedBefore.size
  if (pending.length === 0) {
    return {
      kind: 'success',
      text: 'Magic Context: nothing to flush (no pending drops).',
      requested: 0,
      alreadyRequested: 0,
      pendingNext: 0,
      tags: [],
    }
  }
  const requested = stores.requestFlush(sessionId)
  if (requested === 0 && alreadyRequested === 0) {
    // The row was landed (or otherwise changed) between the read and the
    // UPDATE. That is a successful no-op, not a fabricated failure.
    return {
      kind: 'success',
      text: 'Magic Context: nothing to flush (the pending rows were already landed or changed).',
      requested: 0,
      alreadyRequested: 0,
      pendingNext: pending.length,
      tags: [],
    }
  }
  let tags: number[]
  try {
    tags = stores.listFlushRequestedDrops(sessionId)
  } catch (error) {
    return {
      kind: 'error',
      text: `Magic Context: flush marker written for ${String(requested)} drop(s), but the queue could not be read: ${errText(error)}.`,
      requested,
      alreadyRequested,
      tags: [],
    }
  }
  const newTags = tags.filter(tag => !markedBefore.has(tag))
  const oldTags = tags.filter(tag => markedBefore.has(tag))
  const detail = [
    newTags.length > 0 ? `new ${formatTags(newTags)}` : '',
    oldTags.length > 0 ? `already marked ${formatTags(oldTags)}` : '',
  ].filter(part => part !== '').join('; ')
  const lead = requested > 0
    ? `flush queued for ${String(requested)} new drop(s)`
    : `flush already marked for ${String(alreadyRequested)} drop(s)`
  return {
    kind: 'success',
    text: `Magic Context: ${lead}${detail === '' ? '' : ` (${detail})`}: requested ${String(requested)}, already marked ${String(alreadyRequested)}, processed 0, pendingNext ${String(pending.length)} (upper bound). Changes take effect on the next message; the current request is unchanged.`,
    requested,
    alreadyRequested,
    pendingNext: pending.length,
    tags,
  }
}

/**
 * Pure result builder for the command and its tests. It never touches the
 * surface; it only reads/writes the queue markers.
 */
export function planFlushCommand(stores: AdapterStores, sessionId: string | undefined): FlushReceipt {
  if (sessionId === undefined || sessionId === '') {
    return {
      kind: 'error',
      text: 'Magic Context: no active session; nothing to flush.',
      requested: 0,
      alreadyRequested: 0,
      tags: [],
    }
  }
  if (stores.closed) {
    return {
      kind: 'error',
      text: 'Magic Context: the store is closed; nothing was changed.',
      requested: 0,
      alreadyRequested: 0,
      tags: [],
    }
  }
  try {
    return plan(stores, sessionId)
  } catch (error) {
    return {
      kind: 'error',
      text: `Magic Context: flush failed: ${errText(error)}; nothing was changed.`,
      requested: 0,
      alreadyRequested: 0,
      tags: [],
    }
  }
}

export function registerCtxFlushCommand(ctx: Context, deps: { readonly stores: AdapterStores }): void {
  const commands = (ctx as unknown as { get(name: string): unknown }).get('commands') as
    | CommandRegistrar
    | undefined
  if (commands === undefined) {
    ctx.logger.warn('magic-context dsh adapter: commands service not mounted; /ctx-flush unavailable')
    return
  }
  commands.register({
    name: 'ctx-flush',
    description: 'Force this session\'s pending ctx_reduce drops to land on the next message (no summary or model call).',
    handler: invocation => {
      const receipt = planFlushCommand(deps.stores, invocation.agent?.session?.id)
      return receipt.kind === 'success'
        ? { kind: 'success', text: receipt.text }
        : { kind: 'error', text: receipt.text }
    },
  })
}
