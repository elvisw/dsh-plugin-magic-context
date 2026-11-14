/**
 * The single drop-landing path. The normal execute band and the manual
 * `/ctx-flush` lane both go through here: a pending tag is resolved against
 * the live surface tool results, replaced with its placeholder, and marked
 * landed in `pending_drops`. Keeping one implementation is what makes a flush
 * behave exactly like the automatic pass (no second placeholder format, no
 * second tag lookup, no second journal shape).
 */
import type { Journal } from '../core/journal.ts'
import type { AdapterStores } from '../core/stores.ts'
import { estimateTokens } from '../core/compartments.ts'
import {
  type Session,
  dropPlaceholderContent,
  enumerateSurfaceNodes,
  enumerateSurfaceToolResults,
  replaceToolResultContent,
} from './seams.ts'

export interface DropLandingInput {
  readonly session: Session
  readonly sessionId: string
  readonly stores: AdapterStores
  /** Tags to consider; only they are examined. */
  readonly tags: readonly number[]
  readonly journal?: Journal
  /**
   * Called immediately after a tool result was replaced, before the durable
   * `markDropLanded`. A later throw must still be treated as a surface change
   * by the caller's pressure-staleness guard.
   */
  readonly onReplaced?: (tag: number) => void
}

export interface DropLandingResult {
  /** Tags whose original content was replaced in this call. */
  readonly landed: number[]
  /** Tags whose placeholder was already live; they were marked landed too. */
  readonly already: number[]
  /** Tags with no live surface tool-result node; left pending. */
  readonly skipped: number[]
}

export function landPendingDrops(input: DropLandingInput): DropLandingResult {
  const wanted = [...new Set(input.tags)]
  if (wanted.length === 0) return { landed: [], already: [], skipped: [] }

  const toolNodes = enumerateSurfaceToolResults(input.session, callId =>
    input.stores.getTag(input.sessionId, { kind: 'tool-result', callId }))
  const landed: number[] = []
  const already: number[] = []
  const skipped: number[] = []

  for (const tag of wanted) {
    const node = toolNodes.find(candidate => candidate.tagNumber === tag)
    if (node === undefined) {
      skipped.push(tag)
      continue
    }
    if (node.isPlaceholder) {
      input.stores.markDropLanded(input.sessionId, tag, node.seq)
      already.push(tag)
      continue
    }
    const landedSeq = replaceToolResultContent(input.session, node.seq, dropPlaceholderContent(tag))
    input.onReplaced?.(tag)
    input.stores.markDropLanded(input.sessionId, tag, landedSeq)
    landed.push(tag)
  }

  if (landed.length > 0) {
    const textBySeq = new Map(enumerateSurfaceNodes(input.session).map(node => [node.seq, node.text]))
    input.journal?.info(
      'drop-landed',
      `landed ${String(landed.length)} drop(s): ${landed.map(tag => `§${String(tag)}§`).join(', ')}`,
      {
        tags: landed,
        count: landed.length,
        estTokens: landed.reduce((total, tag) => {
          const node = toolNodes.find(candidate => candidate.tagNumber === tag)
          const text = node === undefined ? undefined : textBySeq.get(node.seq)
          return total + (text === undefined ? 0 : estimateTokens(text))
        }, 0),
      },
      input.sessionId,
    )
  }

  return { landed, already, skipped }
}
