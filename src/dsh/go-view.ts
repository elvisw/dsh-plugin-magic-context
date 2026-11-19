/**
 * T23: the pure, localized half of the Android dsh-go surfaces.
 *
 * The host bridge renders JSON component trees and pushes complete data
 * snapshots. Nothing here imports the browser IIFE or recomputes token
 * accounting: the context panel maps the SAME `TelemetryService.summary()`
 * payload the desktop panel consumes, and the embedding panel maps the SAME
 * `EmbeddingStatus` the web settings page consumes. Absent values stay `null`
 * so the renderer draws `—`; they are never turned into zero.
 */
import type { EmbeddingStatus, EmbeddingState } from './embedding-lane.ts'

export type GoLocale = 'zh' | 'en'
export type GoTone = 'good' | 'warn' | 'bad' | 'info' | 'muted'
export type GoScope = { readonly sessionId?: string }

export interface GoStripData {
  readonly text: string
  readonly icon: string
  readonly tone: GoTone
}

export interface GoListItem {
  readonly title: string
  readonly subtitle?: string
  readonly trailing?: string
  readonly tone?: GoTone
  readonly icon?: string
  readonly action?: { readonly id: string; readonly args?: Record<string, unknown> }
}

/** The four surface ids the manifest and the host-half registrations share. */
export const GO_STRIP_ID = 'ctx-strip'
export const GO_CONTEXT_PANEL_ID = 'ctx-context'
export const GO_EMBEDDING_PANEL_ID = 'ctx-embedding'

interface Copy {
  readonly scopeSession: string
  readonly scopeGlobal: string
  readonly globalNote: string
  readonly pressure: string
  readonly tokens: string
  readonly pending: string
  readonly reclaimed24h: string
  readonly passes24h: string
  readonly drops24h: string
  readonly compartments24h: string
  readonly emergency24h: string
  readonly errors24h: string
  readonly errorsSinceBoot: string
  readonly journalRows: string
  readonly composition: string
  readonly system: string
  readonly tools: string
  readonly messages: string
  readonly shareSystem: string
  readonly shareTools: string
  readonly shareMessages: string
  readonly conversation: string
  readonly toolCalls: string
  readonly compartments: string
  readonly memories: string
  readonly profile: string
  readonly other: string
  readonly history: string
  readonly historianRunning: string
  readonly running: string
  readonly idle: string
  readonly covered: string
  readonly lastPublished: string
  readonly queue: string
  readonly queueTags: string
  readonly memoryTotal: string
  readonly memoryInjected: string
  readonly memoryTokens: string
  readonly profileTokens: string
  readonly maintenance: string
  readonly lastSweep: string
  readonly expired: string
  readonly verified: string
  readonly verifiedLast: string
  readonly unverified: string
  readonly updated: string
  readonly archived: string
  readonly warnings: string
  readonly recent: string
  readonly project: string
  readonly identity: string
  readonly projectMemories: string
  readonly adapter: string
  readonly version: string
  readonly schema: string
  readonly uptime: string
  readonly empty: string
  readonly provider: string
  readonly state: string
  readonly memory: string
  readonly enabled: string
  readonly disabled: string
  readonly model: string
  readonly endpoint: string
  readonly dimensions: string
  readonly keyEnv: string
  readonly keySet: string
  readonly keyMissing: string
  readonly noAuth: string
  readonly coverage: string
  readonly progress: string
  readonly target: string
  readonly missing: string
  readonly models: string
  readonly loadModels: string
  readonly probe: string
  readonly start: string
  readonly confirmStart: string
  readonly cancelAction: string
  readonly pause: string
  readonly resume: string
  readonly copyModel: string
  readonly copied: string
  readonly cancelled: string
  readonly targetChanged: string
  readonly working: string
  readonly modelsLoaded: string
  readonly modelsStale: string
  readonly started: string
  readonly paused: string
  readonly resumed: string
  readonly probeOk: (dimensions: number) => string
  readonly startHint: string
  readonly startHintUnknown: string
  readonly selected: string
  readonly stateLocal: string
  readonly stateRollback: string
  readonly stateOff: string
  readonly stateUnprobed: string
  readonly stateConfigured: string
  readonly statePaused: string
  readonly stateTargetMissing: string
  readonly stateMigrating: string
  readonly stateReady: string
  readonly stateError: string
  readonly errorNotRemote: string
  readonly errorMemoryOff: string
  readonly errorMissingKey: string
  readonly errorEndpoint: string
  readonly errorModel: string
  readonly errorProbe: string
  readonly errorRunning: string
  readonly errorPaused: string
  readonly errorComplete: string
  readonly errorCoverage: string
  readonly errorBusy: string
  readonly errorNotRunning: string
  readonly errorNotPaused: string
  readonly errorAlreadyPaused: string
  readonly errorNotReady: string
  readonly errorGeneric: string
  readonly warningErrors: (n: number) => string
  readonly strip: (pressure: number | null, pending: number | null) => string
}

