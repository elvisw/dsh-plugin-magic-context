/**
 * T19/T20: the OpenAI-compatible remote embedding client.
 *
 * This module is deliberately protocol-only. A provider preset supplies an
 * endpoint and a model-list descriptor; neither supplies model ids or vector
 * widths. Dimensions come from a probe response, never from a compiled table.
 *
 * The security posture is part of the contract, not an afterthought:
 * keys are read from the environment at call time, redirects are refused,
 * endpoints cannot carry userinfo/query strings, and link-local/metadata
 * addresses are rejected before a request is sent.
 */
import { createHash } from 'node:crypto'
import { lookup as dnsLookup } from 'node:dns/promises'
import { liveNumber, liveString, liveValue } from '../dsh/volatile.ts'
import type { MagicContextDshConfig } from '../dsh/config.ts'

export type EmbeddingPurpose = 'query' | 'passage'

export interface ResolvedRemoteEmbedding {
  readonly provider: 'openai-compatible'
  readonly preset: string
  readonly endpoint: string
  readonly authHeader: 'authorization' | 'api-key'
  readonly model: string
  readonly apiKeyEnv: string
  readonly dimensions: number
  readonly queryInstruction: string
  readonly documentPrefix: string
  readonly timeoutMs: number
  readonly queryTimeoutMs: number
  readonly batchSize: number
}

export interface ResolvedEmbeddingConfig {
  readonly provider: 'local' | 'openai-compatible' | 'off'
  readonly remote: ResolvedRemoteEmbedding
}

export interface EmbeddingFetch {
  (input: string, init?: RequestInit): Promise<Response>
}

export interface EmbeddingLookup {
  (hostname: string): Promise<ReadonlyArray<{ address: string; family: number }>>
}

export interface RemoteCallDeps {
  readonly fetchImpl?: EmbeddingFetch
  readonly lookupImpl?: EmbeddingLookup
  readonly env?: NodeJS.ProcessEnv
  readonly now?: () => number
  /** Caller cancellation (native deferred actions, query teardown). */
  readonly signal?: AbortSignal
}

export interface RemoteModelList {
  readonly models: readonly string[]
  readonly endpoint: string
}

export interface RemoteProbe {
  readonly model: string
  readonly dimensions: number
  readonly latencyMs: number
}

export interface RemoteBatch {
  readonly vectors: ReadonlyArray<Float32Array | null>
  readonly servedModel?: string
}

/** Stable, sanitized failures. The message is a code, never a provider body. */
export class EmbeddingRemoteError extends Error {
  readonly code: string
  readonly status?: number
  readonly retryAfterMs?: number

  constructor(code: string, status?: number, retryAfterMs?: number) {
    super(code)
    this.name = 'EmbeddingRemoteError'
    this.code = code
    this.status = status
    this.retryAfterMs = retryAfterMs
  }
}

const DEFAULT_ENDPOINT = 'https://api.siliconflow.cn/v1'
const DEFAULT_KEY_ENV = 'SILICONFLOW_API_KEY'
const MAX_BODY_BYTES = 8 * 1024 * 1024
const MAX_MODELS = 2_000

/** Resolve live config without throwing on bad numbers: clamp to the contract. */
export function resolveEmbeddingConfig(
  config: MagicContextDshConfig,
  env: NodeJS.ProcessEnv = process.env,
): ResolvedEmbeddingConfig {
  const raw = (config.embedding ?? {}) as Record<string, unknown>
  const providerRaw = liveString(raw.provider, 'local').trim().toLowerCase()
  const provider = providerRaw === 'openai-compatible' || providerRaw === 'off' ? providerRaw : 'local'
  const preset = liveString(raw.preset, 'siliconflow').trim().toLowerCase() || 'siliconflow'
  const endpoint = normalizeEndpoint(liveString(raw.endpoint, ''), preset)
  const authRaw = liveString(raw.authHeader, 'authorization').trim().toLowerCase()
  const authHeader = authRaw === 'api-key' ? 'api-key' : 'authorization'
  const model = liveString(raw.model, '').trim()
  const keyEnvRaw = liveValue(raw.apiKeyEnv)
  const keyEnvValue = typeof keyEnvRaw === 'string' ? keyEnvRaw.trim() : undefined
  // A custom preset may deliberately use an empty value for a no-auth local
  // server. The SiliconFlow preset keeps its conventional env fallback.
  const apiKeyEnv = keyEnvValue !== undefined && keyEnvValue !== ''
    ? keyEnvValue
    : preset === 'siliconflow' ? DEFAULT_KEY_ENV : ''
  const dimensions = clampInt(liveNumber(raw.dimensions, 0), 0, 0, 16_384)
  const queryInstruction = liveString(raw.queryInstruction, '')
  const documentPrefix = liveString(raw.documentPrefix, '')
  const timeoutMs = clampInt(liveNumber(raw.timeoutMs, 8_000), 8_000, 1_000, 120_000)
  const queryTimeoutMs = clampInt(liveNumber(raw.queryTimeoutMs, 2_500), 2_500, 500, 10_000)
  const batchSize = clampInt(liveNumber(raw.batchSize, 16), 16, 1, 64)
  void env
  return {
    provider,
    remote: {
      provider: 'openai-compatible',
      preset: preset === 'siliconflow' ? 'siliconflow' : 'custom',
      endpoint,
      authHeader,
      model,
      apiKeyEnv,
      dimensions,
      queryInstruction,
      documentPrefix,
      timeoutMs,
      queryTimeoutMs,
      batchSize,
    },
  }
}

