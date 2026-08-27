import { describe, expect, it } from 'vitest'
import { getAccountDetailGroups, getTodayDisplayItems } from '../src/shared/account-details'
import { ALL_DISPLAY_FIELDS } from '../src/shared/display-fields'
import type { AccountUsageInfo, AccountUsageStatsResponse, Sub2ApiAccount } from '../src/shared/types'

const account: Sub2ApiAccount = {
  id: 7,
  name: 'Codex Team',
  notes: '生产账号',
  platform: 'openai',
  type: 'oauth',
  credentials: {
    email: 'team@example.com',
    plan_type: 'team',
    api_key: 'must-not-render'
  },
  credentials_status: { has_access_token: true },
  extra: {
    privacy_mode: 'standard',
    public_flag: true,
    access_token: 'must-not-render',
    service_account_json: 'must-not-render',
    nested: {
      cookie: 'must-not-render',
      sample_count: 12
    }
  },
  concurrency: 8,
  current_concurrency: 3,
  priority: 20,
  rate_multiplier: 0.9,
  status: 'active',
  schedulable: true,
  created_at: '2026-08-01T00:00:00Z',
  updated_at: '2026-08-27T00:00:00Z',
  groups: [{ id: 2, name: '生产池' }]
}

const usage: AccountUsageInfo = {
  source: 'active',
  updated_at: '2026-08-27T04:00:00Z',
  subscription_tier: 'TEAM',
  ai_credits: [{ credit_type: 'monthly', amount: 500, minimum_balance: 50 }],
  grok_local_usage_24h: { requests: 12, tokens: 34000, cost: 1.2, standard_cost: 1.4, user_cost: 1.6 }
}

const stats: AccountUsageStatsResponse = {
  summary: {
    days: 30,
    actual_days_used: 20,
    total_cost: 50,
    total_user_cost: 60,
    total_standard_cost: 55,
    total_requests: 1000,
    total_tokens: 2_000_000,
    avg_daily_cost: 1.67,
    avg_daily_user_cost: 2,
    avg_daily_requests: 33,
    avg_daily_tokens: 66_666,
    avg_duration_ms: 1200
  },
  history: [{
    date: '2026-08-27',
    label: '08/27',
    requests: 42,
    tokens: 88000,
    cost: 2.2,
    actual_cost: 2,
    user_cost: 2.4
  }],
  models: [{
    model: 'gpt-5.6',
    requests: 1000,
    input_tokens: 1_500_000,
    output_tokens: 500_000,
    cache_creation_tokens: 0,
    cache_read_tokens: 0,
    total_tokens: 2_000_000,
    cost: 55,
    actual_cost: 50,
    account_cost: 50
  }],
  endpoints: [{ endpoint: '/v1/responses', requests: 1000, total_tokens: 2_000_000, cost: 55, actual_cost: 50 }],
  upstream_endpoints: []
}

describe('account display details', () => {
  it('renders every selected safe data group and filters credential-like extensions', () => {
    const groups = getAccountDetailGroups(account, usage, stats, [...ALL_DISPLAY_FIELDS])
    const labels = groups.map((group) => group.label)
    const rendered = JSON.stringify(groups)
    const extensions = JSON.stringify(groups.find((group) => group.id === 'extension-fields'))

    expect(labels).toContain('30 天汇总')
    expect(labels).toContain('每日历史')
    expect(labels).toContain('模型明细')
    expect(labels).toContain('接口明细')
    expect(labels).toContain('账号标识')
    expect(labels).toContain('AI Credits')
    expect(rendered).toContain('privacy_mode')
    expect(rendered).toContain('sample_count')
    expect(rendered).not.toContain('must-not-render')
    expect(extensions).not.toContain('access_token')
    expect(extensions).not.toContain('api_key')
    expect(extensions).not.toContain('service_account_json')
    expect(extensions).not.toContain('cookie')
  })

  it('builds granular today items from only the selected fields', () => {
    const items = getTodayDisplayItems(
      { requests: 9, tokens: 12000, cost: 1.2, standard_cost: 1.4, user_cost: 1.6 },
      ['today-requests', 'today-costs']
    )

    expect(items.map((entry) => entry.id)).toEqual([
      'today-requests',
      'today-account-cost',
      'today-standard-cost',
      'today-user-cost'
    ])
    expect(items.some((entry) => entry.id === 'today-tokens')).toBe(false)
  })
})