const ZH: Copy = {
  scopeSession: '视图：本会话',
  scopeGlobal: '视图：全部会话（全局）',
  globalNote: '全局视图只汇总日志与健康状态，不冒充任何单个会话。',
  pressure: '压力',
  tokens: '已用 / 窗口',
  pending: '待回收',
  reclaimed24h: '24 小时回收',
  passes24h: '24 小时回收带',
  drops24h: '24 小时丢弃',
  compartments24h: '24 小时摘要',
  emergency24h: '24 小时应急',
  errors24h: '24 小时错误',
  errorsSinceBoot: '启动以来错误',
  journalRows: '日志行数',
  composition: '上下文构成',
  system: '系统',
  tools: '工具定义',
  messages: '消息',
  shareSystem: '系统',
  shareTools: '工具',
  shareMessages: '消息',
  conversation: '对话',
  toolCalls: '工具调用',
  compartments: '历史摘要',
  memories: '记忆',
  profile: '用户画像',
  other: '其他',
  history: '历史摘要与记忆',
  historianRunning: '摘要任务',
  running: '运行中',
  idle: '空闲',
  covered: '已覆盖 token',
  lastPublished: '最近发布',
  queue: '待回收队列',
  queueTags: '入队条目',
  memoryTotal: '记忆总数',
  memoryInjected: '注入记忆',
  memoryTokens: '记忆估算',
  profileTokens: '画像估算',
  maintenance: '维护与诊断',
  lastSweep: '最近巡检',
  expired: '过期归档',
  verified: '已验证',
  verifiedLast: '本次验证',
  unverified: '未验证',
  updated: '已更新',
  archived: '已归档',
  warnings: '警告',
  recent: '最近操作',
  project: '项目',
  identity: '项目标识',
  projectMemories: '项目记忆',
  adapter: '适配器',
  version: '版本',
  schema: '数据库版本',
  uptime: '运行时长',
  empty: '暂无数据',
  provider: '提供方',
  state: '状态',
  memory: '记忆功能',
  enabled: '已启用',
  disabled: '未启用',
  model: '模型',
  endpoint: '接口',
  dimensions: '维度',
  keyEnv: '密钥变量',
  keySet: '已设置',
  keyMissing: '未设置',
  noAuth: '无认证',
  coverage: '覆盖率',
  progress: '重建进度',
  target: '目标空间',
  missing: '缺失条目',
  models: '模型列表',
  loadModels: '加载模型',
  probe: '测试连接',
  start: '开始重建',
  confirmStart: '确认重建',
  cancelAction: '取消',
  pause: '暂停',
  resume: '继续',
  copyModel: '复制模型 ID',
  copied: '已复制',
  cancelled: '已取消',
  targetChanged: '目标已变化，请重试',
  working: '处理中',
  modelsLoaded: '模型列表已更新',
  modelsStale: '模型列表已过期',
  started: '重建已开始',
  paused: '已暂停',
  resumed: '已继续',
  probeOk: dimensions => `连接成功 · ${String(dimensions)} 维`,
  startHint: '将重建：{model} · 缺失 {missing} 条',
  startHintUnknown: '先测试连接，确认目标模型和缺失条目数。',
  selected: '当前',
  stateLocal: '本地向量模式',
  stateRollback: '已回滚到本地向量',
  stateOff: '远程向量已关闭',
  stateUnprobed: '远程配置尚未探测；保存配置不会自动探测。',
  stateConfigured: '已探测，尚未开始重建。',
  statePaused: '重建已暂停，继续后从原状态机恢复。',
  stateTargetMissing: '目标空间暂无已覆盖条目；重建完成后才可检索。',
  stateMigrating: '正在重建目标空间。',
  stateReady: '目标空间已完整覆盖。',
  stateError: '最近一次探测或重建失败。',
  errorNotRemote: '仅远程模式支持',
  errorMemoryOff: '记忆功能未启用',
  errorMissingKey: '密钥变量未设置',
  errorEndpoint: '请先填写有效接口',
  errorModel: '请先选择模型',
  errorProbe: '请先测试连接',
  errorRunning: '重建已在运行',
  errorPaused: '重建已暂停，请先继续',
  errorComplete: '目标空间已完整',
  errorCoverage: '没有可重建条目',
  errorBusy: '重建期间暂不可用',
  errorNotRunning: '没有运行中的重建',
  errorNotPaused: '没有暂停的重建',
  errorAlreadyPaused: '重建已暂停',
  errorNotReady: '当前状态不允许',
  errorGeneric: '操作未完成',
  warningErrors: n => `启动以来有 ${String(n)} 条错误记录`,
  strip: (pressure, pending) => pressure === null
    ? `上下文 — · 待回收 ${pending === null ? '—' : String(pending)}`
    : `上下文 ${String(Math.round(pressure))}% · 待回收 ${pending === null ? '—' : String(pending)}`,
}

