import type {
  AccountFloatPreference,
  AppSettings,
  BootstrapPayload,
  ConnectPayload,
  ConnectResult,
  DashboardApi,
  DashboardSnapshot,
  PublicSettings,
  TwoFactorPayload
} from '@shared/types'
import { DEFAULT_ACCOUNT_FLOAT } from '@shared/account-floats'
import { DEFAULT_DISPLAY_FIELDS } from '@shared/display-fields'

const baseSettings: PublicSettings = {
  serverUrl: 'https://sub2api.example.com',
  authMethod: 'api-key',
  email: 'admin@example.com',
  refreshIntervalSeconds: 60,
  alwaysOnTop: true,
  launchAtLogin: false,
  compactMode: false,
  opacity: 1,
  warningThreshold: 75,
  dangerThreshold: 90,
  theme: 'system',
  windowBounds: { width: 468, height: 760 },
  displayFields: [...DEFAULT_DISPLAY_FIELDS],
  accountFloats: {},
  hasSavedCredential: true,
  secureStorageAvailable: true
}

const future = (minutes: number): string => new Date(Date.now() + minutes * 60_000).toISOString()

function demoSnapshot(): DashboardSnapshot {
  return {
    fetchedAt: new Date().toISOString(),
    serverVersion: 'v0.1.146',
    usageErrors: {
      '7': '上游认证失效，请重新授权'
    },
    todayStats: {
      '1': { requests: 184, tokens: 3_820_000, cost: 7.42, standard_cost: 8.16, user_cost: 9.05 },
      '2': { requests: 96, tokens: 1_284_000, cost: 4.38, standard_cost: 4.82, user_cost: 5.21 },
      '3': { requests: 328, tokens: 892_000, cost: 2.14, standard_cost: 2.14, user_cost: 2.36 },
      '5': { requests: 72, tokens: 680_000, cost: 3.92, standard_cost: 4.12, user_cost: 4.55 },
      '6': { requests: 151, tokens: 2_120_000, cost: 5.34, standard_cost: 5.94, user_cost: 6.21 }
    },
    accountStats: {
      '1': {
        summary: {
          days: 30,
          actual_days_used: 27,
          total_cost: 186.42,
          total_user_cost: 214.18,
          total_standard_cost: 201.76,
          total_requests: 4821,
          total_tokens: 98_420_000,
          avg_daily_cost: 6.21,
          avg_daily_user_cost: 7.14,
          avg_daily_requests: 160.7,
          avg_daily_tokens: 3_280_667,
          avg_duration_ms: 2180,
          highest_cost_day: { date: '2026-08-22', label: '08/22', cost: 14.82, user_cost: 16.3, requests: 281 },
          highest_request_day: { date: '2026-08-24', label: '08/24', requests: 316, cost: 12.64, user_cost: 13.9 }
        },
        history: [
          { date: '2026-08-27', label: '08/27', requests: 184, tokens: 3820000, cost: 8.16, actual_cost: 7.42, user_cost: 9.05 },
          { date: '2026-08-26', label: '08/26', requests: 213, tokens: 4210000, cost: 9.08, actual_cost: 8.34, user_cost: 9.92 },
          { date: '2026-08-25', label: '08/25', requests: 176, tokens: 3580000, cost: 7.44, actual_cost: 6.91, user_cost: 8.12 }
        ],
        models: [
          { model: 'gpt-5.6', requests: 3180, input_tokens: 61200000, output_tokens: 14200000, cache_creation_tokens: 0, cache_read_tokens: 18300000, total_tokens: 93700000, cost: 184.2, actual_cost: 169.4, account_cost: 169.4 },
          { model: 'gpt-5.4-mini', requests: 1641, input_tokens: 2810000, output_tokens: 1040000, cache_creation_tokens: 0, cache_read_tokens: 870000, total_tokens: 4720000, cost: 17.56, actual_cost: 17.02, account_cost: 17.02 }
        ],
        endpoints: [
          { endpoint: '/v1/responses', requests: 4520, total_tokens: 96200000, cost: 196.44, actual_cost: 181.12 },
          { endpoint: '/v1/chat/completions', requests: 301, total_tokens: 2220000, cost: 5.32, actual_cost: 5.3 }
        ],
        upstream_endpoints: [
          { endpoint: '/backend-api/codex/responses', requests: 4821, total_tokens: 98420000, cost: 201.76, actual_cost: 186.42 }
        ]
      }
    },
    dataErrors: {},
    accounts: [
      {
        id: 1,
        name: 'Codex Pro · 主力',
        platform: 'openai',
        type: 'oauth',
        credentials: { email: 'work@example.com', plan_type: 'pro' },
        concurrency: 5,
        current_concurrency: 2,
        load_factor: 5,
        priority: 10,
        rate_multiplier: 0.92,
        scheduler_score: { base_score: 0.84, sticky_score: 1.12, sticky_weighted_enabled: true },
        notes: '生产环境主账号',
        groups: [{ id: 1, name: 'Codex 生产池', platform: 'openai' }],
        group_ids: [1],
        created_at: '2026-05-12T03:20:00Z',
        updated_at: new Date(Date.now() - 12 * 60_000).toISOString(),
        base_rpm: 30,
        current_rpm: 8,
        status: 'active',
        schedulable: true,
        last_used_at: new Date(Date.now() - 32_000).toISOString()
      },
      {
        id: 2,
        name: 'Claude Max 20x',
        platform: 'anthropic',
        type: 'oauth',
        credentials: { email: 'claude@example.com' },
        concurrency: 4,
        current_concurrency: 1,
        max_sessions: 8,
        active_sessions: 3,
        window_cost_limit: 40,
        current_window_cost: 12.8,
        status: 'active',
        schedulable: true
      },
      {
        id: 3,
        name: 'Gemini Ultra',
        platform: 'gemini',
        type: 'oauth',
        credentials: { email: 'gemini@example.com', tier_id: 'google_ai_ultra' },
        concurrency: 6,
        current_concurrency: 0,
        status: 'active',
        schedulable: true
      },
      {
        id: 4,
        name: 'Kimi Coding 01',
        platform: 'kimi',
        type: 'oauth',
        credentials: { account_mode: 'coding' },
        extra: {
          kimi_5h_used_percent: 58,
          kimi_5h_reset_at: future(96),
          kimi_weekly_used_percent: 94,
          kimi_weekly_reset_at: future(4_100),
          kimi_usage_updated_at: new Date().toISOString()
        },
        concurrency: 3,
        current_concurrency: 3,
        status: 'active',
        schedulable: true
      },
      {
        id: 5,
        name: 'Grok Heavy',
        platform: 'grok',
        type: 'oauth',
        credentials: { email: 'grok@example.com' },
        concurrency: 8,
        current_concurrency: 2,
        status: 'active',
        schedulable: true
      },
      {
        id: 6,
        name: 'Antigravity Pro',
        platform: 'antigravity',
        type: 'oauth',
        credentials: { email: 'gravity@example.com' },
        concurrency: 4,
        current_concurrency: 1,
        status: 'active',
        schedulable: true
      },
      {
        id: 7,
        name: 'Codex Team · 备用',
        platform: 'openai',
        type: 'oauth',
        credentials: { email: 'backup@example.com', plan_type: 'team' },
        concurrency: 5,
        current_concurrency: 0,
        status: 'error',
        error_message: 'refresh token expired',
        schedulable: false
      }
    ],
    usage: {
      '1': {
        source: 'active',
        updated_at: new Date().toISOString(),
        five_hour: {
          utilization: 64,
          resets_at: future(112),
          used_requests: 184,
          limit_requests: 300,
          window_stats: { requests: 184, tokens: 3_820_000, cost: 7.42, standard_cost: 8.16, user_cost: 9.05 }
        },
        seven_day: { utilization: 78, resets_at: future(4_320) }
      },
      '2': {
        source: 'passive',
        updated_at: new Date(Date.now() - 76_000).toISOString(),
        five_hour: { utilization: 22, resets_at: future(187) },
        seven_day: { utilization: 46, resets_at: future(6_900) },
        seven_day_sonnet: { utilization: 71, resets_at: future(5_200) }
      },
      '3': {
        source: 'active',
        updated_at: new Date().toISOString(),
        gemini_shared_minute: { utilization: 28, resets_at: future(1), used_requests: 28, limit_requests: 100 },
        gemini_shared_daily: { utilization: 87, resets_at: future(510), used_requests: 870, limit_requests: 1000 }
      },
      '5': {
        source: 'active',
        updated_at: new Date().toISOString(),
        grok_request_quota: { limit: 1000, remaining: 386, reset_at: future(310) },
        grok_token_quota: { limit: 2_000_000, remaining: 1_320_000, reset_at: future(310) },
        grok_billing: {
          period_type: 'weekly',
          usage_percent: 62,
          period_end: future(4_300),
          used_percent: 34,
          billing_period_end: future(19_000)
        },
        subscription_tier: 'SuperGrok Heavy'
      },
      '6': {
        source: 'active',
        updated_at: new Date().toISOString(),
        subscription_tier: 'PRO',
        ai_credits: [
          { credit_type: 'monthly', amount: 1840, minimum_balance: 100 },
          { credit_type: 'promotional', amount: 420, minimum_balance: 0 }
        ],
        antigravity_quota_details: {
          'gemini-2.5-pro': { display_name: 'Gemini 2.5 Pro', supports_images: true, supports_thinking: true, max_tokens: 1_048_576, max_output_tokens: 65_536, recommended: true }
        },
        antigravity_quota: {
          'gemini-2.5-pro': { utilization: 35, reset_time: future(380) },
          'claude-sonnet-4.5': { utilization: 81, reset_time: future(240) },
          'gemini-3-flash': { utilization: 18, reset_time: future(95) }
        }
      }
    }
  }
}

