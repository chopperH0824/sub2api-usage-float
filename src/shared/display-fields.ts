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
    id: 'quota',
    label: '额度与容量',
    options: [
      { id: 'usage-windows', label: '额度窗口', description: '5H、7D、月额度及平台模型额度' },
      { id: 'window-requests', label: '窗口请求', description: '窗口内请求数或请求配额' },
      { id: 'window-tokens', label: '窗口 Token', description: '窗口内 Token 用量' },
      { id: 'window-costs', label: '窗口成本', description: '标准、账号和用户成本' },
      { id: 'capacity-daily', label: '日容量', description: '日配额已用与上限' },
      { id: 'capacity-weekly', label: '周容量', description: '周配额已用与上限' },
      { id: 'capacity-total', label: '总容量', description: '账号总配额已用与上限' }
    ]
  },
  {
    id: 'load',
    label: '实时负载',
    options: [
      { id: 'capacity-concurrency', label: '并发', description: '当前并发与账号上限' },
      { id: 'capacity-rpm', label: 'RPM', description: '当前分钟请求数与上限' },
      { id: 'capacity-sessions', label: '活跃会话', description: '活跃会话数与上限' },
      { id: 'capacity-window-cost', label: '窗口费用', description: '当前窗口费用与限制' },
      { id: 'usage-sample', label: '更新时间', description: '用量采样来源及最后更新时间' }
    ]
  },
  {
    id: 'today',
    label: '今日消耗',
    options: [
      { id: 'today-requests', label: '今日请求', description: 'Sub2API 今日请求总数' },
      { id: 'today-tokens', label: '今日 Token', description: 'Sub2API 今日 Token 总数' },
      { id: 'today-costs', label: '今日成本', description: '今日标准、账号和用户成本' }
    ]
  },
  {
    id: 'period',
    label: '趋势与归因',
    options: [
      { id: 'period-summary', label: '30 天汇总', description: '请求、Token、成本、时延和峰值日' },
      { id: 'period-history', label: '每日趋势', description: '最近 30 天逐日消耗趋势' },
      { id: 'period-models', label: '模型排行', description: '按模型归因请求、Token 和成本' },
      { id: 'period-endpoints', label: '接口排行', description: '客户端与上游接口消耗归因' }
    ]
  },
  {
    id: 'account',
    label: '调度与账号',
    options: [
      { id: 'account-subscription', label: '订阅套餐', description: '套餐、母账号和订阅到期信息' },
      { id: 'account-scheduling', label: '调度状态', description: '可调度性、优先级、负载和调度分' },
      { id: 'account-groups', label: '账号分组', description: '所属分组及组内优先级' },
      { id: 'account-notes', label: '运维备注', description: '账号备注与使用说明' },
      { id: 'account-cooldowns', label: '限流与冷却', description: '限流、过载和临时暂停原因' },
      { id: 'account-routing', label: '路由与代理', description: '代理状态、回退来源和母账号关系' }
    ]
  },
  {
    id: 'health',
    label: '健康与平台',
    options: [
      { id: 'usage-health', label: '上游健康', description: '只展示需要处理的验证、封禁和授权异常' },
      { id: 'ai-credits', label: 'AI Credits', description: 'Antigravity Credits 余额与最低保留值' },
      { id: 'grok-details', label: 'Grok 配额与账单', description: '请求、Token、周期用量和费用' },
      { id: 'ollama-details', label: 'Ollama 用量', description: '套餐、余额、模型请求和异常' }
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
  'account-cooldowns',
  'usage-health'
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
    description: '只看实时额度、并发和需要处理的异常',
    fields: [
      'usage-windows',
      'capacity-concurrency',
      'usage-health'
    ],
    dashboardSize: { width: 420, height: 560 },
    floatSize: 'small'
  },
  {
    id: 'standard',
    label: '日常',
    iconName: 'LayoutDashboard',
    description: '核心额度、今日消耗、实时负载与健康状态',
    fields: [...DEFAULT_DISPLAY_FIELDS],
    dashboardSize: { width: 468, height: 760 },
    floatSize: 'medium'
  },
  {
    id: 'costs',
    label: '成本',
    iconName: 'CircleDollarSign',
    description: '聚焦窗口成本、今日成本、趋势、模型和平台账单',
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
      'capacity-total',
      'ai-credits',
      'grok-details',
      'ollama-details'
    ],
    dashboardSize: { width: 520, height: 820 },
    floatSize: 'large'
  },
  {
    id: 'operations',
    label: '调度',
    iconName: 'Network',
    description: '聚焦并发、调度、分组、冷却、代理与上游异常',
    fields: [
      'usage-windows',
      'usage-sample',
      'capacity-concurrency',
      'capacity-rpm',
      'capacity-sessions',
      'account-scheduling',
      'account-groups',
      'account-notes',
      'account-cooldowns',
      'account-routing',
      'usage-health'
    ],
    dashboardSize: { width: 500, height: 800 },
    floatSize: 'large'
  },
  {
    id: 'insights',
    label: '分析',
    iconName: 'ChartColumn',
    description: '趋势、模型与接口归因，兼顾平台账单信息',
    fields: [
      'usage-windows',
      'window-requests',
      'window-tokens',
      'window-costs',
      'today-requests',
      'today-tokens',
      'today-costs',
      'period-summary',
      'period-history',
      'period-models',
      'period-endpoints',
      'account-subscription',
      'ai-credits',
      'grok-details',
      'ollama-details',
      'usage-health'
    ],
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
