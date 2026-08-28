import type {
  AccountUsageInfo,
  AccountUsageStatsResponse,
  AuthMethod,
  AuthTokens,
  ConnectPayload,
  ConnectResult,
  ConnectionState,
  DashboardSnapshot,
  DisplayFieldId,
  PaginatedResponse,
  Sub2ApiAccount,
  Sub2ApiEnvelope,
  Sub2ApiUser,
  TwoFactorChallenge,
  WindowStats
} from '@shared/types'
import {
  hasAnyDisplayField,
  PERIOD_DISPLAY_FIELDS,
  TODAY_DISPLAY_FIELDS
} from '@shared/display-fields'
import type { AppStore } from './store'

interface RuntimeSession {
  serverUrl: string
  authMethod: AuthMethod
  apiKey?: string
  accessToken?: string
  refreshToken?: string
  accessTokenExpiresAt?: number
  user?: Sub2ApiUser
}

interface PendingTwoFactor {
  serverUrl: string
  tempToken: string
}

interface ApiRequestOptions {
  method?: 'GET' | 'POST'
  body?: unknown
  auth?: boolean
  timeoutMs?: number
  retryAuth?: boolean
}

export class Sub2ApiError extends Error {
  constructor(
    message: string,
    readonly status = 0,
    readonly code = '',
    readonly reason = ''
  ) {
    super(message)
    this.name = 'Sub2ApiError'
  }
}

function isEnvelope<T>(value: unknown): value is Sub2ApiEnvelope<T> {
  return Boolean(value && typeof value === 'object' && 'code' in value)
}

function normalizeMessage(status: number, code: string, message: string): string {
  if (status === 401) return '认证已失效，请重新连接'
  if (status === 403) return '当前凭据没有管理员权限'
  if (status === 423 || code === 'ADMIN_COMPLIANCE_ACK_REQUIRED') {
    return '请先在 Sub2API 管理后台完成合规确认'
  }
  if (status === 429) return '服务器请求过于频繁，请稍后重试'
  return message || `Sub2API 请求失败 (${status})`
}

export function normalizeServerUrl(input: string): string {
  const raw = input.trim()
  if (!raw) throw new Sub2ApiError('请输入 Sub2API 服务器地址')

  let parsed: URL
  try {
    parsed = new URL(raw.includes('://') ? raw : `https://${raw}`)
  } catch {
    throw new Sub2ApiError('服务器地址格式不正确')
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Sub2ApiError('服务器地址仅支持 HTTP 或 HTTPS')
  }
  if (parsed.username || parsed.password || parsed.search || parsed.hash) {
    throw new Sub2ApiError('服务器地址不能包含账号、查询参数或锚点')
  }

  let path = parsed.pathname.replace(/\/+$/, '')
  if (path.endsWith('/api/v1')) path = path.slice(0, -7)
  parsed.pathname = path || '/'
  return parsed.toString().replace(/\/$/, '')
}

function apiUrl(serverUrl: string, path: string): string {
  return `${serverUrl}/api/v1${path.startsWith('/') ? path : `/${path}`}`
}

function canFollowRedirect(from: URL, to: URL): boolean {
  return from.hostname === to.hostname && (from.protocol === to.protocol || to.protocol === 'https:')
}

async function fetchWithSafeRedirect(
  url: string,
  init: RequestInit,
  redirectCount = 0
): Promise<Response> {
  const response = await fetch(url, { ...init, redirect: 'manual' })
  if (![301, 302, 303, 307, 308].includes(response.status)) return response
  if (redirectCount >= 3) throw new Sub2ApiError('服务器重定向次数过多')

  const location = response.headers.get('location')
  if (!location) throw new Sub2ApiError('服务器返回了无效重定向')
  const current = new URL(url)
  const target = new URL(location, current)
  if (!canFollowRedirect(current, target)) {
    throw new Sub2ApiError('服务器尝试将凭据重定向到其他主机，已阻止')
  }

  return fetchWithSafeRedirect(target.toString(), init, redirectCount + 1)
}

function isTwoFactorChallenge(value: unknown): value is TwoFactorChallenge {
  if (!value || typeof value !== 'object') return false
  const candidate = value as Partial<TwoFactorChallenge>
  return candidate.requires_2fa === true && typeof candidate.temp_token === 'string'
}

