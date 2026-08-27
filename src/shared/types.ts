export type AuthMethod = 'api-key' | 'password'
export type ThemeMode = 'system' | 'light' | 'dark'
export type AccountFloatSize = 'small' | 'medium' | 'large'

export interface WindowBounds {
  x?: number
  y?: number
  width: number
  height: number
}

export interface AccountFloatPreference {
  open: boolean
  opacity: number
  alwaysOnTop: boolean
  size: AccountFloatSize
  bounds?: WindowBounds
}

export interface AppSettings {
  serverUrl: string
  authMethod: AuthMethod
  email: string
  refreshIntervalSeconds: number
  alwaysOnTop: boolean
  launchAtLogin: boolean
  compactMode: boolean
  opacity: number
  warningThreshold: number
  dangerThreshold: number
  theme: ThemeMode
  windowBounds: WindowBounds
  accountFloats: Record<string, AccountFloatPreference>
}

export interface PublicSettings extends AppSettings {
  hasSavedCredential: boolean
  secureStorageAvailable: boolean
}

export interface ConnectionState {
  connected: boolean
  serverUrl: string
  authMethod: AuthMethod
  displayName?: string
  email?: string
  serverVersion?: string
  error?: string
}

export interface BootstrapPayload {
  settings: PublicSettings
  connection: ConnectionState
}

export interface ApiKeyConnectPayload {
  authMethod: 'api-key'
  serverUrl: string
  apiKey: string
}

export interface PasswordConnectPayload {
  authMethod: 'password'
  serverUrl: string
  email: string
  password: string
}

export type ConnectPayload = ApiKeyConnectPayload | PasswordConnectPayload

export type ConnectResult =
  | { status: 'connected'; connection: ConnectionState }
  | { status: 'requires-2fa'; emailMasked: string }

export interface TwoFactorPayload {
  code: string
}

export interface Sub2ApiUser {
  id: number
  email: string
  username?: string
  role: 'admin' | 'user' | string
}

export interface AuthTokens {
  access_token: string
  refresh_token?: string
  expires_in?: number
  token_type?: string
  user?: Sub2ApiUser
}

export interface TwoFactorChallenge {
  requires_2fa: true
  temp_token: string
  user_email_masked?: string
}

export interface Sub2ApiEnvelope<T> {
  code: number | string
  message?: string
  reason?: string
  metadata?: Record<string, unknown>
  data?: T
}

export interface PaginatedResponse<T> {
  items: T[]
  total: number
  page: number
  page_size: number
  pages: number
}

export interface WindowStats {
  requests?: number
  tokens?: number
  cost?: number
  standard_cost?: number
  user_cost?: number
}

export interface UsageProgress {
  utilization?: number
  resets_at?: string | null
  remaining_seconds?: number
  window_stats?: WindowStats | null
  used_requests?: number
  limit_requests?: number
}

export interface GrokQuotaWindow {
  limit?: number | null
  remaining?: number | null
  reset_unix?: number | null
  reset_at?: string | null
}

export interface AccountUsageInfo {
  source?: 'passive' | 'active'
  updated_at?: string | null
  five_hour?: UsageProgress | null
  seven_day?: UsageProgress | null
  seven_day_sonnet?: UsageProgress | null
  seven_day_fable?: UsageProgress | null
  thirty_day?: UsageProgress | null
  gemini_shared_daily?: UsageProgress | null
  gemini_pro_daily?: UsageProgress | null
  gemini_flash_daily?: UsageProgress | null
  gemini_shared_minute?: UsageProgress | null
  gemini_pro_minute?: UsageProgress | null
  gemini_flash_minute?: UsageProgress | null
  antigravity_quota?: Record<string, { utilization?: number; reset_time?: string }> | null
  grok_request_quota?: GrokQuotaWindow | null
  grok_token_quota?: GrokQuotaWindow | null
  grok_retry_after_seconds?: number | null
  grok_entitlement_status?: string
  grok_quota_snapshot_state?: string
  grok_local_usage?: WindowStats | null
  grok_local_usage_24h?: WindowStats | null
  grok_local_usage_7d?: WindowStats | null
  grok_local_usage_monthly?: WindowStats | null
  grok_free_token_limit?: number
  grok_billing?: Record<string, unknown> | null
  subscription_tier?: string
  subscription_tier_raw?: string
  ai_credits?: Array<{ credit_type?: string; amount?: number; minimum_balance?: number }> | null
  is_forbidden?: boolean
  needs_verify?: boolean
  is_banned?: boolean
  needs_reauth?: boolean
  error_code?: string
  error?: string
}