const EN: Copy = {
  scopeSession: 'View: this session',
  scopeGlobal: 'View: all sessions (global)',
  globalNote: 'The global view aggregates journal and health state; it never pretends to be one session.',
  pressure: 'Pressure',
  tokens: 'Used / window',
  pending: 'Pending',
  reclaimed24h: 'Reclaimed 24h',
  passes24h: 'Passes 24h',
  drops24h: 'Drops 24h',
  compartments24h: 'Compactions 24h',
  emergency24h: 'Emergency 24h',
  errors24h: 'Errors 24h',
  errorsSinceBoot: 'Errors since boot',
  journalRows: 'Journal rows',
  composition: 'Context composition',
  system: 'System',
  tools: 'Tool definitions',
  messages: 'Messages',
  shareSystem: 'Sys',
  shareTools: 'Tools',
  shareMessages: 'Msgs',
  conversation: 'Conversation',
  toolCalls: 'Tool calls',
  compartments: 'Compactions',
  memories: 'Memories',
  profile: 'User profile',
  other: 'Other',
  history: 'Historian & memory',
  historianRunning: 'Historian',
  running: 'Running',
  idle: 'Idle',
  covered: 'Covered tokens',
  lastPublished: 'Last published',
  queue: 'Reclaim queue',
  queueTags: 'Queued tags',
  memoryTotal: 'Memory rows',
  memoryInjected: 'Injected memories',
  memoryTokens: 'Memory estimate',
  profileTokens: 'Profile estimate',
  maintenance: 'Maintenance & diagnostics',
  lastSweep: 'Last sweep',
  expired: 'Expired',
  verified: 'Verified',
  verifiedLast: 'Verified last',
  unverified: 'Unverified',
  updated: 'Updated',
  archived: 'Archived',
  warnings: 'Warnings',
  recent: 'Recent operations',
  project: 'Project',
  identity: 'Identity',
  projectMemories: 'Project memories',
  adapter: 'Adapter',
  version: 'Version',
  schema: 'Schema',
  uptime: 'Uptime',
  empty: 'No data',
  provider: 'Provider',
  state: 'State',
  memory: 'Memory',
  enabled: 'Enabled',
  disabled: 'Disabled',
  model: 'Model',
  endpoint: 'Endpoint',
  dimensions: 'Dimensions',
  keyEnv: 'Key variable',
  keySet: 'Set',
  keyMissing: 'Not set',
  noAuth: 'No auth',
  coverage: 'Coverage',
  progress: 'Rebuild progress',
  target: 'Target space',
  missing: 'Missing entries',
  models: 'Models',
  loadModels: 'Load models',
  probe: 'Test connection',
  start: 'Start rebuild',
  confirmStart: 'Confirm',
  cancelAction: 'Cancel',
  pause: 'Pause',
  resume: 'Resume',
  copyModel: 'Copy model ID',
  copied: 'Copied',
  cancelled: 'Cancelled',
  targetChanged: 'Target changed; retry',
  working: 'Working',
  modelsLoaded: 'Models updated',
  modelsStale: 'Models are stale',
  started: 'Rebuild started',
  paused: 'Paused',
  resumed: 'Resumed',
  probeOk: dimensions => `Connected · ${String(dimensions)} dims`,
  startHint: 'Rebuild target: {model} · {missing} missing',
  startHintUnknown: 'Test the connection first to confirm the target model and missing count.',
  selected: 'Current',
  stateLocal: 'Local vector mode',
  stateRollback: 'Rolled back to local vectors',
  stateOff: 'Remote vectors are off',
  stateUnprobed: 'Remote config is not probed yet; saving config never probes automatically.',
  stateConfigured: 'Probed, but the rebuild has not started.',
  statePaused: 'Rebuild is paused; Resume continues from the same state machine.',
  stateTargetMissing: 'The target space has no covered rows yet, so it is not searchable.',
  stateMigrating: 'Rebuilding the target space.',
  stateReady: 'The target space is fully covered.',
  stateError: 'The last probe or rebuild failed.',
  errorNotRemote: 'Remote mode only',
  errorMemoryOff: 'Memory is disabled',
  errorMissingKey: 'Key variable missing',
  errorEndpoint: 'Set a valid endpoint',
  errorModel: 'Choose a model first',
  errorProbe: 'Probe the connection first',
  errorRunning: 'Rebuild already running',
  errorPaused: 'Rebuild is paused',
  errorComplete: 'Target space is complete',
  errorCoverage: 'No rebuildable rows',
  errorBusy: 'Busy while rebuild is armed',
  errorNotRunning: 'No rebuild is running',
  errorNotPaused: 'No rebuild is paused',
  errorAlreadyPaused: 'Rebuild already paused',
  errorNotReady: 'Not allowed in this state',
  errorGeneric: 'Action failed',
  warningErrors: n => `${String(n)} error record(s) since boot`,
  strip: (pressure, pending) => pressure === null
    ? `Context — · ${pending === null ? '—' : String(pending)} pending`
    : `Context ${String(Math.round(pressure))}% · ${pending === null ? '—' : String(pending)} pending`,
}

const COPY: Record<GoLocale, Copy> = { zh: ZH, en: EN }

/** zh unless the app locale says English (released example convention). */
export function goLocale(locale: unknown): GoLocale {
  return typeof locale === 'string' && locale.toLowerCase().startsWith('en') ? 'en' : 'zh'
}

function copyOf(locale: unknown): Copy {
  return COPY[goLocale(locale)]
}

function record(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined
}