function clampInt(value: number, fallback: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return fallback
  const rounded = Math.floor(value)
  if (!Number.isFinite(rounded)) return fallback
  return Math.min(max, Math.max(min, rounded))
}

/** The endpoint is a base; accept a full `/embeddings` URL as convenience. */
export function normalizeEndpoint(value: string, preset = 'custom'): string {
  const trimmed = value.trim()
  if (trimmed === '') return preset === 'siliconflow' ? DEFAULT_ENDPOINT : ''
  return trimmed.replace(/\/+$/, '').replace(/\/embeddings$/i, '')
}

export function apiKeyOf(remote: ResolvedRemoteEmbedding, env: NodeJS.ProcessEnv = process.env): string | undefined {
  if (remote.apiKeyEnv === '') return undefined
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(remote.apiKeyEnv)) {
    throw new EmbeddingRemoteError('invalid-key-env')
  }
  const value = env[remote.apiKeyEnv]
  return value === undefined || value === '' ? undefined : value
}

export function keyPresent(remote: ResolvedRemoteEmbedding, env: NodeJS.ProcessEnv = process.env): boolean {
  try {
    return apiKeyOf(remote, env) !== undefined
  } catch {
    return false
  }
}

/** In-memory only; never persisted, logged or returned. */
export function keyFingerprint(remote: ResolvedRemoteEmbedding, env: NodeJS.ProcessEnv = process.env): string {
  const key = apiKeyOf(remote, env)
  return key === undefined ? 'absent' : createHash('sha256').update(key).digest('hex').slice(0, 16)
}

/** A namespaced identity, so a remote row is never mistaken for a local one. */
export function remoteIdentityHash(
  remote: ResolvedRemoteEmbedding,
  dimensions: number,
  env: NodeJS.ProcessEnv = process.env,
): string {
  const digest = createHash('md5').update(JSON.stringify({
    provider: 'openai-compatible',
    model: remote.model,
    endpoint: remote.endpoint,
    apiKeyPresent: keyPresent(remote, env),
    dimensions,
    documentPrefix: remote.documentPrefix,
  })).digest('hex')
  return `embedding-remote:${digest}`
}

export function isRemoteModelId(value: string | undefined): boolean {
  return value?.startsWith('embedding-remote:') === true
}

export function endpointWarning(remote: ResolvedRemoteEmbedding): string | undefined {
  try {
    const url = new URL(remote.endpoint)
    if (url.protocol === 'http:' && !isLocalHost(url.hostname) && !isPrivateHost(url.hostname)) return 'plain-http'
  } catch {
    return 'invalid-endpoint'
  }
  return undefined
}

/* ------------------------------------------------------------------ *
 * URL / SSRF guards
 * ------------------------------------------------------------------ */