function isAuthTokens(value: unknown): value is AuthTokens {
  return Boolean(value && typeof value === 'object' && typeof (value as AuthTokens).access_token === 'string')
}

function usageEligible(account: Sub2ApiAccount): boolean {
  if (account.platform === 'anthropic') {
    return account.type === 'oauth' || account.type === 'setup-token'
  }
  if (account.platform === 'openai') return account.type === 'oauth'
  return ['gemini', 'antigravity', 'grok'].includes(account.platform)
}

export class Sub2ApiClient {
  private session: RuntimeSession | null = null
  private pendingTwoFactor: PendingTwoFactor | null = null
  private connectionError = ''
  private serverVersion = ''
  private readonly accountStatsCache = new Map<number, {
    expiresAt: number
    value: AccountUsageStatsResponse
  }>()
  private todayStatsSupported: boolean | null = null
  private readonly unsupportedPeriodStats = new Set<number>()

  constructor(private readonly store: AppStore) {}

  async restore(): Promise<ConnectionState> {
    const settings = this.store.getSettings()
    const saved = this.store.readCredential()
    if (!settings.serverUrl || !saved) return this.getConnectionState()

    try {
      const serverUrl = normalizeServerUrl(settings.serverUrl)
      if (saved.kind === 'api-key') {
        this.session = { serverUrl, authMethod: 'api-key', apiKey: saved.secret }
        await this.validateConnection()
      } else if (saved.kind === 'refresh-token') {
        this.session = { serverUrl, authMethod: 'password', refreshToken: saved.secret }
        await this.refreshAccessToken()
        await this.validateConnection()
      } else {
        this.session = { serverUrl, authMethod: 'password', accessToken: saved.secret }
        await this.validateConnection()
      }
      this.connectionError = ''
    } catch (error) {
      this.connectionError = this.errorMessage(error)
      this.session = null
      if (error instanceof Sub2ApiError && [401, 403].includes(error.status)) {
        await this.store.clearCredential()
      }
    }
    return this.getConnectionState()
  }

  getConnectionState(): ConnectionState {
    if (!this.session) {
      return {
        connected: false,
        serverUrl: this.store.getSettings().serverUrl,
        authMethod: this.store.getSettings().authMethod,
        error: this.connectionError || undefined
      }
    }
    return {
      connected: true,
      serverUrl: this.session.serverUrl,
      authMethod: this.session.authMethod,
      displayName: this.session.authMethod === 'api-key'
        ? 'Admin API Key'
        : this.session.user?.username || this.session.user?.email || '管理员',
      email: this.session.user?.email,
      serverVersion: this.serverVersion || undefined
    }
  }

  async connect(payload: ConnectPayload): Promise<ConnectResult> {
    const serverUrl = normalizeServerUrl(payload.serverUrl)
    this.pendingTwoFactor = null
    this.connectionError = ''
    this.accountStatsCache.clear()
    this.todayStatsSupported = null
    this.unsupportedPeriodStats.clear()

    if (payload.authMethod === 'api-key') {
      const apiKey = payload.apiKey.trim()
      if (!apiKey) throw new Sub2ApiError('请输入 Admin API Key')
      this.session = { serverUrl, authMethod: 'api-key', apiKey }
      try {
        await this.validateConnection()
        await this.store.updateSettings({ serverUrl, authMethod: 'api-key' })
        await this.store.saveCredential('api-key', apiKey)
        return { status: 'connected', connection: this.getConnectionState() }
      } catch (error) {
        this.session = null
        throw error
      }
    }

    const email = payload.email.trim()
    if (!email || !payload.password) throw new Sub2ApiError('请输入管理员邮箱和密码')
    const result = await this.requestAt<AuthTokens | TwoFactorChallenge>(serverUrl, '/auth/login', {
      method: 'POST',
      body: { email, password: payload.password },
      auth: false
    })

    await this.store.updateSettings({ serverUrl, authMethod: 'password', email })
    if (isTwoFactorChallenge(result)) {
      this.pendingTwoFactor = { serverUrl, tempToken: result.temp_token }
      return {
        status: 'requires-2fa',
        emailMasked: result.user_email_masked || email
      }
    }
    if (!isAuthTokens(result)) throw new Sub2ApiError('服务器返回了无法识别的登录响应')
    this.acceptTokens(serverUrl, result)
    try {
      await this.validateConnection()
      await this.persistSessionCredential()
    } catch (error) {
      this.session = null
      throw error
    }
    return { status: 'connected', connection: this.getConnectionState() }
  }

