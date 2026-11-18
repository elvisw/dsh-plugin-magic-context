import { mkdtempSync, mkdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { afterEach, describe, expect, it } from 'vitest'
import { openEmbeddingLane } from '../src/dsh/embedding-lane.ts'
import type { MagicContextDshConfig } from '../src/dsh/config.ts'
import { measureTargetCoverage, planBackfill } from '../src/core/vector-lane.ts'

const dirs: string[] = []
const ENV_NAME = 'MC_T20_LANE_KEY'

function tempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'mc-embedding-lane-'))
  dirs.push(dir)
  return dir
}

afterEach(() => {
  while (dirs.length > 0) {
    try {
      rmSync(dirs.pop()!, { recursive: true, force: true })
    } catch {
      /* never mask the assertion */
    }
  }
})

function config(overrides: Record<string, unknown> = {}): MagicContextDshConfig {
  return {
    embedding: {
      provider: 'openai-compatible',
      preset: 'custom',
      endpoint: 'http://127.0.0.1:9999/v1',
      authHeader: 'authorization',
      model: 'fixture-embed-a',
      apiKeyEnv: ENV_NAME,
      dimensions: 0,
      timeoutMs: 2_000,
      queryTimeoutMs: 500,
      batchSize: 2,
      ...overrides,
    },
  }
}

function response(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
}

function vector(width = 16): number[] {
  return Array.from({ length: width }, (_, index) => index === 0 ? 1 : 0.01)
}

function makeCorpus(path: string, statuses: readonly string[] = ['active', 'active', 'permanent']): void {
  const db = new DatabaseSync(path)
  try {
    db.exec(`
      CREATE TABLE memories(
        id INTEGER PRIMARY KEY,
        project_path TEXT NOT NULL,
        category TEXT NOT NULL,
        content TEXT NOT NULL,
        normalized_hash TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'active',
        expires_at INTEGER
      );
      CREATE TABLE memory_embeddings(
        memory_id INTEGER NOT NULL,
        embedding BLOB NOT NULL,
        model_id TEXT NOT NULL,
        PRIMARY KEY(memory_id, model_id)
      );
    `)
    const insert = db.prepare(
      'INSERT INTO memories(id, project_path, category, content, normalized_hash, status) VALUES(?, ?, ?, ?, ?, ?)',
    )
    statuses.forEach((status, index) => {
      insert.run(index + 1, 'git:alpha', 'ARCHITECTURE', `memory ${String(index + 1)}`, `hash-${String(index + 1)}`, status)
    })
  } finally {
    db.close()
  }
}

function addVector(path: string, memoryId: number, modelId: string): void {
  const db = new DatabaseSync(path)
  try {
    db.prepare('INSERT OR REPLACE INTO memory_embeddings(memory_id, embedding, model_id) VALUES(?, ?, ?)')
      .run(memoryId, new Uint8Array([1, 2, 3]), modelId)
  } finally {
    db.close()
  }
}

