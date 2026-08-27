import type {
  AccountSeverity,
  AccountUsageInfo,
  CapacityMetric,
  Sub2ApiAccount,
  UsageProgress,
  UsageWindow
} from './types'

const STANDARD_WINDOWS: Array<{
  key: keyof AccountUsageInfo
  id: string
  label: string
}> = [
  { key: 'five_hour', id: '5h', label: '5H' },
  { key: 'seven_day', id: '7d', label: '7D' },
  { key: 'seven_day_sonnet', id: '7d-sonnet', label: '7D Sonnet' },
  { key: 'seven_day_fable', id: '7d-fable', label: '7D Fable' },
  { key: 'thirty_day', id: '30d', label: '30D' },
  { key: 'gemini_shared_minute', id: 'shared-minute', label: '共享分钟' },
  { key: 'gemini_pro_minute', id: 'pro-minute', label: 'Pro 分钟' },
  { key: 'gemini_flash_minute', id: 'flash-minute', label: 'Flash 分钟' },
  { key: 'gemini_shared_daily', id: 'shared-daily', label: '共享日用量' },
  { key: 'gemini_pro_daily', id: 'pro-daily', label: 'Pro 日用量' },
  { key: 'gemini_flash_daily', id: 'flash-daily', label: 'Flash 日用量' }
]

export const PLATFORM_LABELS: Record<string, string> = {
  anthropic: 'Claude',
  openai: 'OpenAI',
  gemini: 'Gemini',
  antigravity: 'Antigravity',
  grok: 'Grok',
  kimi: 'Kimi',
  zhipu: '智谱',
  deepseek: 'DeepSeek',
  ollama: 'Ollama'
}

