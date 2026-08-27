export type AuthMethod = 'api-key' | 'password'
export type ThemeMode = 'system' | 'light' | 'dark'
export type AccountFloatSize = 'small' | 'medium' | 'large'
export type DisplayFieldId =
  | 'usage-windows'
  | 'window-requests'
  | 'window-tokens'
  | 'window-costs'
  | 'usage-sample'
  | 'today-requests'
  | 'today-tokens'
  | 'today-costs'
  | 'period-summary'
  | 'period-history'
  | 'period-models'
  | 'period-endpoints'
  | 'capacity-concurrency'
  | 'capacity-rpm'
  | 'capacity-sessions'
  | 'capacity-window-cost'
  | 'capacity-daily'
  | 'capacity-weekly'
  | 'capacity-total'
  | 'account-identity'
  | 'account-subscription'
  | 'account-scheduling'
  | 'account-groups'
  | 'account-notes'
  | 'account-lifecycle'
  | 'account-cooldowns'
  | 'account-session-policy'
  | 'account-quota-policy'
  | 'account-routing'
  | 'account-features'
  | 'usage-health'
  | 'antigravity-details'
  | 'ai-credits'
  | 'grok-details'
  | 'ollama-details'
  | 'extension-fields'

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
  displayFields: DisplayFieldId[]
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
  displayFields: DisplayFieldId[]
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

export interface AntigravityModelDetail {
  display_name?: string
  supports_images?: boolean
  supports_thinking?: boolean
  thinking_budget?: number
  recommended?: boolean
  max_tokens?: number
  max_output_tokens?: number
  supported_mime_types?: Record<string, boolean>
}

export interface GrokBillingSummary {
  period_type?: string
  usage_percent?: number | null
  period_start?: string
  period_end?: string
  product_usage?: Array<{ product?: string; usage_percent?: number | null }>
  monthly_limit_cents?: number | null
  used_cents?: number | null
  included_used_cents?: number | null
  billing_period_start?: string
  billing_period_end?: string
  used_percent?: number | null
  prepaid_balance?: number | null
  monthly_limit?: number | null
  monthly_used?: number | null
  on_demand_cap?: number | null
  on_demand_used?: number | null
  top_up_method?: string
  is_unified_billing_user?: boolean
  plan?: string
  status_code?: number
  weekly_status_code?: number
  monthly_status_code?: number
  source?: string
  fetched_at?: string
  updated_at?: string
  weekly_updated_at?: string
  monthly_updated_at?: string
  partial?: boolean
  failed_windows?: string[]
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
  antigravity_quota_details?: Record<string, AntigravityModelDetail> | null
  model_forwarding_rules?: Record<string, string> | null
  grok_request_quota?: GrokQuotaWindow | null
  grok_token_quota?: GrokQuotaWindow | null
  grok_retry_after_seconds?: number | null
  grok_entitlement_status?: string
  grok_quota_snapshot_state?: string
  grok_last_quota_probe_at?: string
  grok_last_headers_seen_at?: string
  grok_last_status_code?: number
  grok_local_usage?: WindowStats | null
  grok_local_usage_24h?: WindowStats | null
  grok_local_usage_7d?: WindowStats | null
  grok_local_usage_monthly?: WindowStats | null
  grok_free_token_limit?: number
  grok_billing?: GrokBillingSummary | null
  subscription_tier?: string
  subscription_tier_raw?: string
  ai_credits?: Array<{ credit_type?: string; amount?: number; minimum_balance?: number }> | null
  is_forbidden?: boolean
  forbidden_reason?: string
  forbidden_type?: string
  validation_url?: string
  needs_verify?: boolean
  is_banned?: boolean
  needs_reauth?: boolean
  error_code?: string
  error?: string
}

export interface AccountSchedulerScore {
  base_score: number
  sticky_score?: number
  sticky_score_infinity?: boolean
  sticky_weighted_enabled: boolean
}

export interface AccountProxy {
  id: number
  name: string
  protocol: string
  host: string
  port: number
  status: string
  expires_at?: string | null
  fallback_mode?: string
}

