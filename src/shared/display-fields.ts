import type { DisplayFieldId } from './types'

export interface DisplayFieldOption {
  id: DisplayFieldId
  label: string
  description: string
}

export interface DisplayFieldGroup {
  id: string
  label: string
  options: readonly DisplayFieldOption[]
}

export const DISPLAY_FIELD_GROUPS: readonly DisplayFieldGroup[] = [
  {
    id: 'realtime',
    label: '实时额度',
    options: [
      { id: 'usage-windows', label: '额度窗口', description: '5H、7D、月额度及平台模型额度' },
      { id: 'window-requests', label: '窗口请求', description: '窗口内请求数或请求配额' },
      { id: 'window-tokens', label: '窗口 Token', description: '窗口内 Token 用量' },
      { id: 'window-costs', label: '窗口成本', description: '标准、账号和用户成本' },
      { id: 'usage-sample', label: '采样状态', description: '主动/被动采样及更新时间' }
    ]
  },
  {
    id: 'today',
    label: '今日统计',
    options: [
      { id: 'today-requests', label: '今日请求', description: 'Sub2API 今日请求总数' },
      { id: 'today-tokens', label: '今日 Token', description: 'Sub2API 今日 Token 总数' },
      { id: 'today-costs', label: '今日成本', description: '今日标准、账号和用户成本' }
    ]
  },
  {
    id: 'period',
    label: '30 天统计',
    options: [
      { id: 'period-summary', label: '汇总与日均', description: '请求、Token、成本、时延和峰值日' },
      { id: 'period-history', label: '每日历史', description: '最近 30 天逐日统计' },
      { id: 'period-models', label: '模型明细', description: '按模型统计请求、Token 和成本' },
      { id: 'period-endpoints', label: '接口明细', description: '客户端与上游接口统计' }
    ]
  },
  {
    id: 'capacity',
    label: '容量与限制',
    options: [
      { id: 'capacity-concurrency', label: '并发', description: '当前并发与账号上限' },
      { id: 'capacity-rpm', label: 'RPM', description: '当前分钟请求数与上限' },
      { id: 'capacity-sessions', label: '活跃会话', description: '活跃会话数与上限' },
      { id: 'capacity-window-cost', label: '窗口费用', description: '当前窗口费用与限制' },
      { id: 'capacity-daily', label: '日容量', description: '日配额已用与上限' },
      { id: 'capacity-weekly', label: '周容量', description: '周配额已用与上限' },
      { id: 'capacity-total', label: '总容量', description: '账号总配额已用与上限' }
    ]
  },
  {
    id: 'account',
    label: '账号与调度',
    options: [
      { id: 'account-identity', label: '账号标识', description: 'ID、平台、类型和脱敏账号信息' },
      { id: 'account-subscription', label: '订阅套餐', description: '套餐、父账号和订阅到期信息' },
      { id: 'account-scheduling', label: '调度信息', description: '优先级、负载、倍率和调度分' },
      { id: 'account-groups', label: '账号分组', description: '所属分组及组内优先级' },
      { id: 'account-notes', label: '备注', description: '账号备注' },
      { id: 'account-lifecycle', label: '生命周期', description: '创建、更新、调用和到期时间' },
      { id: 'account-cooldowns', label: '限流与冷却', description: '限流、过载和临时不可调度状态' },
      { id: 'account-session-policy', label: '会话策略', description: '窗口、会话、RPM 和队列策略' },
      { id: 'account-quota-policy', label: '配额策略', description: '重置周期、时区和通知阈值' },
      { id: 'account-routing', label: '代理与影子账号', description: '代理、回退、父账号和配额维度' },
      { id: 'account-features', label: '高级能力', description: 'TLS、会话掩码、缓存 TTL 和凭据状态' }
    ]
  },
  {
    id: 'platform',
    label: '平台详情',
    options: [
      { id: 'usage-health', label: '上游健康', description: '错误码、封禁、验证和重新授权状态' },
      { id: 'antigravity-details', label: '模型能力', description: 'Antigravity 模型能力与转发规则' },
      { id: 'ai-credits', label: 'AI Credits', description: 'Antigravity Credits 余额' },
      { id: 'grok-details', label: 'Grok 详情', description: '配额、探测、本地用量和账单' },
      { id: 'ollama-details', label: 'Ollama 详情', description: '计划、余额、模型和采样状态' },
      { id: 'extension-fields', label: '扩展字段', description: 'Sub2API 返回的其他非敏感字段' }
    ]
  }
]

export const ALL_DISPLAY_FIELDS: readonly DisplayFieldId[] = DISPLAY_FIELD_GROUPS.flatMap(
  (group) => group.options.map((option) => option.id)
)