  async completeTwoFactor(code: string): Promise<ConnectResult> {
    if (!this.pendingTwoFactor) throw new Sub2ApiError('二次验证会话已失效，请重新登录')
    const normalizedCode = code.trim()
    if (!/^\d{6}$/.test(normalizedCode)) throw new Sub2ApiError('请输入 6 位验证码')

    const pending = this.pendingTwoFactor
    const result = await this.requestAt<AuthTokens>(pending.serverUrl, '/auth/login/2fa', {
      method: 'POST',
      body: { temp_token: pending.tempToken, totp_code: normalizedCode },
      auth: false
    })
    if (!isAuthTokens(result)) throw new Sub2ApiError('服务器返回了无法识别的验证响应')
    this.pendingTwoFactor = null
    this.acceptTokens(pending.serverUrl, result)
    try {
      await this.validateConnection()
      await this.persistSessionCredential()
    } catch (error) {
      this.session = null
      throw error
    }
    return { status: 'connected', connection: this.getConnectionState() }
  }

  async retrySavedConnection(): Promise<ConnectionState> {
    if (this.session) return this.getConnectionState()
    return this.restore()
  }

  async disconnect(): Promise<void> {
    const session = this.session
    this.session = null
    this.pendingTwoFactor = null
    this.serverVersion = ''
    this.connectionError = ''
    this.accountStatsCache.clear()
    this.todayStatsSupported = null
    this.unsupportedPeriodStats.clear()
    await this.store.clearCredential()

    if (session?.refreshToken) {
      try {
        await this.requestAt(session.serverUrl, '/auth/logout', {
          method: 'POST',
          body: { refresh_token: session.refreshToken },
          auth: false,
          timeoutMs: 8_000
        })
      } catch {
        // Local logout remains complete when the server cannot be reached.
      }
    }
  }

  async fetchDashboard(forceUsage = false): Promise<DashboardSnapshot> {
    if (!this.session) throw new Sub2ApiError('尚未连接 Sub2API 服务器')
    const includeSchedulerScore = this.shouldIncludeSchedulerScore()
    const accounts = await this.fetchAllAccounts(includeSchedulerScore)
    const eligibleAccounts = accounts.filter(usageEligible)
    const todayAccountIds = this.requestedAccountIds(accounts, TODAY_DISPLAY_FIELDS)
    const periodAccountIds = this.requestedAccountIds(accounts, PERIOD_DISPLAY_FIELDS)

    const [usageResult, todayResult, periodResult] = await Promise.all([
      this.fetchUsageData(eligibleAccounts, forceUsage),
      this.fetchTodayStats(todayAccountIds),
      this.fetchPeriodStats(periodAccountIds)
    ])

    return {
      accounts,
      usage: usageResult.usage,
      usageErrors: usageResult.errors,
      todayStats: todayResult.stats,
      accountStats: periodResult.stats,
      dataErrors: { ...todayResult.errors, ...periodResult.errors },
      fetchedAt: new Date().toISOString(),
      serverVersion: this.serverVersion || undefined
    }
  }

  private async validateConnection(): Promise<void> {
    await this.requestAuthenticated('/admin/accounts?page=1&page_size=1&lite=true', {
      timeoutMs: 15_000
    })
    try {
      const version = await this.requestAuthenticated<{ version?: string }>('/admin/system/version', {
        timeoutMs: 8_000
      })
      this.serverVersion = String(version.version || '')
    } catch (error) {
      if (!(error instanceof Sub2ApiError) || error.status !== 404) {
        console.warn('Unable to read Sub2API version:', this.errorMessage(error))
      }
    }
  }

