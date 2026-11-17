/**
 * T22 — `/ctx-wrapup` planning. The command only queues a marker; these tests
 * pin the eligible count, pairing boundaries, no-op cases and marker schema.
 */
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { openStores } from '../src/index.ts'
import type { AdapterStores } from '../src/core/stores.ts'
import type { SurfaceNode } from '../src/dsh/seams.ts'
import {
  clearWrapupMarker,
  parseWrapupKeep,
  planWrapupCommand,
  planWrapupRange,
  readWrapupMarker,
  registerCtxWrapupCommand,
  wrapupMarkerKey,
} from '../src/dsh/wrapup-command.ts'

function node(
  seq: number,
  role: SurfaceNode['role'],
  text: string,
  extra: Partial<SurfaceNode> = {},
): SurfaceNode {
  return {
    seq: seq as SurfaceNode['seq'],
    type: role === 'tool' ? 'tool/result' : `${role}/message`,
    role,
    text,
    hasText: text.length > 0,
    isPlaceholder: false,
    hasToolCalls: false,
    ...extra,
  }
}

function users(count: number): SurfaceNode[] {
  return Array.from({ length: count }, (_, index) => node(index + 1, 'user', `user ${String(index + 1)}`))
}

function stores(): { dataDir: string; stores: AdapterStores } {
  const dataDir = mkdtempSync(join(tmpdir(), 'mc-wrapup-'))
  return { dataDir, stores: openStores(dataDir) }
}

function dispose(context: { dataDir: string; stores: AdapterStores }): void {
  try {
    context.stores.close()
  } finally {
    rmSync(context.dataDir, { recursive: true, force: true })
  }
}

describe('parseWrapupKeep', () => {
  it('defaults to 20 and accepts 1..1000', () => {
    expect(parseWrapupKeep(undefined)).toBe(20)
    expect(parseWrapupKeep('')).toBe(20)
    expect(parseWrapupKeep('1')).toBe(1)
    expect(parseWrapupKeep('1000')).toBe(1000)
  })

  it('rejects zero, out-of-range, fractions and extra tokens', () => {
    for (const raw of ['0', '1001', '2.5', '20x', '-1', '1 2']) {
      expect(typeof parseWrapupKeep(raw)).toBe('string')
    }
  })
})

describe('planWrapupRange', () => {
  it('keeps the newest 20 eligible entries and reports prefix length', () => {
    const plan = planWrapupRange({ nodes: users(21), keep: 20, covered: new Set() })
    expect(plan).toBeDefined()
    expect(plan?.retainedEligible).toBe(20)
    expect(plan?.compactedEntries).toBe(1)
    expect(plan?.prefix).toHaveLength(1)
  })

  it('does not count placeholders, system, empty or covered nodes', () => {
    const nodes = [
      ...users(3),
      node(4, 'tool', '[dropped §1§]', { isPlaceholder: true }),
      node(5, 'system', 'system head'),
      node(6, 'user', '', { hasText: false }),
      node(7, 'user', 'newest'),
    ]
    const plan = planWrapupRange({ nodes, keep: 1, covered: new Set([7]) })
    // The user-boundary move can retain more than the requested minimum.
    expect(plan?.retainedEligible).toBe(2)
  })

  it('counts developer entries as eligible', () => {
    const nodes = [...users(2), node(3, 'developer', 'developer rule'), node(4, 'user', 'newest')]
    const plan = planWrapupRange({ nodes, keep: 1, covered: new Set() })
    expect(plan?.retainedEligible).toBe(3)
  })

  it('moves the cut to a user boundary and skips a leading tool result', () => {
    const nodes = [
      node(1, 'tool', 'result without call'),
      node(2, 'user', 'old'),
      node(3, 'user', 'keep'),
      node(4, 'user', 'newest'),
    ]
    const plan = planWrapupRange({ nodes, keep: 1, covered: new Set() })
    expect(plan?.prefix).toHaveLength(1)
    expect(plan?.prefix[0]?.role).toBe('user')
    expect(plan?.retainedEligible).toBe(2)
  })

  it('allows a middle dropped placeholder but blocks system and compacted', () => {
    const tail = Array.from({ length: 5 }, (_, index) => node(index + 4, 'user', `tail ${String(index + 1)}`))
    const dropped = [
      node(1, 'user', 'old 1'),
      node(2, 'user', 'old 2'),
      node(3, 'tool', '[dropped §1§]', { isPlaceholder: true }),
      ...tail,
    ]
    const system = [
      node(1, 'user', 'old 1'),
      node(2, 'user', 'old 2'),
      node(3, 'system', 'middle system'),
      ...tail,
    ]
    const compacted = [
      node(1, 'user', 'old 1'),
      node(2, 'user', 'old 2'),
      node(3, 'tool', '[compacted §C2§]', { isPlaceholder: true }),
      ...tail,
    ]
    expect(planWrapupRange({ nodes: dropped, keep: 4, covered: new Set() })).toBeDefined()
    expect(planWrapupRange({ nodes: system, keep: 4, covered: new Set() })).toBeUndefined()
    expect(planWrapupRange({ nodes: compacted, keep: 4, covered: new Set() })).toBeUndefined()
  })

  it('returns no-op when there are not enough eligible entries', () => {
    expect(planWrapupRange({ nodes: users(2), keep: 2, covered: new Set() })).toBeUndefined()
    expect(planWrapupRange({ nodes: users(2), keep: 3, covered: new Set() })).toBeUndefined()
  })
})