export function assertEndpoint(remote: ResolvedRemoteEmbedding): URL {
  let url: URL
  try {
    url = new URL(remote.endpoint)
  } catch {
    throw new EmbeddingRemoteError('invalid-endpoint')
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new EmbeddingRemoteError('invalid-endpoint')
  if (url.username !== '' || url.password !== '') throw new EmbeddingRemoteError('endpoint-userinfo')
  if (url.search !== '' || url.hash !== '') throw new EmbeddingRemoteError('endpoint-query')
  if (url.hostname === '') throw new EmbeddingRemoteError('invalid-endpoint')
  return url
}

async function guardHost(hostname: string, lookupImpl: EmbeddingLookup): Promise<void> {
  if (isLocalHost(hostname) || isPrivateHost(hostname)) return
  if (isIpAddress(hostname)) {
    if (isBlockedAddress(hostname)) throw new EmbeddingRemoteError('blocked-endpoint')
    return
  }
  let addresses: ReadonlyArray<{ address: string; family: number }>
  try {
    addresses = await lookupImpl(hostname)
  } catch {
    throw new EmbeddingRemoteError('dns-failed')
  }
  if (addresses.length === 0) throw new EmbeddingRemoteError('dns-failed')
  for (const entry of addresses) {
    if (isBlockedAddress(entry.address)) throw new EmbeddingRemoteError('blocked-endpoint')
  }
}

function isLocalHost(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, '')
  return host === 'localhost' || host === '::1' || host === '0:0:0:0:0:0:0:1'
}

function isPrivateHost(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, '')
  if (host.endsWith('.localhost') || host.endsWith('.local')) return true
  const v4 = parseIpv4(host)
  if (v4 !== undefined) return isPrivateV4(v4)
  return false
}

function isIpAddress(hostname: string): boolean {
  const host = hostname.replace(/^\[|\]$/g, '')
  return parseIpv4(host) !== undefined || host.includes(':')
}

function isBlockedAddress(address: string): boolean {
  const host = address.toLowerCase().replace(/^\[|\]$/g, '')
  if (host === '::1' || host === '0:0:0:0:0:0:0:1') return false
  if (host === '0.0.0.0' || host === '::') return true
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i.exec(host)
  if (mapped !== null) return isBlockedAddress(mapped[1]!)
  const mappedHex = /^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/i.exec(host)
  if (mappedHex !== null) {
    const high = Number.parseInt(mappedHex[1]!, 16)
    const low = Number.parseInt(mappedHex[2]!, 16)
    return isBlockedAddress([high >> 8, high & 0xff, low >> 8, low & 0xff].join('.'))
  }
  const v4 = parseIpv4(host)
  if (v4 !== undefined) {
    if (v4[0] === 169 && v4[1] === 254) return true
    if (v4[0] === 100 && v4[1] === 100 && v4[2] === 100 && v4[3] === 200) return true
    return false
  }
  if (host.startsWith('fe80:') || host.startsWith('fec0:')) return true
  if (host.startsWith('fc') || host.startsWith('fd')) return false
  return false
}

function isPrivateV4(v4: readonly number[]): boolean {
  if (v4[0] === 10) return true
  if (v4[0] === 127) return true
  if (v4[0] === 192 && v4[1] === 168) return true
  if (v4[0] === 172 && v4[1] !== undefined && v4[1] >= 16 && v4[1] <= 31) return true
  return false
}

function parseIpv4(host: string): number[] | undefined {
  const parts = host.split('.')
  if (parts.length !== 4) return undefined
  const nums = parts.map(part => (/^\d{1,3}$/.test(part) ? Number(part) : Number.NaN))
  return nums.every(n => Number.isInteger(n) && n >= 0 && n <= 255) ? nums : undefined
}

/* ------------------------------------------------------------------ *
 * HTTP
 * ------------------------------------------------------------------ */

function authHeaders(remote: ResolvedRemoteEmbedding, env: NodeJS.ProcessEnv): Record<string, string> {
  const key = apiKeyOf(remote, env)
  if (key === undefined) {
    if (remote.apiKeyEnv !== '') throw new EmbeddingRemoteError('missing-key')
    return {}
  }
  return remote.authHeader === 'api-key'
    ? { 'api-key': key }
    : { Authorization: `Bearer ${key}` }
}

interface DeadlineResponse {
  readonly response: Response
  readonly done: () => void
}

async function readJson(deadline: DeadlineResponse): Promise<unknown> {
  const { response } = deadline
  try {
    const text = await response.text()
    if (text.length > MAX_BODY_BYTES) throw new EmbeddingRemoteError('response-too-large', response.status)
    try {
      return JSON.parse(text) as unknown
    } catch {
      throw new EmbeddingRemoteError('invalid-json', response.status)
    }
  } catch (error) {
    if (error instanceof EmbeddingRemoteError) throw error
    throw new EmbeddingRemoteError(response.status >= 400 ? statusError(response.status).code : 'network', response.status)
  } finally {
    deadline.done()
  }
}