export interface Sub2ApiAccount {
  id: number
  name: string
  notes?: string | null
  platform: string
  type: string
  credentials?: Record<string, unknown>
  credentials_status?: Record<string, boolean>
  extra?: Record<string, unknown>
  proxy_id?: number | null
  proxy_fallback_origin_id?: number | null
  proxy_fallback_origin_name?: string | null
  proxy?: AccountProxy | null
  concurrency: number
  current_concurrency?: number
  load_factor?: number | null
  scheduler_score?: AccountSchedulerScore | null
  scheduler_scores?: Array<AccountSchedulerScore & {
    group_id?: number | null
    group_name?: string
    group_priority?: number | null
  }> | null
  priority?: number
  rate_multiplier?: number
  status: 'active' | 'inactive' | 'error' | string
  error_message?: string | null
  last_used_at?: string | null
  expires_at?: number | null
  auto_pause_on_expired?: boolean
  created_at?: string
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
  rpm_strategy?: string | null
  rpm_sticky_buffer?: number | null
  user_msg_queue_mode?: string | null
  enable_tls_fingerprint?: boolean | null
  tls_fingerprint_profile_id?: number | null
  session_id_masking_enabled?: boolean | null
  cache_ttl_override_enabled?: boolean | null
  cache_ttl_override_target?: string | null
  custom_base_url_enabled?: boolean | null
  custom_base_url?: string | null
  quota_limit?: number | null
  quota_used?: number | null
  quota_daily_limit?: number | null
  quota_daily_used?: number | null
  quota_weekly_limit?: number | null
  quota_weekly_used?: number | null
  quota_daily_reset_mode?: string | null
  quota_daily_reset_hour?: number | null
  quota_weekly_reset_mode?: string | null
  quota_weekly_reset_day?: number | null
  quota_weekly_reset_hour?: number | null
  quota_reset_timezone?: string | null
  quota_daily_reset_at?: string | null
  quota_weekly_reset_at?: string | null
  quota_notify_daily_enabled?: boolean | null
  quota_notify_daily_threshold?: number | null
  quota_notify_weekly_enabled?: boolean | null
  quota_notify_weekly_threshold?: number | null
  quota_notify_total_enabled?: boolean | null
  quota_notify_total_threshold?: number | null
  parent_account_id?: number | null
  quota_dimension?: string
  parent_email?: string
  parent_plan_type?: string
  parent_privacy_mode?: string
  parent_subscription_expires_at?: string
  parent_chatgpt_account_id?: string
  account_groups?: Array<{ account_id?: number; group_id?: number; priority?: number }>
  groups?: Array<{ id: number; name: string; platform?: string }>
  group_ids?: number[]
  ollama_cloud_usage?: {
    account_id?: number
    eligible?: boolean
    configured?: boolean
    auto_refresh_enabled?: boolean
    encryption_key_configured?: boolean
    snapshot?: {
      status?: string
      data?: {
        plan?: string
        five_hour?: { used_percent?: number; reset_at?: string; reset_text?: string }
        seven_day?: { used_percent?: number; reset_at?: string; reset_text?: string }
        balance?: string
        models?: Array<{ model?: string; window?: string; requests?: number }>
      }
      fetched_at?: string
      last_attempt_at?: string
      next_refresh_at?: string
      failure_count?: number
      http_status?: number
      last_error?: string
    }
  }
}

export interface ModelStat {
  model: string
  requests: number
  input_tokens: number
  output_tokens: number
  cache_creation_tokens: number
  cache_read_tokens: number
  total_tokens: number
  cost: number
  actual_cost: number
  account_cost?: number
}

export interface EndpointStat {
  endpoint: string
  requests: number
  total_tokens: number
  cost: number
  actual_cost: number
}

export interface AccountUsageHistory {
  date: string
  label: string
  requests: number
  tokens: number
  cost: number
  actual_cost: number
  user_cost: number
}

export interface AccountUsageSummary {
  days: number
  actual_days_used: number
  total_cost: number
  total_user_cost: number
  total_standard_cost: number
  total_requests: number
  total_tokens: number
  avg_daily_cost: number
  avg_daily_user_cost: number
  avg_daily_requests: number
  avg_daily_tokens: number
  avg_duration_ms: number
  today?: { date: string; cost: number; user_cost: number; requests: number; tokens: number } | null
  highest_cost_day?: { date: string; label: string; cost: number; user_cost: number; requests: number } | null
  highest_request_day?: { date: string; label: string; requests: number; cost: number; user_cost: number } | null
}

export interface AccountUsageStatsResponse {
  history: AccountUsageHistory[]
  summary: AccountUsageSummary
  models: ModelStat[]
  endpoints: EndpointStat[]
  upstream_endpoints: EndpointStat[]
}

export interface DashboardSnapshot {
  accounts: Sub2ApiAccount[]
  usage: Record<string, AccountUsageInfo>
  usageErrors: Record<string, string>
  todayStats?: Record<string, WindowStats>
  accountStats?: Record<string, AccountUsageStatsResponse>
  dataErrors?: Record<string, string>
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
  stats?: WindowStats | null
  usedRequests?: number
  limitRequests?: number
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

export interface AccountDetailItem {
  id: string
  label: string
  value: string
  tone?: 'neutral' | 'good' | 'warning' | 'danger'
}

export interface AccountDetailGroup {
  id: string
  label: string
  items: AccountDetailItem[]
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