export function createDemoApi(): DashboardApi {
  let settings = { ...baseSettings }
  let connected = new URLSearchParams(window.location.search).get('screen') !== 'connect'

  const bootstrap = async (): Promise<BootstrapPayload> => ({
    settings,
    connection: {
      connected,
      serverUrl: settings.serverUrl,
      authMethod: settings.authMethod,
      displayName: connected ? 'Admin API Key' : undefined,
      serverVersion: connected ? 'v0.1.146' : undefined
    }
  })

  return {
    bootstrap,
    connect: async (payload: ConnectPayload): Promise<ConnectResult> => {
      connected = true
      settings = { ...settings, serverUrl: payload.serverUrl, authMethod: payload.authMethod }
      return {
        status: 'connected',
        connection: {
          connected: true,
          serverUrl: settings.serverUrl,
          authMethod: settings.authMethod,
          displayName: 'Admin API Key',
          serverVersion: 'v0.1.146'
        }
      }
    },
    completeTwoFactor: async (_payload: TwoFactorPayload): Promise<ConnectResult> => ({
      status: 'connected',
      connection: {
        connected: true,
        serverUrl: settings.serverUrl,
        authMethod: 'password',
        displayName: '管理员'
      }
    }),
    retrySavedConnection: async () => {
      connected = true
      return {
        connected: true,
        serverUrl: settings.serverUrl,
        authMethod: settings.authMethod,
        displayName: 'Admin API Key',
        serverVersion: 'v0.1.146'
      }
    },
    disconnect: async () => {
      connected = false
      return bootstrap()
    },
    refresh: async () => demoSnapshot(),
    getLatestDashboard: async () => demoSnapshot(),
    updateSettings: async (patch: Partial<AppSettings>) => {
      settings = { ...settings, ...patch }
      return settings
    },
    setAlwaysOnTop: async (value: boolean) => {
      settings.alwaysOnTop = value
      return value
    },
    setCompactMode: async (value: boolean) => {
      settings.compactMode = value
      return value
    },
    openServer: async () => undefined,
    hideWindow: async () => undefined,
    openAccountFloat: async (accountId: number) => {
      const key = String(accountId)
      const preference: AccountFloatPreference = {
        ...DEFAULT_ACCOUNT_FLOAT,
        ...settings.accountFloats[key],
        open: true
      }
      settings = {
        ...settings,
        accountFloats: { ...settings.accountFloats, [key]: preference }
      }
      return preference
    },
    closeAccountFloat: async (accountId: number) => {
      const key = String(accountId)
      const preference: AccountFloatPreference = {
        ...DEFAULT_ACCOUNT_FLOAT,
        ...settings.accountFloats[key],
        open: false
      }
      settings = {
        ...settings,
        accountFloats: { ...settings.accountFloats, [key]: preference }
      }
      return preference
    },
    updateAccountFloat: async (accountId: number, patch: Partial<AccountFloatPreference>) => {
      const key = String(accountId)
      const preference: AccountFloatPreference = {
        ...DEFAULT_ACCOUNT_FLOAT,
        ...settings.accountFloats[key],
        ...patch
      }
      settings = {
        ...settings,
        accountFloats: { ...settings.accountFloats, [key]: preference }
      }
      return preference
    },
    onRefreshRequested: () => () => undefined,
    onDashboardUpdated: () => () => undefined,
    onSettingsChanged: () => () => undefined
  }
}

export { demoSnapshot }
