import type {
  AccountDetailGroup,
  AccountDetailItem,
  AccountUsageInfo,
  AccountUsageStatsResponse,
  DisplayFieldId,
  Sub2ApiAccount,
  WindowStats
} from './types'
import { formatCompactNumber } from './usage'

const currency = new Intl.NumberFormat('zh-CN', {
  style: 'currency',
  currency: 'USD',
  minimumFractionDigits: 2,
  maximumFractionDigits: 4
})

const timestamp = new Intl.DateTimeFormat('zh-CN', {
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false
})

type DetailOptions = Pick<AccountDetailItem, 'tone' | 'kind' | 'meta' | 'progress' | 'tags'>

function present(value: unknown): boolean {
  return value !== undefined && value !== null && value !== ''
}

function numeric(value: unknown): number | null {
  const parsed = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function numberText(value: unknown): string {
  const parsed = numeric(value)
  return parsed === null ? String(value ?? '') : formatCompactNumber(parsed)
}

function moneyText(value: unknown): string {
  const parsed = numeric(value)
  return parsed === null ? String(value ?? '') : currency.format(parsed)
}

function percentText(value: unknown): string {
  const parsed = numeric(value)
  return parsed === null ? String(value ?? '') : `${Math.round(parsed * 100) / 100}%`
}

function dateText(value: unknown): string {
  if (!present(value)) return ''
  const parsedNumber = numeric(value)
  const date = parsedNumber !== null && typeof value !== 'string'
    ? new Date(parsedNumber > 10_000_000_000 ? parsedNumber : parsedNumber * 1000)
    : new Date(String(value))
  return Number.isFinite(date.getTime()) ? timestamp.format(date) : String(value)
}

function booleanText(value: unknown): string {
  return value ? '是' : '否'
}

function valueText(value: unknown): string {
  if (typeof value === 'boolean') return booleanText(value)
  if (typeof value === 'number') return numberText(value)
  if (Array.isArray(value)) return value.map(valueText).join('、')
  return String(value ?? '')
}

function clampProgress(value: number): number {
  return Math.max(0, Math.min(100, Number.isFinite(value) ? value : 0))
}

function item(
  id: string,
  label: string,
  value: unknown,
  options: DetailOptions = {},
  formatter: (value: unknown) => string = valueText
): AccountDetailItem | null {
  if (!present(value)) return null
  return {
    id,
    label,
    value: formatter(value),
    kind: options.kind || 'metric',
    ...options,
    ...(options.progress === undefined ? {} : { progress: clampProgress(options.progress) })
  }
}

function add(target: AccountDetailItem[], candidate: AccountDetailItem | null): void {
  if (candidate) target.push(candidate)
}

function addGroup(target: AccountDetailGroup[], id: string, label: string, items: AccountDetailItem[]): void {
  if (items.length) target.push({ id, label, items })
}

function stateTone(value: unknown): AccountDetailItem['tone'] {
  const state = String(value ?? '').toLowerCase()
  if (/active|ready|healthy|ok|success|enabled|valid/.test(state)) return 'good'
  if (/error|fail|ban|forbid|invalid|expired|blocked/.test(state)) return 'danger'
  if (/partial|pending|pause|inactive|unknown|warning/.test(state)) return 'warning'
  return 'neutral'
}

function rankingProgress(value: number, maximum: number): number {
  return maximum > 0 ? (value / maximum) * 100 : 0
}

function quotaItem(
  id: string,
  label: string,
  limitValue: unknown,
  remainingValue: unknown,
  resetValue?: unknown
): AccountDetailItem | null {
  const limit = numeric(limitValue)
  const remaining = numeric(remainingValue)
  if (limit === null && remaining === null) return null
  const safeLimit = Math.max(0, limit ?? 0)
  const safeRemaining = Math.max(0, remaining ?? 0)
  const usedPercent = safeLimit > 0 ? ((safeLimit - safeRemaining) / safeLimit) * 100 : 0
  const tone: AccountDetailItem['tone'] = usedPercent >= 90 ? 'danger' : usedPercent >= 75 ? 'warning' : 'good'
  return {
    id,
    label,
    value: `${numberText(safeRemaining)} 剩余`,
    meta: `${numberText(safeLimit)} 总量${present(resetValue) ? ` · ${dateText(resetValue)} 重置` : ''}`,
    kind: 'progress',
    progress: clampProgress(usedPercent),
    tone
  }
}

function costLimitItem(id: string, label: string, usedValue: unknown, limitValue: unknown): AccountDetailItem | null {
  const used = numeric(usedValue)
  const limit = numeric(limitValue)
  if (used === null || limit === null) return null
  const progress = limit > 0 ? (used / limit) * 100 : 0
  return {
    id,
    label,
    value: `${moneyText(used)} / ${moneyText(limit)}`,
    meta: `${percentText(progress)} 已用`,
    kind: 'progress',
    progress: clampProgress(progress),
    tone: progress >= 90 ? 'danger' : progress >= 75 ? 'warning' : 'good'
  }
}

function formatHistory(stats: AccountUsageStatsResponse): AccountDetailItem[] {
  const rows = [...(stats.history || [])].sort((left, right) => right.date.localeCompare(left.date))
  const maximum = Math.max(0, ...rows.map((row) => row.actual_cost || row.cost || 0))
  return rows.map((row) => ({
    id: `history-${row.date}`,
    label: row.label || row.date,
    value: moneyText(row.actual_cost),
    meta: `${numberText(row.requests)} 请求 · ${numberText(row.tokens)} Token · 用户 ${moneyText(row.user_cost)}`,
    kind: 'ranking',
    progress: rankingProgress(row.actual_cost || row.cost || 0, maximum)
  }))
}

function formatModels(stats: AccountUsageStatsResponse): AccountDetailItem[] {
  const rows = [...(stats.models || [])].sort((left, right) => right.total_tokens - left.total_tokens)
  const maximum = Math.max(0, ...rows.map((row) => row.total_tokens || 0))
  return rows.map((row, index) => ({
    id: `model-${index}-${row.model}`,
    label: row.model,
    value: `${numberText(row.total_tokens)} Token`,
    meta: `${numberText(row.requests)} 请求 · 输入 ${numberText(row.input_tokens)} · 输出 ${numberText(row.output_tokens)} · 实际 ${moneyText(row.actual_cost)}`,
    kind: 'ranking',
    progress: rankingProgress(row.total_tokens || 0, maximum)
  }))
}

function formatEndpoints(stats: AccountUsageStatsResponse): AccountDetailItem[] {
  const rows = [
    ...(stats.endpoints || []).map((row) => ({ ...row, prefix: '入口' })),
    ...(stats.upstream_endpoints || []).map((row) => ({ ...row, prefix: '上游' }))
  ].sort((left, right) => right.requests - left.requests)
  const maximum = Math.max(0, ...rows.map((row) => row.requests || 0))
  return rows.map((row, index) => ({
    id: `endpoint-${index}-${row.endpoint}`,
    label: row.endpoint,
    value: `${numberText(row.requests)} 请求`,
    meta: `${row.prefix} · ${numberText(row.total_tokens)} Token · 实际 ${moneyText(row.actual_cost)}`,
    kind: 'ranking',
    progress: rankingProgress(row.requests || 0, maximum)
  }))
}

export function getTodayDisplayItems(
  stats: WindowStats | null | undefined,
  fields: readonly DisplayFieldId[]
): AccountDetailItem[] {
  if (!stats) return []
  const selected = new Set(fields)
  const result: AccountDetailItem[] = []
  if (selected.has('today-requests')) add(result, item('today-requests', '今日请求', stats.requests ?? 0, {}, numberText))
  if (selected.has('today-tokens')) add(result, item('today-tokens', '今日 Token', stats.tokens ?? 0, {}, numberText))
  if (selected.has('today-costs')) {
    add(result, item('today-account-cost', '今日账号成本', stats.cost ?? 0, {}, moneyText))
    add(result, item('today-standard-cost', '今日标准成本', stats.standard_cost, {}, moneyText))
    add(result, item('today-user-cost', '今日用户成本', stats.user_cost, {}, moneyText))
  }
  return result
}

export function getAccountDetailGroups(
  account: Sub2ApiAccount,
  usage: AccountUsageInfo | null | undefined,
  stats: AccountUsageStatsResponse | null | undefined,
  fields: readonly DisplayFieldId[]
): AccountDetailGroup[] {
  const selected = new Set(fields)
  const groups: AccountDetailGroup[] = []

  if (stats && selected.has('period-summary')) {
    const summary = stats.summary
    const items: AccountDetailItem[] = []
    add(items, item('period-days', '统计范围', `${summary.actual_days_used}/${summary.days} 天`))
    add(items, item('period-requests', '总请求', summary.total_requests, {}, numberText))
    add(items, item('period-tokens', '总 Token', summary.total_tokens, {}, numberText))
    add(items, item('period-account-cost', '账号成本', summary.total_cost, {}, moneyText))
    add(items, item('period-standard-cost', '标准成本', summary.total_standard_cost, {}, moneyText))
    add(items, item('period-user-cost', '用户成本', summary.total_user_cost, {}, moneyText))
    add(items, item('period-avg-cost', '日均账号成本', summary.avg_daily_cost, {}, moneyText))
    add(items, item('period-avg-requests', '日均请求', summary.avg_daily_requests, {}, numberText))
    add(items, item('period-duration', '平均耗时', `${Math.round(summary.avg_duration_ms || 0)} ms`))
    if (summary.highest_cost_day) {
      add(items, item(
        'period-highest-cost',
        '最高成本日',
        moneyText(summary.highest_cost_day.cost),
        {
          kind: 'ranking',
          meta: `${summary.highest_cost_day.label || summary.highest_cost_day.date} · ${numberText(summary.highest_cost_day.requests)} 请求 · 用户 ${moneyText(summary.highest_cost_day.user_cost)}`,
          progress: 100,
          tone: 'warning'
        }
      ))
    }
    if (summary.highest_request_day) {
      add(items, item(
        'period-highest-requests',
        '最高请求日',
        `${numberText(summary.highest_request_day.requests)} 请求`,
        {
          kind: 'ranking',
          meta: `${summary.highest_request_day.label || summary.highest_request_day.date} · 账号 ${moneyText(summary.highest_request_day.cost)}`,
          progress: 100
        }
      ))
    }
    addGroup(groups, 'period-summary', '30 天概览', items)
  }
  if (stats && selected.has('period-history')) addGroup(groups, 'period-history', '每日趋势', formatHistory(stats))
  if (stats && selected.has('period-models')) addGroup(groups, 'period-models', '模型消耗排行', formatModels(stats))
  if (stats && selected.has('period-endpoints')) addGroup(groups, 'period-endpoints', '接口消耗排行', formatEndpoints(stats))

  if (selected.has('account-subscription')) {
    const items: AccountDetailItem[] = []
    const plan = usage?.subscription_tier || account.credentials?.plan_type || account.credentials?.subscription_tier
    add(items, item('subscription-plan', '当前套餐', plan, { kind: 'status', tone: 'good' }))
    if (usage?.subscription_tier_raw && usage.subscription_tier_raw !== plan) {
      add(items, item('subscription-tier-raw', '上游套餐', usage.subscription_tier_raw))
    }
    add(items, item('subscription-parent-plan', '母账号套餐', account.parent_plan_type))
    add(items, item('subscription-parent-expiry', '订阅到期', account.parent_subscription_expires_at || account.expires_at, { kind: 'timeline' }, dateText))
    addGroup(groups, 'account-subscription', '订阅信息', items)
  }

  if (selected.has('account-scheduling')) {
    const items: AccountDetailItem[] = []
    add(items, item('scheduling-status', '账号状态', account.status, { kind: 'status', tone: stateTone(account.status) }))
    add(items, item('scheduling-enabled', '调度资格', account.schedulable ? '可调度' : '已暂停', {
      kind: 'status',
      tone: account.schedulable ? 'good' : 'danger'
    }))
    add(items, item('scheduling-priority', '优先级', account.priority, {}, numberText))
    add(items, item('scheduling-load', '负载因子', account.load_factor, {}, numberText))
    add(items, item('scheduling-rate', '计费倍率', account.rate_multiplier === undefined ? undefined : `${account.rate_multiplier}×`))
    add(items, item('scheduling-base-score', '基础调度分', account.scheduler_score?.base_score, {}, numberText))
    add(items, item('scheduling-sticky-score', '粘性调度分', account.scheduler_score?.sticky_score_infinity ? '∞' : account.scheduler_score?.sticky_score, {}, numberText))
    for (const score of account.scheduler_scores || []) {
      add(items, item(
        `scheduling-group-${score.group_id}`,
        score.group_name || `分组 #${score.group_id}`,
        score.sticky_score_infinity ? '粘性 ∞' : numberText(score.sticky_score ?? score.base_score),
        {
          kind: 'ranking',
          meta: `${score.group_priority === undefined ? '' : `优先级 ${score.group_priority} · `}基础分 ${numberText(score.base_score)}`
        }
      ))
    }
    addGroup(groups, 'account-scheduling', '调度状态', items)
  }

  if (selected.has('account-groups')) {
    const tags = (account.groups || []).map((group) => group.name)
    if (!tags.length) tags.push(...(account.group_ids || []).map((id) => `分组 #${id}`))
    for (const relation of account.account_groups || []) {
      const name = account.groups?.find((group) => group.id === relation.group_id)?.name || `分组 #${relation.group_id}`
      if (relation.priority !== undefined) tags.push(`${name} · P${relation.priority}`)
    }
    const items: AccountDetailItem[] = []
    add(items, item('groups-names', '路由分组', tags.length ? tags.join('、') : undefined, { kind: 'tags', tags }))
    addGroup(groups, 'account-groups', '账号分组', items)
  }

  if (selected.has('account-notes')) {
    const items: AccountDetailItem[] = []
    add(items, item('notes', '运维备注', account.notes, { kind: 'note' }))
    addGroup(groups, 'account-notes', '运维备注', items)
  }

  if (selected.has('account-cooldowns')) {
    const items: AccountDetailItem[] = []
    add(items, item('cooldown-limited', '开始限流', account.rate_limited_at, { kind: 'timeline', tone: 'warning' }, dateText))
    add(items, item('cooldown-reset', '限流解除', account.rate_limit_reset_at, { kind: 'timeline', tone: 'warning' }, dateText))
    add(items, item('cooldown-overload', '过载解除', account.overload_until, { kind: 'timeline', tone: 'warning' }, dateText))
    add(items, item('cooldown-temp', '暂停解除', account.temp_unschedulable_until, { kind: 'timeline', tone: 'danger' }, dateText))
    add(items, item('cooldown-reason', '暂停原因', account.temp_unschedulable_reason, { kind: 'note', tone: 'danger' }))
    addGroup(groups, 'account-cooldowns', '限流与冷却', items)
  }

  if (selected.has('account-routing')) {
    const items: AccountDetailItem[] = []
    const proxy = account.proxy
    add(items, item(
      'routing-proxy',
      '当前代理',
      proxy ? `${proxy.name} · ${proxy.protocol}://${proxy.host}:${proxy.port}` : undefined,
      { kind: 'status', tone: stateTone(proxy?.status), meta: proxy?.fallback_mode ? `回退模式 ${proxy.fallback_mode}` : undefined }
    ))
    add(items, item('routing-proxy-status', '代理状态', proxy?.status, { kind: 'status', tone: stateTone(proxy?.status) }))
    add(items, item('routing-proxy-expiry', '代理到期', proxy?.expires_at, { kind: 'timeline' }, dateText))
    add(items, item('routing-fallback', '回退来源', account.proxy_fallback_origin_name || account.proxy_fallback_origin_id))
    add(items, item('routing-parent-email', '母账号', account.parent_email, { kind: 'status' }))
    add(items, item('routing-dimension', '配额维度', account.quota_dimension))
    addGroup(groups, 'account-routing', '路由与代理', items)
  }

  if (selected.has('usage-health')) {
    const items: AccountDetailItem[] = []
    if (usage?.is_forbidden) {
      add(items, item('health-forbidden', '上游拒绝访问', usage.forbidden_type || '已禁止', {
        kind: 'status',
        tone: 'danger',
        meta: usage.forbidden_reason
      }))
    }
    if (usage?.needs_verify) add(items, item('health-verify', '账号验证', '需要处理', { kind: 'status', tone: 'warning' }))
    if (usage?.is_banned) add(items, item('health-banned', '账号状态', '已封禁', { kind: 'status', tone: 'danger' }))
    if (usage?.needs_reauth) add(items, item('health-reauth', '上游授权', '需要重新授权', { kind: 'status', tone: 'danger' }))
    if (usage?.error) add(items, item('health-error', '上游错误', usage.error, {
      kind: 'note',
      tone: 'danger',
      meta: usage.error_code ? `错误码 ${usage.error_code}` : undefined
    }))
    addGroup(groups, 'usage-health', '上游健康', items)
  }

  if (selected.has('ai-credits')) {
    const items: AccountDetailItem[] = []
    for (const [index, credit] of (usage?.ai_credits || []).entries()) {
      const amount = numeric(credit.amount) ?? 0
      const minimum = numeric(credit.minimum_balance)
      add(items, item(
        `credit-${index}-${credit.credit_type}`,
        credit.credit_type || `Credit ${index + 1}`,
        amount,
        {
          kind: 'metric',
          tone: minimum !== null && amount <= minimum ? 'warning' : 'good',
          meta: minimum === null ? undefined : `最低保留 ${numberText(minimum)}`
        },
        numberText
      ))
    }
    addGroup(groups, 'ai-credits', 'AI Credits', items)
  }

  if (selected.has('grok-details')) {
    const items: AccountDetailItem[] = []
    add(items, quotaItem(
      'grok-request-quota',
      '请求配额',
      usage?.grok_request_quota?.limit,
      usage?.grok_request_quota?.remaining,
      usage?.grok_request_quota?.reset_at || usage?.grok_request_quota?.reset_unix
    ))
    add(items, quotaItem(
      'grok-token-quota',
      'Token 配额',
      usage?.grok_token_quota?.limit,
      usage?.grok_token_quota?.remaining,
      usage?.grok_token_quota?.reset_at || usage?.grok_token_quota?.reset_unix
    ))
    if ((usage?.grok_retry_after_seconds || 0) > 0) {
      add(items, item('grok-retry', '请求冷却', `${usage?.grok_retry_after_seconds} 秒`, { kind: 'status', tone: 'warning' }))
    }
    for (const [key, label] of [['grok_local_usage', '当前窗口'], ['grok_local_usage_24h', '最近 24H'], ['grok_local_usage_7d', '最近 7D'], ['grok_local_usage_monthly', '本月']] as const) {
      const local = usage?.[key]
      if (local) add(items, item(
        `grok-${key}`,
        label,
        moneyText(local.cost || 0),
        {
          kind: 'ranking',
          meta: `${numberText(local.requests || 0)} 请求 · ${numberText(local.tokens || 0)} Token · 用户 ${moneyText(local.user_cost || 0)}`
        }
      ))
    }
    const billing = usage?.grok_billing
    if (billing) {
      add(items, item('grok-plan', '账单套餐', billing.plan, { kind: 'status', tone: 'good' }))
      add(items, item('grok-weekly-usage', '周账期用量', billing.usage_percent, {
        kind: 'progress',
        progress: numeric(billing.usage_percent) ?? 0,
        tone: (numeric(billing.usage_percent) ?? 0) >= 90 ? 'danger' : 'good',
        meta: billing.period_end ? `${dateText(billing.period_end)} 重置` : undefined
      }, percentText))
      add(items, item('grok-monthly-usage', '月账期用量', billing.used_percent, {
        kind: 'progress',
        progress: numeric(billing.used_percent) ?? 0,
        tone: (numeric(billing.used_percent) ?? 0) >= 90 ? 'danger' : 'good'
      }, percentText))
      add(items, item('grok-prepaid', '预付余额', billing.prepaid_balance, {}, moneyText))
      add(items, costLimitItem('grok-monthly-money', '月费用', billing.monthly_used, billing.monthly_limit))
      add(items, costLimitItem('grok-demand', '按需费用', billing.on_demand_used, billing.on_demand_cap))
      if (billing.partial) add(items, item('grok-partial', '账单完整性', '部分数据', { kind: 'status', tone: 'warning' }))
      for (const product of billing.product_usage || []) {
        const progress = numeric(product.usage_percent) ?? 0
        add(items, item(`grok-product-${product.product}`, product.product || '产品', progress, {
          kind: 'progress',
          progress,
          tone: progress >= 90 ? 'danger' : progress >= 75 ? 'warning' : 'good'
        }, percentText))
      }
    }
    addGroup(groups, 'grok-details', 'Grok 配额与账单', items)
  }

  if (selected.has('ollama-details')) {
    const snapshot = account.ollama_cloud_usage?.snapshot
    const items: AccountDetailItem[] = []
    add(items, item('ollama-status', '云用量状态', snapshot?.status, { kind: 'status', tone: stateTone(snapshot?.status) }))
    add(items, item('ollama-plan', '当前套餐', snapshot?.data?.plan, { kind: 'status', tone: 'good' }))
    add(items, item('ollama-balance', '账户余额', snapshot?.data?.balance))
    if ((snapshot?.failure_count || 0) > 0) {
      add(items, item('ollama-failures', '连续失败', snapshot?.failure_count, { kind: 'status', tone: 'warning' }, numberText))
    }
    add(items, item('ollama-error', '最后错误', snapshot?.last_error, { kind: 'note', tone: 'danger' }))
    const models = [...(snapshot?.data?.models || [])].sort((left, right) => (right.requests || 0) - (left.requests || 0))
    const maximum = Math.max(0, ...models.map((model) => model.requests || 0))
    for (const model of models) {
      add(items, item(
        `ollama-model-${model.model}-${model.window}`,
        model.model || '模型',
        `${numberText(model.requests || 0)} 请求`,
        {
          kind: 'ranking',
          progress: rankingProgress(model.requests || 0, maximum),
          meta: model.window || '当前窗口'
        }
      ))
    }
    addGroup(groups, 'ollama-details', 'Ollama 用量', items)
  }

  return groups
}