async function postWithDeadline(
  remote: ResolvedRemoteEmbedding,
  deps: RemoteCallDeps,
  path: string,
  body: unknown,
  timeoutMs: number,
  signal?: AbortSignal,
): Promise<DeadlineResponse> {
  const url = assertEndpoint(remote)
  const lookupImpl = deps.lookupImpl ?? (async hostname => dnsLookup(hostname, { all: true }))
  await guardHost(url.hostname, lookupImpl)
  const fetchImpl = deps.fetchImpl ?? fetch
  const controller = new AbortController()
  let timedOut = false
  const abort = (): void => controller.abort()
  const timer = setTimeout(() => {
    timedOut = true
    abort()
  }, Math.max(1, timeoutMs))
  let settled = false
  const done = (): void => {
    if (settled) return
    settled = true
    clearTimeout(timer)
    if (signal !== undefined) signal.removeEventListener('abort', abort)
  }
  if (signal !== undefined) {
    if (signal.aborted) abort()
    else signal.addEventListener('abort', abort, { once: true })
  }
  try {
    const target = `${remote.endpoint.replace(/\/+$/, '')}${path}`
    const response = await fetchImpl(target, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...authHeaders(remote, deps.env ?? process.env),
      },
      body: JSON.stringify(body),
      redirect: 'error',
      signal: controller.signal,
    })
    return { response, done }
  } catch (error) {
    done()
    if (error instanceof EmbeddingRemoteError) throw error
    if (signal?.aborted === true) throw new EmbeddingRemoteError('cancelled')
    throw new EmbeddingRemoteError(timedOut ? 'timeout' : 'network')
  }
}

function statusError(status: number): EmbeddingRemoteError {
  if (status === 401 || status === 403) return new EmbeddingRemoteError('auth-failed', status)
  if (status === 404) return new EmbeddingRemoteError('model-not-found', status)
  if (status === 429) return new EmbeddingRemoteError('rate-limited', status)
  if (status === 400) return new EmbeddingRemoteError('bad-request', status)
  if (status >= 500) return new EmbeddingRemoteError('server-error', status)
  return new EmbeddingRemoteError('http-error', status)
}

const sleep = async (ms: number): Promise<void> => new Promise(resolve => setTimeout(resolve, ms))

/* ------------------------------------------------------------------ *
 * Models
 * ------------------------------------------------------------------ */

export async function listRemoteModels(
  remote: ResolvedRemoteEmbedding,
  deps: RemoteCallDeps = {},
): Promise<RemoteModelList> {
  const url = assertEndpoint(remote)
  const lookupImpl = deps.lookupImpl ?? (async hostname => dnsLookup(hostname, { all: true }))
  await guardHost(url.hostname, lookupImpl)
  const path = remote.preset === 'siliconflow' ? '/models?sub_type=embedding' : '/models'
  const fetchImpl = deps.fetchImpl ?? fetch
  const controller = new AbortController()
  let timedOut = false
  const onAbort = (): void => controller.abort()
  const timer = setTimeout(() => {
    timedOut = true
    controller.abort()
  }, remote.timeoutMs)
  if (deps.signal !== undefined) {
    if (deps.signal.aborted) {
      clearTimeout(timer)
      throw new EmbeddingRemoteError('cancelled')
    }
    deps.signal.addEventListener('abort', onAbort, { once: true })
  }
  try {
    const response = await fetchImpl(`${remote.endpoint.replace(/\/+$/, '')}${path}`, {
      method: 'GET',
      headers: authHeaders(remote, deps.env ?? process.env),
      redirect: 'error',
      signal: controller.signal,
    })
    if (!response.ok) throw statusError(response.status)
    const payload = await readJson({ response, done: () => { clearTimeout(timer) } })
    const data = (payload as { data?: unknown }).data
    if (!Array.isArray(data)) throw new EmbeddingRemoteError('invalid-response')
    const models: string[] = []
    const seen = new Set<string>()
    for (const entry of data.slice(0, MAX_MODELS)) {
      const id = (entry as { id?: unknown }).id
      if (typeof id !== 'string' || id.trim() === '' || seen.has(id)) continue
      seen.add(id)
      models.push(id)
    }
    return { models, endpoint: remote.endpoint }
  } catch (error) {
    if (error instanceof EmbeddingRemoteError) throw error
    if (deps.signal?.aborted === true) throw new EmbeddingRemoteError('cancelled')
    throw new EmbeddingRemoteError(timedOut ? 'timeout' : 'network')
  } finally {
    clearTimeout(timer)
    deps.signal?.removeEventListener('abort', onAbort)
  }
}

