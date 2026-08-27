import type {
  AccountDetailGroup,
  AccountDetailItem,
  AccountUsageInfo,
  AccountUsageStatsResponse,
  DisplayFieldId,
  Sub2ApiAccount,
  WindowStats
} from './types'
import { formatCompactNumber, platformLabel } from './usage'

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

const SENSITIVE_FIELD = /(^|[._-])(access[_-]?token|refresh[_-]?token|id[_-]?token|api[_-]?key|access[_-]?key|service[_-]?account(?:[_-]?json)?|signing[_-]?key|encryption[_-]?key|secret|password|cookie|private[_-]?key|session[_-]?key|authorization|credential)([._-]|$)/i

const CREDENTIAL_STATUS_LABELS: Record<string, string> = {
  has_access_token: '访问令牌已配置',
  has_refresh_token: '刷新令牌已配置',
  has_id_token: 'ID 令牌已配置',
  has_api_key: 'API Key 已配置',
  has_session_key: '会话密钥已配置',
  has_cookie: 'Cookie 已配置',
  has_private_key: '私钥已配置',
  has_service_account: '服务账号已配置'
}

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

function valueText(value: unknown, key = ''): string {
  if (typeof value === 'boolean') return booleanText(value)
  if (typeof value === 'number') return numberText(value)
  if (Array.isArray(value)) return value.map((item) => valueText(item, key)).join('、')
  if (/(^|_)(at|until|start|end|expires|updated|fetched|checked)(_at)?$/i.test(key)) return dateText(value)
  return String(value ?? '')
}

function item(
  id: string,
  label: string,
  value: unknown,
  formatter: (value: unknown) => string = valueText,
  tone?: AccountDetailItem['tone']
): AccountDetailItem | null {
  if (!present(value)) return null
  return { id, label, value: formatter(value), ...(tone ? { tone } : {}) }
}

function add(target: AccountDetailItem[], candidate: AccountDetailItem | null): void {
  if (candidate) target.push(candidate)
}

function addGroup(target: AccountDetailGroup[], id: string, label: string, items: AccountDetailItem[]): void {
  if (items.length) target.push({ id, label, items })
}

function statsText(stats: WindowStats): string {
  const parts = [
    `${numberText(stats.requests || 0)} 请求`,
    `${numberText(stats.tokens || 0)} Token`,
    `账号 ${moneyText(stats.cost || 0)}`
  ]
  if (stats.standard_cost !== undefined) parts.push(`标准 ${moneyText(stats.standard_cost)}`)
  if (stats.user_cost !== undefined) parts.push(`用户 ${moneyText(stats.user_cost)}`)
  return parts.join(' · ')
}

function quotaText(limit: unknown, remaining: unknown): string {
  const parsedLimit = numeric(limit)
  const parsedRemaining = numeric(remaining)
  if (parsedLimit === null && parsedRemaining === null) return ''
  return `${numberText(parsedRemaining ?? 0)} 剩余 / ${numberText(parsedLimit ?? 0)} 总量`
}

function formatHistory(stats: AccountUsageStatsResponse): AccountDetailItem[] {
  return [...(stats.history || [])]
    .sort((left, right) => right.date.localeCompare(left.date))
    .map((row) => ({
      id: `history-${row.date}`,
      label: row.label || row.date,
      value: `${numberText(row.requests)} 请求 · ${numberText(row.tokens)} Token · 标准 ${moneyText(row.cost)} · 账号 ${moneyText(row.actual_cost)} · 用户 ${moneyText(row.user_cost)}`
    }))
}

function formatModels(stats: AccountUsageStatsResponse): AccountDetailItem[] {
  return [...(stats.models || [])]
    .sort((left, right) => right.requests - left.requests)
    .map((row, index) => ({
      id: `model-${index}-${row.model}`,
      label: row.model,
      value: `${numberText(row.requests)} 请求 · 输入 ${numberText(row.input_tokens)} · 输出 ${numberText(row.output_tokens)} · 缓存写 ${numberText(row.cache_creation_tokens)} · 缓存读 ${numberText(row.cache_read_tokens)} · 总计 ${numberText(row.total_tokens)} Token · 标准 ${moneyText(row.cost)} · 实际 ${moneyText(row.actual_cost)}${row.account_cost === undefined ? '' : ` · 账号 ${moneyText(row.account_cost)}`}`
    }))
}

