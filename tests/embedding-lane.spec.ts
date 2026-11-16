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
})
