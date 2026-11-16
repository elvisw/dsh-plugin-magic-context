/**
 * Telemetry v2 view model: pure, no React, no DOM.
 *
 * The builder is the contract between the Host summary and the popover. It
 * keeps the three host segments separate from the estimated message split and
 * never turns an unknown into `0`.
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const CLIENT = fileURLToPath(new URL('../src/client/index.js', import.meta.url))
const CLIENT_SOURCE = readFileSync(CLIENT, 'utf8')
let definition: { factory?: (require: (name: string) => unknown) => Record<string, unknown> } | null = null
const window = { __ModuleLoader__: { load: (def: unknown) => { definition = def as typeof definition } } }
// eslint-disable-next-line @typescript-eslint/no-implied-eval
new Function('window', CLIENT_SOURCE)(window)
const factory = definition?.factory
if (typeof factory !== 'function') throw new Error('client bundle did not register a module')
const api = factory((name) => {
  if (name === 'react') {
    return {
      createElement: () => null,
      useState: (initial: unknown) => [initial, () => {}],
      useEffect: () => {},
      useRef: () => ({ current: null }),
    }
  }
  throw new Error('unexpected require: ' + name)
}) as {
  __diagnostics: {
    buildTelemetryView: (
      summary: unknown,
      locale: string,
      now: number,
      width?: number,
      lastUpdateAt?: number,
      t?: (key: string, params?: Record<string, unknown>) => string,
      recent?: readonly Record<string, unknown>[],
    ) => Record<string, any>
    displayStatusOf: (transportStatus: string, viewStatus: string) => string
  }
}
const build = api.__diagnostics.buildTelemetryView

function summary(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    recent: [],
    health: {
      lastPressure: 41.4,
      lastTokens: 49_000,
      lastContextWindow: 128_000,
      policy: { executeThreshold: 65, forceThreshold: 85 },
      contextBreakdown: { systemTokens: 12_000, toolsTokens: 8_000, messageTokens: 33_000 },
      messageComposition: {
        conversation: 14_000, toolCalls: 9_000, compartments: 6_000,
        memories: 3_000, profile: 1_000, other: 0, residualTokens: 0,
      },
      historian: { running: false, compartments: 3, coveredTokens: 42_000, lastPublishedAt: 1_763_299_080_000 },
      queue: { pendingDrops: 3, tags: [1, 2, 3] },
      memory: { total: 12, injected: 8, estTokens: 3_000, profileEstTokens: 1_000 },
      surface: { tagged: 48, dropped: 12, reclaimableTokens: 6_800 },
      maintenanceLast: { at: 1_763_299_080_000, expired: 1, verified: 2, updated: 3, archived: 4 },
      ...overrides,
    },
  }
}

describe('buildTelemetryView', () => {
  it('keeps the host bar and the message sub-list separate', () => {
    const view = build(summary(), 'en', 1_000_000, 400, 999_000)
    expect(view.bar.available).toBe(true)
    expect(view.bar.total).toBe(53_000)
    expect(view.bar.segments).toHaveLength(3)
    expect(view.bar.segments.map((segment: any) => segment.id)).toEqual(['system', 'tools', 'messages'])
    expect(view.bar.segments.reduce((total: number, segment: any) => total + segment.share, 0)).toBeCloseTo(1)
    expect(view.messageRows.map((row: any) => row.id)).toEqual([
      'conversation', 'toolCalls', 'compartments', 'memories', 'profile',
    ])
    expect(view.messageRows.find((row: any) => row.id === 'memories').suffixKey).toBe('composition.lastInjection')
    expect(view.sections.find((row: any) => row.id === 'historian').value).toContain('42k digested')
    expect(view.sections.find((row: any) => row.id === 'memory').value).toContain('12 total')
    expect(view.sections.find((row: any) => row.id === 'queue').value).toContain('3 pending')
    expect(view.sections.find((row: any) => row.id === 'hygiene').value).toContain('6.8k reclaimable')
  })

  it('uses policy thresholds and never renders unknown as zero', () => {
    const view = build(summary({ contextBreakdown: null, messageComposition: null }), 'en', 1_000_000)
    expect(view.pressure.percent).toBeCloseTo(41.4)
    expect(view.pressure.executeThreshold).toBe(65)
    expect(view.pressure.tone).toBe('#22a06b')
    expect(view.bar.available).toBe(false)
    expect(view.bar.segments.every((segment: any) => segment.tokens === null)).toBe(true)
    expect(view.bar.aria).toContain('unavailable')
    expect(view.messageRows).toEqual([])
    expect(view.compositionAvailable).toBe(false)
  })

  it('marks a payload with no health section unavailable, not healthy', () => {
    const view = build({}, 'en', 1_000_000)
    expect(view.status).toBe('unavailable')
    expect(view.unavailable).toBe(true)
    expect(build(null, 'en', 1_000_000).status).toBe('connecting')
    expect(build(summary(), 'en', 1_000_000).unavailable).toBe(false)
  })

  it('lets a payload-level unavailable override a healthy transport', () => {
    const { displayStatusOf } = api.__diagnostics
    expect(displayStatusOf('ok', 'unavailable')).toBe('unavailable')
    expect(displayStatusOf('ok', 'connecting')).toBe('connecting')
    expect(displayStatusOf('unavailable', 'ok')).toBe('unavailable')
    expect(displayStatusOf('connecting', 'unavailable')).toBe('connecting')
  })

  it('surfaces residual scaling and keeps Other hidden at zero', () => {
    const residual = build(summary({
      messageComposition: {
        conversation: 14_000, toolCalls: 9_000, compartments: 6_000,
        memories: 3_000, profile: 1_000, other: 0, residualTokens: 500,
      },
    }), 'en', 1_000_000)
    expect(residual.warnings).toHaveLength(1)
    expect(residual.warnings[0].text).toContain('500')
    expect(residual.messageRows.map((row: any) => row.id)).not.toContain('other')
  })

  it('derives the pill variant from width and stale from the receipt time', () => {
    const full = build(summary(), 'en', 1_000_000, 400, 999_000)
    expect(full.pill.variant).toBe('full')
    expect(full.pill.text).toContain('/')
    const compact = build(summary(), 'en', 1_000_000, 350, 999_000)
    expect(compact.pill.variant).toBe('compact')
    expect(compact.pill.text).not.toContain('/')
    expect(build(summary(), 'en', 1_000_000, 360, 999_000).pill.variant).toBe('full')
    expect(build(summary(), 'en', 1_000_000, 280, 999_000).pill.variant).toBe('compact')
    expect(build(summary(), 'en', 1_000_000, 220, 999_000).pill.variant).toBe('icon')
    const icon = build(summary(), 'en', 1_000_000, 260, 999_000)
    expect(icon.pill.variant).toBe('icon')
    expect(icon.pill.text).toContain('Q3')
    expect(icon.pill.text).toContain('H')
    expect(icon.pill.text).not.toContain('H idle')
    expect(icon.pill.text).not.toBe(compact.pill.text)
    const minimal = build(summary(), 'en', 1_000_000, 200, 999_000)
    expect(minimal.pill.variant).toBe('minimal')
    expect(minimal.pill.text).toBe('41%')
    const emptyQueue = build(summary({ queue: { pendingDrops: 0, tags: [] } }), 'en', 1_000_000)
    expect(emptyQueue.pill.text).not.toContain('Q')

    expect(full.stale).toBe(false)
    expect(build(summary(), 'en', 1_000_000, 400, 800_000).stale).toBe(true)
    // A stale health.lastEventAt does NOT make a fresh receipt stale.
    const fresh = summary()
    ;(fresh.health as Record<string, unknown>).lastEventAt = 1
    expect(build(fresh, 'en', 1_000_000, 400, 999_000).stale).toBe(false)
  })

  it('keeps pressure and historian state when recent errors replace the queue', () => {
    const errors = build({
      recent: [{ level: 'error', at: 999_000, summary: 'provider failed' }],
      health: (summary().health as Record<string, unknown>),
    }, 'en', 1_000_000)
    expect(errors.pill.text).toContain('41%')
    expect(errors.pill.text).toContain('H idle')
    expect(errors.pill.text).toContain('1 err')
    expect(errors.pill.text).not.toContain('Q3')
    expect(errors.sections.find((row: any) => row.id === 'warnings').value).toContain('1')
  })

  it('uses the live recent frame for the pill error suffix', () => {
    const view = build(
      summary(),
      'en',
      1_000_000,
      400,
      999_000,
      undefined,
      [{ level: 'error', at: 999_500, summary: 'provider failed' }],
    )
    expect(view.pill.text).toContain('1 err')
    expect(view.pill.text).not.toContain('Q3')
    expect(view.sections.find((row: any) => row.id === 'warnings').value).toContain('1')
  })

  it('uses compositionAvailable for a zero-row composition and treats a null policy as unknown', () => {
    const zeroRows = build(summary({
      policy: null,
      messageComposition: {
        conversation: null, toolCalls: null, compartments: null,
        memories: null, profile: null, other: 0, residualTokens: 0,
      },
    }), 'en', 1_000_000)
    expect(zeroRows.compositionAvailable).toBe(true)
    expect(zeroRows.messageRows).toEqual([])
    expect(zeroRows.pressure.executeThreshold).toBeNull()
    expect(zeroRows.sections.find((row: any) => row.id === 'warnings').value).toBe('none')
  })

  it('renders explicit empty states for queue, maintenance and missing values', () => {
    const view = build(summary({
      queue: { pendingDrops: 0, tags: [] },
      maintenanceLast: { at: null, expired: null, verified: null, updated: null, archived: null },
      historian: { running: false, compartments: null, coveredTokens: null, lastPublishedAt: null },
      memory: { total: 12, injected: null, estTokens: null, profileEstTokens: null },
      surface: { tagged: null, dropped: null, reclaimableTokens: null },
    }), 'en', 1_000_000)
    expect(view.sections.find((row: any) => row.id === 'queue').value).toBe('empty')
    expect(view.sections.find((row: any) => row.id === 'maintenance').value).toContain('—')
    expect(view.sections.find((row: any) => row.id === 'historian').value).toContain('—')
    expect(view.sections.find((row: any) => row.id === 'memory').value).toContain('—')
    expect(view.sections.find((row: any) => row.id === 'hygiene').value).toContain('—')
    const never = build(summary({ maintenanceLast: null }), 'en', 1_000_000)
    expect(never.sections.find((row: any) => row.id === 'maintenance').value).toBe('never run')
  })

  it('does not produce NaN when all host segments are zero', () => {
    const view = build(summary({ contextBreakdown: { systemTokens: 0, toolsTokens: 0, messageTokens: 0 } }), 'en', 1_000_000)
    expect(view.bar.total).toBe(0)
    expect(view.bar.segments.every((segment: any) => segment.share === 0)).toBe(true)
    expect(Number.isNaN(view.bar.segments[0].share)).toBe(false)
    expect(view.bar.aria).toContain('0')
  })
})