function finite(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function integer(value: unknown): number | null {
  const n = finite(value)
  return n === null ? null : Math.round(n)
}

function localeTag(locale: unknown): string {
  return goLocale(locale) === 'zh' ? 'zh-CN' : 'en-US'
}

/** Thousands-separated whole number, or null (renderer draws `—`). */
export function formatGoNumber(value: unknown, locale: unknown): string | null {
  const n = finite(value)
  if (n === null) return null
  return new Intl.NumberFormat(localeTag(locale)).format(Math.round(n))
}

export function formatGoPercent(value: unknown): string | null {
  const n = finite(value)
  return n === null ? null : `${String(Math.round(n))}%`
}

export function formatGoClock(value: unknown, locale: unknown): string | null {
  const at = finite(value)
  if (at === null || at <= 0) return null
  return new Date(at).toLocaleTimeString(localeTag(locale), { hour: '2-digit', minute: '2-digit' })
}

export function formatGoDateTime(value: unknown, locale: unknown): string | null {
  const at = finite(value)
  if (at === null || at <= 0) return null
  const date = new Date(at)
  const sameDay = date.toDateString() === new Date().toDateString()
  return sameDay
    ? date.toLocaleTimeString(localeTag(locale), { hour: '2-digit', minute: '2-digit' })
    : date.toLocaleString(localeTag(locale), { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}

export function formatGoUptime(value: unknown, locale?: unknown): string | null {
  const ms = finite(value)
  if (ms === null || ms < 0) return null
  const zh = goLocale(locale) === 'zh'
  const minutes = Math.floor(ms / 60_000)
  if (minutes < 1) return zh ? '不足 1 分钟' : '<1m'
  const hours = Math.floor(minutes / 60)
  const days = Math.floor(hours / 24)
  if (days > 0) return zh ? `${String(days)} 天 ${String(hours % 24)} 小时` : `${String(days)}d ${String(hours % 24)}h`
  if (hours > 0) return zh ? `${String(hours)} 小时 ${String(minutes % 60)} 分` : `${String(hours)}h ${String(minutes % 60)}m`
  return zh ? `${String(minutes)} 分` : `${String(minutes)}m`
}

/** Keep the released 24-code-point strip limit, even if a future label grows. */
export function clampGoText(text: string, max = 24): string {
  return Array.from(text).slice(0, max).join('')
}

function toneOfPressure(pressure: number | null, execute: number | null, force: number | null): GoTone {
  if (pressure === null || execute === null || force === null) return 'muted'
  if (pressure >= force) return 'bad'
  if (pressure >= execute) return 'warn'
  return 'good'
}

/** The strip: same pressure and pending queue the desktop pill shows. */
export function goStripData(summary: Record<string, unknown>, locale: unknown): GoStripData {
  const health = record(summary.health)
  const policy = record(health?.policy)
  const queue = record(health?.queue)
  const pressure = finite(health?.lastPressure)
  const pending = integer(queue?.pendingDrops)
  const copy = copyOf(locale)
  return {
    text: clampGoText(copy.strip(pressure, pending)),
    icon: 'chart',
    tone: toneOfPressure(pressure, finite(policy?.executeThreshold), finite(policy?.forceThreshold)),
  }
}

/* ------------------------------------------------------------------ *
 * Context panel
 * ------------------------------------------------------------------ */

function recentRows(summary: Record<string, unknown>, locale: unknown): GoListItem[] {
  const rows = Array.isArray(summary.recent) ? summary.recent : []
  const copy = copyOf(locale)
  const kindLabels: Record<string, [string, string]> = {
    boot: ['启动', 'Boot'],
    pass: ['回收带', 'Pass'],
    historian: ['历史摘要', 'Historian'],
    engine: ['压缩引擎', 'Engine'],
    error: ['错误', 'Error'],
    'force-path': ['强制回收', 'Force path'],
    'emergency-reclaim': ['应急回收', 'Emergency reclaim'],
    'context-pressure': ['上下文压力', 'Context pressure'],
    'config-drift': ['配置漂移', 'Config drift'],
    maintenance: ['维护巡检', 'Maintenance'],
    'vector-lane': ['向量车道', 'Vector lane'],
    'tool-call': ['工具调用', 'Tool call'],
    'session-first-seen': ['会话首次出现', 'Session first seen'],
    'project-drift': ['项目漂移', 'Project drift'],
    wrapup: ['手动压缩', 'Wrap-up'],
    'session-notice': ['会话提示', 'Session notice'],
    'global-review': ['全局审批', 'Global review'],
    'memory-recall': ['记忆加载', 'Memory recall'],
    'profile-recall': ['画像加载', 'Profile recall'],
    'drop-landed': ['丢弃落地', 'Drop landed'],
    'compartment-published': ['摘要发布', 'Compartment published'],
    'memory-promote': ['记忆提升', 'Memory promote'],
    'memory-write': ['记忆写入', 'Memory write'],
    'adapter-remount': ['适配器重挂载', 'Adapter remount'],
  }
  const out: GoListItem[] = []
  for (const raw of rows.slice(-20)) {
    const row = record(raw)
    if (row === undefined) continue
    const kind = typeof row.kind === 'string' ? row.kind : ''
    const label = kindLabels[kind]
    const title = label === undefined ? (kind === '' ? copy.empty : kind) : label[goLocale(locale) === 'zh' ? 0 : 1]
    const data = record(row.data)
    const detail: string[] = []
    if (data !== undefined) {
      const tokens = finite(data.tokensBefore)
      const delta = finite(data.tokensDelta)
      const pressure = finite(data.pressure)
      if (tokens !== null) detail.push(`${formatGoNumber(tokens, locale) ?? ''} tok`)
      if (delta !== null) detail.push(`${delta < 0 ? '−' : '+'}${formatGoNumber(Math.abs(delta), locale) ?? ''}`)
      if (pressure !== null) detail.push(formatGoPercent(pressure) ?? '')
      const created = finite(data.created)
      if (created !== null) detail.push(`+${formatGoNumber(created, locale) ?? ''}`)
    }
    out.push({
      title,
      ...detail.filter(part => part !== '').length === 0 ? {} : { subtitle: detail.filter(part => part !== '').join(' · ') },
      ...formatGoClock(row.at, locale) === null ? {} : { trailing: formatGoClock(row.at, locale)! },
      ...row.level === 'error' ? { tone: 'bad' as const } : row.level === 'warn' ? { tone: 'warn' as const } : {},
    })
  }
  return out
}

function warningsOf(summary: Record<string, unknown>, locale: unknown): GoListItem[] {
  const health = record(summary.health)
  const copy = copyOf(locale)
  const out: GoListItem[] = []
  const sinceBoot = integer(health?.errorsSinceBoot) ?? 0
  if (sinceBoot > 0) out.push({ title: copy.warningErrors(sinceBoot), tone: 'bad' })
  return out
}

function commonData(summary: Record<string, unknown>, locale: unknown): Record<string, unknown> {
  const health = record(summary.health)
  const adapter = record(summary.adapter)
  const project = record(summary.project)
  return {
    identity: typeof project?.identity === 'string' ? project.identity : null,
    projectMemories: formatGoNumber(project?.memories, locale),
    uptime: formatGoUptime(adapter?.uptimeMs, locale),
    schema: formatGoNumber(adapter?.schemaVersion, locale),
    // v2 additive fields are under health, matching the Web client's
    // buildTelemetryView and the service's summary().
    version: typeof health?.adapterVersion === 'string' ? health.adapterVersion : null,
    journalRows: formatGoNumber(health?.journalRows, locale),
    warnings: warningsOf(summary, locale),
    recent: recentRows(summary, locale),
  }
}

/** The context panel data model. `summary` is the unchanged telemetry payload. */
export function goContextData(summary: Record<string, unknown>, locale: unknown): Record<string, unknown> {
  const health = record(summary.health) ?? {}
  const common = commonData(summary, locale)
  const pressure = finite(health.lastPressure)
  const tokens = finite(health.lastTokens)
  const window = finite(health.lastContextWindow)
  const policy = record(health.policy)
  const policyTone = toneOfPressure(pressure, finite(policy?.executeThreshold), finite(policy?.forceThreshold))
  const pressureText = formatGoPercent(pressure)
  const tokenText = tokens === null
    ? null
    : window === null
      ? `${formatGoNumber(tokens, locale) ?? ''} tok`
      : `${formatGoNumber(tokens, locale) ?? ''} / ${formatGoNumber(window, locale) ?? ''}`

  if (summary.scope !== 'session') {
    return {
      ...common,
      scope: 'global',
      pressure: pressureText,
      pressureTone: policyTone,
      tokens: tokenText,
      pending: formatGoNumber(health.drops24h, locale),
      reclaimed: formatGoNumber(health.reclaimed24h, locale),
      passes: formatGoNumber(health.passes24h, locale),
      drops: formatGoNumber(health.drops24h, locale),
      compartments: formatGoNumber(health.compartments24h, locale),
      emergency: formatGoNumber(health.emergency24h, locale),
      promote: formatGoNumber(health.promote24h, locale),
      errors24h: formatGoNumber(health.errors24h, locale),
      errorsSinceBoot: formatGoNumber(health.errorsSinceBoot, locale),
    }
  }

  const breakdown = record(health.contextBreakdown) ?? {}
  const composition = record(health.messageComposition) ?? {}
  const historian = record(health.historian)
  const queue = record(health.queue) ?? {}
  const memory = record(health.memory) ?? {}
  const surface = record(health.surface) ?? {}
  const memoryStats = record(health.memoryStats) ?? {}
  const maintenance = record(health.maintenanceLast) ?? {}
  const queuedTags = Array.isArray(queue.tags)
    ? queue.tags.length
    : finite(queue.tags)
  // A missing historian is UNKNOWN, not known idle; a missing running flag is
  // also unknown. The renderer draws — for null.
  const historianRunning = typeof historian?.running === 'boolean'
    ? historian.running ? copyOf(locale).running : copyOf(locale).idle
    : null

  return {
    ...common,
    scope: 'session',
    pressure: pressureText,
    pressureTone: policyTone,
    tokens: tokenText,
    pending: formatGoNumber(queue.pendingDrops, locale),
    queueTags: formatGoNumber(queuedTags, locale),
    system: formatGoNumber(breakdown.systemTokens, locale),
    tools: formatGoNumber(breakdown.toolsTokens, locale),
    messages: formatGoNumber(breakdown.messageTokens, locale),
    // T32: the donut's slices. Strings above are for the rows; the chart needs
    // numbers and the host computes the percentages.
    share: [
      finite(breakdown.systemTokens),
      finite(breakdown.toolsTokens),
      finite(breakdown.messageTokens),
    ],
    conversation: formatGoNumber(composition.conversation, locale),
    toolCalls: formatGoNumber(composition.toolCalls, locale),
    compartments: formatGoNumber(composition.compartments, locale),
    memories: formatGoNumber(composition.memories, locale),
    profile: formatGoNumber(composition.profile, locale),
    other: formatGoNumber(composition.other, locale),
    historianRunning,
    compartmentsCount: formatGoNumber(historian?.compartments, locale),
    coveredTokens: formatGoNumber(historian?.coveredTokens, locale),
    lastPublished: formatGoDateTime(historian?.lastPublishedAt, locale),
    memoryTotal: formatGoNumber(memory.total, locale),
    memoryInjected: formatGoNumber(memory.injected, locale),
    memoryTokens: formatGoNumber(memory.estTokens, locale),
    profileTokens: formatGoNumber(memory.profileEstTokens, locale),
    memoryVerified: formatGoNumber(memoryStats.verified, locale),
    memoryUnverified: formatGoNumber(memoryStats.unverified, locale),
    lastSweep: formatGoDateTime(maintenance.at, locale),
    expired: formatGoNumber(maintenance.expired, locale),
    verifiedCount: formatGoNumber(maintenance.verified, locale),
    updatedCount: formatGoNumber(maintenance.updated, locale),
    archived: formatGoNumber(maintenance.archived, locale),
    tagged: formatGoNumber(surface.tagged, locale),
    dropped: formatGoNumber(surface.dropped, locale),
    reclaimableTokens: formatGoNumber(surface.reclaimableTokens, locale),
  }
}

function sessionContextView(locale: unknown): Record<string, unknown> {
  const c = copyOf(locale)
  const kv = (items: Array<[string, unknown]>): Record<string, unknown> => ({ type: 'keyValue', items })
  const section = (text: string): Record<string, unknown> => ({ type: 'text', text: `**${text}**` })
  return {
    type: 'stack',
    children: [
      { type: 'text', text: c.scopeSession, tone: 'muted' },
      {
        type: 'row',
        children: [
          { type: 'metric', label: c.pressure, value: { $: 'data.pressure' }, tone: { $: 'data.pressureTone' } },
          { type: 'metric', label: c.tokens, value: { $: 'data.tokens' } },
          { type: 'metric', label: c.pending, value: { $: 'data.pending' } },
        ],
      },
      section(c.composition),
      {
        type: 'chart',
        kind: 'donut',
        unit: 'tok',
        // The legend column is narrow: four characters truncate to one plus an
        // ellipsis on the phone, so the slices carry short labels.
        categories: [c.shareSystem, c.shareTools, c.shareMessages],
        series: [{ values: { $: 'data.share' } }],
      },
      kv([
        [c.conversation, { $: 'data.conversation' }],
        [c.toolCalls, { $: 'data.toolCalls' }],
        [c.compartments, { $: 'data.compartments' }],
        [c.memories, { $: 'data.memories' }],
        [c.profile, { $: 'data.profile' }],
        [c.other, { $: 'data.other' }],
      ]),
      section(c.history),
      kv([
        [c.historianRunning, { $: 'data.historianRunning' }],
        [c.compartments, { $: 'data.compartmentsCount' }],
        [c.covered, { $: 'data.coveredTokens' }],
        [c.lastPublished, { $: 'data.lastPublished' }],
        [c.queue, { $: 'data.pending' }],
        [c.queueTags, { $: 'data.queueTags' }],
        [c.memoryTotal, { $: 'data.memoryTotal' }],
        [c.memoryInjected, { $: 'data.memoryInjected' }],
        [c.memoryTokens, { $: 'data.memoryTokens' }],
        [c.profileTokens, { $: 'data.profileTokens' }],
        [c.verified, { $: 'data.memoryVerified' }],
        [c.unverified, { $: 'data.memoryUnverified' }],
      ]),
      section(c.maintenance),
      kv([
        [c.lastSweep, { $: 'data.lastSweep' }],
        [c.expired, { $: 'data.expired' }],
        [c.verifiedLast, { $: 'data.verifiedCount' }],
        [c.updated, { $: 'data.updatedCount' }],
        [c.archived, { $: 'data.archived' }],
      ]),
      section(c.warnings),
      { type: 'list', items: { $: 'data.warnings' } },
      section(c.recent),
      { type: 'list', items: { $: 'data.recent' } },
    ],
  }
}

function globalContextView(locale: unknown): Record<string, unknown> {
  const c = copyOf(locale)
  const kv = (items: Array<[string, unknown]>): Record<string, unknown> => ({ type: 'keyValue', items })
  const section = (text: string): Record<string, unknown> => ({ type: 'text', text: `**${text}**` })
  return {
    type: 'stack',
    children: [
      { type: 'text', text: c.scopeGlobal, tone: 'muted' },
      { type: 'text', text: c.globalNote, tone: 'muted' },
      {
        type: 'row',
        children: [
          { type: 'metric', label: c.pressure, value: { $: 'data.pressure' }, tone: { $: 'data.pressureTone' } },
          { type: 'metric', label: c.tokens, value: { $: 'data.tokens' } },
          { type: 'metric', label: c.drops24h, value: { $: 'data.drops' } },
        ],
      },
      section(c.project),
      kv([
        [c.identity, { $: 'data.identity' }],
        [c.projectMemories, { $: 'data.projectMemories' }],
      ]),
      section(c.warnings),
      { type: 'list', items: { $: 'data.warnings' } },
      section(c.recent),
      { type: 'list', items: { $: 'data.recent' } },
      section(c.maintenance),
      kv([
        [c.passes24h, { $: 'data.passes' }],
        [c.drops24h, { $: 'data.drops' }],
        [c.compartments24h, { $: 'data.compartments' }],
        [c.emergency24h, { $: 'data.emergency' }],
        [c.reclaimed24h, { $: 'data.reclaimed' }],
        [c.errors24h, { $: 'data.errors24h' }],
        [c.errorsSinceBoot, { $: 'data.errorsSinceBoot' }],
        [c.journalRows, { $: 'data.journalRows' }],
        [c.uptime, { $: 'data.uptime' }],
        [c.schema, { $: 'data.schema' }],
      ]),
    ],
  }
}

export function goContextView(scope: GoScope | undefined, locale: unknown): Record<string, unknown> {
  return typeof scope?.sessionId === 'string' && scope.sessionId !== ''
    ? sessionContextView(locale)
    : globalContextView(locale)
}

/* ------------------------------------------------------------------ *
 * Embedding panel
 * ------------------------------------------------------------------ */

export function goEmbeddingStateText(state: EmbeddingState, locale: unknown): string {
  const c = copyOf(locale)
  switch (state) {
    case 'local': return c.stateLocal
    case 'rollback-local': return c.stateRollback
    case 'remote-off': return c.stateOff
    case 'remote-unprobed': return c.stateUnprobed
    case 'remote-configured-not-started': return c.stateConfigured
    case 'remote-paused': return c.statePaused
    case 'remote-target-missing': return c.stateTargetMissing
    case 'remote-migrating': return c.stateMigrating
    case 'remote-ready': return c.stateReady
    case 'remote-error': return c.stateError
    default: return c.stateUnprobed
  }
}

export function goEmbeddingStateTone(state: EmbeddingState): GoTone {
  switch (state) {
    case 'remote-ready': return 'good'
    case 'remote-migrating': return 'info'
    case 'remote-paused':
    case 'remote-target-missing': return 'warn'
    case 'remote-error': return 'bad'
    // The callout component only accepts info/good/warn/bad; neutral states
    // use info instead of the (valid elsewhere) muted tone.
    default: return 'info'
  }
}

/** Machine error codes and transport failures → user copy (never credentials). */
/**
 * Known transport/provider codes → short toast copy. The pinned v1 toast limit
 * is 40 characters, so these are deliberately terse; the panel's state line
 * uses {@link goEmbeddingErrorDetail} for the longer explanation.
 */
export function goEmbeddingErrorText(error: string | undefined, locale: unknown): string {
  const c = copyOf(locale)
  const zh = goLocale(locale) === 'zh'
  switch (error) {
    case 'not-remote': return c.errorNotRemote
    case 'memory-disabled': return c.errorMemoryOff
    case 'missing-key': return c.errorMissingKey
    case 'invalid-key-env': return zh ? '请修正密钥变量名' : 'Fix the key variable NAME'
    case 'endpoint-required':
    case 'invalid-endpoint':
    case 'endpoint-query':
    case 'endpoint-userinfo':
    case 'blocked-endpoint':
    case 'dns-failed':
      return c.errorEndpoint
    case 'model-required': return c.errorModel
    case 'probe-required': return c.errorProbe
    case 'already-running': return c.errorRunning
    case 'paused': return c.errorPaused
    case 'already-complete': return c.errorComplete
    case 'coverage-missing': return c.errorCoverage
    case 'busy': return c.errorBusy
    case 'not-running': return c.errorNotRunning
    case 'not-paused': return c.errorNotPaused
    case 'already-paused': return c.errorAlreadyPaused
    case 'not-ready':
    case 'state-write-failed':
    case 'cache-write-failed':
      return c.errorNotReady
    case 'cancelled': return c.cancelled
    case 'target-changed': return c.targetChanged
    case 'auth-failed': return zh ? '认证失败' : 'Auth failed'
    case 'rate-limited': return zh ? '请求过于频繁' : 'Rate limited'
    case 'model-not-found': return zh ? '模型不存在' : 'Model not found'
    case 'bad-request': return zh ? '请求被拒绝' : 'Bad request'
    case 'server-error': return zh ? '服务端错误' : 'Server error'
    case 'timeout': return zh ? '请求超时' : 'Request timed out'
    case 'network': return zh ? '网络不可达' : 'Network failed'
    case 'invalid-response':
    case 'invalid-json':
      return zh ? '响应格式无效' : 'Invalid response'
    case 'dimensions-unsupported':
    case 'dimensions-changed':
      return zh ? '向量维度不匹配' : 'Dimensions mismatch'
    case 'model-substituted': return zh ? '模型与请求不一致' : 'Model substituted'
    case 'response-too-large': return zh ? '响应过大' : 'Response too large'
    case 'input-too-long': return zh ? '输入过长' : 'Input too long'
    case 'probe-failed': return zh ? '测试连接失败' : 'Probe failed'
    case 'models-failed': return zh ? '模型列表加载失败' : 'Model list failed'
    case 'embed-failed': return zh ? '嵌入失败' : 'Embedding failed'
    case 'query-failed': return zh ? '查询失败' : 'Query failed'
    case 'backfill-failed': return zh ? '重建失败' : 'Rebuild failed'
    default:
      return c.errorGeneric
  }
}

/** The longer, safe explanation the panel may show; never echoes a raw code. */
export function goEmbeddingErrorDetail(error: string | undefined, locale: unknown): string {
  const c = copyOf(locale)
  const zh = goLocale(locale) === 'zh'
  switch (error) {
    case 'missing-key':
      return zh
        ? '密钥未配置；请在配置页「API Key」录入，或设置引用的环境变量后重试。'
        : 'No key configured; enter it in the settings API Key field, or set the referenced environment variable and retry.'
    case 'invalid-key-env':
      return zh
        ? 'apiKeyEnv 必须是合法的引用名（字母、数字、下划线，且以字母或下划线开头），不是密钥值；请修正。'
        : 'apiKeyEnv must be a valid reference name (letters, digits, underscore; start with a letter or underscore), not a key value.'
    case 'auth-failed':
      return zh ? '认证失败：检查密钥是否有效。' : 'Authentication failed; check that the configured key is valid.'
    case 'rate-limited':
      return zh ? '请求过于频繁或额度不足，稍后重试。' : 'The provider rate-limited the request or the quota is exhausted; retry later.'
    case 'model-not-found':
      return zh ? '模型不存在或不可用，请重新加载模型。' : 'The model does not exist or is unavailable; load models again.'
    case 'bad-request':
      return zh ? '请求被拒绝：检查模型、维度与接口预设。' : 'The request was rejected; check the model, dimensions and preset.'
    case 'server-error':
      return zh ? '提供方服务端错误；稍后重试。' : 'The provider returned a server error; retry later.'
    case 'timeout':
      return zh ? '请求超时；检查网络或调大超时。' : 'The request timed out; check the network or raise the timeout.'
    case 'network':
      return zh ? '网络不可达；检查接口地址与网络。' : 'The network request failed; check the endpoint and connectivity.'
    case 'invalid-response':
      return zh ? '提供方响应缺少有效向量。' : 'The provider response did not contain valid vectors.'
    case 'invalid-json':
      return zh ? '提供方返回的不是合法 JSON。' : 'The provider did not return valid JSON.'
    case 'dimensions-unsupported':
      return zh ? '提供方不接受维度参数；请把维度设为 0 或使用支持的模型。' : 'The provider rejects the dimensions parameter; set dimensions to 0 or use a supported model.'
    case 'dimensions-changed':
      return zh ? '探测维度已变化；请重新测试连接。' : 'The probed dimensions changed; test the connection again.'
    case 'model-substituted':
      return zh ? '提供方返回了不同的模型；检查模型 ID。' : 'The provider answered with a different model; check the model ID.'
    case 'response-too-large':
      return zh ? '提供方响应过大；请缩小批次。' : 'The provider response was too large; reduce the batch size.'
    case 'input-too-long':
      return zh ? '文本超出模型输入上限。' : 'The text exceeds the model input limit.'
    case 'coverage-missing':
      return zh ? '没有可重建的记忆条目，或目标覆盖率不可读。' : 'No memory rows can be rebuilt, or target coverage is unreadable.'
    default:
      return goEmbeddingErrorText(error, locale) === c.errorGeneric
        ? (zh ? '操作未完成；请重试。' : 'The action did not complete; retry.')
        : goEmbeddingErrorText(error, locale)
  }
}

/** The action toasts, complete in both languages. */
export function goEmbeddingActionCopy(locale: unknown): {
  readonly modelsLoaded: string
  readonly modelsStale: string
  readonly started: string
  readonly paused: string
  readonly resumed: string
  readonly copied: string
  readonly cancelled: string
  readonly cancelAction: string
  readonly working: string
  readonly probeOk: (dimensions: number) => string
} {
  const c = copyOf(locale)
  return {
    modelsLoaded: c.modelsLoaded,
    modelsStale: c.modelsStale,
    started: c.started,
    paused: c.paused,
    resumed: c.resumed,
    copied: c.copied,
    cancelled: c.cancelled,
    cancelAction: c.cancelAction,
    working: c.working,
    probeOk: c.probeOk,
  }
}

/** Model rows with a copy action; the panel never writes the host config. */
export function goModelRows(models: readonly string[], locale: unknown): GoListItem[] {
  const c = copyOf(locale)
  // The released list component draws at most 50 rows; sending more bloats the
  // 32 KiB data frame for no visible gain.
  return models.slice(0, 50).map(model => ({
    title: model,
    subtitle: c.copyModel,
    icon: 'copy',
    action: { id: 'copy-model', args: { model } },
  }))
}

export interface GoEmbeddingControls {
  readonly remote: boolean
  readonly startAction: string | null
  readonly rebuild: boolean
  readonly hint: boolean
}

/** A bounded action-id suffix: the confirmation binds to the rendered target. */
function shortHash(text: string): string {
  let hash = 2166136261
  for (const char of text) {
    hash ^= char.codePointAt(0) ?? 0
    hash = Math.imul(hash, 16777619)
  }
  return (hash >>> 0).toString(36).padStart(7, '0')
}

function startFingerprint(status: EmbeddingStatus): string | null {
  if (status.provider !== 'openai-compatible' || !status.memoryEnabled) return null
  if (status.target === null) return null
  if (status.state !== 'remote-configured-not-started') return null
  return shortHash(`${status.target}|${status.coverage?.missing ?? '—'}`)
}

/** The confirm action id for the current startable target; null when Start does not apply. */
export function goEmbeddingStartAction(status: EmbeddingStatus): string | null {
  const fingerprint = startFingerprint(status)
  return fingerprint === null ? null : `start:${fingerprint}`
}

function rebuildApplicable(status: EmbeddingStatus): boolean {
  if (status.provider !== 'openai-compatible' || !status.memoryEnabled) return false
  if (status.state === 'remote-paused' || status.state === 'remote-migrating') return true
  // `remote-target-missing` is also the display name while a rebuild runs with
  // zero covered rows; progress is non-null exactly when a rebuild is armed.
  return status.state === 'remote-target-missing' && status.progress.processed !== null
}

export function goEmbeddingData(
  status: EmbeddingStatus,
  models: readonly string[],
  locale: unknown,
): Record<string, unknown> {
  const c = copyOf(locale)
  const coverage = status.coverage
  const coveragePct = coverage === null || coverage.total <= 0
    ? null
    : Math.round(coverage.covered / coverage.total * 100)
  const progress = status.progress
  const progressPct = progress.total === null || progress.total <= 0 || progress.processed === null
    ? null
    : Math.round(progress.processed / progress.total * 100)
  const missing = coverage === null ? null : coverage.missing
  const keyLabel = status.keyEnv === ''
    ? c.noAuth
    : status.keyPresent ? `${status.keyEnv} · ${c.keySet}` : `${status.keyEnv} · ${c.keyMissing}`
  const remote = status.provider === 'openai-compatible'
  const startAction = goEmbeddingStartAction(status)
  const stateText = status.state === 'remote-error' && status.lastError !== undefined
    ? goEmbeddingErrorDetail(status.lastError, locale)
    : goEmbeddingStateText(status.state, locale)
  return {
    stateText,
    stateTone: goEmbeddingStateTone(status.state),
    remote,
    provider: status.provider,
    memory: status.memoryEnabled ? c.enabled : c.disabled,
    model: status.model === '' ? null : status.model,
    endpoint: status.endpoint === '' ? null : status.endpoint,
    dimensions: formatGoNumber(status.dimensions, locale),
    key: keyLabel,
    coverage: coverage === null
      ? null
      : `${formatGoNumber(coverage.covered, locale) ?? '—'} / ${formatGoNumber(coverage.total, locale) ?? '—'}`,
    coveragePct,
    coverageCaption: formatGoPercent(coveragePct),
    progress: progress.processed === null || progress.total === null
      ? null
      : `${formatGoNumber(progress.processed, locale) ?? '—'} / ${formatGoNumber(progress.total, locale) ?? '—'}`
        + (progress.failures === null ? '' : ` · ${String(progress.failures)}✕`),
    progressPct,
    target: status.target,
    missing: formatGoNumber(missing, locale),
    startAction,
    rebuildEnabled: rebuildApplicable(status),
    // A local/off provider has no target to rebuild; never advertise one.
    startHint: remote
      ? status.model === '' || missing === null
        ? c.startHintUnknown
        : c.startHint.replace('{model}', status.model).replace('{missing}', String(missing))
      : null,
    rebuildSelected: status.state === 'remote-paused' ? 'resume' : status.state === 'remote-migrating' ? 'pause' : null,
    models: goModelRows(models, locale),
  }
}

export function goEmbeddingView(locale: unknown, controls?: GoEmbeddingControls): Record<string, unknown> {
  const c = copyOf(locale)
  const remote = controls?.remote ?? true
  const startAction = controls === undefined ? 'start' : controls.startAction
  const rebuild = controls?.rebuild ?? true
  const hint = controls?.hint ?? true
  const kv = (items: Array<[string, unknown]>): Record<string, unknown> => ({ type: 'keyValue', items })
  const children: Array<Record<string, unknown>> = [
    { type: 'callout', text: { $: 'data.stateText' }, tone: { $: 'data.stateTone' } },
    kv([
      [c.provider, { $: 'data.provider' }],
      [c.memory, { $: 'data.memory' }],
      [c.model, { $: 'data.model' }],
      [c.endpoint, { $: 'data.endpoint' }],
      [c.dimensions, { $: 'data.dimensions' }],
      [c.keyEnv, { $: 'data.key' }],
      [c.coverage, { $: 'data.coverage' }],
      [c.progress, { $: 'data.progress' }],
      [c.target, { $: 'data.target' }],
      [c.missing, { $: 'data.missing' }],
    ]),
  ]
  if (hint) children.push({ type: 'text', text: { $: 'data.startHint' }, tone: 'muted' })
  if (remote) {
    children.push({
      type: 'actions',
      items: [
        { label: c.loadModels, icon: 'refresh', action: 'models' },
        { label: c.probe, icon: 'check', action: 'probe' },
      ],
    })
  }
  if (startAction !== null) {
    children.push({ type: 'confirm', id: startAction, confirmLabel: c.confirmStart, cancelLabel: c.cancelAction })
  }
  if (rebuild) {
    children.push({
      type: 'options',
      id: 'rebuild',
      options: [
        { label: c.pause, value: 'pause' },
        { label: c.resume, value: 'resume' },
      ],
      selected: { $: 'data.rebuildSelected' },
    })
  }
  if (remote) {
    children.push(
      { type: 'text', text: c.models, tone: 'muted' },
      { type: 'list', items: { $: 'data.models' } },
    )
  }
  return { type: 'stack', children }
}