/* ------------------------------------------------------------------ *
 * Probe
 * ------------------------------------------------------------------ */

export async function probeRemoteEmbedding(
  remote: ResolvedRemoteEmbedding,
  deps: RemoteCallDeps = {},
): Promise<RemoteProbe> {
  const started = (deps.now ?? Date.now)()
  const deadline = await postWithDeadline(remote, deps, '/embeddings', {
    model: remote.model,
    input: ['dimension probe'],
    ...remote.dimensions > 0 ? { dimensions: remote.dimensions } : {},
  }, remote.timeoutMs, deps.signal)
  const { response } = deadline
  if (!response.ok) {
    deadline.done()
    if (response.status === 400 && remote.dimensions > 0) {
      throw new EmbeddingRemoteError('dimensions-unsupported', response.status)
    }
    throw statusError(response.status)
  }
  const payload = await readJson(deadline)
  const served = (payload as { model?: unknown }).model
  if (typeof served === 'string' && remote.model !== '' && !modelsMatch(served, remote.model)) {
    throw new EmbeddingRemoteError('model-substituted')
  }
  const data = (payload as { data?: unknown }).data
  if (!Array.isArray(data) || data.length === 0) throw new EmbeddingRemoteError('invalid-response')
  const embedding = (data[0] as { embedding?: unknown }).embedding
  if (!Array.isArray(embedding) || embedding.length === 0) throw new EmbeddingRemoteError('invalid-response')
  const width = embedding.length
  if (remote.dimensions > 0 && width !== remote.dimensions) {
    throw new EmbeddingRemoteError('dimensions-unsupported')
  }
  return {
    model: typeof served === 'string' && served !== '' ? served : remote.model,
    dimensions: width,
    latencyMs: Math.max(0, (deps.now ?? Date.now)() - started),
  }
}

/* ------------------------------------------------------------------ *
 * Embeddings
 * ------------------------------------------------------------------ */