describe('/ctx-wrapup command planning', () => {
  it('writes one marker and refuses a duplicate', () => {
    const context = stores()
    try {
      const nodes = users(4)
      const first = planWrapupCommand(context.stores, 's1', '2', nodes)
      expect(first.kind).toBe('success')
      expect(first.keep).toBe(2)
      expect(readWrapupMarker(context.stores, 's1')).toMatchObject({
        keep: 2,
        attempts: 0,
        compartmentIds: [],
      })
      const second = planWrapupCommand(context.stores, 's1', '2', nodes)
      expect(second.kind).toBe('error')
      expect(second.text).toContain('already pending')
      expect(context.stores.getMeta(wrapupMarkerKey('s1'))).not.toBe('')
    } finally {
      dispose(context)
    }
  })

  it('reports a neutral no-op when the planner cannot find a span', () => {
    const context = stores()
    try {
      const receipt = planWrapupCommand(context.stores, 's1', '2', users(2))
      expect(receipt.kind).toBe('success')
      expect(receipt.text).toContain('nothing to wrap')
      expect(receipt.text).toContain('no eligible span')
      expect(receipt.retainedEligible).toBeUndefined()
    } finally {
      dispose(context)
    }
  })

  it('reports the preview counts on a queued request', () => {
    const context = stores()
    try {
      const receipt = planWrapupCommand(context.stores, 's1', '2', users(4))
      expect(receipt.kind).toBe('success')
      expect(receipt.compactedEntries).toBe(1)
      expect(receipt.retainedEligible).toBe(3)
      expect(receipt.text).toContain('compact 1 entries')
    } finally {
      dispose(context)
    }
  })

  it('registers one ctx-wrapup command', () => {
    const context = stores()
    try {
      const registrations: Array<{ name: string }> = []
      const ctx = {
        get: (name: string) => name === 'commands'
          ? { register: (command: { name: string }) => { registrations.push(command) } }
          : undefined,
        logger: { warn: () => undefined },
      }
      registerCtxWrapupCommand(ctx as never, { stores: context.stores })
      expect(registrations.map(command => command.name)).toEqual(['ctx-wrapup'])
    } finally {
      dispose(context)
    }
  })

  it('treats schema-invalid markers as absent', () => {
    const context = stores()
    try {
      const nodes = users(4)
      for (const raw of [
        JSON.stringify({ keep: 0, requestedAt: 1, attempts: 0, compartmentIds: [] }),
        JSON.stringify({ keep: 2, attempts: 0, compartmentIds: [] }),
        JSON.stringify({ keep: 2, requestedAt: 1, attempts: -1, compartmentIds: [] }),
        '{not json',
      ]) {
        context.stores.setMeta(wrapupMarkerKey('s1'), raw)
        expect(readWrapupMarker(context.stores, 's1')).toBeUndefined()
        expect(context.stores.getMeta(wrapupMarkerKey('s1'))).toBe('')
        expect(planWrapupCommand(context.stores, 's1', '2', nodes).kind).toBe('success')
        clearWrapupMarker(context.stores, 's1')
      }
    } finally {
      dispose(context)
    }
  })

  it('does not claim queued when the marker write fails', () => {
    const context = stores()
    try {
      const broken = new Proxy(context.stores, {
        get(target, property, receiver) {
          if (property === 'setMeta') {
            return () => { throw new Error('disk full') }
          }
          return Reflect.get(target, property, receiver)
        },
      }) as AdapterStores
      const receipt = planWrapupCommand(broken, 's1', '2', users(4))
      expect(receipt.kind).toBe('error')
      expect(receipt.text).toContain('could not queue')
    } finally {
      dispose(context)
    }
  })

  it('returns an error without a session or on a closed store', () => {
    const context = stores()
    try {
      expect(planWrapupCommand(context.stores, undefined, '2', users(4)).kind).toBe('error')
      expect(planWrapupCommand(context.stores, '', '2', users(4)).kind).toBe('error')
      context.stores.close()
      expect(planWrapupCommand(context.stores, 's1', '2', users(4)).kind).toBe('error')
    } finally {
      rmSync(context.dataDir, { recursive: true, force: true })
    }
  })
})
