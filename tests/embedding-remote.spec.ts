import { describe, expect, it } from 'vitest'
import {
  EmbeddingRemoteError,
  apiKeyOf,
  embedRemoteBatch,
  endpointWarning,
  keyFingerprint,
  listRemoteModels,
  probeRemoteEmbedding,
  remoteIdentityHash,
  resolveEmbeddingConfig,
  type ResolvedRemoteEmbedding,
} from '../src/core/embedding-remote.ts'
import { embeddingIdentityHash } from '../src/core/embedding-local.ts'
import type { MagicContextDshConfig } from '../src/dsh/config.ts'

const ENV_NAME = 'MC_T20_TEST_KEY'

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
      queryInstruction: 'query: ',
      documentPrefix: 'doc: ',
      timeoutMs: 2_000,
      queryTimeoutMs: 500,
      batchSize: 2,
      ...overrides,
    },
  }
}

function remote(overrides: Record<string, unknown> = {}, env: NodeJS.ProcessEnv = { [ENV_NAME]: 'test-key' }): ResolvedRemoteEmbedding {
  return resolveEmbeddingConfig(config(overrides), env).remote
}

function response(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

function vector(width = 16, value = 1): number[] {
  return Array.from({ length: width }, (_, index) => index === 0 ? value : 0.01)
}

describe('embedding identity and config', () => {
  it('keeps the local identity byte-identical and namespaces remote identities', () => {
    const local = embeddingIdentityHash()
    expect(local).toMatch(/^embedding-provider:/)
    const rem = remote()
    const remoteId = remoteIdentityHash(rem, 16)
    expect(remoteId).toMatch(/^embedding-remote:/)
    expect(remoteId).not.toBe(local)
    expect(remoteIdentityHash({ ...rem, authHeader: 'api-key' }, 16)).toBe(remoteId)
    expect(remoteIdentityHash({ ...rem, queryInstruction: 'other: ' }, 16)).toBe(remoteId)
    expect(remoteIdentityHash({ ...rem, documentPrefix: 'changed' }, 16)).not.toBe(remoteId)
    expect(remoteIdentityHash({ ...rem, model: 'fixture-embed-b' }, 16)).not.toBe(remoteId)
    expect(remoteIdentityHash(rem, 16, { [ENV_NAME]: 'present' })).not.toBe(remoteId)
  })

  it('resolves defaults and clamps malformed numbers', () => {
    const resolved = resolveEmbeddingConfig({
      embedding: { provider: 'weird', timeoutMs: Number.NaN, batchSize: 999, queryTimeoutMs: 10 },
    }, {})
    expect(resolved.provider).toBe('local')
    expect(resolved.remote.timeoutMs).toBe(8_000)
    expect(resolved.remote.batchSize).toBe(64)
    expect(resolved.remote.queryTimeoutMs).toBe(500)
    expect(resolved.remote.endpoint).toBe('https://api.siliconflow.cn/v1')
  })

  it('unwraps the volatile apiKeyEnv reference and preserves an explicit empty value', () => {
    const live = (value: string): { get(): string } => ({ get: () => value })
    const resolved = resolveEmbeddingConfig({
      embedding: {
        provider: 'openai-compatible',
        preset: 'custom',
        endpoint: 'http://127.0.0.1:9999/v1',
        model: 'fixture-embed-a',
        apiKeyEnv: live(ENV_NAME),
      },
    }, {})
    expect(resolved.remote.apiKeyEnv).toBe(ENV_NAME)

    const noAuth = resolveEmbeddingConfig({
      embedding: {
        provider: 'openai-compatible',
        preset: 'custom',
        endpoint: 'http://127.0.0.1:9999/v1',
        model: 'fixture-embed-a',
        apiKeyEnv: live(''),
      },
    }, {})
    expect(noAuth.remote.apiKeyEnv).toBe('')

    const siliconflow = resolveEmbeddingConfig({
      embedding: { provider: 'openai-compatible', preset: 'siliconflow' },
    }, {})
    expect(siliconflow.remote.apiKeyEnv).toBe('SILICONFLOW_API_KEY')
  })

  it('resolves literal, then credential store, then environment', () => {
    const literal = remote({ apiKey: 'literal-key' })
    expect(apiKeyOf(literal, { [ENV_NAME]: 'env-key' }, 'cred-key')).toBe('literal-key')
    const credential = remote({ apiKey: '' })
    expect(apiKeyOf(credential, { [ENV_NAME]: 'env-key' }, 'cred-key')).toBe('cred-key')
    expect(apiKeyOf(credential, { [ENV_NAME]: 'env-key' })).toBe('env-key')
    expect(apiKeyOf(credential, { [ENV_NAME]: 'env-key' }, '')).toBe('env-key')
    // A cleared reference must not borrow a credential from a previous ref.
    expect(apiKeyOf(remote({ apiKeyEnv: '' }), { [ENV_NAME]: 'env-key' }, 'cred-key')).toBeUndefined()
    expect(keyFingerprint(credential, {}, 'cred-key')).not.toContain('cred-key')
  })

  it('never returns a key value in identity or fingerprint', () => {
    const rem = remote()
    const key = apiKeyOf(rem, { [ENV_NAME]: 'super-secret' })
    expect(key).toBe('super-secret')
    expect(keyFingerprint(rem, { [ENV_NAME]: 'super-secret' })).not.toContain('super-secret')
    expect(remoteIdentityHash(rem, 16)).not.toContain('super-secret')
  })

  it('warns about plain HTTP only for non-local endpoints', () => {
    expect(endpointWarning(remote())).toBeUndefined()
    expect(endpointWarning(remote({ endpoint: 'http://example.com/v1' }))).toBe('plain-http')
    expect(endpointWarning(remote({ endpoint: 'https://example.com/v1' }))).toBeUndefined()
  })
})

describe('model list and probe', () => {
  it('lists models through the preset filter and sends auth', async () => {
    let seenUrl = ''
    let seenAuth = ''
    const result = await listRemoteModels(remote({ preset: 'siliconflow', endpoint: 'https://api.example.test/v1' }), {
      env: { [ENV_NAME]: 'test-key' },
      lookupImpl: async () => [{ address: '93.184.216.34', family: 4 }],
      fetchImpl: async (url, init) => {
        seenUrl = url
        seenAuth = String((init?.headers as Record<string, string>).Authorization)
        return response({ object: 'list', data: [{ id: 'fixture-a' }, { id: 'fixture-b' }, { id: 'fixture-a' }] })
      },
    })
    expect(seenUrl).toBe('https://api.example.test/v1/models?sub_type=embedding')
    expect(seenAuth).toBe('Bearer test-key')
    expect(result.models).toEqual(['fixture-a', 'fixture-b'])
  })

  it('does not send a request when the configured key is absent', async () => {
    let calls = 0
    await expect(listRemoteModels(remote(), {
      env: {},
      fetchImpl: async () => {
        calls += 1
        return response({ data: [] })
      },
    })).rejects.toMatchObject({ code: 'missing-key' } satisfies Partial<EmbeddingRemoteError>)
    expect(calls).toBe(0)
  })

  it('probes dimensions without hardcoded widths', async () => {
    const result = await probeRemoteEmbedding(remote(), {
      env: { [ENV_NAME]: 'test-key' },
      fetchImpl: async () => response({ model: 'fixture-embed-a', data: [{ embedding: vector(16), index: 0 }] }),
    })
    expect(result).toMatchObject({ model: 'fixture-embed-a', dimensions: 16 })
  })

  it('maps an explicit dimensions 400 to dimensions-unsupported', async () => {
    await expect(probeRemoteEmbedding(remote({ dimensions: 16 }), {
      env: { [ENV_NAME]: 'test-key' },
      fetchImpl: async () => response({ error: 'unsupported' }, 400),
    })).rejects.toMatchObject({ code: 'dimensions-unsupported' } satisfies Partial<EmbeddingRemoteError>)
  })

  it('rejects a width that differs from the explicit override', async () => {
    await expect(probeRemoteEmbedding(remote({ dimensions: 8 }), {
      env: { [ENV_NAME]: 'test-key' },
      fetchImpl: async () => response({ model: 'fixture-embed-a', data: [{ embedding: vector(16), index: 0 }] }),
    })).rejects.toMatchObject({ code: 'dimensions-unsupported' } satisfies Partial<EmbeddingRemoteError>)
  })

  it('rejects a substituted served model', async () => {
    await expect(probeRemoteEmbedding(remote(), {
      env: { [ENV_NAME]: 'test-key' },
      fetchImpl: async () => response({ model: 'other/model', data: [{ embedding: vector(16), index: 0 }] }),
    })).rejects.toMatchObject({ code: 'model-substituted' } satisfies Partial<EmbeddingRemoteError>)
  })
})

describe('remote batches', () => {
  it('maps by index and tolerates an all-missing index in array order', async () => {
    const byIndex = await embedRemoteBatch(remote(), {
      env: { [ENV_NAME]: 'test-key' },
      fetchImpl: async () => response({
        model: 'fixture-embed-a',
        data: [
          { index: 1, embedding: vector(16, 2) },
          { index: 0, embedding: vector(16, 1) },
        ],
      }),
    }, ['first', 'second'], 'passage')
    expect(byIndex.vectors).toHaveLength(2)
    expect(byIndex.vectors[0]?.[0]).toBeCloseTo(1)

    const byOrder = await embedRemoteBatch(remote(), {
      env: { [ENV_NAME]: 'test-key' },
      fetchImpl: async () => response({
        model: 'fixture-embed-a',
        data: [{ embedding: vector(16, 3) }, { embedding: vector(16, 4) }],
      }),
    }, ['first', 'second'], 'query')
    expect(byOrder.vectors[1]?.[0]).toBeCloseTo(4)
  })

  it('rejects duplicate indices and a wrong width', async () => {
    await expect(embedRemoteBatch(remote(), {
      env: { [ENV_NAME]: 'test-key' },
      fetchImpl: async () => response({
        model: 'fixture-embed-a',
        data: [{ index: 0, embedding: vector(16) }, { index: 0, embedding: vector(16) }],
      }),
    }, ['a', 'b'], 'passage')).rejects.toMatchObject({ code: 'invalid-response' })

    await expect(embedRemoteBatch(remote({ dimensions: 8 }), {
      env: { [ENV_NAME]: 'test-key' },
      fetchImpl: async () => response({
        model: 'fixture-embed-a',
        data: [{ index: 0, embedding: vector(16) }],
      }),
    }, ['a'], 'passage')).rejects.toMatchObject({ code: 'dimensions-changed' })
  })

  it('retries a 5xx once and rejects a non-JSON body', async () => {
    let calls = 0
    const result = await embedRemoteBatch(remote(), {
      env: { [ENV_NAME]: 'test-key' },
      fetchImpl: async () => {
        calls += 1
        return calls === 1
          ? response({ error: 'temporary' }, 503)
          : response({ model: 'fixture-embed-a', data: [{ embedding: vector(16), index: 0 }] })
      },
    }, ['a'], 'passage')
    expect(calls).toBe(2)
    expect(result.vectors).toHaveLength(1)

    await expect(embedRemoteBatch(remote(), {
      env: { [ENV_NAME]: 'test-key' },
      fetchImpl: async () => new Response('not json', { status: 200 }),
    }, ['a'], 'passage')).rejects.toMatchObject({ code: 'invalid-json' })
  })

  it('isolates an input-too-long row instead of blocking the batch', async () => {
    const result = await embedRemoteBatch(remote(), {
      env: { [ENV_NAME]: 'test-key' },
      fetchImpl: async (_url, init) => {
        const body = JSON.parse(String(init?.body)) as { input: string[] }
        if (body.input.length > 1 || body.input[0]?.includes('too long')) {
          return new Response('input is too long', { status: 400 })
        }
        return response({ model: 'fixture-embed-a', data: [{ embedding: vector(16), index: 0 }] })
      },
    }, ['good', 'too long'], 'passage', { allowRowFailure: true })
    expect(result.vectors).toHaveLength(2)
    expect(result.vectors[0]).toBeInstanceOf(Float32Array)
    expect(result.vectors[1]).toBeNull()
  })

  it('blocks metadata endpoints and userinfo/query endpoints', async () => {
    await expect(embedRemoteBatch(remote({ endpoint: 'http://169.254.169.254/v1' }), {
      env: { [ENV_NAME]: 'test-key' },
      fetchImpl: async () => response({ data: [] }),
    }, ['a'], 'passage')).rejects.toMatchObject({ code: 'blocked-endpoint' })

    // URL normalizes IPv4-mapped metadata to `::ffff:a9fe:a9fe`.
    await expect(embedRemoteBatch(remote({ endpoint: 'http://[::ffff:169.254.169.254]/v1' }), {
      env: { [ENV_NAME]: 'test-key' },
      fetchImpl: async () => response({ data: [] }),
    }, ['a'], 'passage')).rejects.toMatchObject({ code: 'blocked-endpoint' })

    await expect(embedRemoteBatch(remote({ endpoint: 'https://user:pass@example.com/v1' }), {
      env: { [ENV_NAME]: 'test-key' },
      fetchImpl: async () => response({ data: [] }),
    }, ['a'], 'passage')).rejects.toMatchObject({ code: 'endpoint-userinfo' })

    await expect(embedRemoteBatch(remote({ endpoint: 'https://example.com/v1?x=1' }), {
      env: { [ENV_NAME]: 'test-key' },
      fetchImpl: async () => response({ data: [] }),
    }, ['a'], 'passage')).rejects.toMatchObject({ code: 'endpoint-query' })
  })
})