export interface Sub2ApiAccount {
  id: number
  name: string
  notes?: string | null
  platform: string
  type: string
  credentials?: Record<string, unknown>
  extra?: Record<string, unknown>
  concurrency: number
  current_concurrency?: number
  load_factor?: number | null
  priority?: number
  rate_multiplier?: number
  status: 'active' | 'inactive' | 'error' | string
  error_message?: string | null
  last_used_at?: string | null
  expires_at?: number | null
  updated_at?: string
  schedulable: boolean
  rate_limited_at?: string | null
  rate_limit_reset_at?: string | null
  overload_until?: string | null
  temp_unschedulable_until?: string | null
  temp_unschedulable_reason?: string | null
  session_window_start?: string | null
  session_window_end?: string | null
  session_window_status?: string | null
  window_cost_limit?: number | null
  window_cost_sticky_reserve?: number | null
  current_window_cost?: number | null
  max_sessions?: number | null
  active_sessions?: number | null
  session_idle_timeout_minutes?: number | null
  base_rpm?: number | null
  current_rpm?: number | null
  quota_limit?: number | null
  quota_used?: number | null
  quota_daily_limit?: number | null
  quota_daily_used?: number | null
  quota_weekly_limit?: number | null
  quota_weekly_used?: number | null
  quota_daily_reset_at?: string | null
  quota_weekly_reset_at?: string | null
  parent_account_id?: number | null
  quota_dimension?: string
  groups?: Array<{ id: number; name: string }>
  group_ids?: number[]
  ollama_cloud_usage?: {
    snapshot?: {
      status?: string
      data?: {
        plan?: string
        five_hour?: { used_percent?: number; reset_at?: string }
        seven_day?: { used_percent?: number; reset_at?: string }
        balance?: string
      }
      fetched_at?: string
      last_error?: string
    }
  }
}

export interface DashboardSnapshot {
  accounts: Sub2ApiAccount[]
  usage: Record<string, AccountUsageInfo>
  usageErrors: Record<string, string>
  fetchedAt: string
  serverVersion?: string
}

export interface UsageWindow {
  id: string
  label: string
  usedPercent: number
  resetAt?: string | null
  updatedAt?: string | null
  detail?: string
  source?: 'active' | 'passive' | 'snapshot'
}

export type AccountSeverity = 'healthy' | 'warning' | 'danger' | 'offline'

export interface CapacityMetric {
  id: string
  label: string
  current: number
  limit: number
  unit?: string
  resetAt?: string | null
}

export interface DashboardApi {
  bootstrap(): Promise<BootstrapPayload>
  connect(payload: ConnectPayload): Promise<ConnectResult>
  completeTwoFactor(payload: TwoFactorPayload): Promise<ConnectResult>
  retrySavedConnection(): Promise<ConnectionState>
  disconnect(): Promise<BootstrapPayload>
  refresh(forceUsage?: boolean): Promise<DashboardSnapshot>
  getLatestDashboard(): Promise<DashboardSnapshot>
  updateSettings(patch: Partial<AppSettings>): Promise<PublicSettings>
  setAlwaysOnTop(value: boolean): Promise<boolean>
  setCompactMode(value: boolean): Promise<boolean>
  openServer(): Promise<void>
  hideWindow(): Promise<void>
  openAccountFloat(accountId: number): Promise<AccountFloatPreference>
  closeAccountFloat(accountId: number): Promise<AccountFloatPreference>
  updateAccountFloat(accountId: number, patch: Partial<AccountFloatPreference>): Promise<AccountFloatPreference>
  onRefreshRequested(callback: () => void): () => void
  onDashboardUpdated(callback: (snapshot: DashboardSnapshot) => void): () => void
  onSettingsChanged(callback: (settings: PublicSettings) => void): () => void
}
