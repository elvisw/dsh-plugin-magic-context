/**
 * Magic Context — the adapter's browser half.
 *
 * This file is plain JavaScript on purpose. The official client build preset
 * (`@deepseek-ai/dsh-client-tsdown`) is not published (npm E404), so the bundle
 * is hand-written in the shape that preset emits: a `__ModuleLoader__.load`
 * registration whose factory returns the Cordis plugin object. `scripts/copy-client.mjs`
 * copies this file verbatim to `lib/client.js`; there is no compile step, so the
 * served artifact and this source are byte-identical by construction.
 *
 * The half contributes three surfaces, all of which degrade to nothing when the
 * deployment does not offer their seat or data:
 *
 *  0. The `magic-context` locale namespace. Every string the two surfaces below
 *     render goes through a typed dictionary (`ctx.locale.register`), and each
 *     registration declares `locale: LOCALE_NS` so the slot renderer hands the
 *     component the framework `t` seat — the panel follows General → Language
 *     with no reload. See the Localization section.
 *
 *  1. `shell.overlay` — a telemetry badge/pill. It follows the Host half's
 *     `/mc-telemetry/events` SSE stream (falling back to one
 *     `/mc-telemetry/summary` read) and renders adapter state plus the most
 *     recent journal events. Collapsed it is a small pill; clicking it opens the
 *     detail panel. The overlay layer is click-through, so the pill opts back
 *     into pointer events itself. Nothing here is a credential or a message
 *     body: only the trimmed telemetry the Host route already exposes.
 *
 *  2. The Plugins page settings card for the row's `magic-context-dsh` settings
 *     namespace (`ctx.configForms`). It writes through the shared settings form,
 *     i.e. `remote.settings.mutate` → config editor → the profile's
 *     `cordis.patch.yml` override row. This half never touches a file.
 *
 * Only modules from the shell's static module table are required (`react`,
 * `@deepseek-ai/dsh-client-ui-primitives`); every other collaborator arrives as
 * a Cordis service (`slots`, `configForms`).
 */

