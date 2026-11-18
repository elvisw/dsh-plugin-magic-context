/**
 * T23: the optional Android dsh-go host half.
 *
 * Registered only inside `ctx.inject(['dshGo'], …)`; a desktop host without
 * the bridge never runs this module, so the existing Web/Desktop startup is
 * unchanged. The feeds own their timers and subscriptions: returning the
 * bridge's cancel function stops every timer, and the parent closes the
 * volatile-update listener at teardown. No second token counter, embedding
 * client or config writer lives here.
 */
import type { EmbeddingLane, EmbeddingStatus } from './embedding-lane.ts'
import type { TelemetryService } from './telemetry.ts'
import {
  GO_CONTEXT_PANEL_ID,
  GO_EMBEDDING_PANEL_ID,
  GO_STRIP_ID,
  goContextData,
  goContextView,
  goEmbeddingActionCopy,
  goEmbeddingData,
  goEmbeddingErrorText,
  goEmbeddingStartAction,
  goEmbeddingView,
  goModelRows,
  goStripData,
  type GoEmbeddingControls,
} from './go-view.ts'

export interface GoNativeScope {
  readonly sessionId?: string
  readonly turnId?: string
  readonly messageId?: string
  readonly callId?: string
}

export interface GoNativeCaps {
  readonly protocol?: number
  readonly app?: string
  readonly locale?: string
  readonly surfaces?: readonly string[]
  readonly components?: readonly string[]
}

export interface GoNativeEvent {
  readonly surface?: string
  readonly id?: string
  readonly action?: string
  readonly value?: unknown
  readonly locale?: string
  readonly signal?: AbortSignal
}

export type GoNativeEffect = Record<string, unknown> | ReadonlyArray<Record<string, unknown>>
export interface GoNativeDeferred {
  readonly pending: { readonly label?: string; readonly timeoutMs?: number }
  readonly result: (signal?: AbortSignal) => Promise<GoNativeEffect | undefined>
}
export type GoNativeActionResult = GoNativeEffect | GoNativeDeferred | undefined
export type GoNativeHandler = (
  scope: GoNativeScope,
  event: GoNativeEvent,
) => GoNativeActionResult | Promise<GoNativeActionResult>

export interface GoNativePanelDefinition {
  readonly view: (scope: GoNativeScope, caps: GoNativeCaps) => Record<string, unknown>
  readonly data?: (
    scope: GoNativeScope,
    emit: (data: Record<string, unknown> | null) => void,
    caps: GoNativeCaps,
  ) => (() => void) | void
  readonly actions?: Record<string, GoNativeHandler>
}

/** The structural slice of the released v1 bridge service we use. */
export interface GoNativeService {
  readonly strip: (
    id: string,
    data: (
      scope: GoNativeScope,
      emit: (data: Record<string, unknown> | null) => void,
      caps: GoNativeCaps,
    ) => (() => void) | void,
  ) => unknown
  readonly panel: (id: string, definition: GoNativePanelDefinition) => unknown
  /** Released v1 dispatch for panel views without an `actions` table. */
  readonly on: (id: string, handler: GoNativeHandler) => unknown
  readonly refresh: (id: string, scope?: GoNativeScope) => void
}

