import type {
  AppSettings,
  BootstrapPayload,
  ConnectPayload,
  ConnectResult,
  DashboardApi,
  DashboardSnapshot,
  PublicSettings,
  TwoFactorPayload
} from '@shared/types'

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
    accounts: [
      {
        id: 1,
        name: 'Codex Pro · 主力',
        platform: 'openai',
        type: 'oauth',
        credentials: { email: 'work@example.com', plan_type: 'pro' },
        concurrency: 5,
        current_concurrency: 2,
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
        five_hour: { utilization: 64, resets_at: future(112), window_stats: { tokens: 3_820_000 } },
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
    onRefreshRequested: () => () => undefined
  }
}

export { demoSnapshot }