describe('embedding lane state machine', () => {
  it('is not queryable or writable before an armed start', async () => {
    const root = tempDir()
    const corpus = join(root, 'memories.db')
    mkdirSync(root, { recursive: true })
    makeCorpus(corpus)
    let requests = 0
    const lane = openEmbeddingLane({
      config: config(),
      corpusDbPath: corpus,
      dataDir: root,
      env: { [ENV_NAME]: 'test-key' },
      logger: { info: () => {}, warn: () => {} },
      fetchImpl: async () => {
        requests += 1
        return response({ model: 'fixture-embed-a', data: [{ embedding: vector(16), index: 0 }] })
      },
    })

    expect(lane.status().state).toBe('remote-unprobed')
    expect(lane.remoteQueryModelId()).toBeNull()
    expect(lane.remoteWritable()).toBe(false)
    expect(requests).toBe(0)

    await lane.probe()
    expect(lane.status().state).toBe('remote-configured-not-started')
    expect(lane.remoteQueryModelId()).toBeNull()
    expect(lane.remoteWritable()).toBe(false)
    expect(requests).toBe(1)
  })

  it('starts, covers active + permanent, pauses and disarms', async () => {
    const root = tempDir()
    const corpus = join(root, 'memories.db')
    makeCorpus(corpus)
    const lane = openEmbeddingLane({
      config: config(),
      corpusDbPath: corpus,
      dataDir: root,
      env: { [ENV_NAME]: 'test-key' },
      logger: { info: () => {}, warn: () => {} },
      fetchImpl: async () => response({ model: 'fixture-embed-a', data: [{ embedding: vector(16), index: 0 }] }),
    })
    await lane.probe()
    expect(await lane.start()).toEqual({ ok: true })
    expect(lane.remoteWritable()).toBe(true)
    expect(lane.remoteQueryModelId()).toBeNull() // no target rows yet
    expect(lane.status().state).toBe('remote-target-missing')

    const target = lane.targetModelId()
    expect(target).toMatch(/^embedding-remote:/)
    addVector(corpus, 1, target!)
    expect(measureTargetCoverage(corpus, target!, { includePermanent: true })).toEqual({
      total: 3,
      covered: 1,
      missing: 2,
    })
    expect(lane.status().state).toBe('remote-migrating')
    expect(lane.remoteQueryModelId()).toBe(target)

    expect(lane.pause()).toEqual({ ok: true })
    expect(lane.status().state).toBe('remote-paused')
    expect(lane.remoteWritable()).toBe(false)
    expect(lane.remoteQueryModelId()).toBe(target)

    expect(lane.disarm()).toEqual({ ok: true })
    expect(lane.status().state).toBe('remote-configured-not-started')
    expect(lane.remoteWritable()).toBe(false)
    expect(lane.remoteQueryModelId()).toBeNull()
  })

  it('uses the probed width even when the override is zero', async () => {
    const root = tempDir()
    const corpus = join(root, 'memories.db')
    makeCorpus(corpus)
    const bodies: Array<Record<string, unknown>> = []
    const lane = openEmbeddingLane({
      config: config(),
      corpusDbPath: corpus,
      dataDir: root,
      env: { [ENV_NAME]: 'test-key' },
      logger: { info: () => {}, warn: () => {} },
      fetchImpl: async (_url, init) => {
        const body = JSON.parse(String(init?.body)) as Record<string, unknown> & { input: string[] }
        bodies.push(body)
        const probe = body.input[0] === 'dimension probe'
        return response({
          model: 'fixture-embed-a',
          data: [{ embedding: vector(probe ? 16 : 8), index: 0 }],
        })
      },
    })
    expect(await lane.probe()).toMatchObject({ ok: true, dimensions: 16 })
    await expect(lane.embedPassages(['one'])).rejects.toMatchObject({ code: 'dimensions-changed' })
    expect(await lane.embedQuery('question')).toBeNull()
    // The probed width is a guard only; it must never become a request
    // `dimensions` parameter when the operator did not override it.
    expect(bodies.filter(body => body.input[0] !== 'dimension probe').every(body => body.dimensions === undefined)).toBe(true)
  })

  it('requires a key when a key variable is configured and never sends an empty header', async () => {
    const root = tempDir()
    let requested = false
    const lane = openEmbeddingLane({
      config: config(),
      corpusDbPath: join(root, 'memories.db'),
      dataDir: root,
      env: {},
      logger: { info: () => {}, warn: () => {} },
      fetchImpl: async () => {
        requested = true
        return response({ data: [] })
      },
    })
    const result = await lane.probe()
    expect(result).toEqual({ ok: false, error: 'missing-key' })
    expect(requested).toBe(false)
    expect(lane.status().keyPresent).toBe(false)
  })

  it('guards action routes against cross-origin and non-JSON posts', async () => {
    const root = tempDir()
    const lane = openEmbeddingLane({
      config: config(),
      corpusDbPath: join(root, 'memories.db'),
      dataDir: root,
      env: { [ENV_NAME]: 'test-key' },
      logger: { info: () => {}, warn: () => {} },
      fetchImpl: async () => response({ data: [] }),
    })
    const call = (headers: Record<string, string>) => {
      const answer: { status?: number; body?: string } = {}
      lane.handle({
        method: 'POST',
        url: '/mc-embedding/rebuild?action=disarm',
        headers,
      }, {
        writeHead: (status) => { answer.status = status },
        end: (chunk) => { answer.body = chunk },
      })
      return answer
    }
    expect(call({ 'content-type': 'text/plain' }).status).toBe(415)
    expect(call({ 'content-type': 'application/json', origin: 'https://evil.test', host: '127.0.0.1:1' }).status).toBe(403)
    const ok = call({ 'content-type': 'application/json' })
    expect(ok.status).toBe(200)
    expect(JSON.parse(ok.body ?? '{}')).toEqual({ ok: true })
  })

  it('keeps complete as maintenance-capable for newly missing rows', async () => {
    const root = tempDir()
    const corpus = join(root, 'memories.db')
    makeCorpus(corpus, ['active'])
    const lane = openEmbeddingLane({
      config: config(),
      corpusDbPath: corpus,
      dataDir: root,
      env: { [ENV_NAME]: 'test-key' },
      logger: { info: () => {}, warn: () => {} },
      fetchImpl: async () => response({ model: 'fixture-embed-a', data: [{ embedding: vector(16), index: 0 }] }),
    })
    await lane.probe()
    await lane.start()
    const target = lane.targetModelId()!
    addVector(corpus, 1, target)
    lane.afterBackfill({ created: 1, present: 0, skipped: 0, failed: 0, total: 1 })
    expect(lane.status().state).toBe('remote-ready')
    expect(lane.remoteWritable()).toBe(true)

    const db = new DatabaseSync(corpus)
    try {
      db.prepare(
        'INSERT INTO memories(id, project_path, category, content, normalized_hash, status) VALUES(?, ?, ?, ?, ?, ?)',
      ).run(2, 'git:alpha', 'ARCHITECTURE', 'new memory', 'hash-new', 'active')
    } finally {
      db.close()
    }
    expect(lane.status().state).toBe('remote-migrating')
    expect(lane.remoteWritable()).toBe(true)
    expect(planBackfill(corpus, { targetModelId: target, includePermanent: true }).candidates).toEqual([2])
  })

  it('refuses every remote action while memory is disabled, before any request', async () => {
    const root = tempDir()
    const corpus = join(root, 'memories.db')
    makeCorpus(corpus)
    let requests = 0
    const lane = openEmbeddingLane({
      config: { ...config(), memory: { enabled: false } },
      corpusDbPath: corpus,
      dataDir: root,
      env: { [ENV_NAME]: 'test-key' },
      logger: { info: () => {}, warn: () => {} },
      fetchImpl: async () => {
        requests += 1
        return response({ model: 'fixture-embed-a', data: [{ embedding: vector(16), index: 0 }] })
      },
    })
    expect(await lane.probe()).toEqual({ ok: false, error: 'memory-disabled' })
    expect(await lane.models()).toEqual({ ok: false, error: 'memory-disabled' })
    expect(await lane.start()).toEqual({ ok: false, error: 'memory-disabled' })
    expect(requests).toBe(0)
  })

  it('requires a probe and non-empty coverage before start, and refuses a second start', async () => {
    const root = tempDir()
    const corpus = join(root, 'memories.db')
    makeCorpus(corpus, [])
    const lane = openEmbeddingLane({
      config: config(),
      corpusDbPath: corpus,
      dataDir: root,
      env: { [ENV_NAME]: 'test-key' },
      logger: { info: () => {}, warn: () => {} },
      fetchImpl: async () => response({ model: 'fixture-embed-a', data: [{ embedding: vector(16), index: 0 }] }),
    })
    expect(await lane.start()).toEqual({ ok: false, error: 'probe-required' })
    await lane.probe()
    expect(await lane.start()).toEqual({ ok: false, error: 'coverage-missing' })

    const withRows = tempDir()
    const fullCorpus = join(withRows, 'memories.db')
    makeCorpus(fullCorpus)
    const full = openEmbeddingLane({
      config: config(),
      corpusDbPath: fullCorpus,
      dataDir: withRows,
      env: { [ENV_NAME]: 'test-key' },
      logger: { info: () => {}, warn: () => {} },
      fetchImpl: async () => response({ model: 'fixture-embed-a', data: [{ embedding: vector(16), index: 0 }] }),
    })
    await full.probe()
    expect(await full.start()).toEqual({ ok: true })
    expect(await full.start()).toEqual({ ok: false, error: 'already-running' })
    addVector(fullCorpus, 1, full.targetModelId()!)
    expect(full.pause()).toEqual({ ok: true })
    expect(await full.start()).toEqual({ ok: false, error: 'paused' })
    expect(full.resume()).toEqual({ ok: true })
  })

  it('blocks model loading and probing while the rebuild is migrating or paused', async () => {
    const root = tempDir()
    const corpus = join(root, 'memories.db')
    makeCorpus(corpus)
    const lane = openEmbeddingLane({
      config: config(),
      corpusDbPath: corpus,
      dataDir: root,
      env: { [ENV_NAME]: 'test-key' },
      logger: { info: () => {}, warn: () => {} },
      fetchImpl: async (_url, init) => {
        if (init?.method === 'GET') return response({ data: [{ id: 'fixture-embed-a' }] })
        return response({ model: 'fixture-embed-a', data: [{ embedding: vector(16), index: 0 }] })
      },
    })
    await lane.probe()
    await lane.start()
    const target = lane.targetModelId()!
    addVector(corpus, 1, target)
    expect(lane.status().state).toBe('remote-migrating')
    expect(await lane.models()).toEqual({ ok: false, error: 'busy' })
    expect(await lane.probe()).toEqual({ ok: false, error: 'busy' })
    expect(lane.pause()).toEqual({ ok: true })
    expect(await lane.models()).toEqual({ ok: false, error: 'busy' })
    expect(await lane.probe()).toEqual({ ok: false, error: 'busy' })
  })

  it('uses the authoritative rebuild state when coverage is zero', async () => {
    const root = tempDir()
    const corpus = join(root, 'memories.db')
    makeCorpus(corpus)
    let requests = 0
    const lane = openEmbeddingLane({
      config: config(),
      corpusDbPath: corpus,
      dataDir: root,
      env: { [ENV_NAME]: 'test-key' },
      logger: { info: () => {}, warn: () => {} },
      fetchImpl: async () => {
        requests += 1
        return response({ model: 'fixture-embed-a', data: [{ embedding: vector(16), index: 0 }] })
      },
    })
    await lane.probe()
    expect(await lane.start()).toEqual({ ok: true })
    expect(lane.status().state).toBe('remote-target-missing')
    expect(lane.rebuildState()?.state).toBe('running')

    // The display name says target-missing; the authoritative state says a
    // rebuild is running. User load/probe must be refused, pause must work.
    expect(await lane.models()).toEqual({ ok: false, error: 'busy' })
    expect(await lane.probe()).toEqual({ ok: false, error: 'busy' })
    expect(requests).toBe(1)
    // Internal dimension repair is not the user action and stays available.
    expect(await lane.probe({ internal: true })).toMatchObject({ ok: true, dimensions: 16 })
    expect(requests).toBe(2)

    expect(lane.pause()).toEqual({ ok: true })
    expect(lane.status().state).toBe('remote-paused')
    expect(await lane.models()).toEqual({ ok: false, error: 'busy' })
    expect(lane.resume()).toEqual({ ok: true })
    expect(lane.rebuildState()?.state).toBe('running')
  })

  it('requires a fresh successful probe after a models failure before arming', async () => {
    const root = tempDir()
    const corpus = join(root, 'memories.db')
    makeCorpus(corpus)
    let failModels = false
    const lane = openEmbeddingLane({
      config: config(),
      corpusDbPath: corpus,
      dataDir: root,
      env: { [ENV_NAME]: 'test-key' },
      logger: { info: () => {}, warn: () => {} },
      fetchImpl: async (_url, init) => {
        if (init?.method === 'GET') {
          return failModels ? new Response('boom', { status: 500 }) : response({ data: [{ id: 'fixture-embed-a' }] })
        }
        return response({ model: 'fixture-embed-a', data: [{ embedding: vector(16), index: 0 }] })
      },
    })
    await lane.probe()
    failModels = true
    expect(await lane.models()).toEqual({ ok: false, error: 'server-error' })
    expect(lane.status().state).toBe('remote-error')
    expect(await lane.start()).toEqual({ ok: false, error: 'not-ready' })
  })

  it('schedules the rebuild runner without waiting for the background pass', async () => {
    const root = tempDir()
    const corpus = join(root, 'memories.db')
    makeCorpus(corpus)
    const lane = openEmbeddingLane({
      config: config(),
      corpusDbPath: corpus,
      dataDir: root,
      env: { [ENV_NAME]: 'test-key' },
      logger: { info: () => {}, warn: () => {} },
      fetchImpl: async () => response({ model: 'fixture-embed-a', data: [{ embedding: vector(16), index: 0 }] }),
    })
    await lane.probe()
    let runnerCalls = 0
    lane.setRunner(() => {
      runnerCalls += 1
      return new Promise(() => {
        /* deliberately never settles: start must not await it */
      })
    })
    await expect(lane.start()).resolves.toEqual({ ok: true })
    expect(runnerCalls).toBe(1)
  })

  it('cancels model and probe requests without writing a cache entry', async () => {
    const root = tempDir()
    const corpus = join(root, 'memories.db')
    makeCorpus(corpus)
    const lane = openEmbeddingLane({
      config: config(),
      corpusDbPath: corpus,
      dataDir: root,
      env: { [ENV_NAME]: 'test-key' },
      logger: { info: () => {}, warn: () => {} },
      fetchImpl: (_url, init) => new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')))
      }),
    })
    const controller = new AbortController()
    const pending = lane.probe({ signal: controller.signal })
    await Promise.resolve()
    controller.abort()
    expect(await pending).toEqual({ ok: false, error: 'cancelled' })
    expect(lane.status().state).toBe('remote-unprobed')

    const modelController = new AbortController()
    const modelsPending = lane.models({ signal: modelController.signal })
    await Promise.resolve()
    modelController.abort()
    expect(await modelsPending).toEqual({ ok: false, error: 'cancelled' })
    expect(lane.status().state).toBe('remote-unprobed')
  })

  it('rejects a probe result whose target changed and keeps the new target cache', async () => {
    const root = tempDir()
    const corpus = join(root, 'memories.db')
    makeCorpus(corpus)
    const configValue = config()
    let release!: (value: Response) => void
    let started!: () => void
    const startedPromise = new Promise<void>(resolve => { started = resolve })
    let slow = false
    const lane = openEmbeddingLane({
      config: configValue,
      corpusDbPath: corpus,
      dataDir: root,
      env: { [ENV_NAME]: 'test-key' },
      logger: { info: () => {}, warn: () => {} },
      fetchImpl: async () => {
        if (slow) {
          started()
          return new Promise<Response>(resolve => { release = resolve })
        }
        const model = configValue.embedding!.model
        return response({
          model,
          data: [{ embedding: vector(model === 'fixture-embed-a' ? 8 : 16), index: 0 }],
        })
      },
    })
    expect(await lane.probe()).toMatchObject({ ok: true, dimensions: 8 })
    configValue.embedding!.model = 'fixture-embed-b'
    expect(await lane.probe()).toMatchObject({ ok: true, dimensions: 16 })
    expect(lane.status().dimensions).toBe(16)

    // A probe for A is still in flight when the user commits B. Its result
    // must not be reported, written, or allowed to evict B's cache entry.
    configValue.embedding!.model = 'fixture-embed-a'
    slow = true
    const pending = lane.probe()
    await startedPromise
    configValue.embedding!.model = 'fixture-embed-b'
    release(response({ model: 'fixture-embed-a', data: [{ embedding: vector(8), index: 0 }] }))
    expect(await pending).toEqual({ ok: false, error: 'target-changed' })
    expect(lane.status().dimensions).toBe(16)
    expect(lane.status().state).toBe('remote-configured-not-started')
  })

  it('rejects a models result whose target changed during the await', async () => {
    const root = tempDir()
    const corpus = join(root, 'memories.db')
    makeCorpus(corpus)
    const configValue = config()
    let release!: (value: Response) => void
    let started!: () => void
    const startedPromise = new Promise<void>(resolve => { started = resolve })
    let slow = false
    const lane = openEmbeddingLane({
      config: configValue,
      corpusDbPath: corpus,
      dataDir: root,
      env: { [ENV_NAME]: 'test-key' },
      logger: { info: () => {}, warn: () => {} },
      fetchImpl: async () => {
        if (slow) {
          started()
          return new Promise<Response>(resolve => { release = resolve })
        }
        return response({ data: [{ id: 'fixture-embed-a' }] })
      },
    })
    slow = true
    const pending = lane.models()
    await startedPromise
    configValue.embedding!.model = 'fixture-embed-b'
    release(response({ data: [{ id: 'fixture-embed-a' }] }))
    expect(await pending).toEqual({ ok: false, error: 'target-changed' })
    // The stale list was not cached: a fresh call for B hits the network.
    slow = false
    expect(await lane.models()).toEqual({ ok: true, models: ['fixture-embed-a'] })
  })
})