export interface GoNativeDeps {
  /** The SAME parent-owned service the Web route uses; never closed here. */
  readonly telemetry: Pick<TelemetryService, 'summary'>
  readonly embedding: EmbeddingLane
  /** Feed cadence while a surface is subscribed; tests shrink it. */
  readonly pollMs?: number
  readonly logger?: { warn(message: string): void }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function disposeOf(value: unknown): (() => void) | undefined {
  return typeof value === 'function' ? value as () => void : undefined
}

/** The effective provider tuple a retained model list belongs to. */
function modelConfigKey(status: EmbeddingStatus): string {
  return [
    status.provider,
    status.preset,
    status.endpoint,
    status.authHeader,
    status.model,
    status.keyEnv,
    status.keyPresent ? 'key' : 'nokey',
    String(status.dimensions),
  ].join('|')
}

function controlsOf(data: Record<string, unknown>): GoEmbeddingControls {
  return {
    remote: data.remote === true,
    startAction: typeof data.startAction === 'string' ? data.startAction : null,
    rebuild: data.rebuildEnabled === true,
    hint: data.remote === true,
  }
}

/**
 * Register the strip and both panels. Returns one disposer for a remount;
 * the bridge also disposes registrations when its plugin unloads.
 */
export function registerGoNative(service: GoNativeService, deps: GoNativeDeps): () => void {
  const pollMs = Math.max(250, deps.pollMs ?? 4_000)
  const disposers: Array<() => void> = []
  const activeFeeds = new Set<() => void>()
  /**
   * Retained model rows belong to the effective provider tuple they were
   * loaded under. A config change invalidates both the rows and their copy
   * actions; no automatic reload/probe and no config write happens here.
   */
  let retainedModels: { key: string; rows: string[] } | null = null
  let controls: GoEmbeddingControls = { remote: false, startAction: null, rebuild: false, hint: false }
  let controlsKey = ''

  const feed = (
    produce: () => Record<string, unknown>,
    emit: (data: Record<string, unknown> | null) => void,
  ): () => void => {
    let stopped = false
    const push = (): void => {
      if (stopped) return
      try {
        emit(produce())
      } catch (error) {
        deps.logger?.warn(`dsh-go native feed failed: ${error instanceof Error ? error.message : String(error)}`)
      }
    }
    push()
    const timer = setInterval(push, pollMs)
    ;(timer as { unref?: () => void }).unref?.()
    return () => {
      stopped = true
      clearInterval(timer)
    }
  }

  /**
   * The bridge calls a data function's return value when the subscriber
   * leaves, but a plugin unload must also stop feeds that are still open.
   * Track them here so `registerGoNative`'s disposer is a real cleanup.
   */
  const trackedFeed = (
    produce: () => Record<string, unknown>,
    emit: (data: Record<string, unknown> | null) => void,
  ): (() => void) => {
    const cancel = feed(produce, emit)
    const stop = (): void => {
      if (!activeFeeds.delete(stop)) return
      cancel()
    }
    activeFeeds.add(stop)
    return stop
  }

  const add = (value: unknown): void => {
    const dispose = disposeOf(value)
    if (dispose !== undefined) disposers.push(dispose)
  }

  const localeOf = (event: GoNativeEvent | undefined): string | undefined => event?.locale

  const startHandler: GoNativeHandler = async (_scope, event) => {
    const copy = goEmbeddingActionCopy(localeOf(event))
    const value = isRecord(event.value) ? event.value : undefined
    if (value?.confirmed !== true) {
      return { toast: copy.cancelled }
    }
    const current = deps.embedding.status()
    const expected = goEmbeddingStartAction(current)
    if (expected === null) {
      // Start is no longer applicable (local/off, memory disabled, paused,
      // unprobed...). Let the lane's authoritative refusal decide instead of
      // inventing a UI error; no paid work starts because the lane refuses.
      const result = await deps.embedding.start()
      return { toast: result.ok ? copy.started : goEmbeddingErrorText(result.error, localeOf(event)) }
    }
    // The confirmation id embeds the target+missing count rendered by the
    // view. Require the reached id to equal BOTH the rendered control (old
    // view) and the current target (no poll in between).
    if (controls.startAction === null || event.action !== controls.startAction || event.action !== expected) {
      return { toast: goEmbeddingErrorText('target-changed', localeOf(event)) }
    }
    const result = await deps.embedding.start()
    return {
      toast: result.ok
        ? copy.started
        : goEmbeddingErrorText(result.error, localeOf(event)),
    }
  }

  const actions: Record<string, GoNativeHandler> = {
    models: (_scope, event) => {
      const copy = goEmbeddingActionCopy(localeOf(event))
      const key = modelConfigKey(deps.embedding.status())
      return {
        pending: { label: copy.working, timeoutMs: 60_000 },
        result: async signal => {
          const result = await deps.embedding.models({ signal })
          if (!result.ok) return { toast: goEmbeddingErrorText(result.error, localeOf(event)) }
          if (modelConfigKey(deps.embedding.status()) !== key) {
            return { toast: copy.modelsStale }
          }
          retainedModels = { key, rows: [...(result.models ?? [])] }
          return [
            { toast: copy.modelsLoaded },
            { patch: { models: goModelRows(retainedModels.rows, localeOf(event)) } },
          ]
        },
      }
    },
    probe: (_scope, event) => {
      const copy = goEmbeddingActionCopy(localeOf(event))
      return {
        pending: { label: copy.working, timeoutMs: 60_000 },
        result: async signal => {
          const result = await deps.embedding.probe({ signal })
          if (!result.ok) return { toast: goEmbeddingErrorText(result.error, localeOf(event)) }
          return { toast: copy.probeOk(result.dimensions ?? 0) }
        },
      }
    },
    rebuild: (_scope, event) => {
      const value = isRecord(event.value) && typeof event.value.value === 'string'
        ? event.value.value
        : event.action
      const copy = goEmbeddingActionCopy(localeOf(event))
      if (value === 'pause') {
        const result = deps.embedding.pause()
        return { toast: result.ok ? copy.paused : goEmbeddingErrorText(result.error, localeOf(event)) }
      }
      if (value === 'resume') {
        const result = deps.embedding.resume()
        return { toast: result.ok ? copy.resumed : goEmbeddingErrorText(result.error, localeOf(event)) }
      }
      return { toast: goEmbeddingErrorText('not-ready', localeOf(event)) }
    },
    'copy-model': (_scope, event) => {
      const copy = goEmbeddingActionCopy(localeOf(event))
      const model = isRecord(event.value) && typeof event.value.model === 'string'
        ? event.value.model
        : ''
      if (model === '') return { toast: goEmbeddingErrorText('model-required', localeOf(event)) }
      // A row can outlive its provider tuple; copying it would hand the user a
      // stale ID. Only rows retained under the CURRENT tuple are copyable.
      const currentKey = modelConfigKey(deps.embedding.status())
      if (retainedModels === null || retainedModels.key !== currentKey || !retainedModels.rows.includes(model)) {
        return { toast: copy.modelsStale }
      }
      return { copy: model, toast: copy.copied }
    },
  }

  const dispatch: GoNativeHandler = (scope, event) => {
    const action = event.action ?? ''
    if (action.startsWith('start:')) return startHandler(scope, event)
    const handler = actions[action]
    if (handler !== undefined) return handler(scope, event)
    return { toast: goEmbeddingErrorText('not-ready', localeOf(event)) }
  }

  add(service.strip(GO_STRIP_ID, (scope, emit, caps) => trackedFeed(
    () => goStripData(
      deps.telemetry.summary(typeof scope?.sessionId === 'string' ? scope.sessionId : undefined),
      caps?.locale,
    ) as unknown as Record<string, unknown>,
    emit,
  )))

  add(service.panel(GO_CONTEXT_PANEL_ID, {
    view: (scope, caps) => goContextView(scope, caps?.locale),
    data: (scope, emit, caps) => trackedFeed(
      () => goContextData(
        deps.telemetry.summary(typeof scope?.sessionId === 'string' ? scope.sessionId : undefined),
        caps?.locale,
      ),
      emit,
    ),
  }))

  add(service.on(GO_EMBEDDING_PANEL_ID, dispatch))

  add(service.panel(GO_EMBEDDING_PANEL_ID, {
    view: (_scope, caps) => {
      // A view can precede its first feed/subscriber. Read the current state
      // here rather than depending on a refresh that nobody could receive.
      controls = controlsOf(goEmbeddingData(deps.embedding.status(), [], caps?.locale))
      return goEmbeddingView(caps?.locale, controls)
    },
    data: (scope, emit, caps) => trackedFeed(
      () => {
        const status = deps.embedding.status()
        const key = modelConfigKey(status)
        if (retainedModels !== null && retainedModels.key !== key) retainedModels = null
        const data = goEmbeddingData(status, retainedModels?.rows ?? [], caps?.locale)
        const next = controlsOf(data)
        const nextKey = JSON.stringify(next)
        if (nextKey !== controlsKey) {
          controlsKey = nextKey
          controls = next
          service.refresh(GO_EMBEDDING_PANEL_ID, scope)
        }
        return data
      },
      emit,
    ),
  }))

  return () => {
    for (const stop of [...activeFeeds]) stop()
    for (const dispose of disposers.splice(0)) {
      try {
        dispose()
      } catch {
        /* bridge teardown is best effort */
      }
    }
  }
}

/** The structural `ctx.inject` slice: the bridge is optional. */
export interface GoNativeHostContext {
  readonly inject: (
    names: string[],
    callback: (scope: { readonly dshGo?: GoNativeService }) => (() => void) | void,
  ) => void
}

/**
 * `['dshGo']` — NOT `['dshGo?']` and NOT a top-level inject (released v1.1.0
 * contract). A host without the bridge never calls the callback.
 */
export function attachOptionalGoNative(ctx: GoNativeHostContext, deps: GoNativeDeps): void {
  ctx.inject(['dshGo'], (scope) => {
    const service = scope?.dshGo
    if (service === undefined) return
    return registerGoNative(service, deps)
  })
}

export interface GoNativeEventHost {
  readonly on: (name: string, listener: () => void) => () => void
}

/**
 * Parent-owned `loader/volatile-update` listener.
 *
 * The released loader commits every reference first, then emits this event
 * synchronously on the owning fiber. A committed local/off provider therefore
 * disarms immediately even when no native panel or Web status read happens.
 * Only an EXISTING rebuild state is removed: a no-op disarm would flip the
 * live status to `rollback-local` on an already-local install.
 */
export function installVolatileDisarm(
  ctx: GoNativeEventHost,
  embedding: EmbeddingLane,
  logger?: { warn(message: string): void },
): () => void {
  return ctx.on('loader/volatile-update', () => {
    if (embedding.providerKind() === 'openai-compatible') return
    if (!embedding.hasRebuildState()) return
    const result = embedding.disarm()
    if (!result.ok) logger?.warn(`embedding disarm after local/off commit failed: ${result.error ?? 'unknown'}`)
  })
}
