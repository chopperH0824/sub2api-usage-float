import { describe, expect, it } from 'vitest'
import type { AccountUsageInfo, Sub2ApiAccount } from '../src/shared/types'
import { accountSeverity, getCapacityMetrics, getUsageWindows } from '../src/shared/usage'

function account(overrides: Partial<Sub2ApiAccount> = {}): Sub2ApiAccount {
  return {
    id: 1,
    name: 'Codex Pro 01',
    platform: 'openai',
    type: 'oauth',
    concurrency: 5,
    current_concurrency: 2,
    status: 'active',
    schedulable: true,
    ...overrides
  }
}

describe('getUsageWindows', () => {
  it('prefers normalized live windows over account snapshots', () => {
    const source = account({
      extra: {
        codex_5h_used_percent: 31,
        codex_5h_reset_at: '2030-01-01T00:00:00Z'
      }
    })
    const usage: AccountUsageInfo = {
      source: 'active',
      five_hour: { utilization: 44, resets_at: '2030-01-01T01:00:00Z' },
      seven_day: { utilization: 68, resets_at: '2030-01-07T00:00:00Z' }
    }

    const windows = getUsageWindows(source, usage)
    expect(windows.map((window) => window.id)).toEqual(['5h', '7d'])
    expect(windows[0].usedPercent).toBe(44)
    expect(windows[0].source).toBe('active')
  })

  it('normalizes passive Anthropic fractions into percentages', () => {
    const windows = getUsageWindows(account({
      platform: 'anthropic',
      type: 'setup-token',
      session_window_end: '2030-01-01T00:00:00Z',
      extra: {
        session_window_utilization: 0.42,
        passive_usage_7d_utilization: 0.77,
        passive_usage_7d_reset: 1_893_456_000
      }
    }))
    expect(windows.find((window) => window.id === '5h')?.usedPercent).toBe(42)
    expect(windows.find((window) => window.id === '7d')?.usedPercent).toBe(77)
  })

  it('reads Chinese coding-plan snapshots', () => {
    const windows = getUsageWindows(account({
      platform: 'kimi',
      extra: {
        kimi_5h_used_percent: 12,
        kimi_weekly_used_percent: 65,
        kimi_weekly_reset_at: '2030-01-07T00:00:00Z'
      }
    }))
    expect(windows.map((window) => [window.id, window.usedPercent])).toEqual([
      ['5h', 12],
      ['weekly', 65]
    ])
  })
})

describe('capacity and severity', () => {
  it('collects configured capacity limits only', () => {
    const metrics = getCapacityMetrics(account({
      base_rpm: 20,
      current_rpm: 7,
      quota_weekly_limit: 100,
      quota_weekly_used: 34
    }))
    expect(metrics.map((metric) => metric.id)).toEqual(['concurrency', 'rpm', 'weekly-quota'])
  })

  it('marks high usage and unschedulable accounts', () => {
    const source = account()
    expect(accountSeverity(source, [{ id: '5h', label: '5H', usedPercent: 91 }], 75, 90)).toBe('danger')
    expect(accountSeverity({ ...source, schedulable: false }, [], 75, 90)).toBe('offline')
  })
})
