/**
 * T20: the embedding lane — provider selection, probe cache, rebuild state and
 * the plugin-owned `/mc-embedding` routes.
 *
 * The lane is deliberately the only place that knows about "the target vector
 * space". Search and backfill ask it; they never infer a space from row counts.
 * A remote space is namespaced (`embedding-remote:…`) and is only queryable or
 * writable after an explicit armed `start`.
 */
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import type { MagicContextDshConfig } from './config.ts'
import { liveBoolean } from './volatile.ts'
import {
  EmbeddingRemoteError,
  apiKeyOf,
  embedRemoteBatch,
  endpointWarning,
  keyFingerprint,
  isRemoteModelId,
  keyPresent,
  listRemoteModels,
  probeRemoteEmbedding,
  remoteIdentityHash,
  resolveEmbeddingConfig,
  type EmbeddingFetch,
  type EmbeddingLookup,
  type ResolvedEmbeddingConfig,
  type ResolvedRemoteEmbedding,
} from '../core/embedding-remote.ts'
import {
  defaultEmbeddingCacheDir,
  embeddingIdentityHash,
  openLocalEmbedder,
  type LocalEmbedder,
} from '../core/embedding-local.ts'
import { measureTargetCoverage, measureVectorLane, type VectorCoverage } from '../core/vector-lane.ts'
import type { VectorBackfillOutcome } from '../core/vector-backfill.ts'
import type { TelemetryRequest, TelemetryResponse } from './telemetry.ts'

export type EmbeddingState =
  | 'local'
  | 'rollback-local'
  | 'remote-off'
  | 'remote-unprobed'
  | 'remote-configured-not-started'
  | 'remote-paused'
  | 'remote-target-missing'
  | 'remote-migrating'
  | 'remote-ready'
  | 'remote-error'

export interface EmbeddingStatus {
  readonly provider: 'local' | 'openai-compatible' | 'off'
  readonly state: EmbeddingState
  readonly memoryEnabled: boolean
  readonly preset: string
  readonly endpoint: string
  readonly authHeader: 'authorization' | 'api-key'
  readonly model: string
  readonly dimensions: number | null
  readonly keyEnv: string
  readonly keyPresent: boolean
  readonly target: string | null
  readonly coverage: VectorCoverage | null
  readonly progress: { readonly processed: number | null; readonly total: number | null; readonly failures: number | null }
  readonly lastError?: string
  readonly httpWarning?: string
}

export interface EmbeddingModelsResult {
  readonly ok: boolean
  readonly models?: readonly string[]
  readonly error?: string
}

export interface EmbeddingProbeResult {
  readonly ok: boolean
  readonly model?: string
  readonly dimensions?: number
  readonly latencyMs?: number
  readonly error?: string
}

export interface EmbeddingCancellableOptions {
  readonly signal?: AbortSignal
}

export interface EmbeddingProbeOptions extends EmbeddingCancellableOptions {
  /**
   * Internal dimension repair after `dimensions-changed`. It may run while a
   * rebuild is armed; the user-facing probe is still refused as `busy`.
   */
  readonly internal?: boolean
}

export interface EmbeddingRebuildSnapshot {
  readonly state: 'running' | 'paused' | 'complete'
  readonly targetIdentity: string
}

/** The native panel and the HTTP lane share these action names. */
export type EmbeddingActionName = 'models' | 'probe' | 'start' | 'pause' | 'resume'

/**
 * The authoritative action gate (T23). The browser keeps its presentation
 * gates, but a native panel or a direct HTTP caller must not be able to bypass
 * them: memory off, a configured-but-absent key, an unprobed target, an empty
 * corpus and a running/paused rebuild are all refusals decided HERE.
 *
 * `rebuilt` is the armed rebuild state for the CURRENT target, not the
 * presentation name: `deriveState` reports `remote-target-missing` while an
 * authoritative rebuild is already running with zero covered rows, so using
 * only `status.state` wrongly allowed models/probes there and made Pause say
 * `not-running`.
 *
 * Returns a stable error code, or `undefined` when the action may proceed.
 * Pure and server-importable so both the lane and its specs use one matrix.
 */