window.__ModuleLoader__.load({
  /**
   * The registered id must equal `name` in package.json. The harness keys the
   * boot-graph row, the `/plugins/??<id>/client.js&rev=…` URL, and the
   * "loaded without registering <id>" check that gates module materialization
   * all by the package name — not by the Loader row id (`magic-context-dsh`),
   * which is only the settings namespace.
   */
  id: '@elvisw/dsh-magic-context',
  factory: (require) => {
    const React = require('react')
    const { useEffect, useRef, useState } = React
    const el = React.createElement

    /* ------------------------------------------------------------------ *
     * Contracts
     * ------------------------------------------------------------------ */

    /** Loader row id of the Host half; also the settings namespace. */
    const CFG_NS = 'magic-context-dsh'
    /** Package name; the `plugins.row.config` key is `<package name>#<row id>`. */
    const PKG_NAME = '@elvisw/dsh-magic-context'
    const ROW_CONFIG_KEY = PKG_NAME + '#' + CFG_NS
    /** Host telemetry routes (loopback only, no auth — telemetry only). */
    const SUMMARY_URL = '/mc-telemetry/summary'
    const EVENTS_URL = '/mc-telemetry/events'

    /**
     * Scope a telemetry URL to one Session.
     *
     * The badge sits in a session-scoped seat, so it asks the Host for that
     * Session's rows (`?session=`), which is what makes the counts and the
     * project identity belong to the work in front of the user rather than to
     * every project on the machine. Without an id — an older shell, or a seat
     * that hands the plugin no id — the request keeps the Host's original
     * whole-store view.
     */
    function telemetryUrl(base, sessionId) {
      return typeof sessionId === 'string' && sessionId !== ''
        ? base + '?session=' + encodeURIComponent(sessionId)
        : base
    }

    /** `git:a81f6372` — enough of a project identity to tell projects apart. */
    function shortIdentity(identity) {
      if (typeof identity !== 'string' || identity === '') return undefined
      const separator = identity.indexOf(':')
      if (separator === -1 || identity.length <= separator + 9) return identity
      return identity.slice(0, separator + 1) + identity.slice(separator + 1, separator + 9)
    }
    /** How many recent events the expanded panel keeps (records + noise alike). */
    const MAX_RECENT = 48
    /** How often the open panel re-reads `/mc-telemetry/summary` for its header counters. */
    const HEALTH_REFRESH_MS = 60_000
    /**
     * How long an `error` row keeps the pill red.
     *
     * The pill answers "is anything wrong NOW", so it must not ride a cumulative
     * counter: `errorsSinceBoot` spans the whole process lifetime, and a long-lived
     * process (measured: 21.5 h of uptime) stayed red all day on provider-side
     * stream failures the adapter had already classified and retried. 15 minutes
     * exceeds the 300 s stream idle timeout, so a run that is genuinely failing
     * still shows red while it retries.
     */
    const ERROR_RECENT_MS = 15 * 60_000
    /**
     * The composer's DOCK row — the "status bar" beneath the input line.
     *
     * The composer is two rows: the input line (left `+` / permission / `input.left`
     * and right `input.right` / model selector) and the dock row
     * (`InputBar`'s `data-composer-dock`), which already carries the session
     * statistics: `ui-chat` registers an activity pill (order 0) and the Token
     * usage pill (order 1) here, and the context meter follows the slot. That is
     * where the user expects project telemetry, so we append at order 2.
     *
     * `list` + `session` scope: the seat hands us the current `sessionId`, which
     * is what scopes our telemetry requests to this conversation.
     */
    const STATUS_SEAT = 'conversation.composer.dock'
    /** Position after the activity (0) and usage (1) pills, before the context meter. */
    const STATUS_SEAT_ORDER = 2
    /** The overlay only appears when the status seat is still absent after this long (an older shell). */
    const OVERLAY_FALLBACK_MS = 1_500

    /**
     * `@deepseek-ai/dsh-client-ui-primitives` is one of the shell's platform
     * modules. The require is guarded so a deployment whose module table lacks
     * it still materializes this bundle and keeps the telemetry badge; the
     * settings card falls back to plain controls.
     */
    let ui = {}
    try {
      ui = require('@deepseek-ai/dsh-client-ui-primitives') || {}
    } catch (error) {
      ui = {}
    }
    const SettingsForm = typeof ui.SettingsForm === 'function' ? ui.SettingsForm : undefined
    const SettingsValueField = typeof ui.SettingsValueField === 'function' ? ui.SettingsValueField : undefined
    const Switch = typeof ui.Switch === 'function' ? ui.Switch : undefined
    /** The official dark tooltip bubble (side top, 200ms delay) — same skin as the context meter's. */
    const Tooltip = typeof ui.Tooltip === 'function' ? ui.Tooltip : undefined

    /* ------------------------------------------------------------------ *
     * The editable settings surface
     * ------------------------------------------------------------------ */

    /**
     * The two route pins are PAIRS: a pin is active only when both halves are
     * non-empty (the same rule on the host side — `maintenance-wiring.ts` for
     * the verify lane, `liveRoute` for the generation lane), so the card stages
     * and saves each pair as one unit.
     */
    const ROUTES = [
      {
        id: 'maintenance',
        providerPath: ['maintenance', 'verifyProvider'],
        modelPath: ['maintenance', 'verifyModel'],
      },
      {
        id: 'historian',
        providerPath: ['historian', 'provider'],
        modelPath: ['historian', 'model'],
      },
    ]

    /**
     * The writes for one pin pair: both halves set → both written; either half
     * empty → BOTH cleared ("Auto" = follow the session route). Pure, so the
     * node-side spec can pin the pair semantics without React.
     */
    function routePairOps(providerText, modelText, providerPath, modelPath) {
      if (providerText === '' || modelText === '') {
        return [
          { op: 'unset', path: providerPath.slice() },
          { op: 'unset', path: modelPath.slice() },
        ]
      }
      return [
        { op: 'set', path: providerPath.slice(), value: providerText },
        { op: 'set', path: modelPath.slice(), value: modelText },
      ]
    }

    /** Sentinel option value for the always-available Custom branch. */
    const EFFORT_CUSTOM_SENTINEL = '__custom__'

    /**
     * Normalize one model's `reasoning` metadata from the host catalog.
     * Malformed rows and duplicate ids are dropped; host order is kept.
     */
    function normalizeModelReasoning(value) {
      if (value === null || typeof value !== 'object') return undefined
      const raw = Array.isArray(value.efforts) ? value.efforts : []
      const efforts = []
      const seen = new Set()
      for (const effort of raw) {
        if (effort === null || typeof effort !== 'object') continue
        if (typeof effort.id !== 'string') continue
        const id = effort.id.trim()
        if (id === '' || id === EFFORT_CUSTOM_SENTINEL || seen.has(id)) continue
        seen.add(id)
        const next = { id }
        if (typeof effort.name === 'string' && effort.name !== '') next.name = effort.name
        if (typeof effort.description === 'string' && effort.description !== '') next.description = effort.description
        efforts.push(next)
      }
      if (efforts.length === 0) return undefined
      const defaultEffort = typeof value.defaultEffort === 'string' ? value.defaultEffort.trim() : ''
      return defaultEffort === ''
        ? { efforts }
        : { efforts, defaultEffort }
    }

    /**
     * The efforts one routed model advertises, or why the picker cannot list
     * them. `auto` means the route is unpinned, `missing` means the catalog has
     * no such provider/model, and `none` means the model advertises no efforts.
     */
    function reasoningEffortsOf(groups, provider, model) {
      const providerId = typeof provider === 'string' ? provider.trim() : ''
      const modelId = typeof model === 'string' ? model.trim() : ''
      if (providerId === '' || modelId === '') return { kind: 'auto', efforts: [] }
      if (!Array.isArray(groups)) return { kind: 'missing', efforts: [] }
      const group = groups.find((candidate) => candidate !== null && typeof candidate === 'object'
        && candidate.id === providerId)
      if (group === undefined || !Array.isArray(group.models)) return { kind: 'missing', efforts: [] }
      const entry = group.models.find((candidate) => candidate !== null && typeof candidate === 'object'
        && candidate.id === modelId)
      if (entry === undefined) return { kind: 'missing', efforts: [] }
      const reasoning = normalizeModelReasoning(entry.reasoning)
      return reasoning === undefined
        ? { kind: 'none', efforts: [] }
        : { kind: 'ready', efforts: reasoning.efforts, defaultEffort: reasoning.defaultEffort }
    }

    /** Classify a stored/current effort id against the advertised options. */
    function effortSelectionOf(options, current) {
      const value = typeof current === 'string' ? current.trim() : ''
      if (value === '') return { mode: 'default', value: '' }
      if (Array.isArray(options) && options.some((option) => option !== null
        && typeof option === 'object' && option.id === value)) {
        return { mode: 'value', value }
      }
      return { mode: 'custom', value }
    }

    /** The writes a staged effort draft posts; never blocks the save. */
    function effortPlanOps(path, draft) {
      if (draft === undefined) return { ops: [], blocked: false }
      if (draft.clear === true) return { ops: [{ op: 'unset', path: path.slice() }], blocked: false }
      const text = String(draft.text ?? '').trim()
      return {
        ops: text === ''
          ? [{ op: 'unset', path: path.slice() }]
          : [{ op: 'set', path: path.slice(), value: text }],
        blocked: false,
      }
    }

    /**
     * The effort picker's render state. `draft.clear` wins over any base value;
     * non-empty draft text wins over the stored value; an opened Custom branch
     * keeps an empty input instead of snapping back to Default.
     */
    function effortDraftOf(input) {
      const source = input !== null && typeof input === 'object' ? input : {}
      const options = Array.isArray(source.options) ? source.options : []
      const customOpen = source.customOpen === true
      if (source.draft !== null && typeof source.draft === 'object' && source.draft.clear === true) {
        return { mode: 'default', value: '', displayValue: '', customOpen: false, cleared: true }
      }
      const classify = (value, open) => {
        const text = typeof value === 'string' ? value.trim() : ''
        if (text === '') {
          return open
            ? { mode: 'custom', value: '', displayValue: '', customOpen: true, cleared: false }
            : { mode: 'default', value: '', displayValue: '', customOpen: false, cleared: false }
        }
        if (!open) {
          const found = options.find((option) => option !== null && typeof option === 'object' && option.id === text)
          if (found !== undefined) {
            return {
              mode: 'value',
              value: text,
              displayValue: typeof found.name === 'string' && found.name !== '' ? found.name : text,
              customOpen: false,
              cleared: false,
            }
          }
        }
        return { mode: 'custom', value: text, displayValue: text, customOpen: true, cleared: false }
      }
      const draft = source.draft !== null && typeof source.draft === 'object' ? source.draft : undefined
      if (draft !== undefined && draft.text !== undefined) {
        const text = String(draft.text).trim()
        if (text !== '') return classify(text, false)
        if (customOpen) return classify('', true)
      }
      const stored = typeof source.stored === 'string' ? source.stored : ''
      if (stored.trim() !== '') return classify(stored, customOpen)
      const base = typeof source.baseValue === 'string' ? source.baseValue : ''
      if (base.trim() !== '') return classify(base, customOpen)
      return classify('', customOpen)
    }

    /**
     * One leaf the card edits.
     *
     * `path` is the path inside the settings namespace section (`policy` is a
     * nested object in the Host `Config`), and the Host writes it as
     * `{ op: 'set', path: ['policy', 'executeThreshold'], value }` — the shared
     * `ConfigForm` accepts nested paths even though the convenience
     * `SettingsFormModel` only models flat fields, which is why this card owns
     * its own small staging model.
     */
    /**
     * Dictionary keys for one field are derived from its path, so a new field
     * cannot acquire copy that lives outside the settings namespace.
     */
    function fieldCopy(path) {
      const prefix = 'settings.field.' + path.join('.')
      return { labelKey: prefix + '.label', hintKey: prefix + '.hint' }
    }

    const FIELDS = [
      {
        path: ['policy', 'executeThreshold'], kind: 'number', ...fieldCopy(['policy', 'executeThreshold']),
      },
      {
        path: ['policy', 'forceThreshold'], kind: 'number', ...fieldCopy(['policy', 'forceThreshold']),
      },
      {
        path: ['policy', 'assumedContextWindow'], kind: 'number', ...fieldCopy(['policy', 'assumedContextWindow']),
      },
      {
        path: ['policy', 'ttlMs'], kind: 'number', ...fieldCopy(['policy', 'ttlMs']),
      },
      {
        path: ['policy', 'protectedToolResults'], kind: 'number', ...fieldCopy(['policy', 'protectedToolResults']),
      },
      {
        path: ['policy', 'historianMinNodes'], kind: 'number', ...fieldCopy(['policy', 'historianMinNodes']),
      },
      {
        path: ['policy', 'historianMaxTokens'], kind: 'number', ...fieldCopy(['policy', 'historianMaxTokens']),
      },
      {
        path: ['policy', 'historianMaxTokensCeiling'], kind: 'number', ...fieldCopy(['policy', 'historianMaxTokensCeiling']),
      },
      {
        path: ['policy', 'historianTimeoutMs'], kind: 'number', ...fieldCopy(['policy', 'historianTimeoutMs']),
      },
      {
        path: ['policy', 'baselineTokens'], kind: 'number', ...fieldCopy(['policy', 'baselineTokens']),
      },
      {
        path: ['policy', 'memoryBudgetTokens'], kind: 'number', ...fieldCopy(['policy', 'memoryBudgetTokens']),
      },
      {
        path: ['policy', 'memoryLimit'], kind: 'number', ...fieldCopy(['policy', 'memoryLimit']),
      },
      {
        path: ['journal', 'retentionDays'], kind: 'number', ...fieldCopy(['journal', 'retentionDays']),
      },
      {
        path: ['historianEnabled'], kind: 'boolean', ...fieldCopy(['historianEnabled']),
      },
      {
        path: ['registerCompactionEngine'], kind: 'boolean', ...fieldCopy(['registerCompactionEngine']),
      },
      {
        path: ROUTES[0].providerPath, kind: 'route-provider', routeId: 'maintenance',
        ...fieldCopy(ROUTES[0].providerPath),
      },
      {
        path: ROUTES[0].modelPath, kind: 'route-model', routeId: 'maintenance',
        ...fieldCopy(ROUTES[0].modelPath),
      },
      {
        path: ROUTES[1].providerPath, kind: 'route-provider', routeId: 'historian',
        ...fieldCopy(ROUTES[1].providerPath),
      },
      {
        path: ROUTES[1].modelPath, kind: 'route-model', routeId: 'historian',
        ...fieldCopy(ROUTES[1].modelPath),
      },
      {
        path: ['historian', 'reasoningEffort'], kind: 'effort', routeId: 'historian',
        ...fieldCopy(['historian', 'reasoningEffort']),
      },
      {
        path: ['journal', 'enabled'], kind: 'boolean', ...fieldCopy(['journal', 'enabled']),
      },
      {
        path: ['journal', 'mirror'], kind: 'boolean', ...fieldCopy(['journal', 'mirror']),
      },
      {
        path: ['embedding', 'provider'], kind: 'select', ...fieldCopy(['embedding', 'provider']),
        options: [
          { value: 'local', labelKey: 'settings.embedding.provider.local' },
          { value: 'openai-compatible', labelKey: 'settings.embedding.provider.remote' },
          { value: 'off', labelKey: 'settings.embedding.provider.off' },
        ],
      },
      {
        path: ['embedding', 'preset'], kind: 'select', ...fieldCopy(['embedding', 'preset']),
        options: [
          { value: 'siliconflow', labelKey: 'settings.embedding.preset.siliconflow' },
          { value: 'custom', labelKey: 'settings.embedding.preset.custom' },
        ],
      },
      { path: ['embedding', 'endpoint'], kind: 'text', ...fieldCopy(['embedding', 'endpoint']) },
      {
        path: ['embedding', 'authHeader'], kind: 'select', ...fieldCopy(['embedding', 'authHeader']),
        options: [
          { value: 'authorization', labelKey: 'settings.embedding.auth.authorization' },
          { value: 'api-key', labelKey: 'settings.embedding.auth.apiKey' },
        ],
      },
      { path: ['embedding', 'model'], kind: 'text', ...fieldCopy(['embedding', 'model']) },
      { path: ['embedding', 'apiKeyEnv'], kind: 'text', ...fieldCopy(['embedding', 'apiKeyEnv']) },
      { path: ['embedding', 'dimensions'], kind: 'number', ...fieldCopy(['embedding', 'dimensions']) },
      { path: ['embedding', 'queryInstruction'], kind: 'text', ...fieldCopy(['embedding', 'queryInstruction']) },
      { path: ['embedding', 'documentPrefix'], kind: 'text', ...fieldCopy(['embedding', 'documentPrefix']) },
      { path: ['embedding', 'timeoutMs'], kind: 'number', ...fieldCopy(['embedding', 'timeoutMs']) },
      { path: ['embedding', 'queryTimeoutMs'], kind: 'number', ...fieldCopy(['embedding', 'queryTimeoutMs']) },
      { path: ['embedding', 'batchSize'], kind: 'number', ...fieldCopy(['embedding', 'batchSize']) },
    ]

    /** Copy owned by the form frame, summary line and effort picker. */
    const SETTINGS_EXTRA_COPY_KEYS = [
      'settings.summary.notReady',
      'settings.summary.line',
      'settings.summary.route',
      'settings.summary.on',
      'settings.summary.off',
      'settings.summary.verify',
      'settings.summary.gen',
      'settings.form.unavailable',
      'settings.form.readOnly',
      'settings.form.saveFailed',
      'settings.form.save',
      'settings.form.saving',
      'settings.form.modified',
      'settings.form.reset',
      'settings.form.invalid',
      'settings.form.invalidNumber',
      'settings.route.autoSession',
      'settings.route.autoPickProvider',
      'settings.route.notInCatalog',
      'settings.route.providerPlaceholder',
      'settings.route.modelPlaceholder',
      'settings.effort.default',
      'settings.effort.custom',
      'settings.effort.customCurrent',
      'settings.effort.customPlaceholder',
      'settings.effort.autoHint',
      'settings.effort.noneHint',
      'settings.effort.unknownHint',
      'settings.embedding.title',
      'settings.embedding.privacy',
      'settings.embedding.status',
      'settings.embedding.savedFirst',
      'settings.embedding.keyPresent',
      'settings.embedding.keyAbsent',
      'settings.embedding.loadModels',
      'settings.embedding.refresh',
      'settings.embedding.probe',
      'settings.embedding.start',
      'settings.embedding.pause',
      'settings.embedding.resume',
      'settings.embedding.rollback',
      'settings.embedding.working',
      'settings.embedding.noModels',
      'settings.embedding.modelPlaceholder',
      'settings.embedding.coverage',
      'settings.embedding.coverageUnknown',
      'settings.embedding.dimensionUnknown',
      'settings.embedding.memoryOff',
      'settings.embedding.plainHttp',
      'settings.embedding.state.local',
      'settings.embedding.state.rollbackLocal',
      'settings.embedding.state.off',
      'settings.embedding.state.unprobed',
      'settings.embedding.state.notStarted',
      'settings.embedding.state.paused',
      'settings.embedding.state.targetMissing',
      'settings.embedding.state.migrating',
      'settings.embedding.state.ready',
      'settings.embedding.state.error',
    ]

    /** Every card-owned key; the node-side checks assert zh/en coverage. */
    function settingsCopyKeys() {
      const keys = []
      for (const spec of FIELDS) {
        keys.push(spec.labelKey, spec.hintKey)
        if (Array.isArray(spec.options)) {
          for (const option of spec.options) keys.push(option.labelKey)
        }
      }
      keys.push(...SETTINGS_EXTRA_COPY_KEYS)
      return keys
    }

    /** The labels the shared SettingsForm shell renders. */
    function formLabels(t) {
      return {
        unavailable: t('settings.form.unavailable'),
        readOnly: t('settings.form.readOnly'),
        saveFailed: t('settings.form.saveFailed'),
        save: t('settings.form.save'),
        saving: t('settings.form.saving'),
      }
    }

    /** The labels SettingsValueField/our picker render around one value. */
    function settingsValueLabels(t) {
      return {
        modified: t('settings.form.modified'),
        reset: t('settings.form.reset'),
        invalid: t('settings.form.invalid'),
        invalidNumber: t('settings.form.invalidNumber'),
      }
    }

    /** Read a value along a path inside a nested plain object. */
    function readPath(root, path) {
      let current = root
      for (let index = 0; index < path.length; index += 1) {
        if (current === null || typeof current !== 'object') return undefined
        current = current[path[index]]
      }
      return current
    }

    /** Whether the raw user layer carries an entry at this exact path. */
    function hasPath(root, path) {
      let current = root
      for (let index = 0; index < path.length; index += 1) {
        if (current === null || typeof current !== 'object') return false
        if (index === path.length - 1) return Object.prototype.hasOwnProperty.call(current, path[index])
        current = current[path[index]]
      }
      return false
    }

    /** Render a number field's stored value as draft text (empty when absent). */
    function formatNumber(value) {
      return typeof value === 'number' && Number.isFinite(value) ? String(value) : ''
    }

    /** Render a text field's stored value as draft text (empty when absent). */
    function formatText(value) {
      return typeof value === 'string' ? value : ''
    }

    /**
     * Convert draft text into the write the field stages.
     * @returns `{ kind: 'clear' }`, `{ kind: 'set', value }`, or `undefined` for
     *   text this field does not accept (which blocks the save).
     */
    function parseNumberText(text) {
      const trimmed = String(text).trim()
      if (trimmed === '') return { kind: 'clear' }
      const parsed = Number(trimmed)
      return Number.isFinite(parsed) ? { kind: 'set', value: parsed } : undefined
    }

    /** Coerce a stored/undefined value to a checkbox state. */
    function asBool(value) {
      return value === true
    }

    /** The path key a draft is staged under. */
    function fieldKey(path) {
      return path.join('.')
    }

    /**
     * Age past which opening the settings card revalidates the model directory.
     * Long enough that reopening the card a few times costs nothing, short enough
     * that a provider edit made while the card was closed is never compared
     * against a directory from another day.
     */
    const MODEL_CATALOG_MAX_AGE_MS = 60_000

    /**
     * One shared read of the host model catalog (`remote.session.modelCatalog()`) —
     * the provider/model directory the composer's model picker renders from.
     * The card reads it so the maintenance verify pin can be PICKED from the
     * models the profile actually configured instead of typed from memory.
     *
     * Read-only and optional: a deployment whose client shell exposes no
     * catalog (or no `remote.session` namespace) leaves the card on plain text
     * inputs. Shape: `{ status, groups: [{ id, models: [{ id, name }] }], error }`.
     */
    function createModelCatalog() {
      const listeners = new Set()
      let state = { status: 'idle', groups: [], error: null }
      let remoteCtx
      let inflight
      /** When the current directory was last read successfully. */
      let loadedAt = 0

      const emit = () => {
        for (const listener of listeners) {
          try {
            listener()
          } catch (error) {
            /* a subscriber must never break the card */
          }
        }
      }
      const set = (next) => {
        state = next
        emit()
      }

      const load = () => {
        if (remoteCtx === undefined
          || remoteCtx.remote === undefined
          || remoteCtx.remote.session === undefined
          || typeof remoteCtx.remote.session.modelCatalog !== 'function') {
          return Promise.resolve()
        }
        if (inflight !== undefined) return inflight
        if (state.status === 'ready') return Promise.resolve()
        set({ status: 'loading', groups: state.groups, error: null })
        inflight = Promise.resolve(remoteCtx.remote.session.modelCatalog()).then(
          (response) => {
            if (response === null || typeof response !== 'object' || response.ok !== true) {
              const detail = response !== null && typeof response === 'object' && response.error !== undefined
                && typeof response.error === 'object' && typeof response.error.message === 'string'
                ? response.error.message
                : 'model catalog unavailable'
              set({ status: 'error', groups: [], error: detail })
              return
            }
            const groups = []
            for (const group of response.value.groups ?? []) {
              if (group === null || typeof group !== 'object') continue
              if (typeof group.id !== 'string' || group.id === '') continue
              const models = []
              for (const model of group.models ?? []) {
                if (model === null || typeof model !== 'object') continue
                if (typeof model.id !== 'string' || model.id === '') continue
                models.push({
                  id: model.id,
                  name: typeof model.name === 'string' && model.name !== '' ? model.name : model.id,
                  reasoning: normalizeModelReasoning(model.reasoning),
                })
              }
              groups.push({ id: group.id, models })
            }
            loadedAt = Date.now()
            set({ status: 'ready', groups, error: null })
          },
          (error) => {
            set({ status: 'error', groups: [], error: error instanceof Error ? error.message : String(error) })
          },
        ).finally(() => {
          inflight = undefined
        })
        return inflight
      }

      const refresh = () => {
        if (state.status === 'ready') set({ status: 'idle', groups: state.groups, error: null })
        load()
      }

      /**
       * Reload a directory older than `maxAgeMs` (and load one that was never
       * read). The `llm/models-updated` event covers live provider edits, but a
       * card that merely opens after an event it missed — or one whose event was
       * raced by a remount — would otherwise keep comparing against a stale
       * directory and surface a false "(not in catalog)" on a valid pin. One
       * cheap RPC per card open is worth never showing that lie.
       * @param maxAgeMs - age past which the cached directory is re-read.
       * @returns completion of the read in flight or started here.
       */
      const ensureFresh = (maxAgeMs = MODEL_CATALOG_MAX_AGE_MS) => {
        if (state.status !== 'ready') return load()
        if (Date.now() - loadedAt <= maxAgeMs) return Promise.resolve()
        return refresh()
      }

      return {
        /** Bind the client context that can reach `remote.session`. */
        attach(context) {
          remoteCtx = context
          if (context.remote === undefined
            || typeof context.remote.$on !== 'function'
            || context.remote.session === undefined) {
            return
          }
          context.effect(() => {
            const disposers = [
              context.remote.$on('llm/models-updated', () => refresh()),
              context.on('connection/reset', () => refresh()),
            ]
            return () => {
              for (const dispose of disposers) dispose()
            }
          }, 'magic-context: model catalog')
          load()
        },
        getSnapshot: () => state,
        ensureFresh,
        subscribe(listener) {
          listeners.add(listener)
          return () => {
            listeners.delete(listener)
          }
        },
        load,
      }
    }

    /**
     * Subscribe one card to the catalog; re-reads a stale directory when the
     * card mounts so an edit made while it was closed cannot leave the route
     * selects comparing against yesterday's providers.
     */
    function useModelCatalog(catalog) {
      const [state, setState] = useState(catalog.getSnapshot())
      useEffect(() => {
        setState(catalog.getSnapshot())
        const off = catalog.subscribe(() => setState(catalog.getSnapshot()))
        catalog.ensureFresh()
        return off
      }, [catalog])
      return state
    }

    /**
     * Build the Plugins page card bound to the shared configuration form of the
     * `magic-context-dsh` namespace.
     *
     * Staging mirrors the official cards: nothing is written until Save, and a
     * save posts every staged edit as one revision-fenced mutation. The
     * `SettingsFormModel` is not reused because it addresses only flat section
     * fields, while every interesting magic-context threshold lives under
     * `policy`/`journal`.
     *
     * @param scope - the `ConfigForm` for the namespace (`ctx.configForms.get`).
     * @param catalog - the shared model catalog (see {@link createModelCatalog});
     *   absent data falls back to plain text for the verify pin.
     * @returns the React component the two configuration seats register.
     */
    function makeCard(scope, catalog) {
      return function MagicContextCard(props) {
        const [, setRevision] = useState(0)
        const drafts = useRef(new Map())
        const [saving, setSaving] = useState(false)
        const [failed, setFailed] = useState(false)
        const [effortCustomOpen, setEffortCustomOpen] = useState(false)
        const catalogState = useModelCatalog(catalog)
        const [embeddingStatus, setEmbeddingStatus] = useState(null)
        const [embeddingModels, setEmbeddingModels] = useState([])
        const [embeddingBusy, setEmbeddingBusy] = useState(false)
        const [embeddingMessage, setEmbeddingMessage] = useState('')

        useEffect(() => scope.subscribe(() => setRevision((value) => value + 1)), [scope])

        const snapshot = scope.getSnapshot()
        const staged = drafts.current
        const t = typeof props.t === 'function' ? props.t : REFERENCE_T
        const labels = formLabels(t)
        const valueLabels = settingsValueLabels(t)

        useEffect(() => {
          if (snapshot.status !== 'ready') return undefined
          let alive = true
          const read = () => {
            fetch('/mc-embedding/status', { headers: { accept: 'application/json' } })
              .then((response) => response.json())
              .then((body) => {
                if (alive && body !== null && typeof body === 'object' && body.ok === true) setEmbeddingStatus(body)
              })
              .catch(() => {})
          }
          read()
          return () => { alive = false }
        }, [snapshot.status])

        // The summary view is the one-liner the Plugins page shows in its list
        // (and as a row's description fallback); it must render without the form.
        if (props.view === 'summary') {
          const execute = formatNumber(readPath(snapshot.value, ['policy', 'executeThreshold']))
          const force = formatNumber(readPath(snapshot.value, ['policy', 'forceThreshold']))
          const historian = asBool(readPath(snapshot.value, ['historianEnabled']))
          if (snapshot.status !== 'ready') return t('settings.summary.notReady')
          const pinnedRoutes = ROUTES.flatMap((route) => {
            const provider = formatText(readPath(snapshot.value, route.providerPath))
            const model = formatText(readPath(snapshot.value, route.modelPath))
            if (provider === '' || model === '') return []
            return [t('settings.summary.route', {
              kind: t(route.id === 'maintenance' ? 'settings.summary.verify' : 'settings.summary.gen'),
              provider,
              model,
            })]
          })
          return t('settings.summary.line', {
            execute: execute || '—',
            force: force || '—',
            historian: t(historian ? 'settings.summary.on' : 'settings.summary.off'),
            routes: pinnedRoutes.join(''),
          })
        }

        /** Stage one field's draft and re-render. */
        const stage = (key, draft) => {
          staged.set(key, draft)
          setFailed(false)
          setRevision((value) => value + 1)
        }
        /** Drop one draft without leaving a `size > 0` ghost entry. */
        const unstage = (key) => {
          if (!staged.delete(key)) return
          setFailed(false)
          setRevision((value) => value + 1)
        }
        /** Drop every draft. */
        const discard = () => {
          if (staged.size === 0 && !failed) return
          staged.clear()
          setFailed(false)
          setRevision((value) => value + 1)
        }

        /** The current view of one field: draft, effective value, override mark. */
        const view = (spec) => {
          const key = fieldKey(spec.path)
          const draft = staged.get(key)
          const sectionValue = readPath(snapshot.value, spec.path)
          const baseValue = readPath(snapshot.base, spec.path)
          const stored = hasPath(snapshot.user, spec.path)
          if (spec.kind === 'boolean') {
            const value = draft === undefined
              ? asBool(sectionValue)
              : (draft.clear ? asBool(baseValue) : draft.bool === true)
            return {
              value,
              overridden: draft === undefined ? stored : (draft.clear ? false : value !== asBool(baseValue)),
            }
          }
          if (spec.kind === 'number') {
            const text = draft === undefined
              ? formatNumber(sectionValue)
              : (draft.clear ? formatNumber(baseValue) : draft.text)
            const write = draft === undefined || draft.clear ? undefined : parseNumberText(draft.text)
            return {
              text,
              invalid: draft !== undefined && !draft.clear && write === undefined,
              overridden: draft === undefined ? stored : (draft.clear ? false : write !== undefined),
            }
          }
          // Text leaves (the verify pin): a non-number value is never invalid.
          const text = draft === undefined
            ? formatText(sectionValue)
            : (draft.clear ? formatText(baseValue) : draft.text)
          return {
            text,
            invalid: false,
            overridden: draft === undefined ? stored : (draft.clear ? false : text !== formatText(baseValue)),
          }
        }

        /**
         * The route pins, resolved once per render. Each pin is a PAIR (both
         * halves non-empty — the host rule), so the card treats it as one unit:
         * one save writes or clears the pair, and a provider switch drops a
         * model that does not belong to the new provider.
         */
        const routes = ROUTES.map((route) => {
          const providerSpec = FIELDS.find((spec) => spec.routeId === route.id && spec.kind === 'route-provider')
          const modelSpec = FIELDS.find((spec) => spec.routeId === route.id && spec.kind === 'route-model')
          return {
            ...route,
            providerSpec,
            modelSpec,
            providerText: view(providerSpec).text,
            modelText: view(modelSpec).text,
          }
        })
        const routeOf = (spec) => routes.find((route) => route.id === spec.routeId)
        const catalogReady = catalogState.status === 'ready' && catalogState.groups.length > 0
        const catalogGroups = catalogReady ? catalogState.groups : []
        /** Models the catalog advertises for one provider. */
        const modelsOf = (providerId) => {
          if (providerId === '') return []
          const group = catalogGroups.find((candidate) => candidate.id === providerId)
          return group === undefined ? [] : group.models
        }

        const effortSpec = FIELDS.find((spec) => spec.kind === 'effort')
        const historianRoute = routes.find((route) => route.id === 'historian')
        const effortOptions = reasoningEffortsOf(
          catalogGroups,
          historianRoute.providerText,
          historianRoute.modelText,
        )
        const effortDraft = staged.get(fieldKey(effortSpec.path))
        const effortView = effortDraftOf({
          baseValue: formatText(readPath(snapshot.base, effortSpec.path)),
          stored: formatText(readPath(snapshot.value, effortSpec.path)),
          draft: effortDraft,
          customOpen: effortCustomOpen,
          options: effortOptions.efforts,
        })

        /** Stage one side of a pin; a provider switch drops a stale model. */
        const stageRoute = (spec, value) => {
          const route = routeOf(spec)
          const textValue = value === undefined || value === null ? '' : String(value)
          stage(fieldKey(spec.path), textValue === '' ? { clear: true } : { clear: false, text: textValue })
          if (spec.kind !== 'route-provider') return
          // Only a catalog-backed switch knows the new provider's models; the
          // text fallback (no catalog) must never wipe a hand-typed model.
          if (!catalogReady) return
          const currentModel = view(route.modelSpec).text
          if (currentModel !== '' && !modelsOf(textValue).some((model) => model.id === currentModel)) {
            stage(fieldKey(route.modelSpec.path), { clear: true })
          }
        }

        /** One enum field (provider/preset/auth header). */
        const renderSelectField = (spec, state) => {
          const id = 'mc-field-' + fieldKey(spec.path)
          const options = Array.isArray(spec.options) ? spec.options : []
          return el('div', { key: id, style: { display: 'grid', gap: 4, margin: '8px 0' } }, [
            el('label', { key: 'label', htmlFor: id, style: { fontSize: 12 } }, t(spec.labelKey)),
            el('select', {
              key: 'select',
              id,
              'aria-label': t(spec.labelKey),
              value: state.text,
              disabled: !shell.writable,
              onChange: (event) => stage(fieldKey(spec.path), { clear: false, text: event.target.value }),
              style: {
                width: '100%',
                maxWidth: 520,
                boxSizing: 'border-box',
                height: 32,
                padding: '0 8px',
                borderRadius: 'var(--dsw-radius-sm, 6px)',
                border: '1px solid var(--dsw-alias-border-secondary, rgba(127,127,127,.35))',
                background: 'var(--dsw-alias-bg-layer-3, transparent)',
                color: 'var(--dsw-alias-label-primary, inherit)',
                font: 'inherit',
                fontSize: 12.5,
              },
            }, options.map((option) => el('option', { key: option.value, value: option.value }, t(option.labelKey)))),
            el('span', { key: 'hint', style: { fontSize: 11, opacity: 0.6 } }, t(spec.hintKey)),
          ])
        }

        /**
         * One route field: a catalog-backed select when the host serves the
         * model directory, plain text otherwise (the manual fallback).
         */
        const renderRouteField = (spec, state, usePrimitives) => {
          const route = routeOf(spec)
          const id = 'mc-field-' + fieldKey(spec.path)
          const isProvider = spec.kind === 'route-provider'
          const providerText = route.providerText
          const currentText = isProvider ? providerText : route.modelText
          const disabled = !shell.writable || (!isProvider && catalogReady && providerText === '')
          if (catalogReady) {
            const options = []
            if (isProvider) {
              options.push({ value: '', label: t('settings.route.autoSession') })
              for (const group of catalogGroups) options.push({ value: group.id, label: group.id })
            } else {
              options.push({
                value: '',
                label: providerText === ''
                  ? t('settings.route.autoPickProvider')
                  : t('settings.route.autoSession'),
              })
              for (const model of modelsOf(providerText)) {
                options.push({
                  value: model.id,
                  label: model.name === model.id ? model.id : model.name + ' (' + model.id + ')',
                })
              }
            }
            if (currentText !== '' && !options.some((option) => option.value === currentText)) {
              options.push({ value: currentText, label: t('settings.route.notInCatalog', { value: currentText }) })
            }
            return el('div', { key: id, style: { display: 'grid', gap: 4, margin: '8px 0' } }, [
              el('span', { key: 'label', style: { fontSize: 12 } }, t(spec.labelKey)),
              el('select', {
                key: 'select',
                id,
                'aria-label': t(spec.labelKey),
                value: currentText,
                disabled,
                onChange: (event) => stageRoute(spec, event.target.value),
                style: {
                  width: '100%',
                  maxWidth: 520,
                  boxSizing: 'border-box',
                  height: 32,
                  padding: '0 8px',
                  borderRadius: 'var(--dsw-radius-sm, 6px)',
                  border: '1px solid var(--dsw-alias-border-secondary, rgba(127,127,127,.35))',
                  background: 'var(--dsw-alias-bg-layer-3, transparent)',
                  color: 'var(--dsw-alias-label-primary, inherit)',
                  font: 'inherit',
                  fontSize: 12.5,
                },
              }, options.map((option) => el('option', { key: option.value, value: option.value }, option.label))),
              el('span', { key: 'hint', style: { fontSize: 11, opacity: 0.6 } }, t(spec.hintKey)),
            ])
          }
          if (usePrimitives && SettingsValueField !== undefined) {
            return el(SettingsValueField, {
              key: id,
              id,
              label: t(spec.labelKey),
              hint: t(spec.hintKey),
              numeric: false,
              text: state.text,
              overridden: state.overridden,
              invalid: false,
              overriddenLabel: valueLabels.modified,
              resetLabel: valueLabels.reset,
              invalidLabel: valueLabels.invalid,
              disabled: !shell.writable,
              onEdit: (text) => stageRoute(spec, text),
              onReset: () => stage(fieldKey(spec.path), { clear: true }),
            })
          }
          return el('div', { key: id, style: { margin: '8px 0' } }, [
            el('span', { key: 'label', style: { display: 'block', fontSize: 12 } }, t(spec.labelKey)),
            el('input', {
              key: 'input',
              id,
              'aria-label': t(spec.labelKey),
              type: 'text',
              value: state.text,
              placeholder: isProvider
                ? t('settings.route.providerPlaceholder')
                : t('settings.route.modelPlaceholder'),
              disabled: !shell.writable,
              onChange: (event) => stageRoute(spec, event.target.value),
            }),
            el('span', { key: 'hint', style: { display: 'block', fontSize: 11, opacity: 0.6 } }, t(spec.hintKey)),
          ])
        }

        /**
         * One effort field: a catalog-backed select when the routed model
         * advertises efforts, otherwise the manual text input plus Default.
         * Values are never validated here; the provider stays authoritative.
         */
        const renderEffortField = (spec, state) => {
          const id = 'mc-field-' + fieldKey(spec.path)
          const label = t(spec.labelKey)
          const hint = t(spec.hintKey)
          const disabled = !shell.writable
          const customUnknown = effortSelectionOf(effortOptions.efforts, effortView.value).mode === 'custom'
          const customLabel = customUnknown
            ? t('settings.effort.customCurrent', { value: effortView.value })
            : t('settings.effort.custom')
          const reset = () => {
            setEffortCustomOpen(false)
            stage(fieldKey(spec.path), { clear: true })
          }
          const inputStyle = {
            width: '100%',
            maxWidth: 520,
            boxSizing: 'border-box',
            height: 32,
            padding: '0 8px',
            borderRadius: 'var(--dsw-radius-sm, 6px)',
            border: '1px solid var(--dsw-alias-border-secondary, rgba(127,127,127,.35))',
            background: 'var(--dsw-alias-bg-layer-3, transparent)',
            color: 'var(--dsw-alias-label-primary, inherit)',
            font: 'inherit',
            fontSize: 12.5,
          }
          if (effortOptions.kind === 'ready') {
            const options = [{ value: '', label: t('settings.effort.default') }]
            for (const effort of effortOptions.efforts) {
              options.push({
                value: effort.id,
                label: typeof effort.name === 'string' && effort.name !== effort.id
                  ? effort.name + ' (' + effort.id + ')'
                  : effort.id,
              })
            }
            options.push({ value: EFFORT_CUSTOM_SENTINEL, label: customLabel })
            const selected = effortView.mode === 'custom'
              ? EFFORT_CUSTOM_SENTINEL
              : effortView.mode === 'value' ? effortView.value : ''
            const showCustomInput = effortView.mode === 'custom' || effortView.customOpen
            return el('div', { key: id, style: { display: 'grid', gap: 4, margin: '8px 0' } }, [
              el('label', { key: 'label', htmlFor: id, style: { fontSize: 12 } }, label),
              el('select', {
                key: 'select',
                id,
                'aria-label': label,
                value: selected,
                disabled,
                onChange: (event) => {
                  const next = event.target.value
                  if (next === EFFORT_CUSTOM_SENTINEL) {
                    // Drop any staged clear/listed value: `draft.clear` wins over
                    // `customOpen` in effortDraftOf and would bounce the select
                    // straight back to Default.
                    unstage(fieldKey(spec.path))
                    setEffortCustomOpen(true)
                    return
                  }
                  setEffortCustomOpen(false)
                  stage(fieldKey(spec.path), next === '' ? { clear: true } : { clear: false, text: next })
                },
                style: inputStyle,
              }, options.map((option) => el('option', { key: option.value, value: option.value }, option.label))),
              showCustomInput ? el('input', {
                key: 'custom',
                id: id + '-custom',
                'aria-label': label,
                type: 'text',
                value: effortView.mode === 'custom' ? effortView.value : '',
                placeholder: t('settings.effort.customPlaceholder'),
                disabled,
                onChange: (event) => stage(fieldKey(spec.path), { clear: false, text: event.target.value }),
                style: inputStyle,
              }) : null,
              el('span', { key: 'hint', style: { fontSize: 11, opacity: 0.6 } }, hint),
              customUnknown
                ? el('span', { key: 'customHint', style: { fontSize: 11, opacity: 0.6 } },
                  t('settings.effort.unknownHint'))
                : null,
              state.overridden
                ? el('button', { key: 'reset', type: 'button', disabled, onClick: reset }, valueLabels.reset)
                : null,
            ])
          }
          const textValue = effortView.mode === 'custom' ? effortView.value : ''
          return el('div', { key: id, style: { display: 'grid', gap: 4, margin: '8px 0' } }, [
            el('label', { key: 'label', htmlFor: id, style: { fontSize: 12 } }, label),
            el('input', {
              key: 'input',
              id,
              'aria-label': label,
              type: 'text',
              value: textValue,
              placeholder: t('settings.effort.customPlaceholder'),
              disabled,
              onChange: (event) => {
                setEffortCustomOpen(true)
                stage(fieldKey(spec.path), { clear: false, text: event.target.value })
              },
              style: inputStyle,
            }),
            el('span', { key: 'hint', style: { fontSize: 11, opacity: 0.6 } }, hint),
            el('span', { key: 'routeHint', style: { fontSize: 11, opacity: 0.6 } },
              t(effortOptions.kind === 'none' ? 'settings.effort.noneHint' : 'settings.effort.autoHint')),
            textValue !== '' || state.overridden
              ? el('button', { key: 'default', type: 'button', disabled, onClick: reset }, t('settings.effort.default'))
              : null,
          ])
        }

        const plan = () => {
          const ops = []
          let blocked = false
          for (const spec of FIELDS) {
            // The route pairs are coupled and planned below.
            if (spec.kind === 'route-provider' || spec.kind === 'route-model') continue
            const draft = staged.get(fieldKey(spec.path))
            if (draft === undefined) continue
            if (spec.kind === 'effort') {
              const planned = effortPlanOps(spec.path, draft)
              ops.push(...planned.ops)
              continue
            }
            if (draft.clear) {
              ops.push({ op: 'unset', path: spec.path.slice() })
              continue
            }
            if (spec.kind === 'boolean') {
              ops.push({ op: 'set', path: spec.path.slice(), value: draft.bool === true })
              continue
            }
            if (spec.kind === 'text' || spec.kind === 'select') {
              const text = String(draft.text ?? '').trim()
              if (text === '') ops.push({ op: 'unset', path: spec.path.slice() })
              else ops.push({ op: 'set', path: spec.path.slice(), value: text })
              continue
            }
            const write = parseNumberText(draft.text)
            if (write === undefined) {
              blocked = true
              continue
            }
            if (write.kind === 'clear') ops.push({ op: 'unset', path: spec.path.slice() })
            else ops.push({ op: 'set', path: spec.path.slice(), value: write.value })
          }
          for (const route of routes) {
            const providerStaged = staged.get(fieldKey(route.providerPath))
            const modelStaged = staged.get(fieldKey(route.modelPath))
            if (providerStaged === undefined && modelStaged === undefined) continue
            // The final text of one side: draft → base → empty ("Auto").
            const finalText = (path) => {
              const draft = staged.get(fieldKey(path))
              if (draft === undefined) return formatText(readPath(snapshot.value, path)).trim()
              if (draft.clear) return ''
              return String(draft.text ?? '').trim()
            }
            // "Auto" (or a half-filled pin, which the host cannot activate) is
            // written as BOTH paths unset, so the profile stays unambiguous.
            ops.push(...routePairOps(
              finalText(route.providerPath),
              finalText(route.modelPath),
              route.providerPath,
              route.modelPath,
            ))
          }
          return { ops, blocked }
        }

        const save = () => {
          if (saving || !snapshot.writable || staged.size === 0) return
          const { ops, blocked } = plan()
          if (blocked || ops.length === 0) return
          const turnsLocal = ops.some((op) =>
            op.op === 'set' && op.path.length === 2
              && op.path[0] === 'embedding' && op.path[1] === 'provider' && op.value === 'local')
          if (turnsLocal) {
            // Disarm is a state-only route: it never writes profile config. The
            // revision-fenced Save below remains the only config writer.
            void fetch('/mc-embedding/rebuild?action=disarm', {
              method: 'POST',
              headers: { 'content-type': 'application/json' },
            }).catch(() => {})
          }
          setSaving(true)
          setFailed(false)
          Promise.resolve(scope.mutate(ops, snapshot.revision)).then((accepted) => {
            if (accepted) {
              staged.clear()
              setTimeout(() => { void refreshEmbeddingStatus() }, 600)
            }
            setSaving(false)
            setFailed(!accepted)
            setRevision((value) => value + 1)
          }, () => {
            setSaving(false)
            setFailed(true)
            setRevision((value) => value + 1)
          })
        }

        const shell = {
          available: snapshot.status === 'ready',
          writable: snapshot.writable === true,
          dirty: staged.size > 0,
          invalid: plan().blocked,
          saving,
          failed,
        }

        const embeddingStateKey = (value) => ({
          local: 'settings.embedding.state.local',
          'rollback-local': 'settings.embedding.state.rollbackLocal',
          'remote-off': 'settings.embedding.state.off',
          'remote-unprobed': 'settings.embedding.state.unprobed',
          'remote-configured-not-started': 'settings.embedding.state.notStarted',
          'remote-paused': 'settings.embedding.state.paused',
          'remote-target-missing': 'settings.embedding.state.targetMissing',
          'remote-migrating': 'settings.embedding.state.migrating',
          'remote-ready': 'settings.embedding.state.ready',
          'remote-error': 'settings.embedding.state.error',
        }[value] ?? 'settings.embedding.state.unprobed')

        const refreshEmbeddingStatus = () => fetch('/mc-embedding/status', { headers: { accept: 'application/json' } })
          .then((response) => response.json())
          .then((body) => {
            if (body !== null && typeof body === 'object' && body.ok === true) setEmbeddingStatus(body)
          })
          .catch(() => {})

        const callEmbedding = (path, action) => {
          if (embeddingBusy || !shell.writable || shell.dirty) return
          setEmbeddingBusy(true)
          setEmbeddingMessage('')
          fetch(path + (action === undefined ? '' : '?action=' + encodeURIComponent(action)), {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
          })
            .then((response) => response.json())
            .then((body) => {
              if (body === null || typeof body !== 'object') throw new Error('bad-response')
              if (body.ok !== true) {
                setEmbeddingMessage(t('settings.embedding.state.error') + ': ' + String(body.error ?? 'error'))
              } else {
                setEmbeddingMessage('')
              }
              return refreshEmbeddingStatus()
            })
            .then(() => {
              // A started/resumed bounded pass runs just after the route returns;
              // poll twice so the panel reflects the landed state without reload.
              setTimeout(() => { void refreshEmbeddingStatus() }, 1200)
              setTimeout(() => { void refreshEmbeddingStatus() }, 2600)
            })
            .catch((error) => setEmbeddingMessage(String(error && error.message ? error.message : error)))
            .finally(() => setEmbeddingBusy(false))
        }

        const loadEmbeddingModels = () => {
          if (embeddingBusy || !shell.writable || shell.dirty) return
          setEmbeddingBusy(true)
          setEmbeddingMessage('')
          fetch('/mc-embedding/models', { headers: { accept: 'application/json' } })
            .then((response) => response.json())
            .then((body) => {
              if (body !== null && typeof body === 'object' && body.ok === true && Array.isArray(body.models)) {
                setEmbeddingModels(body.models)
                if (body.models.length === 0) setEmbeddingMessage(t('settings.embedding.noModels'))
              } else {
                setEmbeddingMessage(t('settings.embedding.state.error') + ': ' + String(body && body.error ? body.error : 'error'))
              }
            })
            .catch((error) => setEmbeddingMessage(String(error && error.message ? error.message : error)))
            .finally(() => setEmbeddingBusy(false))
        }

        const renderEmbeddingTools = () => {
          if (!shell.available || embeddingStatus === null) return null
          const status = embeddingStatus
          const remote = status.provider === 'openai-compatible'
          const coverage = status.coverage === null
            ? t('settings.embedding.coverageUnknown')
            : t('settings.embedding.coverage', {
              covered: String(status.coverage.covered),
              total: String(status.coverage.total),
            })
          const dimensions = status.dimensions === null ? '—' : String(status.dimensions) + 'd'
          const progressText = status.progress === null || status.progress === undefined
            || status.progress.processed === null || status.progress.total === null
            ? ''
            : String(status.progress.processed) + '/' + String(status.progress.total)
              + (status.progress.failures > 0 ? ' · ' + String(status.progress.failures) : '')
          const modelOptions = embeddingModels.map((id) => el('option', { key: id, value: id }, id))
          return el('section', {
            key: 'embedding-tools',
            'aria-label': t('settings.embedding.title'),
            style: { display: 'grid', gap: 6, margin: '12px 0 4px', paddingTop: 8,
              borderTop: '1px solid var(--dsw-alias-border-secondary, rgba(127,127,127,.25))' },
          }, [
            el('strong', { key: 'title', style: { fontSize: 12.5 } }, t('settings.embedding.title')),
            el('span', { key: 'status', style: { fontSize: 11.5, opacity: 0.8 } },
              t('settings.embedding.status') + ': ' + t(embeddingStateKey(status.state))
                + ' · ' + (status.model || '—') + ' · ' + dimensions + ' · ' + coverage),
            el('span', { key: 'key', style: { fontSize: 11.5, opacity: 0.7 } },
              (status.keyPresent ? t('settings.embedding.keyPresent') : t('settings.embedding.keyAbsent'))
                + (status.keyEnv ? ' (' + status.keyEnv + ')' : '')),
            status.httpWarning === 'plain-http'
              ? el('span', { key: 'http', style: { fontSize: 11.5, color: 'var(--dsw-alias-label-warning, #b8860b)' } },
                t('settings.embedding.plainHttp'))
              : null,
            el('span', { key: 'privacy', style: { fontSize: 11.5, opacity: 0.7 } }, t('settings.embedding.privacy')),
            status.memoryEnabled === false
              ? el('span', { key: 'memory-off', style: { fontSize: 11.5, color: 'var(--dsw-alias-label-warning, #b8860b)' } }, t('settings.embedding.memoryOff'))
              : null,
            progressText === ''
              ? null
              : el('span', { key: 'progress', style: { fontSize: 11.5, opacity: 0.75 } }, progressText),
            status.lastError
              ? el('span', { key: 'last-error', style: { fontSize: 11.5, color: 'var(--dsw-alias-label-warning, #b8860b)' } },
                status.lastError)
              : null,
            !snapshot.writable || shell.dirty
              ? el('span', { key: 'saved', style: { fontSize: 11.5, opacity: 0.7 } }, t('settings.embedding.savedFirst'))
              : null,
            remote ? el('div', { key: 'remote-actions', style: { display: 'flex', gap: 6, flexWrap: 'wrap' } }, [
              el('button', { key: 'refresh', type: 'button', disabled: embeddingBusy || shell.dirty || !snapshot.writable, onClick: () => { void refreshEmbeddingStatus() } },
                t('settings.embedding.refresh')),
              el('button', { key: 'models', type: 'button', disabled: embeddingBusy || shell.dirty || !snapshot.writable, onClick: loadEmbeddingModels },
                t('settings.embedding.loadModels')),
              el('button', { key: 'probe', type: 'button', disabled: embeddingBusy || shell.dirty || !snapshot.writable, onClick: () => callEmbedding('/mc-embedding/probe') },
                t('settings.embedding.probe')),
              el('button', { key: 'start', type: 'button', disabled: embeddingBusy || shell.dirty || !snapshot.writable, onClick: () => callEmbedding('/mc-embedding/rebuild', 'start') },
                t('settings.embedding.start')),
              el('button', { key: 'pause', type: 'button', disabled: embeddingBusy || shell.dirty || !snapshot.writable, onClick: () => callEmbedding('/mc-embedding/rebuild', 'pause') },
                t('settings.embedding.pause')),
              el('button', { key: 'resume', type: 'button', disabled: embeddingBusy || shell.dirty || !snapshot.writable, onClick: () => callEmbedding('/mc-embedding/rebuild', 'resume') },
                t('settings.embedding.resume')),
              el('button', { key: 'rollback', type: 'button', disabled: embeddingBusy || shell.dirty || !snapshot.writable, onClick: () => {
                callEmbedding('/mc-embedding/rebuild', 'disarm')
                stage(fieldKey(['embedding', 'provider']), { clear: false, text: 'local' })
                setEmbeddingMessage(t('settings.embedding.savedFirst'))
              } }, t('settings.embedding.rollback')),
            ]) : el('span', { key: 'off', style: { fontSize: 11.5, opacity: 0.7 } },
              t(snapshot.value && snapshot.value.memory && snapshot.value.memory.enabled === false
                ? 'settings.embedding.memoryOff'
                : status.provider === 'off'
                  ? 'settings.embedding.state.off'
                  : 'settings.embedding.state.local')),
            embeddingModels.length > 0
              ? el('select', {
                key: 'model-select',
                'aria-label': t('settings.embedding.modelPlaceholder'),
                onChange: (event) => {
                  if (event.target.value !== '') stage(fieldKey(['embedding', 'model']), { clear: false, text: event.target.value })
                },
              }, [el('option', { key: 'empty', value: '' }, t('settings.embedding.modelPlaceholder')), ...modelOptions])
              : null,
            embeddingMessage === '' ? null : el('span', { key: 'message', style: { fontSize: 11.5 } }, embeddingMessage),
          ])
        }

        // Plain-control fallback for a module table without ui-primitives: the
        // same staging and the same writes, only the chrome differs.
        if (SettingsForm === undefined || SettingsValueField === undefined) {
          const rows = FIELDS.map((spec) => {
            const state = view(spec)
            const id = 'mc-field-' + fieldKey(spec.path)
            if (spec.kind === 'boolean') {
              return el('div', { key: id, style: { margin: '6px 0' } }, [
                el('input', {
                  key: 'input',
                  id,
                  type: 'checkbox',
                  checked: state.value,
                  disabled: !shell.writable,
                  onChange: (event) => stage(fieldKey(spec.path), { clear: false, bool: event.target.checked }),
                }),
                el('label', { key: 'label', htmlFor: id, style: { marginLeft: 6, fontSize: 12 } }, t(spec.labelKey)),
              ])
            }
            if (spec.kind === 'route-provider' || spec.kind === 'route-model') {
              return renderRouteField(spec, state, false)
            }
            if (spec.kind === 'effort') return renderEffortField(spec, state)
            if (spec.kind === 'select') return renderSelectField(spec, state)
            return el('div', { key: id, style: { margin: '6px 0' } }, [
              el('label', { key: 'label', htmlFor: id, style: { display: 'block', fontSize: 12 } }, t(spec.labelKey)),
              el('input', {
                key: 'input',
                id,
                type: 'text',
                value: state.text,
                disabled: !shell.writable,
                onChange: (event) => stage(fieldKey(spec.path), { clear: false, text: event.target.value }),
              }),
            ])
          })
          return el('div', { style: { display: 'grid', gap: 4, maxWidth: 520 } }, [
            el('p', { key: 'unavailable', style: { margin: 0, fontSize: 12 } },
              shell.available ? '' : labels.unavailable),
            ...rows,
            renderEmbeddingTools(),
            el('button', {
              key: 'save', type: 'button', disabled: !shell.dirty || shell.invalid || shell.saving || !shell.writable,
              onClick: save,
            }, shell.saving ? labels.saving : labels.save),
            failed ? el('span', { key: 'failed', style: { color: 'var(--dsw-alias-label-error, #c33)', fontSize: 12 } },
              labels.saveFailed) : null,
          ])
        }

        const controls = FIELDS.map((spec) => {
          const state = view(spec)
          const id = 'mc-field-' + fieldKey(spec.path)
          if (spec.kind === 'boolean') {
            return el('div', { key: id, style: { display: 'flex', alignItems: 'center', gap: 8, margin: '8px 0' } }, [
              el('span', { key: 'label', style: { fontSize: 12 } }, t(spec.labelKey)),
              Switch !== undefined
                ? el(Switch, {
                  key: 'switch',
                  checked: state.value,
                  disabled: !shell.writable,
                  label: t(spec.labelKey),
                  onChange: (next) => stage(fieldKey(spec.path), { clear: false, bool: next }),
                })
                : el('input', {
                  key: 'switch',
                  type: 'checkbox',
                  checked: state.value,
                  disabled: !shell.writable,
                  'aria-label': t(spec.labelKey),
                  onChange: (event) => stage(fieldKey(spec.path), { clear: false, bool: event.target.checked }),
                }),
              state.overridden
                ? el('button', {
                  key: 'reset',
                  type: 'button',
                  disabled: !shell.writable,
                  onClick: () => stage(fieldKey(spec.path), { clear: true }),
                }, valueLabels.reset)
                : null,
            ])
          }
          if (spec.kind === 'route-provider' || spec.kind === 'route-model') {
            return renderRouteField(spec, state, true)
          }
          if (spec.kind === 'effort') return renderEffortField(spec, state)
          if (spec.kind === 'select') return renderSelectField(spec, state)
          return el(SettingsValueField, {
            key: id,
            id,
            label: t(spec.labelKey),
            hint: t(spec.hintKey),
            numeric: spec.kind === 'number',
            text: state.text,
            overridden: state.overridden,
            invalid: state.invalid,
            overriddenLabel: valueLabels.modified,
            resetLabel: valueLabels.reset,
            invalidLabel: valueLabels.invalidNumber,
            disabled: !shell.writable,
            onEdit: (text) => stage(fieldKey(spec.path), { clear: false, text }),
            onReset: () => stage(fieldKey(spec.path), { clear: true }),
          })
        })

        controls.push(renderEmbeddingTools())

        return el(SettingsForm, {
          labels,
          state: shell,
          onSave: save,
          onDiscard: discard,
        }, controls)
      }
    }

    /* ------------------------------------------------------------------ *
     * The telemetry badge
     * ------------------------------------------------------------------ */

    /**
     * The errors the badge counts as "now": `level === 'error'` journal rows inside
     * `ERROR_RECENT_MS`. Read off `recent` (newest-first, owned by the live frames)
     * rather than the summary, so the window closes on its own as frames arrive —
     * the timer in the component only covers a session that has gone quiet.
     */
    function countRecentErrors(recent, now) {
      if (!Array.isArray(recent)) return 0
      const cutoff = now - ERROR_RECENT_MS
      let count = 0
      for (const entry of recent) {
        if (entry !== null && typeof entry === 'object' && entry.level === 'error'
          && typeof entry.at === 'number' && entry.at >= cutoff) count += 1
      }
      return count
    }

    /** Trim the Host summary into what the badge renders. */
    function trimSummary(summary) {
      const adapter = summary && typeof summary.adapter === 'object' && summary.adapter !== null ? summary.adapter : {}
      const health = summary && typeof summary.health === 'object' && summary.health !== null ? summary.health : {}
      const project = summary && typeof summary.project === 'object' && summary.project !== null ? summary.project : {}
      const num = (value) => (typeof value === 'number' ? value : undefined)
      const obj = (value) => (value !== null && typeof value === 'object' ? value : undefined)
      return {
        scope: summary && summary.scope === 'session' ? 'session' : 'global',
        schemaVersion: adapter.schemaVersion,
        engine: typeof adapter.engine === 'string' ? adapter.engine : 'unknown',
        uptimeMs: adapter.uptimeMs,
        memory: adapter.memory,
        memoryWrite: adapter.memoryWrite,
        // The shipped Host half names this `toolsMode`; the contract sketch said
        // `tools`. Read both so neither revision renders an empty row.
        tools: adapter.tools === undefined ? adapter.toolsMode : adapter.tools,
        projectIdentity: shortIdentity(project.identity),
        projectMemories: num(project.memories),
        journalRows: health.journalRows,
        journalRowsAll: health.journalRowsAll,
        lastEventAt: health.lastEventAt,
        passes24h: health.passes24h,
        errorsSinceBoot: health.errorsSinceBoot,
        drops24h: health.drops24h,
        compartments24h: health.compartments24h,
        // The density pass: the numbers a user actually acts on.
        lastPressure: num(health.lastPressure),
        emergency24h: num(health.emergency24h),
        promote24h: num(health.promote24h),
        reclaimed24h: num(health.reclaimed24h),
        // Panel v3: absolute context size + the dreamer-slice KPIs.
        lastTokens: num(health.lastTokens),
        lastContextWindow: num(health.lastContextWindow),
        memoryStats: obj(health.memoryStats) === undefined ? undefined : {
          verified: num(health.memoryStats.verified),
          unverified: num(health.memoryStats.unverified),
        },
        maintenanceLast: obj(health.maintenanceLast) === undefined ? undefined : {
          at: num(health.maintenanceLast.at),
          expired: num(health.maintenanceLast.expired),
          verified: num(health.maintenanceLast.verified),
          updated: num(health.maintenanceLast.updated),
          archived: num(health.maintenanceLast.archived),
        },
      }
    }

    /**
     * The pure telemetry view model (T18).
     *
     * It receives the RAW summary (not `trimSummary` output), because the new
     * v2 fields are additive and the legacy whitelist would drop them. Every
     * number is kept as a number here; the UI owns formatting/placement. The
     * builder is exported through `__diagnostics` so tests do not need a DOM.
     */
    /** A healthy transport with a payload that has no `health` is unavailable. */
    function displayStatusOf(transportStatus, viewStatus) {
      return transportStatus === 'ok' ? viewStatus : transportStatus
    }

    function buildTelemetryView(summary, locale, now, width, lastUpdateAt, t, recent) {
      const translate = typeof t === 'function' ? t : dictionaryTranslator(locale)
      const health = summary !== null && typeof summary === 'object'
        && summary.health !== null && typeof summary.health === 'object' ? summary.health : {}
      const number = (value) => (typeof value === 'number' && Number.isFinite(value) ? value : null)
      const pressureRaw = number(health.lastPressure)
      const used = number(health.lastTokens)
      const window = number(health.lastContextWindow)
      const policy = health.policy !== null && typeof health.policy === 'object' ? health.policy : {}
      const executeThreshold = number(policy.executeThreshold)
      const forceThreshold = number(policy.forceThreshold)
      const percent = pressureRaw !== null
        ? pressureRaw
        : used !== null && window !== null && window > 0 ? used / window * 100 : null
      const tone = percent === null || executeThreshold === null ? 'inherit'
        : forceThreshold !== null && percent >= forceThreshold ? '#e5484d'
          : percent >= executeThreshold ? '#d08700' : '#22a06b'

      const breakdown = health.contextBreakdown !== null && typeof health.contextBreakdown === 'object'
        ? health.contextBreakdown : null
      const segmentDefs = [
        ['system', 'bar.system', number(breakdown?.systemTokens)],
        ['tools', 'bar.tools', number(breakdown?.toolsTokens)],
        ['messages', 'bar.messages', number(breakdown?.messageTokens)],
      ]
      const barAvailable = breakdown !== null && segmentDefs.every(([, , tokens]) => tokens !== null)
      const barTotal = barAvailable ? segmentDefs.reduce((total, [, , tokens]) => total + tokens, 0) : null
      const segments = segmentDefs.map(([id, labelKey, tokens]) => ({
        id,
        labelKey,
        tokens,
        share: barAvailable && barTotal > 0 ? tokens / barTotal : barAvailable ? 0 : null,
      }))
      const barAria = barAvailable
        ? translate('bar.aria', {
          system: compactTok(segments[0].tokens),
          tools: compactTok(segments[1].tokens),
          messages: compactTok(segments[2].tokens),
        })
        : translate('bar.unavailable')

      const composition = health.messageComposition !== null && typeof health.messageComposition === 'object'
        ? health.messageComposition : null
      const messageRows = composition === null ? [] : [
        ['conversation', 'composition.conversation'],
        ['toolCalls', 'composition.toolCalls'],
        ['compartments', 'composition.compartments'],
        ['memories', 'composition.memories', 'composition.lastInjection'],
        ['profile', 'composition.profile', 'composition.lastInjection'],
        ['other', 'composition.other'],
      ].flatMap(([id, labelKey, suffixKey]) => {
        const tokens = number(composition[id])
        if (tokens === null || tokens <= 0) return []
        return [{ id, labelKey, tokens, ...(suffixKey === undefined ? {} : { suffixKey }) }]
      })

      const residual = composition === null ? null : number(composition.residualTokens)
      const errorSource = Array.isArray(recent) ? recent : Array.isArray(summary?.recent) ? summary.recent : []
      const errors = countRecentErrors(errorSource, now)
      const warningRows = []
      if (residual !== null && residual > 0) {
        warningRows.push({ id: 'residual', text: translate('warnings.residual', { tokens: compactTok(residual) }) })
      }
      if (errors > 0) {
        warningRows.push({ id: 'recent', text: translate('warnings.recent', { n: errors }) })
      }
      const dashInt = (value) => {
        const count = number(value)
        return count === null ? '—' : fmtInt(count)
      }

      const sections = []
      const historian = health.historian !== null && typeof health.historian === 'object' ? health.historian : null
      if (historian !== null) {
        const at = number(historian.lastPublishedAt)
        const state = historian.running === true ? translate('historian.running') : translate('historian.idle')
        sections.push({
          id: 'historian',
          labelKey: 'section.historian',
          value: translate('historian.line', {
            state,
            compartments: dashInt(historian.compartments),
            digested: number(historian.coveredTokens) === null ? '—' : compactTok(historian.coveredTokens),
            at: at === null ? '—' : timeShort(at),
          }),
        })
      }
      const memory = health.memory !== null && typeof health.memory === 'object' ? health.memory : null
      if (memory !== null) {
        const total = number(memory.total)
        const injected = number(memory.injected)
        const est = number(memory.estTokens)
        const profile = number(memory.profileEstTokens)
        sections.push({
          id: 'memory',
          labelKey: 'section.memory',
          value: translate('memory.line', {
            total: total === null ? '—' : fmtInt(total),
            injected: injected === null ? '—' : fmtInt(injected),
            est: est === null ? '—' : compactTok(est),
            profile: profile === null ? '—' : compactTok(profile),
          }),
        })
      }
      const queue = health.queue !== null && typeof health.queue === 'object' ? health.queue : null
      if (queue !== null) {
        const pendingRaw = number(queue.pendingDrops)
        const tags = Array.isArray(queue.tags) ? queue.tags.map(String) : []
        sections.push({
          id: 'queue',
          labelKey: 'section.queue',
          value: pendingRaw === null
            ? '—'
            : pendingRaw === 0 ? translate('queue.empty') : translate('queue.line', {
              pending: fmtInt(pendingRaw),
              tags: tags.length === 0 ? '—' : tags.join(', '),
            }),
        })
      }
      const maintenance = health.maintenanceLast !== null && typeof health.maintenanceLast === 'object'
        ? health.maintenanceLast : null
      sections.push({
        id: 'maintenance',
        labelKey: 'section.maintenance',
        value: maintenance === null ? translate('maintenance.never') : translate('maintenance.line', {
          at: number(maintenance.at) === null ? '—' : timeShort(maintenance.at),
          expired: dashInt(maintenance.expired),
          verified: dashInt(maintenance.verified),
          updated: dashInt(maintenance.updated),
          archived: dashInt(maintenance.archived),
        }),
      })
      const surface = health.surface !== null && typeof health.surface === 'object' ? health.surface : null
      if (surface !== null) {
        sections.push({
          id: 'hygiene',
          labelKey: 'section.hygiene',
          value: translate('hygiene.line', {
            tagged: dashInt(surface.tagged),
            dropped: dashInt(surface.dropped),
            reclaimable: number(surface.reclaimableTokens) === null
              ? '—' : compactTok(surface.reclaimableTokens),
          }),
        })
      }
      sections.push({
        id: 'warnings',
        labelKey: 'section.warnings',
        value: warningRows.length === 0
          ? translate('warnings.none')
          : warningRows.map(row => row.text).join(' · '),
      })

      const pressureText = percent === null ? '—' : Math.round(percent) + '%'
      const tokenPair = used !== null && window !== null ? compactTok(used) + '/' + compactTok(window) : ''
      const historianState = historian === null ? ''
        : historian.running === true ? translate('historian.running') : translate('historian.idle')
      const pending = queue === null ? null : number(queue.pendingDrops)
      const queueText = pending === null || pending <= 0 ? '' : 'Q' + String(pending)
      const historianText = historian === null ? '' : 'H ' + historianState
      const queueSuffix = errors > 0 ? errors + ' err' : queueText
      const suffix = [historianText, queueSuffix].filter(Boolean).join(' · ')
      const iconSuffix = [historian === null ? '' : 'H', queueSuffix].filter(Boolean).join(' · ')
      const narrow = typeof width === 'number' ? width : 999
      let variant = 'full'
      if (narrow < 220) variant = 'minimal'
      else if (narrow < 280) variant = 'icon'
      else if (narrow < 360) variant = 'compact'
      let body = ''
      if (variant === 'minimal') body = pressureText
      else if (variant === 'icon') {
        body = pressureText + (iconSuffix === '' ? '' : ' · ' + iconSuffix)
      } else if (variant === 'compact') {
        body = pressureText + (suffix === '' ? '' : ' · ' + suffix)
      } else {
        body = pressureText + (tokenPair === '' ? '' : ' · ' + tokenPair) + (suffix === '' ? '' : ' · ' + suffix)
      }
      const stale = typeof lastUpdateAt === 'number' && now - lastUpdateAt > 120_000
      const unavailable = summary !== null && summary !== undefined
        && (summary.health === null || summary.health === undefined)
      const status = summary === null || summary === undefined ? 'connecting' : unavailable ? 'unavailable' : 'ok'

      return {
        status,
        unavailable,
        stale,
        pressure: percent === null ? null : {
          percent,
          used,
          window,
          executeThreshold,
          forceThreshold,
          tone,
        },
        bar: { available: barAvailable, total: barTotal, segments, aria: barAria },
        messageRows,
        compositionAvailable: composition !== null,
        compositionResidual: residual,
        sections,
        warnings: warningRows,
        pill: { variant, text: body, label: translate('label.telemetry') },
      }
    }

    /** `HH:MM` for an epoch-millisecond stamp — the record row's stamp. */
    function timeShort(at) {
      const full = timeOf(at)
      return full === '' ? '' : full.slice(0, 5)
    }

    /** `125k` / `1.2M` / `912` — the ONE token-scale formatter: no bare
     * five-digit token numbers anywhere in the panel. */
    function compactTok(value) {
      if (typeof value !== 'number' || !Number.isFinite(value)) return ''
      if (value >= 1_000_000) return (value / 1_000_000).toFixed(value >= 10_000_000 ? 0 : 1).replace(/\.0$/, '') + 'M'
      if (value >= 1_000) return (value / 1_000).toFixed(value >= 100_000 ? 0 : 1).replace(/\.0$/, '') + 'k'
      return String(Math.round(value))
    }

    /** `1,234` — the ONE counting formatter: every 条/个/节点/次 figure gets
     * a thousands separator, never a bare long number. */
    function fmtInt(value) {
      if (typeof value !== 'number' || !Number.isFinite(value)) return ''
      return Math.round(value).toLocaleString('en-US')
    }

    /** `HH:MM:SS` for an epoch-millisecond stamp, when it is one. */
    function timeOf(at) {
      if (typeof at !== 'number' || !Number.isFinite(at)) return ''
      try {
        return new Date(at).toLocaleTimeString()
      } catch (error) {
        return ''
      }
    }

    /* ------------------------------------------------------------------ *
     * Localization
     * ------------------------------------------------------------------ */

    /**
     * The locale namespace this half registers its dictionaries under.
     *
     * The shell's locale service (`@deepseek-ai/dsh-client-locale`) merges the
     * namespace into whatever language is active; a slot entry that declares
     * `locale: LOCALE_NS` receives the matching `t` seat as a prop, and every
     * outlet re-renders on a switch — the panel and the pill follow General →
     * Language with no reload. `ctx.locale.bind` returns a STABLE function that
     * resolves the active language on every call, so a `t` captured once in
     * `apply` (the slot label thunks) stays correct across switches.
     */
    const LOCALE_NS = 'magic-context'

    /**
     * The shipped dictionaries. Both locales must carry the same key set:
     * registration is runtime-only (this half is hand-written JS, so no
     * compiler checks the union) and a missing key renders as the key itself.
     * `__diagnostics.dictionaryKeys` exists so the key parity can be asserted
     * outside a browser.
     */
    const DICTIONARIES = {
      zh: {
        // Operation categories (the chips / row labels).
        'category.write': '写入记忆',
        'category.read': '加载记忆',
        'category.reclaim': '压缩上下文',
        'category.drop': '丢弃上下文',
        'category.maintain': '维护',
        'category.archive': '历史归档',
        'category.error': '失败',
        // Per-turn beats folded into one line.
        'noise.memoryRecall': '加载记忆',
        'noise.baselineRefresh': '基线刷新',
        // Record titles.
        'record.reclaimPass': '执行回收',
        'record.promotion': '记忆提升',
        'record.memoryWritten': '写入记忆',
        'record.memorySearch': '检索记忆',
        'record.compacted': '压缩上下文',
        'record.baselineHard': '基线重建 (HARD)',
        'record.emergencyDrop': '丢弃上下文',
        'record.wireRepaired': '线材修复',
        'record.dropLanded': '丢弃落地',
        'record.reduceQueued': '回收入队',
        'record.expandRestored': '恢复原文',
        'record.expandRange': '读取上下文',
        'record.remountRecovery': '重挂载恢复',
        'record.historianFailed': '历史摘要失败',
        'record.archived': '归档已存',
        'record.maintenance': '维护巡检',
        'record.failed': '执行失败',
        // Record details ({n} figures).
        'detail.added': '新增 {n}',
        'detail.staged': '入队 {n}',
        'detail.seenAgain': '去重命中 {n}',
        'detail.skipped': '跳过 {n}',
        'detail.verb.write': '写入',
        'detail.verb.update': '更新',
        'detail.verb.archive': '归档',
        'detail.verb.merge': '合并',
        'detail.verb.list': '检索',
        'detail.verb.get': '读取',
        'detail.verb.search': '检索',
        'detail.queued': '入队 {n}',
        'detail.refused': '被拒 {n}',
        'detail.restored': '恢复 {n}',
        'detail.rangeEvents': '{n} 个事件',
        'detail.rangeSkipped': '跳过 {n}',
        'detail.hits': '命中 {n}',
        'detail.rejected': '被拒',
        'detail.replacedNodes': '替换 {n} 节点',
        'detail.nodes': '{n} 节点',
        'detail.reclaimed': '回收 {n} tok',
        'detail.droppedToolOutputs': '丢弃 {n} 条工具输出',
        'detail.wireSwept': '清除 {n} 条失配结果',
        'detail.toolOutputs': '{n} 条工具输出',
        'detail.backfilled': '补记中断的历史归档',
        'detail.ttlExpired': 'TTL 归档 {n}',
        'detail.verified': '验证 {n}',
        'detail.revised': '修订 {n}',
        'detail.nothingToDo': '无需处理',
        'detail.facts': 'facts {n}',
        // Panel status + pill tooltip.
        'status.ok': '正常',
        'status.connecting': '连接中',
        'status.unavailable': '不可用',
        'tip.unavailable': '遥测不可用',
        'tip.connecting': '连接中…',
        'tip.errors': '{n} 个近期错误',
        'tip.pressure': '上下文已用 {pressure}',
        'tip.pressureWithMemories': '上下文已用 {pressure} · 记忆 {memories} 条',
        'tip.live': 'Magic Context 运行中',
        // The single-letter ledger's hover names.
        'ledger.O': '占用（原生投影：下一次请求将看到多少）',
        'ledger.L': '压缩后账面（最近一次压缩后的 surface 量）',
        'ledger.M': '本项目记忆总数',
        'ledger.P': '24h 提升的记忆',
        'ledger.U': '待验证记忆',
        'ledger.T': '最近维护 tick',
        'ledger.K': 'TTL 到期归档',
        'ledger.V': '维护验证通过',
        'ledger.R': '维护修订',
        'ledger.E': '本进程错误',
        // Telemetry v2: composition, sections and empty states.
        'telemetry.pressureLine': '{percent}% / {threshold}%',
        'telemetry.tokens': '{used} / {window}',
        'telemetry.stale': '已过期',
        'bar.system': '系统',
        'bar.tools': '工具定义',
        'bar.messages': '消息',
        'bar.aria': '上下文构成：系统 {system}，工具定义 {tools}，消息 {messages}',
        'bar.unavailable': '上下文构成不可用',
        'composition.head': '消息构成（估算）',
        'composition.unavailable': '消息构成不可用',
        'composition.conversation': '对话',
        'composition.toolCalls': '工具调用',
        'composition.compartments': '压缩段',
        'composition.memories': '记忆',
        'composition.profile': '用户画像',
        'composition.other': '其他',
        'composition.lastInjection': '上次注入',
        'section.historian': '历史摘要',
        'section.memory': '记忆',
        'section.queue': '回收队列',
        'section.maintenance': '维护',
        'section.hygiene': '可回收',
        'section.warnings': '警告',
        'historian.running': '运行中',
        'historian.idle': '空闲',
        'historian.line': '{state} · {compartments} 个压缩段 · {digested} 已消化 · 上次发布 {at}',
        'memory.line': '{total} 总计 · {injected} 已注入 · {est} 上次注入 · {profile} 画像上次注入',
        'queue.line': '{pending} 待回收 · 标签 {tags}',
        'queue.empty': '空',
        'maintenance.line': '最近 {at} · 过期 {expired} · 验证 {verified} · 更新 {updated} · 归档 {archived}',
        'maintenance.never': '尚未运行',
        'hygiene.line': '{tagged} 已打标 · {dropped} 已回收 · {reclaimable} 可回收',
        'warnings.residual': '消息构成超出宿主估算，已按比例缩放 {tokens} tok',
        'warnings.recent': '最近 15 分钟有 {n} 条错误',
        'warnings.none': '无',
        'footer.ctxStatus': '查看完整账本',
        'panel.close': '关闭',
        // Operation feed.
        'records.empty': '暂无操作记录',
        'records.noRoute': '此宿主未挂遥测路由',
        'records.folded': '{n} 次',
        'records.head': '最近操作',
        'records.count': '近 {n} 项',
        'records.foot': '悬停条目看详情',
        'records.beats': '节拍: {beats}',
        // Slot labels (ledger rows the shell projects).
        // Settings card copy.
        'settings.summary.notReady': 'Magic Context 适配器设置',
        'settings.summary.line': '执行 {execute}% · 强制 {force}% · Historian {historian}{routes}',
        'settings.summary.route': ' · {kind} {provider}/{model}',
        'settings.summary.on': '开',
        'settings.summary.off': '关',
        'settings.summary.verify': '校验',
        'settings.summary.gen': '生成',
        'settings.form.unavailable': '此部署未提供 Magic Context 设置。',
        'settings.form.readOnly': '此部署以只读方式保存设置。',
        'settings.form.saveFailed': '宿主没有接受本次保存；下面的值仍未保存。',
        'settings.form.save': '保存',
        'settings.form.saving': '保存中…',
        'settings.form.modified': '已修改',
        'settings.form.reset': '重置',
        'settings.form.invalid': '无效',
        'settings.form.invalidNumber': '不是数字',
        'settings.route.autoSession': 'Auto — 跟随会话路由',
        'settings.route.autoPickProvider': 'Auto — 先选择 provider',
        'settings.route.notInCatalog': '{value}（不在目录中）',
        'settings.route.providerPlaceholder': 'provider id',
        'settings.route.modelPlaceholder': 'model id',
        'settings.effort.default': '默认',
        'settings.effort.custom': '自定义…',
        'settings.effort.customCurrent': '自定义（{value}）',
        'settings.effort.customPlaceholder': '输入 effort id',
        'settings.effort.autoHint': '固定 Historian provider 与 model 后，可从模型公布的 effort 列表中选择。',
        'settings.effort.noneHint': '该模型未公布 reasoning effort；留空使用模型默认值。',
        'settings.effort.unknownHint': '该 id 不在当前模型目录中；在你修改前会保留。',
        'settings.field.embedding.provider.label': '向量提供方',
        'settings.field.embedding.provider.hint': '本地模型是默认选项；远程只支持 OpenAI 兼容接口。',
        'settings.field.embedding.preset.label': '服务预设',
        'settings.field.embedding.preset.hint': '预设只提供端点和模型列表方式，不包含模型 ID 或维度。',
        'settings.field.embedding.endpoint.label': '接口地址',
        'settings.field.embedding.endpoint.hint': '例如 https://api.siliconflow.cn/v1；不要填写密钥。',
        'settings.field.embedding.authHeader.label': '认证头',
        'settings.field.embedding.authHeader.hint': '多数服务使用 Authorization；Azure 可用 api-key。',
        'settings.field.embedding.model.label': '模型 ID',
        'settings.field.embedding.model.hint': '从模型列表选择，或手动填写服务商公布的模型 ID。',
        'settings.field.embedding.apiKeyEnv.label': 'API Key 环境变量',
        'settings.field.embedding.apiKeyEnv.hint': '只写变量名，不写密钥值；填写空值表示端点不需要认证。',
        'settings.field.embedding.dimensions.label': '向量维度',
        'settings.field.embedding.dimensions.hint': '0 表示自动探测；只有服务支持 dimensions 参数时才填写覆盖值。',
        'settings.field.embedding.queryInstruction.label': '查询指令前缀',
        'settings.field.embedding.queryInstruction.hint': '可选；只影响查询向量，不写入存储。',
        'settings.field.embedding.documentPrefix.label': '文档前缀',
        'settings.field.embedding.documentPrefix.hint': '可选；会改变写入的文档向量，切换后需要重建。',
        'settings.field.embedding.timeoutMs.label': '后台超时（毫秒）',
        'settings.field.embedding.timeoutMs.hint': '后台探测/重建请求的超时；默认 8000。',
        'settings.field.embedding.queryTimeoutMs.label': '查询超时（毫秒）',
        'settings.field.embedding.queryTimeoutMs.hint': '交互式检索的最长等待；默认 2500，超时降级为全文检索。',
        'settings.field.embedding.batchSize.label': '批大小',
        'settings.field.embedding.batchSize.hint': '每次远程请求的文本条数；默认 16。',
        'settings.embedding.provider.local': '本地 MiniLM',
        'settings.embedding.provider.remote': 'OpenAI 兼容 API',
        'settings.embedding.provider.off': '关闭语义检索',
        'settings.embedding.preset.siliconflow': '硅基流动',
        'settings.embedding.preset.custom': '自定义',
        'settings.embedding.auth.authorization': 'Authorization: Bearer',
        'settings.embedding.auth.apiKey': 'api-key 头',
        'settings.embedding.title': '向量检索',
        'settings.embedding.privacy': '启用远程向量会把你检索的记忆文本发送到该端点；请使用可信端点。',
        'settings.embedding.status': '状态',
        'settings.embedding.savedFirst': '先保存当前修改，再执行远程操作。',
        'settings.embedding.keyPresent': 'API Key：已配置',
        'settings.embedding.keyAbsent': 'API Key：未配置',
        'settings.embedding.loadModels': '加载模型',
        'settings.embedding.refresh': '刷新',
        'settings.embedding.probe': '测试连接',
        'settings.embedding.start': '开始重建向量',
        'settings.embedding.pause': '暂停',
        'settings.embedding.resume': '继续',
        'settings.embedding.rollback': '回滚到本地',
        'settings.embedding.working': '处理中…',
        'settings.embedding.noModels': '无模型；可手动填写模型 ID',
        'settings.embedding.modelPlaceholder': '选择或填写模型',
        'settings.embedding.coverage': '{covered}/{total} 条可检索记忆',
        'settings.embedding.coverageUnknown': '覆盖未知',
        'settings.embedding.dimensionUnknown': '维度未知',
        'settings.embedding.memoryOff': '记忆功能已关闭；向量检索不会运行。',
        'settings.embedding.plainHttp': '该端点使用明文 HTTP，且不是本机/私网；请谨慎使用。',
        'settings.embedding.state.local': '本地模型',
        'settings.embedding.state.rollbackLocal': '已回滚到本地',
        'settings.embedding.state.off': '语义检索已关闭',
        'settings.embedding.state.unprobed': '未探测',
        'settings.embedding.state.notStarted': '未开始重建',
        'settings.embedding.state.paused': '已暂停',
        'settings.embedding.state.targetMissing': '目标空间尚无向量',
        'settings.embedding.state.migrating': '迁移中',
        'settings.embedding.state.ready': '已就绪',
        'settings.embedding.state.error': '远程错误',
        'settings.field.policy.executeThreshold.label': '执行阈值（%）',
        'settings.field.policy.executeThreshold.hint': '执行回收带开启时的上下文占用百分比（0-100）。',
        'settings.field.policy.forceThreshold.label': '强制阈值（%）',
        'settings.field.policy.forceThreshold.hint': '回收变为无条件时的占用百分比（0-100）。',
        'settings.field.policy.assumedContextWindow.label': '假定窗口（tokens）',
        'settings.field.policy.assumedContextWindow.hint': '路由模型未披露窗口时用于调度的窗口大小。',
        'settings.field.policy.ttlMs.label': '回收 TTL（毫秒）',
        'settings.field.policy.ttlMs.hint': '被回收的区间保持可恢复的时长。',
        'settings.field.policy.protectedToolResults.label': '保护工具结果数',
        'settings.field.policy.protectedToolResults.hint': '策略永不回收的最新工具结果数量。',
        'settings.field.policy.historianMinNodes.label': 'Historian 最小节点数',
        'settings.field.policy.historianMinNodes.hint': 'Historian 运行前需要的 assistant/tool 节点数。',
        'settings.field.policy.historianMaxTokens.label': 'Historian 最大 tokens',
        'settings.field.policy.historianMaxTokens.hint': '单次 Historian 调用的生成上限；低于 8192 会按 8192 处理。',
        'settings.field.policy.historianMaxTokensCeiling.label': 'Historian 重试上限',
        'settings.field.policy.historianMaxTokensCeiling.hint': 'token 截断后允许升级到的上限（每次尝试翻倍）。',
        'settings.field.policy.historianTimeoutMs.label': 'Historian 超时（毫秒）',
        'settings.field.policy.historianTimeoutMs.hint': '单次 Historian 运行的墙钟预算；超时会记录失败。',
        'settings.field.policy.baselineTokens.label': '基线 tokens',
        'settings.field.policy.baselineTokens.hint': '为 m[0]/m[1] 基线预留的 token 预算。',
        'settings.field.policy.memoryBudgetTokens.label': '记忆预算 tokens',
        'settings.field.policy.memoryBudgetTokens.hint': '召回记忆块可使用的 token 预算。',
        'settings.field.policy.memoryLimit.label': '记忆行上限',
        'settings.field.policy.memoryLimit.hint': '每次 pass 最多召回的共享记忆行数。',
        'settings.field.journal.retentionDays.label': 'Journal 保留天数',
        'settings.field.journal.retentionDays.hint': 'Journal 行的保留时长。修改后会重新清理（最少 1 天）。',
        'settings.field.historianEnabled.label': 'Historian 启用',
        'settings.field.historianEnabled.hint': '运行带外 Historian。',
        'settings.field.registerCompactionEngine.label': '注册压缩引擎',
        'settings.field.registerCompactionEngine.hint': '把适配器注册为压缩引擎 seam；在 DSH Web 和桌面端都无效。只对 flat/headless profile 生效，且必须先停用该组合的根 compaction-basic 行；Web 与桌面端的每个 agent preset 自带 compaction 引擎，本开关不会替换它。下一次 agent step 挂载或卸载。',
        'settings.field.maintenance.verifyProvider.label': '校验 provider',
        'settings.field.maintenance.verifyProvider.hint': '维护校验通道使用的 provider。“Auto” 表示不固定，跟随会话路由。',
        'settings.field.maintenance.verifyModel.label': '校验模型',
        'settings.field.maintenance.verifyModel.hint': '维护校验通道使用的模型。同时设置 provider 和 model 才会固定；“Auto” 跟随会话路由。',
        'settings.field.historian.provider.label': 'Historian provider',
        'settings.field.historian.provider.hint': 'Historian 与 /compact 摘要使用的 provider。“Auto” 跟随会话路由（推荐）。',
        'settings.field.historian.model.label': 'Historian 模型',
        'settings.field.historian.model.hint': 'Historian 与 /compact 摘要使用的模型。两半都设置才会固定；“Auto” 跟随会话路由。',
        'settings.field.historian.reasoningEffort.label': 'Historian 推理强度',
        'settings.field.historian.reasoningEffort.hint': '路由模型公布的 effort id（例如 off/low/high/max）；留空使用模型默认值。',
        'settings.field.journal.enabled.label': 'Journal 启用',
        'settings.field.journal.enabled.hint': '记录适配器活动。关闭立即生效；从关闭状态开启需要重启应用。',
        'settings.field.journal.mirror.label': 'Journal 文本镜像',
        'settings.field.journal.mirror.hint': '同时写单行活动镜像文件。仅对修改后写入的条目生效。',
        'title': 'Magic Context',
        'label.telemetry': 'Magic Context 遥测',
      },
      en: {
        'category.write': 'Memory written',
        'category.read': 'Memory loaded',
        'category.reclaim': 'Context reclaimed',
        'category.drop': 'Context dropped',
        'category.maintain': 'Maintenance',
        'category.archive': 'Archived',
        'category.error': 'Failed',
        'noise.memoryRecall': 'memories loaded',
        'noise.baselineRefresh': 'baseline refreshed',
        'record.reclaimPass': 'Reclaim pass',
        'record.promotion': 'Memory promotion',
        'record.memoryWritten': 'Memory written',
        'record.memorySearch': 'Memory search',
        'record.compacted': 'Context compacted',
        'record.baselineHard': 'Baseline rebuild (HARD)',
        'record.emergencyDrop': 'Emergency drop',
        'record.wireRepaired': 'Wire repair',
        'record.dropLanded': 'Drop landed',
        'record.reduceQueued': 'Reclaim queued',
        'record.expandRestored': 'Content restored',
        'record.expandRange': 'Context read',
        'record.remountRecovery': 'Remount recovery',
        'record.historianFailed': 'Historian failed',
        'record.archived': 'Compartment stored',
        'record.maintenance': 'Maintenance sweep',
        'record.failed': 'Operation failed',
        'detail.added': 'added {n}',
        'detail.staged': 'staged {n}',
        'detail.seenAgain': 'seen again {n}',
        'detail.skipped': 'skipped {n}',
        'detail.verb.write': 'write',
        'detail.verb.update': 'update',
        'detail.verb.archive': 'archive',
        'detail.verb.merge': 'merge',
        'detail.verb.list': 'list',
        'detail.verb.get': 'read',
        'detail.verb.search': 'search',
        'detail.queued': 'queued {n}',
        'detail.refused': 'refused {n}',
        'detail.restored': 'restored {n}',
        'detail.rangeEvents': '{n} events',
        'detail.rangeSkipped': 'skipped {n}',
        'detail.hits': '{n} hits',
        'detail.rejected': 'rejected',
        'detail.replacedNodes': 'replaced {n} nodes',
        'detail.nodes': '{n} nodes',
        'detail.reclaimed': 'reclaimed {n} tok',
        'detail.droppedToolOutputs': 'dropped {n} tool outputs',
        'detail.wireSwept': 'swept {n} stranded results',
        'detail.toolOutputs': '{n} tool outputs',
        'detail.backfilled': 'backfilled the interrupted archive',
        'detail.ttlExpired': 'TTL expired {n}',
        'detail.verified': 'verified {n}',
        'detail.revised': 'revised {n}',
        'detail.nothingToDo': 'nothing to do',
        'detail.facts': 'facts {n}',
        'status.ok': 'healthy',
        'status.connecting': 'connecting',
        'status.unavailable': 'unavailable',
        'tip.unavailable': 'Telemetry unavailable',
        'tip.connecting': 'Connecting…',
        'tip.errors': '{n} recent errors',
        'tip.pressure': '{pressure} of context used',
        'tip.pressureWithMemories': '{pressure} of context used · {memories} memories',
        'tip.live': 'Magic Context live',
        'ledger.O': 'Occupancy (native projection: what the next request sees)',
        'ledger.L': 'Post-compaction ledger (surface after the last compaction)',
        'ledger.M': 'Memories in this project',
        'ledger.P': 'Memories promoted in 24h',
        'ledger.U': 'Unverified memories',
        'ledger.T': 'Last maintenance tick',
        'ledger.K': 'TTL-expired archives',
        'ledger.V': 'Maintenance verifications passed',
        'ledger.R': 'Maintenance revisions',
        'ledger.E': 'Errors in this process',
        // Telemetry v2: composition, sections and empty states.
        'telemetry.pressureLine': '{percent}% / {threshold}%',
        'telemetry.tokens': '{used} / {window}',
        'telemetry.stale': 'stale',
        'bar.system': 'System',
        'bar.tools': 'Tool definitions',
        'bar.messages': 'Messages',
        'bar.aria': 'Context composition: system {system}, tool definitions {tools}, messages {messages}',
        'bar.unavailable': 'Context composition unavailable',
        'composition.head': 'Message composition (estimated)',
        'composition.unavailable': 'Message composition unavailable',
        'composition.conversation': 'Conversation',
        'composition.toolCalls': 'Tool calls',
        'composition.compartments': 'Compartments',
        'composition.memories': 'Memories',
        'composition.profile': 'Profile',
        'composition.other': 'Other',
        'composition.lastInjection': 'last injection',
        'section.historian': 'Historian',
        'section.memory': 'Memory',
        'section.queue': 'Queue',
        'section.maintenance': 'Maintenance',
        'section.hygiene': 'Hygiene',
        'section.warnings': 'Warnings',
        'historian.running': 'running',
        'historian.idle': 'idle',
        'historian.line': '{state} · {compartments} compartments · {digested} digested · last published {at}',
        'memory.line': '{total} total · {injected} injected · {est} last injection · {profile} profile last injection',
        'queue.line': '{pending} pending · tags {tags}',
        'queue.empty': 'empty',
        'maintenance.line': 'last {at} · expired {expired} · verified {verified} · updated {updated} · archived {archived}',
        'maintenance.never': 'never run',
        'hygiene.line': '{tagged} tagged · {dropped} dropped · {reclaimable} reclaimable',
        'warnings.residual': 'Message composition exceeded the host estimate and was scaled by {tokens} tok',
        'warnings.recent': 'Recent errors in the last 15 minutes: {n}',
        'warnings.none': 'none',
        'footer.ctxStatus': '/ctx-status for the full ledger',
        'panel.close': 'Close',
        'records.empty': 'No operations recorded yet',
        'records.noRoute': 'This host exposes no telemetry route',
        'records.folded': '×{n}',
        'records.head': 'Recent operations',
        'records.count': 'last {n}',
        'records.foot': 'Hover a row for detail',
        'records.beats': 'Beats: {beats}',
        // Settings card copy.
        'settings.summary.notReady': 'Magic Context adapter settings',
        'settings.summary.line': 'execute {execute}% · force {force}% · historian {historian}{routes}',
        'settings.summary.route': ' · {kind} {provider}/{model}',
        'settings.summary.on': 'on',
        'settings.summary.off': 'off',
        'settings.summary.verify': 'verify',
        'settings.summary.gen': 'gen',
        'settings.form.unavailable': 'Magic Context settings are not served by this deployment.',
        'settings.form.readOnly': 'This deployment stores settings read-only.',
        'settings.form.saveFailed': 'The Host did not accept the save; the values below are unsaved.',
        'settings.form.save': 'Save',
        'settings.form.saving': 'Saving…',
        'settings.form.modified': 'Modified',
        'settings.form.reset': 'Reset',
        'settings.form.invalid': 'Invalid',
        'settings.form.invalidNumber': 'Not a number',
        'settings.route.autoSession': 'Auto — follow the session route',
        'settings.route.autoPickProvider': 'Auto — pick a provider first',
        'settings.route.notInCatalog': '{value} (not in catalog)',
        'settings.route.providerPlaceholder': 'provider id',
        'settings.route.modelPlaceholder': 'model id',
        'settings.effort.default': 'Default',
        'settings.effort.custom': 'Custom…',
        'settings.effort.customCurrent': 'Custom ({value})',
        'settings.effort.customPlaceholder': 'Enter an effort id',
        'settings.effort.autoHint': 'Pin the Historian provider and model to pick from the model\'s advertised efforts.',
        'settings.effort.noneHint': 'This model advertises no reasoning efforts; blank uses the model default.',
        'settings.effort.unknownHint': 'This id is not in the current model catalog; it is preserved until you change it.',
        'settings.field.embedding.provider.label': 'Embedding provider',
        'settings.field.embedding.provider.hint': 'Local is the default; remote supports only OpenAI-compatible APIs.',
        'settings.field.embedding.preset.label': 'Provider preset',
        'settings.field.embedding.preset.hint': 'A preset supplies an endpoint and a model-list mode, never model IDs or dimensions.',
        'settings.field.embedding.endpoint.label': 'Endpoint',
        'settings.field.embedding.endpoint.hint': 'For example https://api.siliconflow.cn/v1; never put the key here.',
        'settings.field.embedding.authHeader.label': 'Auth header',
        'settings.field.embedding.authHeader.hint': 'Most services use Authorization; Azure can use api-key.',
        'settings.field.embedding.model.label': 'Model ID',
        'settings.field.embedding.model.hint': 'Pick from the model list or type a vendor-published model ID.',
        'settings.field.embedding.apiKeyEnv.label': 'API key environment variable',
        'settings.field.embedding.apiKeyEnv.hint': 'Name only, never the value; leave empty when the endpoint needs no auth.',
        'settings.field.embedding.dimensions.label': 'Vector dimensions',
        'settings.field.embedding.dimensions.hint': '0 probes automatically; override only when the service supports the dimensions parameter.',
        'settings.field.embedding.queryInstruction.label': 'Query instruction',
        'settings.field.embedding.queryInstruction.hint': 'Optional; affects query vectors only, never stored vectors.',
        'settings.field.embedding.documentPrefix.label': 'Document prefix',
        'settings.field.embedding.documentPrefix.hint': 'Optional; changes stored document vectors, so a change needs a rebuild.',
        'settings.field.embedding.timeoutMs.label': 'Background timeout (ms)',
        'settings.field.embedding.timeoutMs.hint': 'Probe/rebuild request timeout; default 8000.',
        'settings.field.embedding.queryTimeoutMs.label': 'Query timeout (ms)',
        'settings.field.embedding.queryTimeoutMs.hint': 'Longest interactive wait; default 2500, then falls back to full-text search.',
        'settings.field.embedding.batchSize.label': 'Batch size',
        'settings.field.embedding.batchSize.hint': 'Texts per remote request; default 16.',
        'settings.embedding.provider.local': 'Local MiniLM',
        'settings.embedding.provider.remote': 'OpenAI-compatible API',
        'settings.embedding.provider.off': 'Off (full-text only)',
        'settings.embedding.preset.siliconflow': 'SiliconFlow',
        'settings.embedding.preset.custom': 'Custom',
        'settings.embedding.auth.authorization': 'Authorization: Bearer',
        'settings.embedding.auth.apiKey': 'api-key header',
        'settings.embedding.title': 'Embedding search',
        'settings.embedding.privacy': 'Enabling remote embeddings sends the memory text you search to that endpoint; use a trusted endpoint.',
        'settings.embedding.status': 'Status',
        'settings.embedding.savedFirst': 'Save the current edits before using remote actions.',
        'settings.embedding.keyPresent': 'API key: configured',
        'settings.embedding.keyAbsent': 'API key: not configured',
        'settings.embedding.loadModels': 'Load models',
        'settings.embedding.refresh': 'Refresh',
        'settings.embedding.probe': 'Test connection',
        'settings.embedding.start': 'Start rebuild',
        'settings.embedding.pause': 'Pause',
        'settings.embedding.resume': 'Resume',
        'settings.embedding.rollback': 'Roll back to local',
        'settings.embedding.working': 'Working…',
        'settings.embedding.noModels': 'No models; type a model ID manually',
        'settings.embedding.modelPlaceholder': 'Pick or type a model',
        'settings.embedding.coverage': '{covered}/{total} searchable memories',
        'settings.embedding.coverageUnknown': 'coverage unknown',
        'settings.embedding.dimensionUnknown': 'dimensions unknown',
        'settings.embedding.memoryOff': 'Memory is disabled; embedding search will not run.',
        'settings.embedding.plainHttp': 'This endpoint uses plain HTTP and is not local/private; use with care.',
        'settings.embedding.state.local': 'local model',
        'settings.embedding.state.rollbackLocal': 'rolled back to local',
        'settings.embedding.state.off': 'semantic search off',
        'settings.embedding.state.unprobed': 'not probed',
        'settings.embedding.state.notStarted': 'rebuild not started',
        'settings.embedding.state.paused': 'paused',
        'settings.embedding.state.targetMissing': 'target space has no vectors',
        'settings.embedding.state.migrating': 'migrating',
        'settings.embedding.state.ready': 'ready',
        'settings.embedding.state.error': 'remote error',
        'settings.field.policy.executeThreshold.label': 'Execute threshold (%)',
        'settings.field.policy.executeThreshold.hint': 'Adoption percentage at which the execute band opens (0-100).',
        'settings.field.policy.forceThreshold.label': 'Force threshold (%)',
        'settings.field.policy.forceThreshold.hint': 'Adoption percentage at which reclaim becomes unconditional (0-100).',
        'settings.field.policy.assumedContextWindow.label': 'Assumed window (tokens)',
        'settings.field.policy.assumedContextWindow.hint': 'Window used for scheduling when the routed model discloses none.',
        'settings.field.policy.ttlMs.label': 'Reclaim TTL (ms)',
        'settings.field.policy.ttlMs.hint': 'How long a reclaimed compartment stays reversible.',
        'settings.field.policy.protectedToolResults.label': 'Protected tool results',
        'settings.field.policy.protectedToolResults.hint': 'Newest tool results the policy never reclaims.',
        'settings.field.policy.historianMinNodes.label': 'Historian minimum nodes',
        'settings.field.policy.historianMinNodes.hint': 'Assistant/tool nodes required before the historian runs.',
        'settings.field.policy.historianMaxTokens.label': 'Historian max tokens',
        'settings.field.policy.historianMaxTokens.hint': 'Generation cap for one historian call; anything below 8192 is raised to 8192.',
        'settings.field.policy.historianMaxTokensCeiling.label': 'Historian retry ceiling',
        'settings.field.policy.historianMaxTokensCeiling.hint': 'Ceiling the historian may escalate to after a token-cap truncation (doubles per attempt).',
        'settings.field.policy.historianTimeoutMs.label': 'Historian timeout (ms)',
        'settings.field.policy.historianTimeoutMs.hint': 'Wall-clock budget for one historian run; a spent budget journals a failed run.',
        'settings.field.policy.baselineTokens.label': 'Baseline tokens',
        'settings.field.policy.baselineTokens.hint': 'Token budget reserved for the m[0]/m[1] baseline.',
        'settings.field.policy.memoryBudgetTokens.label': 'Memory budget tokens',
        'settings.field.policy.memoryBudgetTokens.hint': 'Token budget the recalled-memory block may spend.',
        'settings.field.policy.memoryLimit.label': 'Memory row limit',
        'settings.field.policy.memoryLimit.hint': 'Maximum shared memory rows recalled per pass.',
        'settings.field.journal.retentionDays.label': 'Journal retention (days)',
        'settings.field.journal.retentionDays.hint': 'How long journal rows are kept. Re-prunes once the value changes (minimum 1 day).',
        'settings.field.historianEnabled.label': 'Historian enabled',
        'settings.field.historianEnabled.hint': 'Run the out-of-band historian.',
        'settings.field.registerCompactionEngine.label': 'Register compaction engine',
        'settings.field.registerCompactionEngine.hint': 'Register the adapter as the compaction engine seam. This switch has no effect on DSH Web or Desktop. It is only effective on a flat/headless profile whose root compaction-basic row is disabled and whose host composition does not already provide compaction through an agent preset; Web and Desktop presets own their compaction engine and this switch does not replace it. Mounts or unmounts on the next agent step.',
        'settings.field.maintenance.verifyProvider.label': 'Verify provider',
        'settings.field.maintenance.verifyProvider.hint': 'Provider for the maintenance verify lane. “Auto” leaves the pin off and follows the session route.',
        'settings.field.maintenance.verifyModel.label': 'Verify model',
        'settings.field.maintenance.verifyModel.hint': 'Model for the maintenance verify lane. Set both provider and model to pin; “Auto” follows the session route.',
        'settings.field.historian.provider.label': 'Historian provider',
        'settings.field.historian.provider.hint': 'Provider for the historian and /compact summaries. “Auto” follows the session route (recommended).',
        'settings.field.historian.model.label': 'Historian model',
        'settings.field.historian.model.hint': 'Model for the historian and /compact summaries. Set both halves to pin; “Auto” follows the session route.',
        'settings.field.historian.reasoningEffort.label': 'Historian reasoning effort',
        'settings.field.historian.reasoningEffort.hint': 'Optional effort id advertised by the routed model (for example off/low/high/max). Blank uses the model default.',
        'settings.field.journal.enabled.label': 'Journal enabled',
        'settings.field.journal.enabled.hint': 'Record adapter activity. Turning off applies immediately; turning on from an off start needs an app restart.',
        'settings.field.journal.mirror.label': 'Journal text mirror',
        'settings.field.journal.mirror.hint': 'Also write the one-line activity mirror file. Applies to entries written after the change.',
        'title': 'Magic Context',
        'label.telemetry': 'Magic Context telemetry',
      },
    }

    /**
     * A dictionary-backed translator in the same shape as the slot `t` seat:
     * `t(key, params)` interpolates `{name}` and falls back en → key. Used as
     * the default for the pure record functions, whose direct callers
     * (`__diagnostics`, the records-check script) read the shipped zh copy;
     * every rendered string goes through the framework `t` instead.
     */
    function dictionaryTranslator(locale) {
      const table = DICTIONARIES[locale] !== undefined ? DICTIONARIES[locale] : DICTIONARIES.en
      const fallback = DICTIONARIES.en
      return (key, params) => {
        const template = table[key] !== undefined ? table[key] : fallback[key] !== undefined ? fallback[key] : key
        if (params === undefined || params === null) return template
        return template.replace(/\{(\w+)\}/g, (match, name) => (name in params ? String(params[name]) : match))
      }
    }

    /** The reference translator for callers that pass no `t`. */
    const REFERENCE_T = dictionaryTranslator('zh')

    /** Every key the dictionaries carry, for the parity check outside a browser. */
    function dictionaryKeys() {
      return {
        zh: Object.keys(DICTIONARIES.zh).sort(),
        en: Object.keys(DICTIONARIES.en).sort(),
      }
    }

    /* ------------------------------------------------------------------ *
     * Operation records (what the adapter just did, in the operator's words)
     * ------------------------------------------------------------------ */

    /**
     * The categories the panel groups operations into.
     *
     * The panel is the window onto the three things a reviewing operator cares
     * about — memories going in, memories coming out, and context being
     * reclaimed or dropped — so every journal kind that represents one of them
     * is mapped here. Process chatter (`pass` defers, boots, engine notices,
     * session-first-seen) is counted but never listed, otherwise 480 defer rows
     * bury the handful of real operations.
     */
    const RECORD_CATEGORIES = {
      write: { icon: '🧠', labelKey: 'category.write', tone: '#a371f7' },
      read: { icon: '🔎', labelKey: 'category.read', tone: '#2f81f7' },
      reclaim: { icon: '✂️', labelKey: 'category.reclaim', tone: '#22a06b' },
      drop: { icon: '🗑️', labelKey: 'category.drop', tone: '#d08700' },
      maintain: { icon: '🧰', labelKey: 'category.maintain', tone: '#8250df' },
      archive: { icon: '🧭', labelKey: 'category.archive', tone: '#8a8f98' },
      error: { icon: '⚠️', labelKey: 'category.error', tone: '#e5484d' },
    }
    /** Kinds that are process noise unless they carry a real operation. */
    // Telemetry-only kinds: real signals, but never operation rows — they
    // would flood the feed (context-pressure fires per distinct reading) or
    // read as raw English summaries under the archive fallback.
    const NOISE_KINDS = { pass: true, boot: true, 'session-first-seen': true, engine: true, 'context-pressure': true, 'memory-recall': true }
    /** How many records the panel lists (the stream keeps `MAX_RECENT`). */
    const MAX_RECORDS = 12

    function numberField(data, key) {
      if (data === null || typeof data !== 'object') return undefined
      const value = data[key]
      return typeof value === 'number' && Number.isFinite(value) ? value : undefined
    }

    function arrayLength(data, key) {
      if (data === null || typeof data !== 'object') return undefined
      return Array.isArray(data[key]) ? data[key].length : undefined
    }

    /** `−70.7k tok`; '' when the Host sent no number. Same compact scale as
     * every other token figure in the panel — no thousands-separated bills. */
    function tokensOf(value) {
      if (typeof value !== 'number' || !Number.isFinite(value)) return ''
      const sign = value < 0 ? '−' : ''
      return sign + compactTok(Math.abs(value)) + ' tok'
    }

    /** `135ms` / `9.7s`; '' when the Host sent no number. */
    function spanOf(value) {
      if (typeof value !== 'number' || !Number.isFinite(value)) return ''
      return value < 1000 ? Math.round(value) + 'ms' : (value / 1000).toFixed(1) + 's'
    }

    function joinDetail(parts) {
      return parts.filter((part) => typeof part === 'string' && part !== '').join(' · ')
    }

    /**
     * One journal row → one record, or null for noise.
     *
     * `detail` reads numbers off the SSE payload; the snapshot strip carries no
     * `data`, so those rows fall back to the Host's one-line summary (rendered
     * by the caller) instead of losing their content entirely.
     *
     * `t` is the active translator (the slot `t` seat in the panel, the shipped
     * zh dictionary for `__diagnostics` callers that pass none), so every
     * string this returns is already in the reader's language.
     */
    function recordOf(event, t = REFERENCE_T) {
      if (event === null || typeof event !== 'object') return null
      const kind = typeof event.kind === 'string' ? event.kind : 'event'
      const data = event.data !== null && typeof event.data === 'object' ? event.data : undefined
      const level = typeof event.level === 'string' ? event.level : 'info'
      const at = typeof event.at === 'number' ? event.at : undefined
      const action = data !== undefined && typeof data.action === 'string' ? data.action : undefined
      const record = (category, key, params, detail) => ({
        category,
        text: t(key, params),
        detail: joinDetail(detail),
        at,
        summary: event.summary,
      })
      switch (kind) {
        case 'pass': {
          if (data === undefined || data.decision !== 'execute') return null
          // An execute pass that moved 0 tokens is a no-op: the real reclamation
          // is already reported by its `compartment-published`/`baseline` rows,
          // so listing it would bury them under "0 tok" lines.
          const delta = numberField(data, 'tokensDelta')
          if (delta === undefined || delta === 0) return null
          const passPressure = numberField(data, 'pressure')
          return record('reclaim', 'record.reclaimPass', undefined, [
            passPressure === undefined ? '' : Math.round(passPressure) + '%',
            tokensOf(delta),
          ])
        }
        case 'memory-promote': {
          const inserted = arrayLength(data, 'inserted')
          const seenAgain = arrayLength(data, 'seenAgain')
          const skipped = arrayLength(data, 'skipped')
          const staged = arrayLength(data, 'staged')
          const detail = [
            inserted === undefined ? '' : t('detail.added', { n: fmtInt(inserted) }),
            // A machine/org auto-stage row (`phase: auto-stage`) carries `staged`
            // instead of `inserted` — the candidate pool is filled, no project
            // row is written. Show the candidating count for it.
            staged === undefined ? '' : t('detail.staged', { n: fmtInt(staged) }),
          ]
          // The panel's promotion detail must always carry a real count
          // (mc-records-check asserts /新增 \d+/ on the rendered line).
          const count = detail.find((part) => /^\D*?\d+/.test(part))
          if (count !== undefined) {
            return record('write', 'record.promotion', undefined, [
              count,
              seenAgain ? t('detail.seenAgain', { n: fmtInt(seenAgain) }) : '',
              skipped ? t('detail.skipped', { n: fmtInt(skipped) }) : '',
            ])
          }
          return record('write', 'record.promotion', undefined, detail)
        }
        case 'tool-call': {
          // The reclamation lane first: ctx_reduce/ctx_expand rows carry `tool`
          // plus tag arrays and NO `action` (tool-bridge.ts:217,277), so the
          // action branches below dropped them entirely — the panel never showed
          // the agent's own drops or restores, the two operations it exists for.
          const tool = data !== undefined && typeof data.tool === 'string' ? data.tool : undefined
          if (tool === 'ctx_reduce') {
            const queued = arrayLength(data, 'queued')
            const refused = arrayLength(data, 'refused')
            return record('drop', 'record.reduceQueued', undefined, [
              queued === undefined ? '' : t('detail.queued', { n: fmtInt(queued) }),
              refused ? t('detail.refused', { n: fmtInt(refused) }) : '',
              spanOf(numberField(data, 'ms')),
            ])
          }
          if (tool === 'ctx_expand') {
            if (data !== undefined && data.locator === 'range') {
              const events = arrayLength(data, 'events')
              const skipped = numberField(data, 'skipped')
              return record('read', 'record.expandRange', undefined, [
                events === undefined ? '' : t('detail.rangeEvents', { n: fmtInt(events) }),
                skipped ? t('detail.rangeSkipped', { n: fmtInt(skipped) }) : '',
                spanOf(numberField(data, 'ms')),
              ])
            }
            const restored = arrayLength(data, 'restored')
            const refused = arrayLength(data, 'refused')
            return record('archive', 'record.expandRestored', undefined, [
              restored === undefined ? '' : t('detail.restored', { n: fmtInt(restored) }),
              refused ? t('detail.refused', { n: fmtInt(refused) }) : '',
              spanOf(numberField(data, 'ms')),
            ])
          }
          const writeish = action === 'write' || action === 'update' || action === 'archive' || action === 'merge'
          // `search` is the agent's read lane (MC ctx_search's memory half) and
          // used to be dropped for not being list/get.
          const readish = action === 'list' || action === 'get' || action === 'search'
          if (!writeish && !readish) return null
          const hits = numberField(data, 'hits')
          return record(writeish ? 'write' : 'read', writeish ? 'record.memoryWritten' : 'record.memorySearch', undefined, [
            t('detail.verb.' + String(action)),
            readish && hits !== undefined ? t('detail.hits', { n: fmtInt(hits) }) : '',
            data !== undefined && data.ok === false ? t('detail.rejected') : '',
            spanOf(numberField(data, 'ms')),
          ])
        }
        case 'memory-recall': {
          // Every pass re-reports the same injection; the per-turn beat lives
          // in the beat line, not the record list.
          return null
        }
        case 'compartment-published': {
          const nodes = numberField(data, 'nodes')
          const reclaimed = numberField(data, 'estTokensReclaimed')
          return record('reclaim', 'record.compacted', undefined, [
            nodes === undefined ? '' : t('detail.replacedNodes', { n: fmtInt(nodes) }),
            reclaimed === undefined ? '' : t('detail.reclaimed', { n: compactTok(reclaimed) }),
          ])
        }
        case 'baseline': {
          // A SOFT refresh is the engine's per-execute heartbeat; only a HARD
          // rebuild (a priced cache bust) is worth a row.
          if (data === undefined || data.mode !== 'hard') return null
          const bytes = numberField(data, 'bytes')
          const est = numberField(data, 'estTokens')
          return record('reclaim', 'record.baselineHard', undefined, [
            bytes === undefined ? '' : compactTok(bytes) + ' B',
            est === undefined ? '' : compactTok(est) + ' tok',
          ])
        }
        case 'emergency-reclaim': {
          const dropped = numberField(data, 'dropped')
          return record('drop', 'record.emergencyDrop', undefined, [
            dropped === undefined ? '' : t('detail.droppedToolOutputs', { n: fmtInt(dropped) }),
            data !== undefined && typeof data.reason === 'string' ? data.reason : '',
          ])
        }
        case 'wire-repair': {
          // A wire defect means the adapter once broke pairing on the live
          // surface; the sweep is the fix, and the row is the receipt.
          const swept = numberField(data, 'swept')
          return record('maintain', 'record.wireRepaired', undefined, [
            swept === undefined ? '' : t('detail.wireSwept', { n: fmtInt(swept) }),
          ])
        }
        case 'drop-landed': {
          const count = numberField(data, 'count')
          const est = numberField(data, 'estTokens')
          return record('drop', 'record.dropLanded', undefined, [
            count === undefined ? '' : t('detail.toolOutputs', { n: fmtInt(count) }),
            est === undefined ? '' : t('detail.reclaimed', { n: compactTok(est) }),
          ])
        }
        case 'historian': {
          const phase = data === undefined || typeof data.phase !== 'string' ? '' : data.phase
          if (phase === 'failed') {
            // A remount-killed run is repaired host-side at the next mount —
            // it is bookkeeping, not an operation failure, so it reads as a
            // dim archive row instead of a red one.
            if (data !== undefined && data.kind === 'adapter-remount') {
              return record('maintain', 'record.remountRecovery', undefined, [t('detail.backfilled')])
            }
            const reason = typeof data.reason === 'string' ? data.reason : ''
            return record('error', 'record.historianFailed', undefined, [reason.slice(0, 42)])
          }
          if (phase !== 'stored') return null // start/done are the run's inner beat
          const facts = numberField(data, 'facts')
          const nodes = numberField(data, 'nodes')
          return record('archive', 'record.archived', undefined, [
            data !== undefined && typeof data.compartmentId === 'number' ? '§C' + String(data.compartmentId) + '§' : '',
            facts === undefined ? '' : t('detail.facts', { n: fmtInt(facts) }),
            nodes === undefined ? '' : t('detail.nodes', { n: fmtInt(nodes) }),
            spanOf(numberField(data, 'durationMs')),
          ])
        }
        case 'maintenance': {
          const parts = [
            numberField(data, 'expired') === undefined ? '' : t('detail.ttlExpired', { n: fmtInt(data.expired) }),
            numberField(data, 'verified') === undefined ? '' : t('detail.verified', { n: fmtInt(data.verified) }),
            numberField(data, 'updated') === undefined ? '' : t('detail.revised', { n: fmtInt(data.updated) }),
          ]
          if (parts.every((part) => part === '')) {
            return record('maintain', 'record.maintenance', undefined, [t('detail.nothingToDo')])
          }
          return record('maintain', 'record.maintenance', undefined, parts)
        }
        case 'session-notice':
          // The notice is the conversation's own inline row; mirroring it here
          // duplicates what the transcript already shows.
          return null
        default:
          if (level === 'error') return record('error', 'record.failed', undefined, [kind])
          return NOISE_KINDS[kind] === true ? null : record('archive', kind, undefined, [])
      }
    }

    /**
     * Newest-first records out of the raw stream, with adjacent repeats folded.
     *
     * The automatic m[0]/m[1] injection runs on every turn and reports the same
     * "m[0] 40 条 · m[1] +26 条" line each time; listing that forty times would
     * hide the operations that actually changed something. Consecutive identical
     * records therefore collapse into one with a `×N` count (the same way a
     * repeated tool call reads in a coding agent's transcript).
     */
    function recordsOf(events, t = REFERENCE_T) {
      const out = []
      for (const event of events) {
        const record = recordOf(event, t)
        if (record === null) continue
        const last = out.length === 0 ? undefined : out[out.length - 1]
        if (last !== undefined && last.category === record.category && last.text === record.text && last.detail === record.detail) {
          out[out.length - 1] = { ...last, count: last.count + 1 }
          continue
        }
        out.push({ ...record, count: 1 })
      }
      return out
    }

    /** `[{category, icon, label, labelKey, tone, count}]`, only for categories that occurred. */
    function recordCounts(records, t = REFERENCE_T) {
      const out = []
      for (const key of Object.keys(RECORD_CATEGORIES)) {
        let count = 0
        for (const record of records) if (record.category === key) count++
        const meta = RECORD_CATEGORIES[key]
        if (count > 0) out.push({ key, count, ...meta, label: t(meta.labelKey) })
      }
      return out
    }

    /** The per-turn beats worth one folded line: routine injections only. */
    function noiseLine(events, t = REFERENCE_T) {
      let recalled = 0
      let refreshed = 0
      for (const event of events) {
        if (event === null || typeof event !== 'object' || typeof event.kind !== 'string') continue
        if (event.kind === 'memory-recall') recalled += 1
        else if (event.kind === 'baseline' && !(event.data !== null && typeof event.data === 'object' && event.data.mode === 'hard')) refreshed += 1
      }
      return [
        recalled === 0 ? undefined : t('noise.memoryRecall') + ' ×' + recalled,
        refreshed === 0 ? undefined : t('noise.baselineRefresh') + ' ×' + refreshed,
      ].filter((line) => line !== undefined).join(' · ')
    }

    /* ------------------------------------------------------------------ *
     * Inline records in the conversation itself
     * ------------------------------------------------------------------ */

    // The per-Turn tail blocks and the live strip were removed (see `apply`):
    // their shared SSE plumbing (`subscribeLive`, the TURN_*/LIVE maps) went
    // with them. The record model below (`recordOf`/`recordsOf`/`recordCounts`/
    // `noiseLine`) stays — the pill's expanded panel still renders journal
    // rows with it.

    /** Where the expanded panel opens when the pill cannot be measured. */
    const PANEL_FALLBACK_ANCHOR = { right: 12, bottom: 44, maxHeight: 400 }

    /**
     * Anchor the panel just above and right-aligned with the pill.
     *
     * The panel is `position: fixed` on purpose: the status bar sits inside the
     * composer, whose scroll/overflow containers would otherwise clip a panel
     * opened upward. Measuring the pill keeps it attached to whichever seat
     * rendered it, and the values are clamped so the panel cannot leave the
     * viewport.
     */
    function anchorAbove(node) {
      if (node === null || node === undefined || typeof node.getBoundingClientRect !== 'function' || typeof window === 'undefined') {
        return PANEL_FALLBACK_ANCHOR
      }
      try {
        const rect = node.getBoundingClientRect()
        const viewportHeight = typeof window.innerHeight === 'number' ? window.innerHeight : 0
        const viewportWidth = typeof window.innerWidth === 'number' ? window.innerWidth : 0
        const bottom = Math.max(8, viewportHeight - rect.top + 8)
        return {
          right: Math.max(8, viewportWidth - rect.right),
          bottom,
          maxHeight: Math.max(160, Math.min(480, viewportHeight - bottom - 8)),
        }
      } catch (error) {
        return PANEL_FALLBACK_ANCHOR
      }
    }

    /**
     * The telemetry pill.
     *
     * It is rendered in whichever seat the plugin managed to take: the composer
     * status bar (`placement: 'statusbar'`, the intended home) or the
     * `shell.overlay` fallback (`placement: 'overlay'`) for a shell that never
     * declares the status seat. Collapsed it is one very short line — the
     * status bar already carries three statistics — and the hover title holds
     * the full summary. The expanded panel always renders above the pill.
     *
     * The Host route is optional: an absent route (404 on `EventSource`, or no
     * `EventSource` at all) makes the badge read `MC · —` and nothing else in
     * the UI is affected. The overlay layer is click-through, so both the pill
     * and the panel opt back into pointer events.
     */
    function TelemetryBadge(props) {
      const placement = props !== undefined && props.placement === 'statusbar' ? 'statusbar' : 'overlay'
      const sessionId = props !== undefined && typeof props.sessionId === 'string' && props.sessionId !== ''
        ? props.sessionId
        : undefined
      // The locale seat the shell injects for a `locale`-declaring entry. The
      // outlet re-renders on a switch, so this resolves to the new language
      // without any subscription of our own; the shipped zh copy is the
      // fallback for a shell that hands us none.
      const t = props !== undefined && typeof props.t === 'function' ? props.t : REFERENCE_T
      const eventsUrl = telemetryUrl(EVENTS_URL, sessionId)
      const summaryUrl = telemetryUrl(SUMMARY_URL, sessionId)
      const [state, setState] = useState({ status: 'connecting', summary: null, recent: [], updatedAt: undefined })
      const [open, setOpen] = useState(false)
      const [anchor, setAnchor] = useState(null)
      const [hovered, setHovered] = useState(false)
      const [pillWidth, setPillWidth] = useState(undefined)
      const pillRef = useRef(null)
      useEffect(() => {
        const node = pillRef.current
        if (node === null || node === undefined) return undefined
        // The immediate parent is the pill's shrink-wrapped anchor; climb to
        // the first ancestor wide enough to be the composer seat, so the pill
        // does not mistake its own text width for the available width.
        let target = node.parentElement !== null && node.parentElement !== undefined ? node.parentElement : node
        try {
          while (target.parentElement !== null && target.parentElement !== undefined
            && target.getBoundingClientRect().width < 200) target = target.parentElement
        } catch { /* measurement is cosmetic */ }
        const measure = () => {
          try {
            const width = target.getBoundingClientRect().width
            if (Number.isFinite(width) && width > 0) setPillWidth(Math.round(width))
          } catch { /* measurement is cosmetic */ }
        }
        measure()
        let observer
        if (typeof ResizeObserver === 'function') {
          observer = new ResizeObserver(measure)
          observer.observe(target)
        }
        if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
          window.addEventListener('resize', measure)
        }
        return () => {
          if (observer !== undefined) observer.disconnect()
          if (typeof window !== 'undefined' && typeof window.removeEventListener === 'function') {
            window.removeEventListener('resize', measure)
          }
        }
      }, [])
      // Computed here (not down with the other render-time values) because the decay
      // timer below has to know whether the badge is currently red.
      const recentErrors = countRecentErrors(state.recent, Date.now())
      const redNow = recentErrors > 0
      const [, setClock] = useState(0)
      // A quiet session emits no frames, so a red badge would never age out on its
      // own; while (and only while) it is red, re-render once a minute so the
      // window closes on time. Green costs nothing.
      useEffect(() => {
        if (!redNow) return undefined
        const timer = setInterval(() => { setClock((value) => value + 1) }, 60_000)
        return () => { clearInterval(timer) }
      }, [redNow])
      /** The one summary fetch: `ok → json`, anything else rejects. Lives at
       * component scope — both the SSE effect (probe) and the open-panel
       * effect (refresh) call it. */
      const fetchSummaryJson = () => Promise.resolve(fetch(summaryUrl, { headers: { accept: 'application/json' } })).then(
        (response) => (response !== undefined && response.ok ? response.json() : Promise.reject(new Error('unavailable'))),
      )

      useEffect(() => {
        let disposed = false
        let sawSnapshot = false

        const acceptSummary = (payload) => {
          if (disposed || payload === null || typeof payload !== 'object') return
          sawSnapshot = true
          const recent = Array.isArray(payload.recent) ? payload.recent.slice(-MAX_RECENT).reverse() : []
          setState({ status: 'ok', summary: payload, recent, updatedAt: Date.now() })
        }
        const acceptEvent = (event) => {
          if (disposed || event === null || typeof event !== 'object') return
          setState((previous) => {
            if (previous.status === 'unavailable') return previous
            return { status: 'ok', summary: previous.summary, recent: [event, ...previous.recent].slice(0, MAX_RECENT), updatedAt: Date.now() }
          })
        }
        // One tolerant reader for both framings: the Host's named `snapshot` /
        // `journal` events, and a bare `data:` frame from an older revision.
        const acceptAny = (payload) => {
          if (payload === null || typeof payload !== 'object') return
          if (payload.adapter !== undefined || payload.health !== undefined) acceptSummary(payload)
          else if (payload.kind !== undefined || payload.summary !== undefined) acceptEvent(payload)
        }
        const parseFrame = (data, accept) => {
          try {
            accept(JSON.parse(data))
          } catch (error) {
            /* a malformed frame must not break the badge */
          }
        }
        const probe = () => {
          if (disposed || sawSnapshot || typeof fetch !== 'function') return
          fetchSummaryJson().then((payload) => {
            if (!disposed) acceptSummary(payload)
          }, () => {
            if (!disposed && !sawSnapshot) setState((previous) => (previous.summary !== null ? previous : { status: 'unavailable', summary: null, recent: [], updatedAt: undefined }))
          })
        }

        if (typeof EventSource !== 'function') {
          probe()
        } else {
          let source
          try {
            source = new EventSource(eventsUrl)
          } catch (error) {
            source = undefined
          }
          if (source === undefined) {
            probe()
          } else {
            source.addEventListener('snapshot', (event) => parseFrame(event.data, acceptSummary))
            source.addEventListener('journal', (event) => parseFrame(event.data, acceptEvent))
            source.onmessage = (event) => parseFrame(event.data, acceptAny)
            source.onerror = () => {
              // The browser reconnects a dropped stream by itself; a route that
              // was never mounted settles as CLOSED and is probed once instead.
              if (source.readyState === 2 /* CLOSED */ && !sawSnapshot) probe()
            }
            return () => {
              disposed = true
              source.close()
            }
          }
        }
        return () => { disposed = true }
      }, [eventsUrl])

      // The stream's `snapshot` frame is read once, at connect, so the header
      // counters would grow stale for as long as the page stays open. Refresh
      // the summary while (and only while) the panel is open: immediately on
      // open, then every HEALTH_REFRESH_MS. `recent` stays owned by the live
      // frames, and a failed refresh keeps the last good header.
      useEffect(() => {
        if (!open) return undefined
        let disposed = false
        const refresh = () => {
          if (typeof fetch !== 'function') return
          fetchSummaryJson().then((payload) => {
            if (disposed || payload === null || typeof payload !== 'object') return
            setState((previous) => ({ status: 'ok', summary: payload, recent: previous.recent, updatedAt: Date.now() }))
          }, () => {
            /* the last good header stays on screen */
          })
        }
        refresh()
        const timer = setInterval(refresh, HEALTH_REFRESH_MS)
        return () => {
          disposed = true
          clearInterval(timer)
        }
      }, [open, summaryUrl])

      // The panel is a popover, so it closes the moment it stops being the thing
      // the user is looking at: a pointer press outside it, Escape, or the
      // window losing focus. Both surfaces carry `data-mc-surface` (the panel is
      // `position: fixed`, so hit-testing its box would be fragile).
      useEffect(() => {
        if (!open) return undefined
        const onPointerDown = (event) => {
          const target = event === null || event === undefined ? null : event.target
          const inside = target !== null && target !== undefined
            && typeof target.closest === 'function' && target.closest('[data-mc-surface]') !== null
          if (!inside) {
            // Keep the browser from moving focus to the element under the
            // pointer; the popover's cleanup hands focus back to the pill.
            if (typeof event.preventDefault === 'function') event.preventDefault()
            setOpen(false)
            const button = pillRef === null || pillRef === undefined ? null : pillRef.current
            if (button !== null && button !== undefined && typeof button.focus === 'function') {
              if (typeof window !== 'undefined' && typeof window.setTimeout === 'function') {
                window.setTimeout(() => button.focus(), 0)
              } else button.focus()
            }
          }
        }
        const onKeyDown = (event) => {
          if (event !== null && event !== undefined && event.key === 'Escape') setOpen(false)
        }
        const onWindowBlur = () => setOpen(false)
        document.addEventListener('pointerdown', onPointerDown, true)
        document.addEventListener('keydown', onKeyDown, true)
        window.addEventListener('blur', onWindowBlur)
        return () => {
          document.removeEventListener('pointerdown', onPointerDown, true)
          document.removeEventListener('keydown', onKeyDown, true)
          window.removeEventListener('blur', onWindowBlur)
        }
      }, [open])

      // Focus trap + return: the panel is a dialog-like popover, so Tab stays
      // inside while it is open and Escape/outside returns focus to the pill.
      useEffect(() => {
        const previous = typeof document !== 'undefined' ? document.activeElement : null
        if (!open) return undefined
        const panel = typeof document !== 'undefined'
          ? document.querySelector('[data-mc-panel]') : null
        const focusables = panel === null ? [] : Array.from(panel.querySelectorAll(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
        ))
        if (focusables.length > 0 && typeof focusables[0].focus === 'function') focusables[0].focus()
        else if (panel !== null && typeof panel.focus === 'function') panel.focus()
        const onTab = (event) => {
          if (event.key !== 'Tab' || panel === null || focusables.length === 0) return
          const first = focusables[0]
          const last = focusables[focusables.length - 1]
          if (event.shiftKey && document.activeElement === first) {
            event.preventDefault()
            last.focus()
          } else if (!event.shiftKey && document.activeElement === last) {
            event.preventDefault()
            first.focus()
          }
        }
        document.addEventListener('keydown', onTab, true)
        return () => {
          document.removeEventListener('keydown', onTab, true)
          const target = pillRef === null || pillRef === undefined ? null : pillRef.current
          if (target !== null && target !== undefined && typeof target.focus === 'function') target.focus()
          else if (previous !== null && previous !== undefined && typeof previous.focus === 'function') previous.focus()
        }
      }, [open])

      const summary = state.summary
      const health = trimSummary(summary)
      const rawHealth = summary !== null && typeof summary === 'object'
        && summary.health !== null && typeof summary.health === 'object' ? summary.health : {}
      const adapterVersion = typeof rawHealth.adapterVersion === 'string' ? rawHealth.adapterVersion : undefined
      const view = buildTelemetryView(
        state.summary,
        typeof document !== 'undefined' && document.documentElement !== null ? document.documentElement.lang : 'zh',
        Date.now(),
        typeof pillWidth === 'number' ? pillWidth : undefined,
        state.updatedAt,
        t,
        state.recent,
      )
      // The pill answers "is anything wrong NOW": a RECENT error (`recentErrors`,
      // 15-minute window), not the cumulative `errorsSinceBoot` — that count in a
      // long-lived process kept the badge red for a whole day on provider-side
      // failures the adapter itself had already classified and retried. The
      // cumulative number is still what `/ctx-status` reports.
      const errors = recentErrors
      // The transport can be healthy while the payload has no `health` object;
      // `view.status` is the payload-level verdict and must win in that case.
      const displayStatus = displayStatusOf(state.status, view.status)
      // The one number that matters is the context pressure, not the pass
      // count (92% of passes are defers — noise). Tone follows the configured
      // policy thresholds from the payload, never the old 50/65 constants.
      const pressure = view.pressure === null ? undefined : view.pressure.percent
      const tone = displayStatus === 'unavailable' ? '#d08700'
        : displayStatus !== 'ok' ? '#8a8f98'
        : errors > 0 ? '#e5484d'
        : view.pressure === null ? '#22a06b'
        : view.pressure.tone
      const pressureText = pressure === undefined ? '' : Math.round(pressure) + '%'
      // Shortest possible line; the error suffix replaces the queue suffix but
      // pressure, token pair and historian state stay visible.
      const collapsed = displayStatus === 'unavailable'
        ? 'MC · —'
        : displayStatus !== 'ok'
          ? 'MC · …'
          : (view.pill.variant === 'minimal' ? '' : 'MC · ') + view.pill.text
      const ariaText = displayStatus === 'unavailable'
        ? t('tip.unavailable')
        : displayStatus !== 'ok'
          ? t('tip.connecting')
          : t('label.telemetry') + ' · ' + view.pill.text
      const lastSeen = timeOf(health.lastEventAt)
      const scopeLabel = health.scope === 'session' ? 'this session' : 'all sessions'
      // The pill's hover bubble mirrors the native pills' tooltip (one dark
      // rounded line); the full diagnostic title lives on the panel only.
      const tipText = displayStatus === 'unavailable'
        ? t('tip.unavailable')
        : displayStatus !== 'ok'
          ? t('tip.connecting')
          : errors > 0
            ? t('tip.errors', { n: errors })
            : pressureText !== ''
              ? health.projectMemories !== undefined
                ? t('tip.pressureWithMemories', { pressure: pressureText, memories: fmtInt(health.projectMemories) })
                : t('tip.pressure', { pressure: pressureText })
              : t('tip.live')

      const inDock = placement === 'statusbar'
      // The official pill skin: hover + open keep the interactive background
      // (injected once — inline styles cannot express :hover), and the pill
      // rides in the official Tooltip bubble when the primitives module exists.
      const pillCore = el('button', {
        type: 'button',
        'data-mc-surface': '1',
        ref: pillRef,
        'aria-label': ariaText,
        'aria-expanded': open,
        onClick: () => {
          if (!open) setAnchor(anchorAbove(pillRef === null || pillRef === undefined ? null : pillRef.current))
          setOpen((value) => !value)
        },
        // The official pill's hover/open skin, driven by state: an injected
        // :hover rule kept losing to (or sticking past) the inline styles, so
        // the background is computed here instead — same token, no specificity.
        onMouseEnter: () => setHovered(true),
        onMouseLeave: () => setHovered(false),
        style: {
          pointerEvents: 'auto',
          display: 'inline-flex',
          alignItems: 'center',
          // In the dock row: adopt the neighbouring pills' skin (12/20 tertiary
          // tier, transparent, nowrap, tabular figures) so the row reads as one
          // set. The overlay fallback keeps its own compact monospace badge.
          gap: inDock ? 5 : 6,
          font: inDock ? 'inherit' : '11px/1.4 ui-monospace, SFMono-Regular, Menlo, monospace',
          fontVariantNumeric: inDock ? 'tabular-nums' : undefined,
          padding: inDock ? '1px 8px' : '4px 9px',
          borderRadius: inDock ? 'var(--dsw-radius-sm, 6px)' : 999,
          border: inDock ? 'none' : '1px solid var(--dsw-alias-border-secondary, rgba(127,127,127,.35))',
          // Hover/open skin (the official pill's token), computed from state.
          // The dock's own stylesheet paints buttons a static grey, so the
          // resting state must be an EXPLICIT transparent — leaving it unset
          // lets that grey through, and a :hover rule cannot win against the
          // inline style anyway.
          background: inDock
            ? (hovered || open ? 'var(--dsw-alias-interactive-bg-hover, rgba(127,127,127,.16))' : 'transparent')
            : 'transparent',
          color: errors > 0 && displayStatus === 'ok'
            ? 'var(--dsw-alias-label-error, #e5484d)'
            : inDock
              ? 'var(--dsw-alias-label-tertiary, currentColor)'
              : 'var(--dsw-alias-label-secondary, currentColor)',
          cursor: 'pointer',
          whiteSpace: 'nowrap',
          transition: 'background-color .12s ease',
        },
      }, [
        el('span', {
          key: 'dot',
          style: {
            width: inDock ? 6 : 7,
            height: inDock ? 6 : 7,
            borderRadius: '50%',
            background: tone,
            display: 'inline-block',
            flex: '0 0 auto',
          },
        }),
        el('span', { key: 'text' }, collapsed),
      ])
      const pill = Tooltip !== undefined
        ? el(Tooltip, { label: tipText, side: 'top', delayMs: 200, disabled: open }, pillCore)
        : pillCore

      const place = anchor === null ? PANEL_FALLBACK_ANCHOR : anchor

      if (!open) {
        return placement === 'overlay'
          ? el('div', { style: { position: 'fixed', right: 12, bottom: 10, zIndex: 40, pointerEvents: 'none' } }, pill)
          // Dock entry root: shrink-wraps the pill (like the neighbouring stat
          // pills' anchor) and inherits the dock row's 12/20 text tier, so the
          // fixed-position panel measures the pill and the row stays one line.
          : el('div', {
            style: {
              display: 'inline-flex',
              alignItems: 'center',
              minWidth: 0,
              pointerEvents: 'auto',
              fontSize: 'calc(var(--dsh-content-font-size-secondary, 13px) - 1px)',
              lineHeight: 'calc(20px + var(--dsh-content-font-delta-secondary, 0px))',
            },
          }, pill)
      }

      // ---- Panel v3: status dot + pressure gauge, label-grid summary,
      // categorized operation feed. System font for prose, tabular numerals
      // for figures; the old full-monospace panel read like a debug console.
      const statusMeta = {
        ok: [t('status.ok'), '#22a06b'],
        connecting: [t('status.connecting'), '#d08700'],
        unavailable: [t('status.unavailable'), '#e5484d'],
      }
      const [statusLabel, statusTone] = statusMeta[displayStatus] ?? [String(displayStatus), '#8a8f98']
      const pressureValue = pressure === undefined ? undefined : Math.round(pressure)
      /** Ledger precision: two decimals, so O and the big %-age can differ
       * honestly (73.00% vs the rounded 73%). */
      const pressureExact = pressure === undefined ? undefined : pressure.toFixed(2)
      const pressureTone = view.pressure === null ? 'inherit' : view.pressure.tone
      const pressureThreshold = view.pressure?.executeThreshold

      // The v2 panel: pressure + 100% host composition + estimated message
      // sub-list + named sections. The old single-letter ledger is gone; the
      // numbers it carried now live in the sections or `/ctx-status`.
      const barColors = { system: '#8250df', tools: '#2f81f7', messages: '#22a06b' }
      const barNode = view.bar.available
        ? el('div', {
          key: 'bar',
          role: 'img',
          'aria-label': view.bar.aria,
          style: { display: 'flex', height: 10, borderRadius: 5, overflow: 'hidden', marginTop: 6, background: 'rgba(127,127,127,.14)' },
        }, view.bar.segments.map(segment => el('span', {
          key: segment.id,
          title: t(segment.labelKey) + ' · ' + compactTok(segment.tokens),
          style: {
            width: (segment.share === null ? 0 : segment.share * 100) + '%',
            background: barColors[segment.id],
            opacity: 0.9,
          },
        })))
        : el('div', { key: 'bar-empty', style: { marginTop: 6, opacity: 0.5 } }, t('bar.unavailable'))
      const barLegend = view.bar.available
        ? view.bar.segments.map(segment => el('div', {
          key: 'legend-' + segment.id,
          style: { display: 'flex', justifyContent: 'space-between', gap: 8, padding: '2px 0', fontVariantNumeric: 'tabular-nums' },
        }, [
          el('span', { key: 'label', style: { display: 'inline-flex', alignItems: 'center', gap: 5 } }, [
            el('span', { key: 'swatch', style: { width: 7, height: 7, borderRadius: 2, background: barColors[segment.id] } }),
            t(segment.labelKey),
          ]),
          el('span', { key: 'value', style: { opacity: 0.65 } }, compactTok(segment.tokens)),
        ]))
        : []
      const compositionRows = view.messageRows.map(row => el('div', {
        key: 'composition-' + row.id,
        style: { display: 'flex', justifyContent: 'space-between', gap: 8, padding: '1px 0', fontVariantNumeric: 'tabular-nums' },
      }, [
        el('span', { key: 'label', style: { opacity: 0.8 } }, [
          t(row.labelKey),
          row.suffixKey === undefined ? '' : ' · ' + t(row.suffixKey),
        ]),
        el('span', { key: 'value', style: { opacity: 0.6 } }, compactTok(row.tokens)),
      ]))
      const sectionRows = view.sections.map(section => el('div', {
        key: 'section-' + section.id,
        style: { display: 'flex', justifyContent: 'space-between', gap: 10, padding: '2px 0', alignItems: 'baseline' },
      }, [
        el('span', { key: 'label', style: { flex: '0 0 auto', opacity: 0.55 } }, t(section.labelKey)),
        el('span', { key: 'value', style: { textAlign: 'right', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' } }, section.value),
      ]))
      const summaryRows = [
        el('div', { key: 'pressure', style: { display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'baseline' } }, [
          el('span', { key: 'p', style: { fontSize: 17, fontWeight: 600, color: pressureTone, fontVariantNumeric: 'tabular-nums' } },
            pressureExact === undefined ? '—' : t('telemetry.pressureLine', { percent: pressureExact, threshold: pressureThreshold == null ? '—' : String(pressureThreshold) })),
          el('span', { key: 'tokens', style: { opacity: 0.55, fontVariantNumeric: 'tabular-nums' } },
            health.lastTokens !== undefined && health.lastContextWindow
              ? t('telemetry.tokens', { used: compactTok(health.lastTokens), window: compactTok(health.lastContextWindow) })
              : ''),
        ]),
        barNode,
        ...barLegend,
        el('div', { key: 'composition-head', style: { marginTop: 8, fontSize: 10, letterSpacing: '.06em', textTransform: 'uppercase', opacity: 0.45 } }, t('composition.head')),
        compositionRows.length > 0
          ? el('div', { key: 'composition', style: { marginTop: 2 } }, compositionRows)
          : view.compositionAvailable
            ? el('div', { key: 'composition-zero', style: { opacity: 0.45, padding: '2px 0' } }, '0')
            : el('div', { key: 'composition-empty', style: { opacity: 0.45, padding: '2px 0' } }, t('composition.unavailable')),
        el('div', { key: 'sections', style: { marginTop: 8, paddingTop: 6, borderTop: '1px solid rgba(127,127,127,.14)' } }, sectionRows),
      ]

      const records = recordsOf(state.recent, t)
      const noise = noiseLine(state.recent, t)
      const recordNodes = records.length === 0
        ? [el('div', { key: 'empty', style: { padding: '4px 0', opacity: 0.55 } }, displayStatus === 'unavailable' ? t('records.noRoute') : t('records.empty'))]
        : records.slice(0, MAX_RECORDS).map((record, index) => {
          const meta = RECORD_CATEGORIES[record.category] === undefined ? RECORD_CATEGORIES.archive : RECORD_CATEGORIES[record.category]
          const label = t(meta.labelKey)
          const body = record.detail !== '' ? record.detail : typeof record.summary === 'string' ? record.summary : ''
          const folded = record.count > 1 ? body + ' · ' + t('records.folded', { n: record.count }) : body
          return el('div', {
            key: 'record-' + index,
            title: label + (record.count > 1 ? ' ×' + record.count : '') + (record.summary !== '' && record.summary !== body ? '\n' + record.summary : ''),
            style: {
              display: 'flex',
              gap: 8,
              alignItems: 'center',
              padding: '5px 0',
              borderTop: index === 0 ? 'none' : '1px solid rgba(127,127,127,.12)',
            },
          }, [
            el('span', { key: 'dot', style: { flex: '0 0 auto', width: 7, height: 7, borderRadius: 4, background: meta.tone } }),
            el('span', { key: 'label', style: { flex: '0 0 auto' } }, label),
            el('span', {
              key: 'detail',
              style: { flex: '1 1 auto', minWidth: 0, opacity: 0.6, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' },
            }, folded),
            el('span', { key: 'at', style: { flex: '0 0 auto', opacity: 0.45, fontVariantNumeric: 'tabular-nums' } }, timeShort(record.at)),
          ])
        })

      const sectionTitle = (key, title, extra) => el('div', {
        key,
        style: { display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', margin: '10px 0 3px' },
      }, [
        el('span', { key: 't', style: { fontSize: 10, letterSpacing: '.08em', textTransform: 'uppercase', opacity: 0.5 } }, title),
        extra === undefined ? null : el('span', { key: 'e', style: { fontSize: 10.5, opacity: 0.5 } }, extra),
      ])

      const panel = el('div', {
        'data-mc-surface': '1',
        'data-mc-panel': '1',
        tabIndex: -1,
        style: {
          position: 'fixed',
          right: place.right,
          bottom: place.bottom,
          zIndex: 60,
          pointerEvents: 'auto',
          width: 352,
          maxWidth: 'calc(100vw - 24px)',
          maxHeight: place.maxHeight,
          overflowY: 'auto',
          padding: '12px 14px 10px',
          borderRadius: 12,
          border: '1px solid var(--dsw-alias-border-secondary, rgba(127,127,127,.3))',
          background: 'var(--dsw-alias-bg-layer-1, rgba(24,24,27,.97))',
          color: 'var(--dsw-alias-label-primary, #e6e6e6)',
          boxShadow: '0 12px 32px rgba(0,0,0,.22)',
          font: '12px/1.55 -apple-system, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif',
        },
      }, [
        el('div', { key: 'head', style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' } }, [
          el('div', { key: 'who', style: { display: 'flex', alignItems: 'center', gap: 7 } }, [
            el('span', { key: 'dot', style: { width: 8, height: 8, borderRadius: 4, background: statusTone, boxShadow: '0 0 6px ' + statusTone } }),
            el('strong', { key: 'title', style: { fontSize: 12.5, fontWeight: 600, letterSpacing: '.01em' } }, 'Magic Context'),
            el('span', { key: 'status', style: { fontSize: 10.5, opacity: 0.55 } },
              statusLabel
              + (adapterVersion === undefined ? '' : ' · v' + adapterVersion)
              + (view.stale ? ' · ' + t('telemetry.stale') : '')),
          ]),
          pressureValue === undefined
            ? el('span', { key: 'p', style: { fontSize: 10.5, opacity: 0.4 } }, '—')
            : el('span', {
              key: 'p',
              style: { fontSize: 17, fontWeight: 600, lineHeight: 1, color: pressureTone, fontVariantNumeric: 'tabular-nums' },
            }, pressureValue + '%'),
          el('button', {
            key: 'close',
            type: 'button',
            'aria-label': t('panel.close'),
            onClick: () => setOpen(false),
            style: {
              border: 'none', background: 'transparent', color: 'inherit', cursor: 'pointer',
              opacity: 0.55, fontSize: 15, lineHeight: 1, padding: '0 2px',
            },
          }, '×'),
        ]),
        el('div', { key: 'summary', style: { marginTop: 8, paddingTop: 8, borderTop: '1px solid rgba(127,127,127,.14)' } }, summaryRows),
        sectionTitle('records-head', t('records.head'), records.length === 0 ? undefined : t('records.count', { n: records.length })),
        el('div', { key: 'records', style: { display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)' } }, recordNodes),
        el('div', {
          key: 'foot',
          title: noise === '' ? undefined : t('records.beats', { beats: noise }),
          style: { marginTop: 8, paddingTop: 6, borderTop: '1px solid rgba(127,127,127,.14)', opacity: 0.45, fontSize: 10.5 },
        }, [
          el('span', { key: 'hint' }, t('records.foot')),
          ' · ',
          el('button', {
            key: 'ctx-status',
            type: 'button',
            title: t('footer.ctxStatus'),
            onClick: () => {
              try { void navigator.clipboard?.writeText('/ctx-status') } catch { /* clipboard is optional */ }
            },
            style: {
              border: 'none', background: 'transparent', color: 'inherit', cursor: 'pointer',
              padding: 0, font: 'inherit', textDecoration: 'underline',
            },
          }, '/ctx-status'),
        ]),
      ])

      return placement === 'overlay'
        ? el('div', {
          style: { position: 'fixed', right: 12, bottom: 10, zIndex: 40, display: 'flex', flexDirection: 'column', alignItems: 'flex-end', pointerEvents: 'none' },
        }, [panel, pill])
        : el('div', {
          style: {
            display: 'inline-flex',
            alignItems: 'center',
            minWidth: 0,
            pointerEvents: 'auto',
            fontSize: 'calc(var(--dsh-content-font-size-secondary, 13px) - 1px)',
            lineHeight: 'calc(20px + var(--dsh-content-font-delta-secondary, 0px))',
          },
        }, [panel, pill])
    }

    /**
     * The dock pill (`conversation.composer.dock`, the composer's status row).
     *
     * The seat is session-scoped, so the framework hands the component the
     * current `sessionId`; that id is what scopes both telemetry requests to the
     * conversation in front of the user. A shell that omits it (or an older
     * shell) degrades to the Host's whole-store view instead of failing.
     */
    function StatusBarBadge(props) {
      return TelemetryBadge({
        placement: 'statusbar',
        sessionId: props === undefined || props === null ? undefined : props.sessionId,
        t: props === undefined || props === null ? undefined : props.t,
      })
    }

    /** The floating pill (`shell.overlay`), used only when the status seat never appears. */
    function OverlayBadge(props) {
      return TelemetryBadge({
        placement: 'overlay',
        t: props === undefined || props === null ? undefined : props.t,
      })
    }

    /* ------------------------------------------------------------------ *
     * Plugin face
     * ------------------------------------------------------------------ */

    /**
     * Register the telemetry pill and the settings card.
     *
     * The pill goes into the composer's dock row (`conversation.composer.dock`,
     * the "status bar" under the input line) next to the activity and Token
     * usage pills, but ONLY there — one seat, so no duplicate pill. The
     * `shell.overlay` registration is the fallback for a shell that never
     * declares that seat, and it is dropped as soon as the dock seat arrives
     * (so the two never coexist). The overlay is mounted only after
     * {@link OVERLAY_FALLBACK_MS} so a normal boot shows no corner flash, and
     * a shell whose composer never mounts still gets a badge.
     *
     * Both seats are taken through `ctx.slots.inject`, which tolerates a late
     * declaration, and both registrations live on the parent context, so the
     * badge survives a deployment without the settings domain. The card waits
     * on `configForms` through `ctx.inject` rather than a hard plugin
     * dependency, so the badge is never held back by it.
     *
     * @param ctx - the browser plugin context.
     */
    function apply(ctx) {
      // The live strip (conversation.input.dock) and the per-Turn frozen blocks
      // (conversation.chat.turnTail) were REMOVED by decision on 2026-10-07:
      // the session stream now carries the durable record — one `notice` entry
      // per action-bearing management pass, appended by the adapter itself
      // (src/dsh/session-notice.ts) and rendered natively by the transcript.
      // The pill + panel below remain the real-time/telemetry surface.

      // The dictionaries are registered in an effect so a reload re-registers
      // them: `locale.register` throws on a duplicate namespace+locale, and the
      // effect's disposer drops the entries before the re-run.
      ctx.effect(
        () => ctx.locale.register(LOCALE_NS, { zh: DICTIONARIES.zh, en: DICTIONARIES.en }),
        'magic-context: dictionaries',
      )
      // `bind` returns one stable function that resolves the ACTIVE language on
      // every call, so these thunks follow a switch without being re-created.
      const t = ctx.locale.bind(LOCALE_NS)
      const telemetryLabel = () => t('label.telemetry')

      ctx.effect(() => {
        let overlayOff
        let seatTaken = false
        const mountOverlay = () => {
          if (seatTaken || overlayOff !== undefined) return
          overlayOff = ctx.slots.inject('shell.overlay', () => ctx.slots.register({
            name: 'shell.overlay',
            id: 'magic-context.telemetry',
            order: 100,
            label: telemetryLabel,
            locale: LOCALE_NS,
          }, OverlayBadge))
        }
        const unmountOverlay = () => {
          if (overlayOff === undefined) return
          const off = overlayOff
          overlayOff = undefined
          off()
        }
        const fallback = setTimeout(mountOverlay, OVERLAY_FALLBACK_MS)
        const seatOff = ctx.slots.inject(STATUS_SEAT, () => {
          seatTaken = true
          clearTimeout(fallback)
          const offPill = ctx.slots.register({
            name: STATUS_SEAT,
            id: 'magic-context.telemetry',
            order: STATUS_SEAT_ORDER,
            label: telemetryLabel,
            locale: LOCALE_NS,
          }, StatusBarBadge)
          unmountOverlay()
          return offPill
        })
        return () => {
          clearTimeout(fallback)
          seatOff()
          unmountOverlay()
        }
      }, 'magic-context: telemetry badge')

      // The model catalog is optional: without `remote.session` (or its
      // `modelCatalog` RPC) the card stays on plain text for the verify pin.
      const catalog = createModelCatalog()
      ctx.inject(['remote', 'remote.session'], (remoteCtx) => {
        catalog.attach(remoteCtx)
      })

      ctx.inject(['configForms'], (settingsCtx) => {
        const scope = settingsCtx.configForms.get(CFG_NS)
        const Card = makeCard(scope, catalog)
        settingsCtx.effect(() => settingsCtx.configForms.whileServed([CFG_NS], () => {
          const offSection = ctx.slots.inject('settings.section', () => ctx.slots.register({
            name: 'settings.section',
            id: 'magic-context',
            order: 30,
            label: () => t('title'),
            locale: LOCALE_NS,
          }, Card))
          const offItem = ctx.slots.inject('plugins.item', () => ctx.slots.register({
            name: 'plugins.item',
            id: CFG_NS,
            order: 20,
            label: () => t('title'),
            locale: LOCALE_NS,
          }, Card))
          const offRow = ctx.slots.inject('plugins.row.config', () => ctx.slots.register({
            name: 'plugins.row.config',
            key: ROW_CONFIG_KEY,
            order: 20,
            locale: LOCALE_NS,
          }, Card))
          return () => {
            offSection()
            offItem()
            offRow()
          }
        }), 'magic-context: settings card')
      })
    }

    /**
     * `apply` is the only thing the loader needs. `__diagnostics` exists so the
     * record mapping can be exercised against a real journal outside a browser
     * (this repo has no client test runner): feed it journal rows and compare
     * what the panel would print. It is pure and reads nothing.
     */
    return {
      name: 'magic-context-client',
      inject: ['slots', 'locale'],
      apply,
      __diagnostics: {
        recordOf, recordsOf, recordCounts, noiseLine, dictionaryKeys, dictionaryTranslator, dictionaries: DICTIONARIES,
        // Package identity (the client module id and the row-config key).
        PKG_NAME, ROW_CONFIG_KEY,
        // The category table the panel renders from. Exposed so node-side checks
        // use THIS table instead of a hand-copied mirror — the mirror had
        // already drifted (`maintain` was missing) and the records-check script
        // crashed on it instead of reporting a category it did not know.
        recordCategories: RECORD_CATEGORIES,
        /** The verify-pin picker reads the host model catalog; pinned on node. */
        createModelCatalog,
        /** The pin-pair write semantics (pure; pinned by the client spec). */
        routePairOps,
        /** Settings copy + catalog-backed effort picker helpers. */
        settingsCopyKeys, reasoningEffortsOf, effortSelectionOf, effortPlanOps, effortDraftOf,
        EFFORT_CUSTOM_SENTINEL, fieldSpecs: FIELDS,
        // The number/text formatters are the panel's display contract; the
        // node-side spec pins them so a formatting regression (the scope bug
        // that briefly unmounted the pill) cannot come back silently.
        compactTok, fmtInt, spanOf, trimSummary, timeShort, buildTelemetryView, displayStatusOf,
        // The pill's "is anything wrong NOW" window: pinned by
        // tests/client-pure.spec.ts so the badge cannot silently fall back to the
        // cumulative count (it stayed red for 21.5 h of uptime on provider-side
        // failures the adapter had already handled).
        countRecentErrors, errorRecentMs: ERROR_RECENT_MS,
      },
    }
  },
})