function formatEndpoints(stats: AccountUsageStatsResponse): AccountDetailItem[] {
  const rows = [
    ...(stats.endpoints || []).map((row) => ({ ...row, prefix: '入口' })),
    ...(stats.upstream_endpoints || []).map((row) => ({ ...row, prefix: '上游' }))
  ]
  return rows
    .sort((left, right) => right.requests - left.requests)
    .map((row, index) => ({
      id: `endpoint-${index}-${row.endpoint}`,
      label: `${row.prefix} ${row.endpoint}`,
      value: `${numberText(row.requests)} 请求 · ${numberText(row.total_tokens)} Token · 标准 ${moneyText(row.cost)} · 实际 ${moneyText(row.actual_cost)}`
    }))
}

function flattenSafeFields(
  value: unknown,
  prefix: string,
  target: AccountDetailItem[],
  depth = 0
): void {
  if (target.length >= 500 || depth > 4 || !present(value) || SENSITIVE_FIELD.test(prefix)) return
  if (Array.isArray(value)) {
    if (value.every((entry) => ['string', 'number', 'boolean'].includes(typeof entry))) {
      add(target, item(`extension-${prefix}`, prefix, value, (entry) => valueText(entry, prefix)))
      return
    }
    value.forEach((entry, index) => flattenSafeFields(entry, `${prefix}.${index + 1}`, target, depth + 1))
    return
  }
  if (typeof value === 'object') {
    for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
      flattenSafeFields(entry, prefix ? `${prefix}.${key}` : key, target, depth + 1)
    }
    return
  }
  add(target, item(`extension-${prefix}`, prefix, value, (entry) => valueText(entry, prefix)))
}