function modelsMatch(served: string, requested: string): boolean {
  const normalize = (value: string): string => value.toLowerCase().replace(/^[^/]+\//, '').replace(/[:@].*$/, '')
  const a = normalize(served)
  const b = normalize(requested)
  if (a === b) return true
  return a.endsWith('/' + b) || b.endsWith('/' + a) || a.endsWith('-' + b) || b.endsWith('-' + a)
}

function looksInputTooLong(body: string): boolean {
  const lower = body.toLowerCase()
  return /too long|max(imum)? (context|length|token)|input.*(length|token)|context length/.test(lower)
}

interface BatchRequest {
  readonly texts: readonly string[]
  readonly purpose: EmbeddingPurpose
}

async function requestBatch(
  remote: ResolvedRemoteEmbedding,
  deps: RemoteCallDeps,
  texts: readonly string[],
  purpose: EmbeddingPurpose,
  signal?: AbortSignal,
  expectedDimensions?: number,
): Promise<RemoteBatch> {
  const prefixed = texts.map(text => purpose === 'query' ? remote.queryInstruction + text : remote.documentPrefix + text)
  const deadline = await postWithDeadline(remote, deps, '/embeddings', {
    model: remote.model,
    input: prefixed,
    ...remote.dimensions > 0 ? { dimensions: remote.dimensions } : {},
  }, purpose === 'query' ? remote.queryTimeoutMs : remote.timeoutMs, signal)
  const { response } = deadline
  if (!response.ok) {
    if (response.status === 400) {
      const body = await response.text().catch(() => '')
      deadline.done()
      if (looksInputTooLong(body)) throw new EmbeddingRemoteError('input-too-long', response.status)
    } else {
      deadline.done()
    }
    if (response.status === 429) {
      const header = response.headers.get('retry-after')
      const seconds = header === null ? Number.NaN : Number(header)
      throw new EmbeddingRemoteError('rate-limited', 429,
        Number.isFinite(seconds) && seconds > 0 ? Math.min(5_000, seconds * 1_000) : undefined)
    }
    throw statusError(response.status)
  }
  const payload = await readJson(deadline)
  const served = (payload as { model?: unknown }).model
  if (typeof served === 'string' && remote.model !== '' && !modelsMatch(served, remote.model)) {
    throw new EmbeddingRemoteError('model-substituted')
  }
  const data = (payload as { data?: unknown }).data
  if (!Array.isArray(data) || data.length !== texts.length) throw new EmbeddingRemoteError('invalid-response')
  const slots: Array<Float32Array | undefined> = new Array<Float32Array | undefined>(texts.length)
  let allMissingIndex = true
  const seen = new Set<number>()
  for (const entry of data) {
    const index = (entry as { index?: unknown }).index
    const embedding = (entry as { embedding?: unknown }).embedding
    if (!Array.isArray(embedding) || embedding.length === 0) throw new EmbeddingRemoteError('invalid-response')
    if (index !== undefined) {
      allMissingIndex = false
      if (!Number.isInteger(index) || (index as number) < 0 || (index as number) >= texts.length || seen.has(index as number)) {
        throw new EmbeddingRemoteError('invalid-response')
      }
      seen.add(index as number)
      slots[index as number] = vectorOf(embedding)
    } else {
      const position = data.indexOf(entry)
      if (position < 0) throw new EmbeddingRemoteError('invalid-response')
      slots[position] = vectorOf(embedding)
    }
  }
  if (!allMissingIndex && seen.size !== texts.length) throw new EmbeddingRemoteError('invalid-response')
  if (allMissingIndex && data.length !== texts.length) throw new EmbeddingRemoteError('invalid-response')
  const expected = expectedDimensions ?? remote.dimensions
  const vectors: Array<Float32Array | null> = []
  for (let i = 0; i < texts.length; i += 1) {
    const vector = slots[i]
    if (vector === undefined) throw new EmbeddingRemoteError('invalid-response')
    if (expected > 0 && vector.length !== expected) throw new EmbeddingRemoteError('dimensions-changed')
    vectors.push(vector)
  }
  return { vectors, ...typeof served === 'string' ? { servedModel: served } : {} }
}

function vectorOf(value: readonly unknown[]): Float32Array {
  if (!value.every(item => typeof item === 'number' && Number.isFinite(item))) {
    throw new EmbeddingRemoteError('invalid-response')
  }
  return Float32Array.from(value as number[])
}

export async function embedRemoteBatch(
  remote: ResolvedRemoteEmbedding,
  deps: RemoteCallDeps,
  texts: readonly string[],
  purpose: EmbeddingPurpose,
  options: { signal?: AbortSignal; allowRowFailure?: boolean; expectedDimensions?: number } = {},
): Promise<RemoteBatch> {
  if (texts.length === 0) return { vectors: [] }
  if (remote.model.trim() === '') throw new EmbeddingRemoteError('model-required')
  const size = Math.max(1, Math.floor(remote.batchSize))
  if (texts.length > size) {
    const vectors: Array<Float32Array | null> = []
    for (let start = 0; start < texts.length; start += size) {
      const part = await embedRemoteBatch(remote, deps, texts.slice(start, start + size), purpose, options)
      vectors.push(...part.vectors)
    }
    return { vectors }
  }
  let lastError: unknown
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      return await requestBatch(remote, deps, texts, purpose, options.signal, options.expectedDimensions)
    } catch (error) {
      lastError = error
      if (!(error instanceof EmbeddingRemoteError)) throw error
      if (error.code === 'input-too-long' && options.allowRowFailure === true) {
        return isolateLongRows(remote, deps, texts, purpose, options.signal, options.expectedDimensions)
      }
      if ((error.code === 'server-error' || (error.code === 'rate-limited' && purpose !== 'query')) && attempt === 0) {
        await sleep(error.code === 'rate-limited' ? (error.retryAfterMs ?? 500) : 150)
        continue
      }
      throw error
    }
  }
  throw lastError instanceof Error ? lastError : new EmbeddingRemoteError('network')
}

async function isolateLongRows(
  remote: ResolvedRemoteEmbedding,
  deps: RemoteCallDeps,
  texts: readonly string[],
  purpose: EmbeddingPurpose,
  signal?: AbortSignal,
  expectedDimensions?: number,
): Promise<RemoteBatch> {
  const vectors: Array<Float32Array | null> = []
  for (const text of texts) {
    try {
      const single = await requestBatch(remote, deps, [text], purpose, signal)
      vectors.push(single.vectors[0] ?? null)
    } catch (error) {
      if (error instanceof EmbeddingRemoteError && error.code === 'input-too-long') {
        vectors.push(null)
        continue
      }
      throw error
    }
  }
  return { vectors }
}