export function embeddingActionRefusal(
  action: EmbeddingActionName,
  status: EmbeddingStatus,
  rebuilt: EmbeddingRebuildSnapshot | null = null,
): string | undefined {
  if (status.provider !== 'openai-compatible') return 'not-remote'
  if (!status.memoryEnabled) return 'memory-disabled'
  const keyMissing = status.keyEnv !== '' && !status.keyPresent
  if (action === 'models' || action === 'probe') {
    if (rebuilt?.state === 'running' || rebuilt?.state === 'paused') return 'busy'
    if (status.endpoint === '') return 'endpoint-required'
    if (action === 'probe' && status.model.trim() === '') return 'model-required'
    if (keyMissing) return 'missing-key'
    return undefined
  }
  if (action === 'start') {
    if (status.model.trim() === '') return 'model-required'
    if (keyMissing) return 'missing-key'
    if (status.state === 'remote-unprobed') return 'probe-required'
    if (rebuilt?.state === 'running') return 'already-running'
    if (rebuilt?.state === 'paused') return 'paused'
    if (status.state === 'remote-ready') return 'already-complete'
    // Coverage must exist and be non-empty, but `covered` may legitimately be
    // zero here: Start is exactly the action that begins covering the target.
    if (status.coverage === null || status.coverage.total === 0) return 'coverage-missing'
    // Match the Web gate: a failed probe/models call leaves the lane in
    // `remote-error` and the user must test again before arming.
    if (status.state !== 'remote-configured-not-started') return 'not-ready'
    return undefined
  }
  if (action === 'pause') {
    if (rebuilt?.state === 'paused') return 'already-paused'
    return rebuilt?.state === 'running' ? undefined : 'not-running'
  }
  if (action === 'resume') return rebuilt?.state === 'paused' ? undefined : 'not-paused'
  return undefined
}

export interface EmbeddingLane {
  readonly status: () => EmbeddingStatus
  readonly localEmbedder: () => LocalEmbedder | undefined
  readonly providerKind: () => 'local' | 'openai-compatible' | 'off'
  readonly isRemote: () => boolean
  readonly localTargetModelId: () => string
  readonly targetModelId: () => string | null
  readonly dimensions: () => number | null
  readonly remoteQueryModelId: () => string | null
  readonly remoteWritable: () => boolean
  readonly models: (options?: EmbeddingCancellableOptions) => Promise<EmbeddingModelsResult>
  readonly probe: (options?: EmbeddingProbeOptions) => Promise<EmbeddingProbeResult>
  readonly start: () => Promise<{ ok: boolean; error?: string }>
  readonly pause: () => { ok: boolean; error?: string }
  readonly resume: () => { ok: boolean; error?: string }
  readonly disarm: () => { ok: boolean; error?: string }
  /** The authoritative armed rebuild for the current target (not display state). */
  readonly rebuildState: () => EmbeddingRebuildSnapshot | null
  /** The loader event handler and the native bridge use this to avoid a no-op disarm. */
  readonly hasRebuildState: () => boolean
  readonly setRunner: (runner: (() => Promise<VectorBackfillOutcome | undefined>) | undefined) => void
  readonly embedPassages: (texts: readonly string[]) => Promise<readonly Float32Array[]>
  readonly embedQuery: (text: string, signal?: AbortSignal) => Promise<Float32Array | null>
  readonly afterBackfill: (outcome: VectorBackfillOutcome) => void
  readonly handle: (req: TelemetryRequest, res: TelemetryResponse) => void
}

export interface EmbeddingLaneDeps {
  readonly config: MagicContextDshConfig
  readonly corpusDbPath: string
  readonly dataDir: string
  readonly logger: { info(message: string): void; warn(message: string): void }
  readonly fetchImpl?: EmbeddingFetch
  readonly lookupImpl?: EmbeddingLookup
  readonly env?: NodeJS.ProcessEnv
  readonly now?: () => number
}

interface ProbeCacheEntry {
  readonly endpoint: string
  readonly preset: string
  readonly authHeader: string
  readonly model: string
  readonly dimensionsOverride: number
  readonly keyPresent: boolean
  readonly dims: number
  readonly probedAt: number
}

interface RebuildState {
  readonly version: 1
  readonly targetIdentity: string
  readonly state: 'running' | 'paused' | 'complete'
  readonly armedAt: number
  readonly startedAt: number
  readonly updatedAt: number
  readonly processed: number
  readonly total: number
  readonly failures: number
}

const CACHE_FILE = 'embedding-cache.json'
const REBUILD_FILE = 'embedding-rebuild.json'
const MODEL_CACHE_MS = 15 * 60_000