  private acceptTokens(serverUrl: string, tokens: AuthTokens): void {
    if (tokens.user && tokens.user.role !== 'admin') {
      throw new Sub2ApiError('当前账号不是管理员，无法读取账号用量')
    }
    this.session = {
      serverUrl,
      authMethod: 'password',
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
      accessTokenExpiresAt: tokens.expires_in ? Date.now() + tokens.expires_in * 1000 : undefined,
      user: tokens.user
    }
  }

  private async persistSessionCredential(): Promise<void> {
    if (!this.session) return
    if (this.session.refreshToken) {
      await this.store.saveCredential('refresh-token', this.session.refreshToken)
    } else if (this.session.accessToken) {
      await this.store.saveCredential('access-token', this.session.accessToken)
    }
  }

  private async refreshAccessToken(): Promise<void> {
    if (!this.session?.refreshToken) throw new Sub2ApiError('没有可用的刷新令牌')
    const refreshToken = this.session.refreshToken
    const tokens = await this.requestAt<AuthTokens>(this.session.serverUrl, '/auth/refresh', {
      method: 'POST',
      body: { refresh_token: refreshToken },
      auth: false,
      timeoutMs: 30_000
    })
    if (!isAuthTokens(tokens)) throw new Sub2ApiError('服务器返回了无法识别的刷新响应')
    this.session.accessToken = tokens.access_token
    this.session.refreshToken = tokens.refresh_token || refreshToken
    this.session.accessTokenExpiresAt = tokens.expires_in
      ? Date.now() + tokens.expires_in * 1000
      : undefined
    await this.store.saveCredential('refresh-token', this.session.refreshToken)
  }

  private async requestAuthenticated<T>(path: string, options: ApiRequestOptions = {}): Promise<T> {
    if (!this.session) throw new Sub2ApiError('尚未连接 Sub2API 服务器')
    if (
      this.session.authMethod === 'password' &&
      this.session.refreshToken &&
      this.session.accessTokenExpiresAt &&
      this.session.accessTokenExpiresAt - Date.now() < 60_000
    ) {
      await this.refreshAccessToken()
    }

    try {
      return await this.requestAt<T>(this.session.serverUrl, path, {
        ...options,
        auth: true
      })
    } catch (error) {
      if (
        error instanceof Sub2ApiError &&
        error.status === 401 &&
        this.session?.authMethod === 'password' &&
        this.session.refreshToken &&
        options.retryAuth !== false
      ) {
        await this.refreshAccessToken()
        return this.requestAt<T>(this.session.serverUrl, path, {
          ...options,
          auth: true,
          retryAuth: false
        })
      }
      throw error
    }
  }

