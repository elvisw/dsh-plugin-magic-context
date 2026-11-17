/**
 * T22 regression: a deferred/rejected wrapup digest must not appear in the
 * baseline while its original span is still on the wire.
 */
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { Session, SessionId } from '@deepseek-ai/dsh-session'
import { DEFAULT_POLICY } from '../src/core/policy.ts'
import { openStores } from '../src/index.ts'
import { runManagementPass } from '../src/dsh/management-pass.ts'
import { enumerateSurfaceNodes } from '../src/dsh/seams.ts'

const silentLogger = { info: () => {}, warn: () => {} }

function digest(text: string) {
  return {
    tiers: { p1: text, p2: text, p3: text, p4: text },
    importance: 50,
    facts: [],
    events: [],
  }
}

describe('wrapup baseline visibility', () => {
  it('renders only landed compartments into the baseline', () => {
    const dataDir = mkdtempSync(join(tmpdir(), 'mc-wrapup-baseline-'))
    const stores = openStores(dataDir)
    try {
      const session = Session.create(SessionId('s1'))
      const seqs = Array.from({ length: 4 }, (_, index) => session.append('user/message', {
        id: `baseline-${String(index)}`,
        role: 'user',
        content: [{ type: 'text', text: `message ${String(index)}` }],
        source: { kind: 'user' },
      } as never, { surfaceOp: 'append' }).seq)
      const nodes = enumerateSurfaceNodes(session)
      const landed = stores.allocateCompartment('s1', digest('LANDED DIGEST'), {
        startSeq: seqs[2]!,
        endSeq: seqs[2]!,
        seqs: [seqs[2]!],
        tokens: 8,
      }, 0, Date.now())
      stores.markCompartmentLanded('s1', landed.compartmentId, 99)
      stores.allocateCompartment('s1', digest('UNLANDED DIGEST'), {
        startSeq: nodes[0]!.seq,
        endSeq: nodes[2]!.seq,
        seqs: [nodes[0]!.seq, nodes[2]!.seq],
        tokens: 4,
      }, 0, Date.now())
      stores.saveBaselineState({
        sessionId: 's1',
        epoch: 1,
        nodeSeq: nodes[1]!.seq,
        frozenAt: Date.now(),
        updatedAt: Date.now(),
      } as never)
      runManagementPass({
        session,
        sessionId: 's1',
        stores,
        policy: DEFAULT_POLICY,
        logger: silentLogger,
        pass: { kind: 'execute', reason: 'execute-threshold' },
        pressure: 90,
        route: { provider: 'mock', model: 'mock' },
      })
      const text = session.snapshotEvents()
        .map(event => JSON.stringify(event.data))
        .join('\n')
      expect(text).toContain('LANDED DIGEST')
      expect(text).not.toContain('UNLANDED DIGEST')
    } finally {
      stores.close()
      rmSync(dataDir, { recursive: true, force: true })
    }
  })
})