export function openEmbeddingLane(deps: EmbeddingLaneDeps): EmbeddingLane {
  const env = deps.env ?? process.env
  const now = deps.now ?? Date.now
  const cachePath = join(deps.dataDir, CACHE_FILE)
  const statePath = join(deps.dataDir, REBUILD_FILE)
  let local: LocalEmbedder | undefined
  let lastError: string | undefined
  let rollbackLocal = false
  let modelCache: { key: string; at: number; models: readonly string[] } | undefined
  let runner: (() => Promise<VectorBackfillOutcome | undefined>) | undefined

  const resolved = (): ResolvedEmbeddingConfig => resolveEmbeddingConfig(deps.config, env)
  const remote = (): ResolvedRemoteEmbedding => resolved().remote

  const readJsonFile = <T>(path: string): T | undefined => {
    try {
      if (!existsSync(path)) return undefined
      return JSON.parse(readFileSync(path, 'utf8')) as T
    } catch {
      return undefined
    }
  }

  const writeJsonFile = (path: string, value: unknown): boolean => {
    try {
      mkdirSync(dirname(path), { recursive: true })
      const temp = `${path}.${String(process.pid)}.${String(now())}.tmp`
      writeFileSync(temp, JSON.stringify(value, null, 2), 'utf8')
      renameSync(temp, path)
      return true
    } catch (error) {
      deps.logger.warn(`embedding state write failed: ${error instanceof Error ? error.message : String(error)}`)
      return false
    }
  }

  const cacheKeyOf = (rem: ResolvedRemoteEmbedding): string => [
    rem.endpoint,
    rem.preset,
    rem.authHeader,
    rem.model,
    String(rem.dimensions),
    keyPresent(rem, env) ? 'key' : 'nokey',
  ].join('|')

  /** The cache key of an ENTRY (not of the current config). */
  const entryKey = (entry: ProbeCacheEntry): string => [
    entry.endpoint,
    entry.preset,
    entry.authHeader,
    entry.model,
    String(entry.dimensionsOverride),
    entry.keyPresent ? 'key' : 'nokey',
  ].join('|')

  /** The probe target plus the in-memory key fingerprint: a completed probe
   * belongs to exactly this tuple, never to whatever the config says later. */
  const targetFingerprint = (): string => {
    const cfg = resolved()
    if (cfg.provider !== 'openai-compatible') return cfg.provider
    let fingerprint = 'invalid-key-env'
    try {
      fingerprint = keyFingerprint(cfg.remote, env)
    } catch {
      // An invalid env-var name is its own target: never let the comparison
      // itself throw inside a catch path.
    }
    return `${cacheKeyOf(cfg.remote)}|${fingerprint}`
  }

  const readCache = (): ProbeCacheEntry | undefined => {
    const raw = readJsonFile<{ entries?: unknown }>(cachePath)
    if (raw === undefined || !Array.isArray(raw.entries)) return undefined
    const rem = remote()
    const wanted = cacheKeyOf(rem)
    for (const entry of raw.entries) {
      if (entry === null || typeof entry !== 'object') continue
      const row = entry as Record<string, unknown>
      if (typeof row.endpoint !== 'string' || typeof row.model !== 'string' || typeof row.dims !== 'number') continue
      const candidate: ProbeCacheEntry = {
        endpoint: row.endpoint,
        preset: typeof row.preset === 'string' ? row.preset : 'custom',
        authHeader: typeof row.authHeader === 'string' ? row.authHeader : 'authorization',
        model: row.model,
        dimensionsOverride: typeof row.dimensionsOverride === 'number' ? row.dimensionsOverride : 0,
        keyPresent: row.keyPresent === true,
        dims: row.dims,
        probedAt: typeof row.probedAt === 'number' ? row.probedAt : 0,
      }
      if (entryKey(candidate) === wanted && Number.isFinite(candidate.dims) && candidate.dims > 0) return candidate
    }
    return undefined
  }

  const writeCache = (entry: ProbeCacheEntry): boolean => {
    const raw = readJsonFile<{ entries?: unknown }>(cachePath)
    const entries = raw !== undefined && Array.isArray(raw.entries) ? raw.entries : []
    // Evict only the entry this write replaces — derived from the CAPTURED
    // entry, not from the config a slower request may have raced past. Using
    // the current config here evicted the new target's cache on an old probe.
    const key = entryKey(entry)
    const kept = entries.filter((candidate) => {
      if (candidate === null || typeof candidate !== 'object') return false
      const row = candidate as Record<string, unknown>
      return [
        String(row.endpoint ?? ''),
        String(row.preset ?? ''),
        String(row.authHeader ?? ''),
        String(row.model ?? ''),
        String(row.dimensionsOverride ?? 0),
        row.keyPresent === true ? 'key' : 'nokey',
      ].join('|') !== key
    })
    return writeJsonFile(cachePath, { version: 1, entries: [...kept, entry] })
  }

  const clearCache = (): void => {
    try {
      if (existsSync(cachePath)) rmSync(cachePath, { force: true })
    } catch {
      /* best effort */
    }
  }

  let warnedMalformedState = false
  const readState = (): RebuildState | undefined => {
    const raw = readJsonFile<Record<string, unknown>>(statePath)
    if (raw === undefined) {
      if (existsSync(statePath) && !warnedMalformedState) {
        warnedMalformedState = true
        deps.logger.warn('embedding rebuild state is unreadable; treating it as absent')
      }
      return undefined
    }
    if (
      raw.version !== 1
      || typeof raw.targetIdentity !== 'string'
      || (raw.state !== 'running' && raw.state !== 'paused' && raw.state !== 'complete')
    ) {
      if (!warnedMalformedState) {
        warnedMalformedState = true
        deps.logger.warn('embedding rebuild state is malformed; treating it as absent')
      }
      return undefined
    }
    return {
      version: 1,
      targetIdentity: raw.targetIdentity,
      state: raw.state,
      armedAt: typeof raw.armedAt === 'number' ? raw.armedAt : 0,
      startedAt: typeof raw.startedAt === 'number' ? raw.startedAt : 0,
      updatedAt: typeof raw.updatedAt === 'number' ? raw.updatedAt : 0,
      processed: typeof raw.processed === 'number' ? raw.processed : 0,
      total: typeof raw.total === 'number' ? raw.total : 0,
      failures: typeof raw.failures === 'number' ? raw.failures : 0,
    }
  }

  const writeState = (state: RebuildState): boolean => writeJsonFile(statePath, state)

  const disarm = (): { ok: boolean; error?: string } => {
    try {
      if (existsSync(statePath)) rmSync(statePath, { force: true })
      rollbackLocal = true
      return { ok: true }
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : 'disarm-failed' }
    }
  }

  const identity = (): string | null => {
    if (resolved().provider !== 'openai-compatible') return null
    const entry = readCache()
    if (entry === undefined) return null
    return remoteIdentityHash(remote(), entry.dims, env)
  }

  const coverage = (target: string | null): VectorCoverage | null => {
    if (target === null) return null
    try {
      return measureTargetCoverage(deps.corpusDbPath, target, { includePermanent: true }) ?? null
    } catch {
      return null
    }
  }

  const localTargetModelId = (): string => {
    const localId = embeddingIdentityHash()
    try {
      const report = measureVectorLane(deps.corpusDbPath)
      if (report !== undefined) {
        if (report.spaces.some(space => space.modelId === localId && space.rows > 0)) return localId
        const localSpaces = report.spaces
          .filter(space => !isRemoteModelId(space.modelId) && space.rows > 0)
          .sort((a, b) => b.rows - a.rows)
        if (localSpaces[0] !== undefined) return localSpaces[0].modelId
      }
    } catch {
      /* fall through to the deterministic local identity */
    }
    return localId
  }

  const localEmbedder = (): LocalEmbedder | undefined => {
    if (resolved().provider !== 'local') return undefined
    if (local !== undefined) return local
    local = openLocalEmbedder({
      cacheDir: defaultEmbeddingCacheDir(deps.corpusDbPath),
      logger: deps.logger,
    })
    return local
  }

  const targetModelId = (): string | null => {
    if (resolved().provider !== 'openai-compatible') return null
    return identity()
  }

  const remoteCached = (): { rem: ResolvedRemoteEmbedding; entry: ProbeCacheEntry } | undefined => {
    const rem = remote()
    if (rem.model.trim() === '') return undefined
    const entry = readCache()
    return entry === undefined ? undefined : { rem, entry }
  }

  const armedState = (): RebuildState | undefined => {
    const target = identity()
    if (target === null) return undefined
    const state = readState()
    return state !== undefined && state.targetIdentity === target ? state : undefined
  }

  const remoteQueryModelId = (): string | null => {
    if (resolved().provider !== 'openai-compatible' || lastError !== undefined) return null
    const state = armedState()
    if (state === undefined) return null
    if (state.state !== 'running' && state.state !== 'paused' && state.state !== 'complete') return null
    const target = identity()
    const report = coverage(target)
    if (target === null || report === null || report.covered === 0) return null
    return target
  }

  const remoteWritable = (): boolean => {
    if (lastError !== undefined) return false
    const state = armedState()
    return state !== undefined && (state.state === 'running' || state.state === 'complete')
  }

  const deriveState = (): EmbeddingState => {
    const cfg = resolved()
    if (cfg.provider === 'off') {
      if (readState() !== undefined) disarm()
      return 'remote-off'
    }
    if (cfg.provider === 'local') {
      if (readState() !== undefined) disarm()
      return rollbackLocal ? 'rollback-local' : 'local'
    }
    if (lastError !== undefined) return 'remote-error'
    const rem = remote()
    if (rem.model.trim() === '' || readCache() === undefined) return 'remote-unprobed'
    const state = armedState()
    if (state === undefined) return 'remote-configured-not-started'
    if (state.state === 'paused') return 'remote-paused'
    const report = coverage(identity())
    if (report === null || report.total === 0 || report.covered === 0) return 'remote-target-missing'
    return report.covered >= report.total ? 'remote-ready' : 'remote-migrating'
  }

  const status = (): EmbeddingStatus => {
    const cfg = resolved()
    const rem = cfg.remote
    const entry = cfg.provider === 'openai-compatible' ? readCache() : undefined
    const target = cfg.provider === 'openai-compatible' ? identity() : null
    const report = cfg.provider === 'openai-compatible'
      ? coverage(target)
      : cfg.provider === 'local'
        ? (() => {
            try {
              return measureTargetCoverage(deps.corpusDbPath, localTargetModelId(), {
                includePermanent: false,
              }) ?? null
            } catch {
              return null
            }
          })()
        : null
    const state = deriveState()
    const current = readState()
    const rebuild = current !== undefined && current.targetIdentity === target ? current : undefined
    let warning: string | undefined
    if (cfg.provider === 'openai-compatible') {
      try {
        warning = endpointWarning(rem)
      } catch {
        warning = 'invalid-endpoint'
      }
    }
    return {
      provider: cfg.provider,
      state,
      memoryEnabled: liveBoolean(deps.config.memory?.enabled, true),
      preset: rem.preset,
      endpoint: (() => {
        try {
          const url = new URL(rem.endpoint)
          return `${url.protocol}//${url.host}${url.pathname.replace(/\/+$/, '')}`
        } catch {
          return ''
        }
      })(),
      authHeader: rem.authHeader,
      model: cfg.provider === 'local' ? 'local' : rem.model,
      dimensions: cfg.provider === 'local' ? null : entry?.dims ?? null,
      keyEnv: rem.apiKeyEnv,
      keyPresent: keyPresent(rem, env),
      target,
      coverage: report,
      progress: rebuild === undefined
        ? { processed: null, total: null, failures: null }
        : {
            processed: rebuild.processed,
            total: rebuild.total,
            failures: rebuild.failures,
          },
      ...lastError === undefined ? {} : { lastError },
      ...warning === undefined ? {} : { httpWarning: warning },
    }
  }

  const models = async (options: EmbeddingCancellableOptions = {}): Promise<EmbeddingModelsResult> => {
    const refusal = embeddingActionRefusal('models', status(), armedState() ?? null)
    if (refusal !== undefined) return { ok: false, error: refusal }
    const captured = targetFingerprint()
    const rem = remote()
    try {
      if (rem.apiKeyEnv !== '' && apiKeyOf(rem, env) === undefined) {
        lastError = 'missing-key'
        return { ok: false, error: 'missing-key' }
      }
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : 'missing-key' }
    }
    const key = `${rem.endpoint}|${rem.preset}|${rem.authHeader}|${keyFingerprint(rem, env)}`
    if (modelCache !== undefined && modelCache.key === key && now() - modelCache.at < MODEL_CACHE_MS) {
      lastError = undefined
      return { ok: true, models: modelCache.models }
    }
    try {
      const list = await listRemoteModels(rem, {
        env,
        ...deps.fetchImpl === undefined ? {} : { fetchImpl: deps.fetchImpl },
        ...deps.lookupImpl === undefined ? {} : { lookupImpl: deps.lookupImpl },
        ...options.signal === undefined ? {} : { signal: options.signal },
      })
      // A probe/list that outlived its target must not cache or report its
      // models as the current provider's. The captured fingerprint is the
      // boundary; compare after every await.
      if (options.signal?.aborted === true) return { ok: false, error: 'cancelled' }
      if (targetFingerprint() !== captured) return { ok: false, error: 'target-changed' }
      modelCache = { key, at: now(), models: list.models }
      lastError = undefined
      return { ok: true, models: list.models }
    } catch (error) {
      if (options.signal?.aborted === true) return { ok: false, error: 'cancelled' }
      if (targetFingerprint() !== captured) return { ok: false, error: 'target-changed' }
      lastError = error instanceof Error ? error.message : 'models-failed'
      deps.logger.warn(`embedding models failed: ${lastError}`)
      return { ok: false, error: lastError }
    }
  }

  const probe = async (options: EmbeddingProbeOptions = {}): Promise<EmbeddingProbeResult> => {
    // Internal dimension repair must remain allowed while a rebuild is armed;
    // a user probe is refused as busy by the same gate.
    const refusal = embeddingActionRefusal('probe', status(), options.internal === true ? null : armedState() ?? null)
    if (refusal !== undefined) return { ok: false, error: refusal }
    const rem = remote()
    const captured = targetFingerprint()
    try {
      const result = await probeRemoteEmbedding(rem, {
        env,
        ...deps.fetchImpl === undefined ? {} : { fetchImpl: deps.fetchImpl },
        ...deps.lookupImpl === undefined ? {} : { lookupImpl: deps.lookupImpl },
        ...deps.now === undefined ? {} : { now: deps.now },
        ...options.signal === undefined ? {} : { signal: options.signal },
      })
      if (options.signal?.aborted === true) return { ok: false, error: 'cancelled' }
      // Full target/key comparison after the await: a changed model, endpoint,
      // preset, dimension override or key must not be written under the old
      // result, and must not report success for the new target.
      if (targetFingerprint() !== captured) return { ok: false, error: 'target-changed' }
      if (!writeCache({
        endpoint: rem.endpoint,
        preset: rem.preset,
        authHeader: rem.authHeader,
        model: rem.model,
        dimensionsOverride: rem.dimensions,
        keyPresent: keyPresent(rem, env),
        dims: result.dimensions,
        probedAt: now(),
      })) {
        lastError = 'cache-write-failed'
        return { ok: false, error: lastError }
      }
      lastError = undefined
      return { ok: true, model: result.model, dimensions: result.dimensions, latencyMs: result.latencyMs }
    } catch (error) {
      if (options.signal?.aborted === true) return { ok: false, error: 'cancelled' }
      if (targetFingerprint() !== captured) return { ok: false, error: 'target-changed' }
      lastError = error instanceof Error ? error.message : 'probe-failed'
      // `clearCache` is target-sensitive too: an old failure must not delete
      // the cache the user just probed under a different target.
      if (lastError === 'dimensions-unsupported') clearCache()
      deps.logger.warn(`embedding probe failed: ${lastError}`)
      return { ok: false, error: lastError }
    }
  }

  const start = async (): Promise<{ ok: boolean; error?: string }> => {
    const refusal = embeddingActionRefusal('start', status(), armedState() ?? null)
    if (refusal !== undefined) return { ok: false, error: refusal }
    const rem = remote()
    const entry = readCache()
    if (entry === undefined) return { ok: false, error: 'probe-required' }
    if (rem.dimensions > 0 && entry.dims !== rem.dimensions) return { ok: false, error: 'probe-required' }
    const target = identity()
    if (target === null) return { ok: false, error: 'probe-required' }
    const previous = readState()
    if (previous !== undefined && previous.state === 'running' && previous.targetIdentity === target) {
      return { ok: false, error: 'already-running' }
    }
    const at = now()
    const written = writeState({
      version: 1,
      targetIdentity: target,
      state: 'running',
      armedAt: previous?.targetIdentity === target && previous.armedAt > 0 ? previous.armedAt : at,
      startedAt: previous?.targetIdentity === target && previous.startedAt > 0 ? previous.startedAt : at,
      updatedAt: at,
      processed: 0,
      total: 0,
      failures: 0,
    })
    if (!written) return { ok: false, error: 'state-write-failed' }
    rollbackLocal = false
    lastError = undefined
    if (runner !== undefined) void runner().catch((error: unknown) => {
      lastError = error instanceof Error ? error.message : 'backfill-failed'
    })
    return { ok: true }
  }

  const pause = (): { ok: boolean; error?: string } => {
    const refusal = embeddingActionRefusal('pause', status(), armedState() ?? null)
    if (refusal !== undefined) return { ok: false, error: refusal }
    const state = armedState()
    if (state === undefined || state.state !== 'running') return { ok: false, error: 'not-running' }
    return writeState({ ...state, state: 'paused', updatedAt: now() })
      ? { ok: true }
      : { ok: false, error: 'state-write-failed' }
  }

  const resume = (): { ok: boolean; error?: string } => {
    const refusal = embeddingActionRefusal('resume', status(), armedState() ?? null)
    if (refusal !== undefined) return { ok: false, error: refusal }
    const state = armedState()
    if (state === undefined || state.state !== 'paused') return { ok: false, error: 'not-paused' }
    if (!writeState({ ...state, state: 'running', updatedAt: now() })) {
      return { ok: false, error: 'state-write-failed' }
    }
    if (runner !== undefined) void runner().catch((error: unknown) => {
      lastError = error instanceof Error ? error.message : 'backfill-failed'
    })
    return { ok: true }
  }

  const afterBackfill = (outcome: VectorBackfillOutcome): void => {
    const state = readState()
    if (state === undefined) return
    // A Pause or Disarm that landed while the batch was in flight wins. Do not
    // resurrect `running`, and keep an established `complete` state complete.
    if (state.state !== 'running' && state.state !== 'complete') return
    const target = identity()
    if (target === null || state.targetIdentity !== target) return
    const report = coverage(target)
    const processed = state.processed + outcome.created + outcome.present + outcome.failed + outcome.skipped
    const failures = state.failures + outcome.failed + outcome.skipped
    const total = Math.max(state.total, outcome.total, report?.total ?? 0)
    const complete = report !== null && report.total > 0 && report.covered >= report.total
    writeState({
      ...state,
      state: complete || state.state === 'complete' ? 'complete' : 'running',
      updatedAt: now(),
      processed,
      total,
      failures,
    })
  }

  const providerForEmbed = (): { rem: ResolvedRemoteEmbedding; entry: ProbeCacheEntry } => {
    const cached = remoteCached()
    if (cached === undefined) throw new EmbeddingRemoteError('probe-required')
    return cached
  }

  const embedPassages = async (texts: readonly string[]): Promise<readonly Float32Array[]> => {
    if (texts.length === 0) return []
    const { rem, entry } = providerForEmbed()
    try {
      const batch = await embedRemoteBatch(rem, {
        env,
        ...deps.fetchImpl === undefined ? {} : { fetchImpl: deps.fetchImpl },
        ...deps.lookupImpl === undefined ? {} : { lookupImpl: deps.lookupImpl },
      }, texts, 'passage', { allowRowFailure: true, expectedDimensions: entry.dims })
      return batch.vectors.map(vector => vector ?? new Float32Array(0))
    } catch (error) {
      if (error instanceof EmbeddingRemoteError && error.code === 'dimensions-changed') {
        clearCache()
        const repaired = await probe({ internal: true })
        if (!repaired.ok) throw error
        const { rem: fresh, entry: freshEntry } = providerForEmbed()
        const batch = await embedRemoteBatch(fresh, {
          env,
          ...deps.fetchImpl === undefined ? {} : { fetchImpl: deps.fetchImpl },
          ...deps.lookupImpl === undefined ? {} : { lookupImpl: deps.lookupImpl },
        }, texts, 'passage', { allowRowFailure: true, expectedDimensions: freshEntry.dims })
        return batch.vectors.map(vector => vector ?? new Float32Array(0))
      }
      lastError = error instanceof Error ? error.message : 'embed-failed'
      throw error
    }
  }

  const embedQuery = async (text: string, signal?: AbortSignal): Promise<Float32Array | null> => {
    const cached = remoteCached()
    if (cached === undefined) return null
    try {
      const batch = await embedRemoteBatch(cached.rem, {
        env,
        ...deps.fetchImpl === undefined ? {} : { fetchImpl: deps.fetchImpl },
        ...deps.lookupImpl === undefined ? {} : { lookupImpl: deps.lookupImpl },
      }, [text], 'query', {
        ...signal === undefined ? {} : { signal },
        expectedDimensions: cached.entry.dims,
      })
      return batch.vectors[0] ?? null
    } catch (error) {
      lastError = error instanceof Error ? error.message : 'query-failed'
      return null
    }
  }

  const sendJson = (res: TelemetryResponse, statusCode: number, payload: unknown): void => {
    const body = JSON.stringify(payload)
    res.writeHead(statusCode, {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      'content-length': String(Buffer.byteLength(body)),
    })
    res.end(body)
  }

  const requestUrl = (req: TelemetryRequest): URL => new URL(req.url ?? '/', 'http://embedding.invalid')
  const methodOf = (req: TelemetryRequest): string => (req.method ?? 'GET').toUpperCase()
  const headerOf = (req: TelemetryRequest, name: string): string => {
    const value = req.headers?.[name]
    return Array.isArray(value) ? (value[0] ?? '') : (value ?? '')
  }

  const guard = (req: TelemetryRequest, method: string): { ok: boolean; status?: number; error?: string } => {
    if (methodOf(req) !== method) return { ok: false, status: 405, error: 'method-not-allowed' }
    if (method !== 'POST') return { ok: true }
    const origin = headerOf(req, 'origin')
    const host = headerOf(req, 'host')
    if (origin !== '') {
      try {
        if (new URL(origin).host !== host) return { ok: false, status: 403, error: 'origin-rejected' }
      } catch {
        return { ok: false, status: 403, error: 'origin-rejected' }
      }
    }
    if (!headerOf(req, 'content-type').toLowerCase().includes('application/json')) {
      return { ok: false, status: 415, error: 'content-type-required' }
    }
    const length = Number(headerOf(req, 'content-length') || '0')
    if (Number.isFinite(length) && length > 1024) return { ok: false, status: 413, error: 'body-too-large' }
    return { ok: true }
  }

  const handle = (req: TelemetryRequest, res: TelemetryResponse): void => {
    const url = requestUrl(req)
    const base = '/mc-embedding'
    const path = url.pathname.startsWith(base) ? url.pathname.slice(base.length) || '/' : url.pathname
    if (path === '/status') {
      if (!guard(req, 'GET').ok) {
        const bad = guard(req, 'GET')
        sendJson(res, bad.status ?? 405, { ok: false, error: bad.error })
        return
      }
      try {
        sendJson(res, 200, { ok: true, ...status() })
      } catch (error) {
        sendJson(res, 500, { ok: false, error: error instanceof Error ? error.message : 'status-failed' })
      }
      return
    }
    if (path === '/models') {
      const bad = guard(req, 'GET')
      if (!bad.ok) {
        sendJson(res, bad.status ?? 405, { ok: false, error: bad.error })
        return
      }
      void models().then(result => sendJson(res, 200, result), error => sendJson(res, 500, {
        ok: false,
        error: error instanceof Error ? error.message : 'models-failed',
      }))
      return
    }
    if (path === '/probe') {
      const bad = guard(req, 'POST')
      if (!bad.ok) {
        sendJson(res, bad.status ?? 405, { ok: false, error: bad.error })
        return
      }
      void probe().then(result => sendJson(res, 200, result), error => sendJson(res, 500, {
        ok: false,
        error: error instanceof Error ? error.message : 'probe-failed',
      }))
      return
    }
    if (path === '/rebuild') {
      const bad = guard(req, 'POST')
      if (!bad.ok) {
        sendJson(res, bad.status ?? 405, { ok: false, error: bad.error })
        return
      }
      const action = url.searchParams.get('action')
      if (action === 'start') {
        void start().then(result => sendJson(res, result.ok ? 200 : 409, result))
        return
      }
      if (action === 'pause') {
        const result = pause()
        sendJson(res, result.ok ? 200 : 409, result)
        return
      }
      if (action === 'resume') {
        const result = resume()
        sendJson(res, result.ok ? 200 : 409, result)
        return
      }
      if (action === 'disarm') {
        sendJson(res, 200, disarm())
        return
      }
      sendJson(res, 400, { ok: false, error: 'unknown-action' })
      return
    }
    sendJson(res, 404, { ok: false, error: 'unknown-route' })
  }

  return {
    status,
    localEmbedder,
    providerKind: () => resolved().provider,
    isRemote: () => resolved().provider === 'openai-compatible',
    localTargetModelId,
    targetModelId,
    dimensions: () => {
      if (resolved().provider === 'local') return localEmbedder()?.dims ?? null
      return readCache()?.dims ?? null
    },
    remoteQueryModelId,
    remoteWritable,
    models,
    probe,
    start,
    pause,
    resume,
    disarm,
    rebuildState: () => {
      const state = armedState()
      return state === undefined ? null : { state: state.state, targetIdentity: state.targetIdentity }
    },
    hasRebuildState: () => readState() !== undefined,
    setRunner: (next) => { runner = next },
    embedPassages,
    embedQuery,
    afterBackfill,
    handle,
  }
}
