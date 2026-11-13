/**
 * The durable drop lifecycle (#13 A, contract D1.2).
 *
 * `ctx_reduce` must refuse a spent tag from persisted state, not from whether a
 * placeholder happens to be live: a landed drop reads `landed`, a queued mark
 * reads `pending`, and an untouched tag reads `none`. `tagSessions` is the
 * global tag index the result-return expand needs to tell a tag from another
 * session (`cross-session tag`) from one that never existed (`no such tag`).
 *
 * These are store-level cases: no host, no session log.
 */
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { openStores } from '../src/index.ts'

describe('durable drop state', () => {
  it('moves none → pending → landed, and a landed re-queue stays landed', () => {
    const dataDir = mkdtempSync(join(tmpdir(), 'mc-tag-state-'))
    const stores = openStores(dataDir)
    try {
      const now = Date.now()
      const tag = stores.allocateTag('session-a', { kind: 'tool-result', callId: 'call-1' }, now)
      expect(tag).toBe(1)

      // An allocated tag nobody asked to drop is active, not dropped.
      expect(stores.dropState('session-a', 1)).toBe('none')
      // Unknown tag numbers read the same way; callers resolve the tag first.
      expect(stores.dropState('session-a', 99)).toBe('none')

      stores.queueDrop('session-a', 1, now)
      expect(stores.dropState('session-a', 1)).toBe('pending')
      expect(stores.listPendingDrops('session-a')).toEqual([1])

      stores.markDropLanded('session-a', 1, 42)
      expect(stores.dropState('session-a', 1)).toBe('landed')
      expect(stores.listPendingDrops('session-a')).toEqual([])

      // The existing ON CONFLICT branch only refreshes queued_at; it never
      // clears landed_event_seq. A landed row therefore stays landed, and
      // #13 A refuses a spent tag ABOVE this call so it never reaches it.
      stores.queueDrop('session-a', 1, now + 1)
      expect(stores.dropState('session-a', 1)).toBe('landed')
      expect(stores.listPendingDrops('session-a')).toEqual([])
    } finally {
      stores.close()
      rmSync(dataDir, { recursive: true, force: true })
    }
  })

  it('answers per session and survives a reopen at the same data directory', () => {
    const dataDir = mkdtempSync(join(tmpdir(), 'mc-tag-state-reopen-'))
    const first = openStores(dataDir)
    try {
      const now = Date.now()
      first.allocateTag('session-a', { kind: 'tool-result', callId: 'call-a' }, now)
      first.allocateTag('session-b', { kind: 'tool-result', callId: 'call-b' }, now)
      first.queueDrop('session-a', 1, now)
      first.markDropLanded('session-a', 1, 7)
    } finally {
      first.close()
    }
    const second = openStores(dataDir)
    try {
      expect(second.dropState('session-a', 1)).toBe('landed')
      expect(second.dropState('session-b', 1)).toBe('none')
      expect(second.tagSessions(1)).toEqual(['session-a', 'session-b'])
    } finally {
      second.close()
      rmSync(dataDir, { recursive: true, force: true })
    }
  })
})

describe('the global tag index', () => {
  it('lists every session that holds a tag number, and nothing for an unused one', () => {
    const dataDir = mkdtempSync(join(tmpdir(), 'mc-tag-sessions-'))
    const stores = openStores(dataDir)
    try {
      const now = Date.now()
      stores.allocateTag('session-a', { kind: 'tool-result', callId: 'a-1' }, now)
      stores.allocateTag('session-a', { kind: 'user-message', messageId: 'a-m' }, now)
      stores.allocateTag('session-b', { kind: 'tool-result', callId: 'b-1' }, now)
      stores.allocateTag('session-b', { kind: 'tool-result', callId: 'b-2' }, now)
      stores.allocateTag('session-b', { kind: 'tool-result', callId: 'b-3' }, now)

      // Numbers are per-session counters: tag 1 and 2 exist in both, tag 3 only
      // in session-b, and an unused number belongs to nobody.
      expect(stores.tagSessions(1)).toEqual(['session-a', 'session-b'])
      expect(stores.tagSessions(2)).toEqual(['session-a', 'session-b'])
      expect(stores.tagSessions(3)).toEqual(['session-b'])
      expect(stores.tagSessions(4)).toEqual([])
    } finally {
      stores.close()
      rmSync(dataDir, { recursive: true, force: true })
    }
  })

  it('reports the other session for a tag this session never allocated', () => {
    const dataDir = mkdtempSync(join(tmpdir(), 'mc-tag-cross-'))
    const stores = openStores(dataDir)
    try {
      stores.allocateTag('session-owner', { kind: 'tool-result', callId: 'owned' }, Date.now())
      expect(stores.tagSessions(1).filter(other => other !== 'session-other')).toEqual(['session-owner'])
      expect(stores.tagSessions(1)).not.toContain('session-other')
    } finally {
      stores.close()
      rmSync(dataDir, { recursive: true, force: true })
    }
  })
})