export function getTodayDisplayItems(
  stats: WindowStats | null | undefined,
  fields: readonly DisplayFieldId[]
): AccountDetailItem[] {
  if (!stats) return []
  const selected = new Set(fields)
  const result: AccountDetailItem[] = []
  if (selected.has('today-requests')) add(result, item('today-requests', '今日请求', stats.requests ?? 0, numberText))
  if (selected.has('today-tokens')) add(result, item('today-tokens', '今日 Token', stats.tokens ?? 0, numberText))
  if (selected.has('today-costs')) {
    add(result, item('today-account-cost', '今日账号成本', stats.cost ?? 0, moneyText))
    add(result, item('today-standard-cost', '今日标准成本', stats.standard_cost, moneyText))
    add(result, item('today-user-cost', '今日用户成本', stats.user_cost, moneyText))
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
    add(items, item('period-days', '统计天数', `${summary.actual_days_used}/${summary.days} 天`))
    add(items, item('period-requests', '总请求', summary.total_requests, numberText))
    add(items, item('period-tokens', '总 Token', summary.total_tokens, numberText))
    add(items, item('period-account-cost', '账号成本', summary.total_cost, moneyText))
    add(items, item('period-standard-cost', '标准成本', summary.total_standard_cost, moneyText))
    add(items, item('period-user-cost', '用户成本', summary.total_user_cost, moneyText))
    add(items, item('period-avg-cost', '日均账号成本', summary.avg_daily_cost, moneyText))
    add(items, item('period-avg-user-cost', '日均用户成本', summary.avg_daily_user_cost, moneyText))
    add(items, item('period-avg-requests', '日均请求', summary.avg_daily_requests, numberText))
    add(items, item('period-avg-tokens', '日均 Token', summary.avg_daily_tokens, numberText))
    add(items, item('period-duration', '平均耗时', `${Math.round(summary.avg_duration_ms || 0)} ms`))
    if (summary.today) {
      add(items, item('period-today', '今日（历史口径）', `${numberText(summary.today.requests)} 请求 · ${numberText(summary.today.tokens)} Token · 账号 ${moneyText(summary.today.cost)} · 用户 ${moneyText(summary.today.user_cost)}`))
    }
    if (summary.highest_cost_day) {
      add(items, item('period-highest-cost', '最高成本日', `${summary.highest_cost_day.label || summary.highest_cost_day.date} · ${numberText(summary.highest_cost_day.requests)} 请求 · 账号 ${moneyText(summary.highest_cost_day.cost)} · 用户 ${moneyText(summary.highest_cost_day.user_cost)}`))
    }
    if (summary.highest_request_day) {
      add(items, item('period-highest-requests', '最高请求日', `${summary.highest_request_day.label || summary.highest_request_day.date} · ${numberText(summary.highest_request_day.requests)} 请求 · 账号 ${moneyText(summary.highest_request_day.cost)} · 用户 ${moneyText(summary.highest_request_day.user_cost)}`))
    }
    addGroup(groups, 'period-summary', '30 天汇总', items)
  }
  if (stats && selected.has('period-history')) addGroup(groups, 'period-history', '每日历史', formatHistory(stats))
  if (stats && selected.has('period-models')) addGroup(groups, 'period-models', '模型明细', formatModels(stats))
  if (stats && selected.has('period-endpoints')) addGroup(groups, 'period-endpoints', '接口明细', formatEndpoints(stats))

  if (selected.has('account-identity')) {
    const items: AccountDetailItem[] = []
    add(items, item('identity-id', '账号 ID', account.id, numberText))
    add(items, item('identity-platform', '平台', platformLabel(account.platform)))
    add(items, item('identity-type', '类型', account.type))
    add(items, item('identity-email', '邮箱', account.credentials?.email))
    add(items, item('identity-username', '用户名', account.credentials?.username))
    addGroup(groups, 'account-identity', '账号标识', items)
  }

  if (selected.has('account-subscription')) {
    const items: AccountDetailItem[] = []
    add(items, item('subscription-tier', '订阅等级', usage?.subscription_tier))
    add(items, item('subscription-tier-raw', '上游套餐', usage?.subscription_tier_raw))
    add(items, item('subscription-plan', '账号套餐', account.credentials?.plan_type || account.credentials?.subscription_tier))
    add(items, item('subscription-parent-plan', '母账号套餐', account.parent_plan_type))
    add(items, item('subscription-parent-expiry', '母账号订阅到期', account.parent_subscription_expires_at, dateText))
    add(items, item('subscription-ollama-plan', 'Ollama 套餐', account.ollama_cloud_usage?.snapshot?.data?.plan))
    addGroup(groups, 'account-subscription', '订阅套餐', items)
  }

  if (selected.has('account-scheduling')) {
    const items: AccountDetailItem[] = []
    add(items, item('scheduling-status', '账号状态', account.status, valueText, account.status === 'active' ? 'good' : 'danger'))
    add(items, item('scheduling-enabled', '可调度', account.schedulable, booleanText, account.schedulable ? 'good' : 'danger'))
    add(items, item('scheduling-priority', '优先级', account.priority, numberText))
    add(items, item('scheduling-load', '负载因子', account.load_factor, numberText))
    add(items, item('scheduling-rate', '计费倍率', account.rate_multiplier === undefined ? undefined : `${account.rate_multiplier}×`))
    add(items, item('scheduling-base-score', '基础调度分', account.scheduler_score?.base_score, numberText))
    add(items, item('scheduling-sticky-score', '粘性调度分', account.scheduler_score?.sticky_score_infinity ? '∞' : account.scheduler_score?.sticky_score, numberText))
    add(items, item('scheduling-weighted', '粘性加权', account.scheduler_score?.sticky_weighted_enabled, booleanText))
    for (const score of account.scheduler_scores || []) {
      add(items, item(
        `scheduling-group-${score.group_id}`,
        score.group_name || `分组 #${score.group_id}`,
        `${score.group_priority === undefined ? '' : `优先级 ${score.group_priority} · `}${numberText(score.base_score)}${score.sticky_score_infinity ? ' · 粘性 ∞' : score.sticky_score === undefined ? '' : ` · 粘性 ${numberText(score.sticky_score)}`}`
      ))
    }
    addGroup(groups, 'account-scheduling', '调度信息', items)
  }

  if (selected.has('account-groups')) {
    const items: AccountDetailItem[] = []
    add(items, item('groups-names', '所属分组', account.groups?.map((group) => group.name)))
    if (!account.groups?.length) add(items, item('groups-ids', '分组 ID', account.group_ids))
    for (const relation of account.account_groups || []) {
      add(items, item(`group-relation-${relation.group_id}`, `分组 #${relation.group_id}`, relation.priority === undefined ? '已绑定' : `优先级 ${relation.priority}`))
    }
    addGroup(groups, 'account-groups', '账号分组', items)
  }

  if (selected.has('account-notes')) {
    const items: AccountDetailItem[] = []
    add(items, item('notes', '备注', account.notes))
    addGroup(groups, 'account-notes', '备注', items)
  }

  if (selected.has('account-lifecycle')) {
    const items: AccountDetailItem[] = []
    add(items, item('lifecycle-created', '创建时间', account.created_at, dateText))
    add(items, item('lifecycle-updated', '账号更新', account.updated_at, dateText))
    add(items, item('lifecycle-last-used', '最后调用', account.last_used_at, dateText))
    add(items, item('lifecycle-expires', '账号到期', account.expires_at, dateText))
    add(items, item('lifecycle-auto-pause', '到期自动停用', account.auto_pause_on_expired, booleanText))
    addGroup(groups, 'account-lifecycle', '生命周期', items)
  }

  if (selected.has('account-cooldowns')) {
    const items: AccountDetailItem[] = []
    add(items, item('cooldown-limited', '开始限流', account.rate_limited_at, dateText))
    add(items, item('cooldown-reset', '限流解除', account.rate_limit_reset_at, dateText))
    add(items, item('cooldown-overload', '过载解除', account.overload_until, dateText))
    add(items, item('cooldown-temp', '暂停解除', account.temp_unschedulable_until, dateText))
    add(items, item('cooldown-reason', '暂停原因', account.temp_unschedulable_reason))
    addGroup(groups, 'account-cooldowns', '限流与冷却', items)
  }

  if (selected.has('account-session-policy')) {
    const items: AccountDetailItem[] = []
    add(items, item('session-status', '窗口状态', account.session_window_status))
    add(items, item('session-start', '窗口开始', account.session_window_start, dateText))
    add(items, item('session-end', '窗口结束', account.session_window_end, dateText))
    add(items, item('session-reserve', '粘性费用预留', account.window_cost_sticky_reserve, moneyText))
    add(items, item('session-idle', '会话空闲超时', account.session_idle_timeout_minutes === undefined ? undefined : `${account.session_idle_timeout_minutes} 分钟`))
    add(items, item('session-rpm-strategy', 'RPM 策略', account.rpm_strategy))
    add(items, item('session-rpm-buffer', 'RPM 粘性缓冲', account.rpm_sticky_buffer, numberText))
    add(items, item('session-queue-mode', '消息队列模式', account.user_msg_queue_mode))
    addGroup(groups, 'account-session-policy', '会话策略', items)
  }

  if (selected.has('account-quota-policy')) {
    const items: AccountDetailItem[] = []
    add(items, item('quota-daily-mode', '日重置模式', account.quota_daily_reset_mode))
    add(items, item('quota-daily-hour', '日重置小时', account.quota_daily_reset_hour))
    add(items, item('quota-weekly-mode', '周重置模式', account.quota_weekly_reset_mode))
    add(items, item('quota-weekly-day', '周重置星期', account.quota_weekly_reset_day))
    add(items, item('quota-weekly-hour', '周重置小时', account.quota_weekly_reset_hour))
    add(items, item('quota-timezone', '重置时区', account.quota_reset_timezone))
    add(items, item('quota-daily-at', '下次日重置', account.quota_daily_reset_at, dateText))
    add(items, item('quota-weekly-at', '下次周重置', account.quota_weekly_reset_at, dateText))
    add(items, item('quota-notify-daily', '日配额通知', account.quota_notify_daily_enabled, booleanText))
    add(items, item('quota-notify-daily-threshold', '日通知阈值', account.quota_notify_daily_threshold, percentText))
    add(items, item('quota-notify-weekly', '周配额通知', account.quota_notify_weekly_enabled, booleanText))
    add(items, item('quota-notify-weekly-threshold', '周通知阈值', account.quota_notify_weekly_threshold, percentText))
    add(items, item('quota-notify-total', '总配额通知', account.quota_notify_total_enabled, booleanText))
    add(items, item('quota-notify-total-threshold', '总通知阈值', account.quota_notify_total_threshold, percentText))
    addGroup(groups, 'account-quota-policy', '配额策略', items)
  }

  if (selected.has('account-routing')) {
    const items: AccountDetailItem[] = []
    add(items, item('routing-proxy-id', '代理 ID', account.proxy_id))
    add(items, item('routing-proxy', '代理', account.proxy ? `${account.proxy.name} · ${account.proxy.protocol}://${account.proxy.host}:${account.proxy.port}` : undefined))
    add(items, item('routing-proxy-status', '代理状态', account.proxy?.status))
    add(items, item('routing-proxy-expiry', '代理到期', account.proxy?.expires_at, dateText))
    add(items, item('routing-proxy-mode', '代理回退模式', account.proxy?.fallback_mode))
    add(items, item('routing-fallback', '代理回退来源', account.proxy_fallback_origin_name || account.proxy_fallback_origin_id))
    add(items, item('routing-parent', '母账号 ID', account.parent_account_id))
    add(items, item('routing-parent-email', '母账号邮箱', account.parent_email))
    add(items, item('routing-parent-privacy', '母账号隐私模式', account.parent_privacy_mode))
    add(items, item('routing-parent-chatgpt', '母账号 ChatGPT ID', account.parent_chatgpt_account_id))
    add(items, item('routing-dimension', '配额维度', account.quota_dimension))
    addGroup(groups, 'account-routing', '代理与影子账号', items)
  }

  if (selected.has('account-features')) {
    const items: AccountDetailItem[] = []
    add(items, item('features-tls', 'TLS 指纹', account.enable_tls_fingerprint, booleanText))
    add(items, item('features-tls-profile', 'TLS 模板 ID', account.tls_fingerprint_profile_id))
    add(items, item('features-session-mask', '会话 ID 掩码', account.session_id_masking_enabled, booleanText))
    add(items, item('features-cache-ttl', '缓存 TTL 覆盖', account.cache_ttl_override_enabled, booleanText))
    add(items, item('features-cache-target', '缓存 TTL 目标', account.cache_ttl_override_target))
    add(items, item('features-custom-url', '自定义中继', account.custom_base_url_enabled, booleanText))
    add(items, item('features-custom-base', '自定义 Base URL', account.custom_base_url))
    for (const [key, enabled] of Object.entries(account.credentials_status || {})) {
      add(items, item(
        `features-credential-${key}`,
        CREDENTIAL_STATUS_LABELS[key] || `凭据 ${key.replace(/^has_/, '')}`,
        enabled,
        booleanText
      ))
    }
    addGroup(groups, 'account-features', '高级能力', items)
  }

  if (selected.has('usage-health')) {
    const items: AccountDetailItem[] = []
    add(items, item('health-source', '采样来源', usage?.source === 'passive' ? '被动' : usage?.source === 'active' ? '主动' : usage?.source))
    add(items, item('health-updated', '用量更新', usage?.updated_at, dateText))
    add(items, item('health-forbidden', '上游禁止', usage?.is_forbidden, booleanText, usage?.is_forbidden ? 'danger' : 'good'))
    add(items, item('health-forbidden-type', '禁止类型', usage?.forbidden_type))
    add(items, item('health-forbidden-reason', '禁止原因', usage?.forbidden_reason))
    add(items, item('health-verify', '需要验证', usage?.needs_verify, booleanText, usage?.needs_verify ? 'warning' : 'good'))
    add(items, item('health-banned', '账号封禁', usage?.is_banned, booleanText, usage?.is_banned ? 'danger' : 'good'))
    add(items, item('health-reauth', '需要重新授权', usage?.needs_reauth, booleanText, usage?.needs_reauth ? 'danger' : 'good'))
    add(items, item('health-code', '错误码', usage?.error_code))
    add(items, item('health-error', '上游错误', usage?.error))
    add(items, item('health-validation-url', '验证地址', usage?.validation_url))
    addGroup(groups, 'usage-health', '上游健康', items)
  }

  if (selected.has('antigravity-details')) {
    const items: AccountDetailItem[] = []
    for (const [model, detail] of Object.entries(usage?.antigravity_quota_details || {})) {
      const capabilities = [
        detail.display_name,
        detail.supports_images ? '图像' : '',
        detail.supports_thinking ? '思考' : '',
        detail.thinking_budget ? `思考预算 ${numberText(detail.thinking_budget)}` : '',
        detail.max_tokens ? `${numberText(detail.max_tokens)} 上下文` : '',
        detail.max_output_tokens ? `${numberText(detail.max_output_tokens)} 输出` : '',
        detail.supported_mime_types
          ? `MIME ${Object.entries(detail.supported_mime_types).filter(([, supported]) => supported).map(([mime]) => mime).join('、')}`
          : '',
        detail.recommended ? '推荐' : ''
      ].filter(Boolean).join(' · ')
      add(items, item(`antigravity-${model}`, model, capabilities))
    }
    for (const [from, to] of Object.entries(usage?.model_forwarding_rules || {})) {
      add(items, item(`forward-${from}`, `模型转发 ${from}`, to))
    }
    addGroup(groups, 'antigravity-details', '模型能力', items)
  }

  if (selected.has('ai-credits')) {
    const items = (usage?.ai_credits || []).map((credit, index) => ({
      id: `credit-${index}-${credit.credit_type}`,
      label: credit.credit_type || `Credit ${index + 1}`,
      value: `${numberText(credit.amount ?? 0)}${credit.minimum_balance === undefined ? '' : ` · 最低 ${numberText(credit.minimum_balance)}`}`
    }))
    addGroup(groups, 'ai-credits', 'AI Credits', items)
  }

  if (selected.has('grok-details')) {
    const items: AccountDetailItem[] = []
    add(items, item('grok-request-quota', '请求配额', quotaText(usage?.grok_request_quota?.limit, usage?.grok_request_quota?.remaining)))
    add(items, item('grok-request-reset', '请求重置', usage?.grok_request_quota?.reset_at || usage?.grok_request_quota?.reset_unix, dateText))
    add(items, item('grok-token-quota', 'Token 配额', quotaText(usage?.grok_token_quota?.limit, usage?.grok_token_quota?.remaining)))
    add(items, item('grok-token-reset', 'Token 重置', usage?.grok_token_quota?.reset_at || usage?.grok_token_quota?.reset_unix, dateText))
    add(items, item('grok-retry', '重试等待', usage?.grok_retry_after_seconds === undefined ? undefined : `${usage.grok_retry_after_seconds} 秒`))
    add(items, item('grok-entitlement', '权益状态', usage?.grok_entitlement_status))
    add(items, item('grok-snapshot-state', '快照状态', usage?.grok_quota_snapshot_state))
    add(items, item('grok-last-probe', '最后额度探测', usage?.grok_last_quota_probe_at, dateText))
    add(items, item('grok-last-headers', '最后响应头', usage?.grok_last_headers_seen_at, dateText))
    add(items, item('grok-last-status', '最后状态码', usage?.grok_last_status_code))
    add(items, item('grok-free-limit', 'Free Token 上限', usage?.grok_free_token_limit, numberText))
    for (const [key, label] of [['grok_local_usage', '当前窗口'], ['grok_local_usage_24h', '最近 24H'], ['grok_local_usage_7d', '最近 7D'], ['grok_local_usage_monthly', '本月']] as const) {
      const local = usage?.[key]
      if (local) add(items, item(`grok-${key}`, label, statsText(local)))
    }
    const billing = usage?.grok_billing
    if (billing) {
      add(items, item('grok-plan', '账单套餐', billing.plan))
      add(items, item('grok-period-type', '账期类型', billing.period_type))
      add(items, item('grok-weekly-usage', '周用量', billing.usage_percent, percentText))
      add(items, item('grok-weekly-period', '周账期', billing.period_start && billing.period_end ? `${dateText(billing.period_start)} - ${dateText(billing.period_end)}` : undefined))
      add(items, item('grok-monthly-usage', '月用量', billing.used_percent, percentText))
      add(items, item('grok-monthly-cents', '月额度（分）', billing.monthly_limit_cents, numberText))
      add(items, item('grok-used-cents', '已用（分）', billing.used_cents, numberText))
      add(items, item('grok-included-cents', '套餐内已用（分）', billing.included_used_cents, numberText))
      add(items, item('grok-monthly-period', '月账期', billing.billing_period_start && billing.billing_period_end ? `${dateText(billing.billing_period_start)} - ${dateText(billing.billing_period_end)}` : undefined))
      add(items, item('grok-prepaid', '预付余额', billing.prepaid_balance, moneyText))
      add(items, item('grok-monthly-money', '月费用', billing.monthly_limit === undefined ? undefined : `${moneyText(billing.monthly_used ?? 0)} / ${moneyText(billing.monthly_limit)}`))
      add(items, item('grok-demand', '按需费用', billing.on_demand_cap === undefined ? undefined : `${moneyText(billing.on_demand_used ?? 0)} / ${moneyText(billing.on_demand_cap)}`))
      add(items, item('grok-topup', '充值方式', billing.top_up_method))
      add(items, item('grok-unified', '统一账单', billing.is_unified_billing_user, booleanText))
      add(items, item('grok-billing-source', '账单来源', billing.source))
      add(items, item('grok-status', '账单状态码', billing.status_code))
      add(items, item('grok-weekly-status', '周账单状态码', billing.weekly_status_code))
      add(items, item('grok-monthly-status', '月账单状态码', billing.monthly_status_code))
      add(items, item('grok-billing-fetched', '账单采样', billing.fetched_at || billing.updated_at, dateText))
      add(items, item('grok-weekly-updated', '周账单更新', billing.weekly_updated_at, dateText))
      add(items, item('grok-monthly-updated', '月账单更新', billing.monthly_updated_at, dateText))
      add(items, item('grok-partial', '部分数据', billing.partial, booleanText, billing.partial ? 'warning' : 'good'))
      add(items, item('grok-failed-windows', '失败窗口', billing.failed_windows))
      for (const product of billing.product_usage || []) {
        add(items, item(`grok-product-${product.product}`, product.product || '产品', product.usage_percent, percentText))
      }
    }
    addGroup(groups, 'grok-details', 'Grok 详情', items)
  }

  if (selected.has('ollama-details')) {
    const state = account.ollama_cloud_usage
    const snapshot = state?.snapshot
    const items: AccountDetailItem[] = []
    add(items, item('ollama-eligible', '支持云用量', state?.eligible, booleanText))
    add(items, item('ollama-configured', '已配置', state?.configured, booleanText))
    add(items, item('ollama-auto', '自动刷新', state?.auto_refresh_enabled, booleanText))
    add(items, item('ollama-key', '加密密钥可用', state?.encryption_key_configured, booleanText))
    add(items, item('ollama-status', '快照状态', snapshot?.status))
    add(items, item('ollama-plan', '套餐', snapshot?.data?.plan))
    add(items, item('ollama-balance', '余额', snapshot?.data?.balance))
    add(items, item('ollama-fetched', '采样时间', snapshot?.fetched_at, dateText))
    add(items, item('ollama-attempt', '最后尝试', snapshot?.last_attempt_at, dateText))
    add(items, item('ollama-next', '下次刷新', snapshot?.next_refresh_at, dateText))
    add(items, item('ollama-failures', '连续失败', snapshot?.failure_count))
    add(items, item('ollama-http', 'HTTP 状态', snapshot?.http_status))
    add(items, item('ollama-error', '最后错误', snapshot?.last_error))
    for (const model of snapshot?.data?.models || []) {
      add(items, item(`ollama-model-${model.model}-${model.window}`, model.model || '模型', `${model.window || '窗口'} · ${numberText(model.requests ?? 0)} 请求`))
    }
    addGroup(groups, 'ollama-details', 'Ollama 详情', items)
  }

  if (selected.has('extension-fields')) {
    const items: AccountDetailItem[] = []
    flattenSafeFields(account.credentials || {}, 'credentials', items)
    flattenSafeFields(account.extra || {}, 'extra', items)
    addGroup(groups, 'extension-fields', '扩展字段', items)
  }

  return groups
}