export const DEFAULT_FLOAT_DISPLAY_FIELDS: readonly DisplayFieldId[] = [
  'usage-windows',
  'window-requests',
  'window-tokens',
  'usage-sample',
  'today-requests',
  'today-tokens',
  'capacity-concurrency'
]

export const DEFAULT_DISPLAY_FIELDS: readonly DisplayFieldId[] = [
  'usage-windows',
  'window-requests',
  'window-tokens',
  'usage-sample',
  'today-requests',
  'today-tokens',
  'today-costs',
  'capacity-concurrency',
  'capacity-rpm',
  'capacity-sessions',
  'capacity-window-cost',
  'capacity-daily',
  'capacity-weekly',
  'capacity-total',
  'account-subscription',
  'account-cooldowns'
]

const displayFieldSet = new Set<string>(ALL_DISPLAY_FIELDS)

export const PERIOD_DISPLAY_FIELDS = new Set<DisplayFieldId>([
  'period-summary',
  'period-history',
  'period-models',
  'period-endpoints'
])

export const TODAY_DISPLAY_FIELDS = new Set<DisplayFieldId>([
  'today-requests',
  'today-tokens',
  'today-costs'
])

export const CAPACITY_DISPLAY_FIELDS: Record<string, DisplayFieldId> = {
  concurrency: 'capacity-concurrency',
  rpm: 'capacity-rpm',
  sessions: 'capacity-sessions',
  'window-cost': 'capacity-window-cost',
  'daily-quota': 'capacity-daily',
  'weekly-quota': 'capacity-weekly',
  'total-quota': 'capacity-total'
}

export interface DisplayPreset {
  id: string
  label: string
  iconName: string
  description: string
  fields: readonly DisplayFieldId[]
  dashboardSize: { width: number; height: number }
  floatSize: 'small' | 'medium' | 'large'
}

export const DISPLAY_PRESETS: readonly DisplayPreset[] = [
  {
    id: 'minimal',
    label: '极简',
    iconName: 'Zap',
    description: '仅看实时额度窗口与并发状态，超省空间',
    fields: [
      'usage-windows',
      'usage-sample',
      'capacity-concurrency'
    ],
    dashboardSize: { width: 420, height: 560 },
    floatSize: 'small'
  },
  {
    id: 'standard',
    label: '标准',
    iconName: 'LayoutDashboard',
    description: '核心额度、今日请求/Token、并发与容量限制',
    fields: [...DEFAULT_DISPLAY_FIELDS],
    dashboardSize: { width: 468, height: 760 },
    floatSize: 'medium'
  },
  {
    id: 'costs',
    label: '成本',
    iconName: 'CircleDollarSign',
    description: '聚焦窗口成本、今日成本、30天历史与模型明细',
    fields: [
      'usage-windows',
      'window-costs',
      'today-costs',
      'today-requests',
      'today-tokens',
      'period-summary',
      'period-history',
      'period-models',
      'capacity-window-cost',
      'capacity-daily',
      'capacity-weekly',
      'capacity-total'
    ],
    dashboardSize: { width: 520, height: 820 },
    floatSize: 'large'
  },
  {
    id: 'platform',
    label: '平台',
    iconName: 'Sparkles',
    description: '聚焦各平台专属配额、AI Credits与模型能力',
    fields: [
      'usage-windows',
      'usage-sample',
      'capacity-concurrency',
      'antigravity-details',
      'ai-credits',
      'grok-details',
      'ollama-details',
      'extension-fields',
      'usage-health'
    ],
    dashboardSize: { width: 480, height: 780 },
    floatSize: 'medium'
  },
  {
    id: 'expert',
    label: '全能',
    iconName: 'Layers',
    description: '全选 36 项：调度分、代理、影子账号、全量详情',
    fields: [...ALL_DISPLAY_FIELDS],
    dashboardSize: { width: 580, height: 900 },
    floatSize: 'large'
  }
]

export function isDisplayFieldId(value: unknown): value is DisplayFieldId {
  return typeof value === 'string' && displayFieldSet.has(value)
}

export function normalizeDisplayFields(
  value: unknown,
  fallback: readonly DisplayFieldId[] = DEFAULT_DISPLAY_FIELDS
): DisplayFieldId[] {
  if (!Array.isArray(value)) return [...fallback]
  const selected = new Set(value.filter(isDisplayFieldId))
  return ALL_DISPLAY_FIELDS.filter((field) => selected.has(field))
}

export function hasAnyDisplayField(
  fields: readonly DisplayFieldId[],
  candidates: ReadonlySet<DisplayFieldId>
): boolean {
  return fields.some((field) => candidates.has(field))
}