export function finiteNumber(value: unknown): number | null {
  const parsed = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function safeString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function isoFromUnix(value: unknown): string | undefined {
  const number = finiteNumber(value)
  if (number === null || number <= 0) return undefined
  const millis = number > 10_000_000_000 ? number : number * 1000
  return new Date(millis).toISOString()
}

function clampPercent(value: unknown): number | null {
  const number = finiteNumber(value)
  if (number === null) return null
  return Math.max(0, Math.min(999, number))
}

function progressWindow(
  id: string,
  label: string,
  progress: UsageProgress,
  usage: AccountUsageInfo
): UsageWindow | null {
  const percent = clampPercent(progress.utilization)
  if (percent === null) return null
  const used = finiteNumber(progress.used_requests)
  const limit = finiteNumber(progress.limit_requests)
  const detail = used !== null && limit !== null && limit > 0
    ? `${Math.round(used)} / ${Math.round(limit)} 次`
    : progress.window_stats?.tokens
      ? `${formatCompactNumber(progress.window_stats.tokens)} tokens`
      : undefined
  return {
    id,
    label,
    usedPercent: percent,
    resetAt: progress.resets_at,
    updatedAt: usage.updated_at,
    detail,
    source: usage.source || 'active'
  }
}

function addWindow(target: UsageWindow[], candidate: UsageWindow | null): void {
  if (!candidate) return
  const index = target.findIndex((item) => item.id === candidate.id)
  if (index === -1) target.push(candidate)
  else target[index] = candidate
}

function quotaPercent(limit: unknown, remaining: unknown): number | null {
  const parsedLimit = finiteNumber(limit)
  const parsedRemaining = finiteNumber(remaining)
  if (parsedLimit === null || parsedRemaining === null || parsedLimit <= 0) return null
  return Math.max(0, Math.min(999, ((parsedLimit - parsedRemaining) / parsedLimit) * 100))
}

function extractUsageWindows(usage: AccountUsageInfo): UsageWindow[] {
  const result: UsageWindow[] = []
  for (const item of STANDARD_WINDOWS) {
    const progress = usage[item.key]
    if (progress && typeof progress === 'object' && 'utilization' in progress) {
      addWindow(result, progressWindow(item.id, item.label, progress as UsageProgress, usage))
    }
  }

  if (usage.antigravity_quota) {
    for (const [model, quota] of Object.entries(usage.antigravity_quota)) {
      const percent = clampPercent(quota.utilization)
      if (percent === null) continue
      addWindow(result, {
        id: `model-${model}`,
        label: compactModelName(model),
        usedPercent: percent,
        resetAt: quota.reset_time,
        updatedAt: usage.updated_at,
        source: usage.source || 'active'
      })
    }
  }

  const requestPercent = quotaPercent(usage.grok_request_quota?.limit, usage.grok_request_quota?.remaining)
  if (requestPercent !== null) {
    addWindow(result, {
      id: 'grok-requests',
      label: '请求额度',
      usedPercent: requestPercent,
      resetAt: usage.grok_request_quota?.reset_at || isoFromUnix(usage.grok_request_quota?.reset_unix),
      updatedAt: usage.updated_at,
      source: usage.source || 'active'
    })
  }

  const tokenPercent = quotaPercent(usage.grok_token_quota?.limit, usage.grok_token_quota?.remaining)
  if (tokenPercent !== null) {
    addWindow(result, {
      id: 'grok-tokens',
      label: 'Token 额度',
      usedPercent: tokenPercent,
      resetAt: usage.grok_token_quota?.reset_at || isoFromUnix(usage.grok_token_quota?.reset_unix),
      updatedAt: usage.updated_at,
      source: usage.source || 'active'
    })
  }

  const billing = usage.grok_billing
  if (billing && typeof billing === 'object') {
    const weekly = clampPercent(billing.usage_percent)
    if (weekly !== null && (billing.period_type === 'weekly' || billing.period_type == null)) {
      addWindow(result, {
        id: 'grok-weekly',
        label: '周额度',
        usedPercent: weekly,
        resetAt: safeString(billing.period_end),
        updatedAt: safeString(billing.updated_at) || usage.updated_at,
        source: usage.source || 'active'
      })
    }
    const monthly = clampPercent(billing.used_percent)
    if (monthly !== null) {
      addWindow(result, {
        id: 'grok-monthly',
        label: '月额度',
        usedPercent: monthly,
        resetAt: safeString(billing.billing_period_end),
        updatedAt: safeString(billing.monthly_updated_at) || usage.updated_at,
        source: usage.source || 'active'
      })
    }
  }

  return result
}

function extractSnapshotWindows(account: Sub2ApiAccount): UsageWindow[] {
  const result: UsageWindow[] = []
  const extra = account.extra || {}
  const updatedAt = safeString(extra.codex_usage_updated_at)

  const addExtraWindow = (
    id: string,
    label: string,
    percentKey: string,
    resetAtKey: string,
    resetAfterKey?: string
  ): void => {
    const percent = clampPercent(extra[percentKey])
    if (percent === null) return
    const resetAt = safeString(extra[resetAtKey]) || (
      resetAfterKey && finiteNumber(extra[resetAfterKey]) !== null
        ? new Date(Date.now() + Number(extra[resetAfterKey]) * 1000).toISOString()
        : undefined
    )
    addWindow(result, {
      id,
      label,
      usedPercent: percent,
      resetAt,
      updatedAt,
      source: 'snapshot'
    })
  }

  addExtraWindow('5h', '5H', 'codex_5h_used_percent', 'codex_5h_reset_at', 'codex_5h_reset_after_seconds')
  addExtraWindow('7d', '7D', 'codex_7d_used_percent', 'codex_7d_reset_at', 'codex_7d_reset_after_seconds')

  if (!result.some((item) => item.id === '5h' || item.id === '7d')) {
    const legacyWindows = [
      {
        prefix: 'codex_primary',
        percent: 'codex_primary_used_percent',
        minutes: 'codex_primary_window_minutes',
        reset: 'codex_primary_reset_after_seconds'
      },
      {
        prefix: 'codex_secondary',
        percent: 'codex_secondary_used_percent',
        minutes: 'codex_secondary_window_minutes',
        reset: 'codex_secondary_reset_after_seconds'
      }
    ]
    for (const legacy of legacyWindows) {
      const minutes = finiteNumber(extra[legacy.minutes])
      const percent = clampPercent(extra[legacy.percent])
      if (minutes === null || percent === null) continue
      const weekly = minutes > 2_000
      addWindow(result, {
        id: weekly ? '7d' : '5h',
        label: weekly ? '7D' : '5H',
        usedPercent: percent,
        resetAt: finiteNumber(extra[legacy.reset]) !== null
          ? new Date(Date.now() + Number(extra[legacy.reset]) * 1000).toISOString()
          : undefined,
        updatedAt,
        source: 'snapshot'
      })
    }
  }

  const passiveFiveHour = clampPercent(extra.session_window_utilization)
  if (!result.some((item) => item.id === '5h') && (passiveFiveHour !== null || account.session_window_end)) {
    addWindow(result, {
      id: '5h',
      label: '5H',
      usedPercent: passiveFiveHour === null
        ? account.session_window_status === 'rejected'
          ? 100
          : account.session_window_status === 'allowed_warning'
            ? 80
            : 0
        : passiveFiveHour * (passiveFiveHour <= 1 ? 100 : 1),
      resetAt: account.session_window_end,
      updatedAt: safeString(extra.passive_usage_sampled_at),
      source: 'snapshot'
    })
  }

  const passiveWindows = [
    { id: '7d', label: '7D', util: 'passive_usage_7d_utilization', reset: 'passive_usage_7d_reset' },
    { id: '7d-fable', label: '7D Fable', util: 'passive_usage_7d_oi_utilization', reset: 'passive_usage_7d_oi_reset' }
  ]
  for (const item of passiveWindows) {
    const raw = finiteNumber(extra[item.util])
    if (raw === null) continue
    addWindow(result, {
      id: item.id,
      label: item.label,
      usedPercent: raw <= 1 ? raw * 100 : raw,
      resetAt: isoFromUnix(extra[item.reset]),
      updatedAt: safeString(extra.passive_usage_sampled_at),
      source: 'snapshot'
    })
  }

  const platform = account.platform
  for (const item of [
    { id: '5h', label: '5H', suffix: '5h' },
    { id: 'weekly', label: '周额度', suffix: 'weekly' }
  ]) {
    const percent = clampPercent(extra[`${platform}_${item.suffix}_used_percent`])
    if (percent === null) continue
    addWindow(result, {
      id: item.id,
      label: item.label,
      usedPercent: percent,
      resetAt: safeString(extra[`${platform}_${item.suffix}_reset_at`]),
      updatedAt: safeString(extra[`${platform}_usage_updated_at`]),
      source: 'snapshot'
    })
  }

  const ollama = account.ollama_cloud_usage?.snapshot
  if (ollama?.status === 'ok' && ollama.data) {
    if (finiteNumber(ollama.data.five_hour?.used_percent) !== null) {
      addWindow(result, {
        id: '5h',
        label: '5H',
        usedPercent: Number(ollama.data.five_hour?.used_percent),
        resetAt: ollama.data.five_hour?.reset_at,
        updatedAt: ollama.fetched_at,
        source: 'snapshot'
      })
    }
    if (finiteNumber(ollama.data.seven_day?.used_percent) !== null) {
      addWindow(result, {
        id: '7d',
        label: '7D',
        usedPercent: Number(ollama.data.seven_day?.used_percent),
        resetAt: ollama.data.seven_day?.reset_at,
        updatedAt: ollama.fetched_at,
        source: 'snapshot'
      })
    }
  }

  return result
}

export function getUsageWindows(account: Sub2ApiAccount, usage?: AccountUsageInfo | null): UsageWindow[] {
  const snapshot = extractSnapshotWindows(account)
  if (!usage) return snapshot
  const live = extractUsageWindows(usage)
  const merged = [...snapshot]
  for (const window of live) addWindow(merged, window)
  return merged.sort((left, right) => windowOrder(left.id) - windowOrder(right.id) || left.label.localeCompare(right.label))
}

function windowOrder(id: string): number {
  if (id === '5h') return 1
  if (id.includes('minute')) return 2
  if (id.includes('daily')) return 3
  if (id === '7d') return 4
  if (id.startsWith('7d-')) return 5
  if (id.includes('weekly')) return 6
  if (id.includes('monthly') || id === '30d') return 7
  return 8
}

export function getCapacityMetrics(account: Sub2ApiAccount): CapacityMetric[] {
  const metrics: CapacityMetric[] = []
  const add = (
    id: string,
    label: string,
    current: unknown,
    limit: unknown,
    unit?: string,
    resetAt?: string | null
  ): void => {
    const parsedCurrent = finiteNumber(current)
    const parsedLimit = finiteNumber(limit)
    if (parsedLimit === null || parsedLimit <= 0) return
    metrics.push({
      id,
      label,
      current: parsedCurrent ?? 0,
      limit: parsedLimit,
      unit,
      resetAt
    })
  }

  add('concurrency', '并发', account.current_concurrency, account.concurrency)
  add('rpm', 'RPM', account.current_rpm, account.base_rpm)
  add('sessions', '会话', account.active_sessions, account.max_sessions)
  add('window-cost', '窗口费用', account.current_window_cost, account.window_cost_limit, '$', account.session_window_end)
  add('daily-quota', '日容量', account.quota_daily_used, account.quota_daily_limit, '$', account.quota_daily_reset_at)
  add('weekly-quota', '周容量', account.quota_weekly_used, account.quota_weekly_limit, '$', account.quota_weekly_reset_at)
  add('total-quota', '总容量', account.quota_used, account.quota_limit, '$')
  return metrics
}

export function accountSeverity(
  account: Sub2ApiAccount,
  windows: UsageWindow[],
  warningThreshold: number,
  dangerThreshold: number,
  now = Date.now()
): AccountSeverity {
  if (account.status !== 'active' || !account.schedulable || runtimeBlocked(account, now)) return 'offline'
  const max = windows.reduce((highest, window) => {
    if (window.resetAt) {
      const reset = new Date(window.resetAt).getTime()
      if (Number.isFinite(reset) && reset <= now) return highest
    }
    return Math.max(highest, window.usedPercent)
  }, 0)
  if (max >= dangerThreshold) return 'danger'
  if (max >= warningThreshold) return 'warning'
  return 'healthy'
}

export function runtimeBlocked(account: Sub2ApiAccount, now = Date.now()): boolean {
  return [account.rate_limit_reset_at, account.overload_until, account.temp_unschedulable_until]
    .some((value) => {
      if (!value) return false
      const time = new Date(value).getTime()
      return Number.isFinite(time) && time > now
    })
}

export function accountSubtitle(account: Sub2ApiAccount, usage?: AccountUsageInfo | null): string {
  const credentials = account.credentials || {}
  const email = safeString(credentials.email)
  const tier = safeString(usage?.subscription_tier) ||
    safeString(usage?.subscription_tier_raw) ||
    safeString(credentials.plan_type) ||
    safeString(credentials.subscription_tier) ||
    safeString(account.ollama_cloud_usage?.snapshot?.data?.plan)
  return [email, tier].filter(Boolean).join(' · ') || `${PLATFORM_LABELS[account.platform] || account.platform} · ${account.type}`
}

export function formatCompactNumber(value: number): string {
  return new Intl.NumberFormat('zh-CN', {
    notation: value >= 10_000 ? 'compact' : 'standard',
    maximumFractionDigits: 1
  }).format(value)
}

export function compactModelName(value: string): string {
  return value
    .replace(/^models\//, '')
    .replace(/-preview.*$/i, '')
    .replace(/-\d{4}-\d{2}-\d{2}$/i, '')
}

export function platformLabel(platform: string): string {
  return PLATFORM_LABELS[platform] || platform || 'Unknown'
}