  private async requestAt<T>(serverUrl: string, path: string, options: ApiRequestOptions): Promise<T> {
    const headers: Record<string, string> = {
      Accept: 'application/json',
      'Accept-Language': 'zh-CN',
      'User-Agent': 'Sub2API-Usage-Float/0.7.0'
    }
    if (options.body !== undefined) headers['Content-Type'] = 'application/json'
    if (options.auth) {
      if (!this.session) throw new Sub2ApiError('尚未连接 Sub2API 服务器')
      if (this.session.authMethod === 'api-key' && this.session.apiKey) {
        headers['x-api-key'] = this.session.apiKey
      } else if (this.session.accessToken) {
        headers.Authorization = `Bearer ${this.session.accessToken}`
      } else {
        throw new Sub2ApiError('没有可用的认证凭据')
      }
    }

    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), options.timeoutMs || 30_000)
    let response: Response
    try {
      response = await fetchWithSafeRedirect(apiUrl(serverUrl, path), {
        method: options.method || 'GET',
        headers,
        body: options.body === undefined ? undefined : JSON.stringify(options.body),
        signal: controller.signal
      })
    } catch (error) {
      if ((error as Error).name === 'AbortError') {
        throw new Sub2ApiError('连接服务器超时')
      }
      if (error instanceof Sub2ApiError) throw error
      throw new Sub2ApiError(`无法连接服务器：${(error as Error).message}`)
    } finally {
      clearTimeout(timeout)
    }

    const contentType = response.headers.get('content-type') || ''
    let payload: unknown
    if (contentType.includes('application/json')) {
      payload = await response.json().catch(() => null)
    } else {
      const text = await response.text().catch(() => '')
      payload = text ? { message: text.slice(0, 240) } : null
    }

    if (!response.ok) {
      const envelope = isEnvelope<unknown>(payload) ? payload : null
      const raw = payload && typeof payload === 'object' ? payload as Record<string, unknown> : {}
      const code = String(envelope?.code || raw.code || '')
      const message = String(envelope?.message || raw.message || response.statusText || '')
      throw new Sub2ApiError(
        normalizeMessage(response.status, code, message),
        response.status,
        code,
        String(envelope?.reason || raw.reason || '')
      )
    }

    if (isEnvelope<T>(payload)) {
      if (Number(payload.code) !== 0) {
        const code = String(payload.code)
        throw new Sub2ApiError(
          normalizeMessage(response.status, code, payload.message || ''),
          response.status,
          code,
          payload.reason || ''
        )
      }
      return payload.data as T
    }
    return payload as T
  }

  private shouldIncludeSchedulerScore(): boolean {
    const settings = this.store.getSettings()
    if (settings.displayFields.includes('account-scheduling')) return true
    return Object.values(settings.accountFloats).some(
      (preference) => preference.open && preference.displayFields.includes('account-scheduling')
    )
  }

  private requestedAccountIds(
    accounts: Sub2ApiAccount[],
    candidates: ReadonlySet<DisplayFieldId>
  ): number[] {
    const settings = this.store.getSettings()
    const allAccounts = hasAnyDisplayField(settings.displayFields, candidates)
    return accounts
      .filter((account) => {
        if (allAccounts) return true
        const preference = settings.accountFloats[String(account.id)]
        return Boolean(preference?.open && hasAnyDisplayField(preference.displayFields, candidates))
      })
      .map((account) => account.id)
  }

  private async fetchUsageData(
    accounts: Sub2ApiAccount[],
    forceUsage: boolean
  ): Promise<{ usage: Record<string, AccountUsageInfo>; errors: Record<string, string> }> {
    if (!accounts.length) return { usage: {}, errors: {} }
    const accountIds = accounts.map((account) => account.id)
    try {
      const batch = await this.requestAuthenticated<{
        usage?: Record<string, AccountUsageInfo>
        errors?: Record<string, string>
      }>('/admin/accounts/usage/batch', {
        method: 'POST',
        body: { account_ids: accountIds, force: forceUsage },
        timeoutMs: 75_000
      })
      return { usage: batch.usage || {}, errors: batch.errors || {} }
    } catch (error) {
      if (!(error instanceof Sub2ApiError) || ![404, 405].includes(error.status)) throw error
      return this.fetchUsageFallback(accounts)
    }
  }

  private async fetchTodayStats(accountIds: number[]): Promise<{
    stats: Record<string, WindowStats>
    errors: Record<string, string>
  }> {
    const stats: Record<string, WindowStats> = {}
    const errors: Record<string, string> = {}
    if (!accountIds.length) return { stats, errors }
    if (this.todayStatsSupported === false) {
      for (const accountId of accountIds) errors[String(accountId)] = '今日统计：当前服务器版本不支持'
      return { stats, errors }
    }

    try {
      const batch = await this.requestAuthenticated<{ stats?: Record<string, WindowStats> }>(
        '/admin/accounts/today-stats/batch',
        {
          method: 'POST',
          body: { account_ids: accountIds },
          timeoutMs: 45_000
        }
      )
      this.todayStatsSupported = true
      return { stats: batch.stats || {}, errors }
    } catch (error) {
      if (!(error instanceof Sub2ApiError) || ![404, 405].includes(error.status)) {
        const message = this.errorMessage(error)
        for (const accountId of accountIds) errors[String(accountId)] = `今日统计：${message}`
        return { stats, errors }
      }
    }

    const queue = [...accountIds]
    let unsupportedCount = 0
    const workers = Array.from({ length: Math.min(6, queue.length) }, async () => {
      while (queue.length) {
        const accountId = queue.shift()
        if (!accountId) return
        try {
          stats[String(accountId)] = await this.requestAuthenticated<WindowStats>(
            `/admin/accounts/${accountId}/today-stats`,
            { timeoutMs: 30_000 }
          )
        } catch (error) {
          if (error instanceof Sub2ApiError && [404, 405].includes(error.status)) unsupportedCount += 1
          errors[String(accountId)] = `今日统计：${this.errorMessage(error)}`
        }
      }
    })
    await Promise.all(workers)
    if (unsupportedCount === accountIds.length) {
      this.todayStatsSupported = false
      for (const accountId of accountIds) errors[String(accountId)] = '今日统计：当前服务器版本不支持'
    } else if (Object.keys(stats).length) {
      this.todayStatsSupported = true
    }
    return { stats, errors }
  }

  private async fetchPeriodStats(accountIds: number[]): Promise<{
    stats: Record<string, AccountUsageStatsResponse>
    errors: Record<string, string>
  }> {
    const stats: Record<string, AccountUsageStatsResponse> = {}
    const errors: Record<string, string> = {}
    const queue = accountIds.filter((accountId) => {
      if (!this.unsupportedPeriodStats.has(accountId)) return true
      errors[String(accountId)] = '30 天统计：当前服务器版本不支持'
      return false
    })
    const workers = Array.from({ length: Math.min(4, queue.length) }, async () => {
      while (queue.length) {
        const accountId = queue.shift()
        if (!accountId) return
        const cached = this.accountStatsCache.get(accountId)
        if (cached && cached.expiresAt > Date.now()) {
          stats[String(accountId)] = cached.value
          continue
        }
        try {
          const value = await this.requestAuthenticated<AccountUsageStatsResponse>(
            `/admin/accounts/${accountId}/stats?days=30`,
            { timeoutMs: 45_000 }
          )
          stats[String(accountId)] = value
          this.accountStatsCache.set(accountId, {
            value,
            expiresAt: Date.now() + 5 * 60_000
          })
        } catch (error) {
          if (error instanceof Sub2ApiError && [404, 405].includes(error.status)) {
            this.unsupportedPeriodStats.add(accountId)
            errors[String(accountId)] = '30 天统计：当前服务器版本不支持'
          } else {
            errors[String(accountId)] = `30 天统计：${this.errorMessage(error)}`
          }
        }
      }
    })
    await Promise.all(workers)
    return { stats, errors }
  }

  private async fetchAllAccounts(includeSchedulerScore = false): Promise<Sub2ApiAccount[]> {
    const pageSize = 1000
    const schedulerQuery = includeSchedulerScore ? '&include_scheduler_score=true' : ''
    const first = await this.requestAuthenticated<PaginatedResponse<Sub2ApiAccount>>(
      `/admin/accounts?page=1&page_size=${pageSize}&sort_by=name&sort_order=asc${schedulerQuery}`,
      { timeoutMs: 45_000 }
    )
    const accounts = [...(first.items || [])]
    const pages = Math.max(1, Number(first.pages) || Math.ceil((first.total || accounts.length) / pageSize))
    for (let page = 2; page <= pages; page += 1) {
      const next = await this.requestAuthenticated<PaginatedResponse<Sub2ApiAccount>>(
        `/admin/accounts?page=${page}&page_size=${pageSize}&sort_by=name&sort_order=asc${schedulerQuery}`,
        { timeoutMs: 45_000 }
      )
      accounts.push(...(next.items || []))
    }
    return accounts
  }

  private async fetchUsageFallback(accounts: Sub2ApiAccount[]): Promise<{
    usage: Record<string, AccountUsageInfo>
    errors: Record<string, string>
  }> {
    const usage: Record<string, AccountUsageInfo> = {}
    const errors: Record<string, string> = {}
    const queue = [...accounts]
    const workers = Array.from({ length: Math.min(4, queue.length) }, async () => {
      while (queue.length > 0) {
        const account = queue.shift()
        if (!account) return
        const source = account.platform === 'anthropic' ? '?source=passive' : ''
        try {
          usage[String(account.id)] = await this.requestAuthenticated<AccountUsageInfo>(
            `/admin/accounts/${account.id}/usage${source}`,
            { timeoutMs: 35_000 }
          )
        } catch (error) {
          errors[String(account.id)] = this.errorMessage(error)
        }
      }
    })
    await Promise.all(workers)
    return { usage, errors }
  }

  private errorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error)
  }
}
