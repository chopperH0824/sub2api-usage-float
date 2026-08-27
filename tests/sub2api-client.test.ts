import { afterEach, describe, expect, it } from 'vitest'
import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import type { AppSettings } from '../src/shared/types'
import { normalizeServerUrl, Sub2ApiClient } from '../src/main/sub2api-client'
import type { AppStore } from '../src/main/store'
import { DEFAULT_DISPLAY_FIELDS } from '../src/shared/display-fields'

interface FakeStore {
  settings: AppSettings
  savedCredential: { kind: string; secret: string } | null
  getSettings(): AppSettings
  readCredential(): null
  updateSettings(patch: Partial<AppSettings>): Promise<AppSettings>
  saveCredential(kind: 'api-key' | 'refresh-token' | 'access-token', secret: string): Promise<void>
  clearCredential(): Promise<void>
}

function fakeStore(): FakeStore {
  const store: FakeStore = {
    settings: {
      serverUrl: '',
      authMethod: 'api-key',
      email: '',
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
      accountFloats: {}
    },
    savedCredential: null,
    getSettings() {
      return { ...this.settings, windowBounds: { ...this.settings.windowBounds } }
    },
    readCredential() {
      return null
    },
    async updateSettings(patch) {
      this.settings = { ...this.settings, ...patch }
      return this.getSettings()
    },
    async saveCredential(kind, secret) {
      this.savedCredential = { kind, secret }
    },
    async clearCredential() {
      this.savedCredential = null
    }
  }
  return store
}

function json(response: import('node:http').ServerResponse, data: unknown, status = 200): void {
  response.writeHead(status, { 'Content-Type': 'application/json' })
  response.end(JSON.stringify(data))
}

let server: Server | null = null

afterEach(async () => {
  if (!server) return
  await new Promise<void>((resolve, reject) => server?.close((error) => error ? reject(error) : resolve()))
  server = null
})

describe('normalizeServerUrl', () => {
  it('accepts host input and strips an API suffix', () => {
    expect(normalizeServerUrl('sub2api.example.com/api/v1/')).toBe('https://sub2api.example.com')
    expect(normalizeServerUrl('http://127.0.0.1:8080')).toBe('http://127.0.0.1:8080')
  })

  it('rejects credential-bearing URLs', () => {
    expect(() => normalizeServerUrl('https://admin:secret@example.com')).toThrow('不能包含账号')
  })
})

describe('Sub2ApiClient protocol', () => {
  it('authenticates with x-api-key and joins account and batch usage data', async () => {
    const receivedKeys: string[] = []
    let receivedTodayStats = false
    server = createServer((request, response) => {
      receivedKeys.push(String(request.headers['x-api-key'] || ''))
      const url = new URL(request.url || '/', 'http://localhost')
      if (url.pathname === '/api/v1/admin/system/version') {
        json(response, { code: 0, data: { version: 'v-test' } })
        return
      }
      if (url.pathname === '/api/v1/admin/accounts/today-stats/batch') {
        let body = ''
        request.on('data', (chunk) => { body += chunk })
        request.on('end', () => {
          expect(JSON.parse(body)).toEqual({ account_ids: [11] })
          receivedTodayStats = true
          json(response, {
            code: 0,
            data: {
              stats: {
                '11': { requests: 19, tokens: 84000, cost: 1.25, standard_cost: 1.5, user_cost: 1.8 }
              }
            }
          })
        })
        return
      }
      if (url.pathname === '/api/v1/admin/accounts/usage/batch') {
        let body = ''
        request.on('data', (chunk) => { body += chunk })
        request.on('end', () => {
          expect(JSON.parse(body)).toEqual({ account_ids: [11], force: false })
          json(response, {
            code: 0,
            data: {
              usage: {
                '11': {
                  source: 'active',
                  five_hour: { utilization: 42, resets_at: '2030-01-01T00:00:00Z' }
                }
              },
              errors: {}
            }
          })
        })
        return
      }
      if (url.pathname === '/api/v1/admin/accounts') {
        json(response, {
          code: 0,
          data: {
            items: [{
              id: 11,
              name: 'Codex Pro',
              platform: 'openai',
              type: 'oauth',
              concurrency: 5,
              current_concurrency: 1,
              status: 'active',
              schedulable: true
            }],
            total: 1,
            page: 1,
            page_size: Number(url.searchParams.get('page_size')) || 1,
            pages: 1
          }
        })
        return
      }
      json(response, { code: 404, message: 'not found' }, 404)
    })

    await new Promise<void>((resolve) => server?.listen(0, '127.0.0.1', resolve))
    const port = (server.address() as AddressInfo).port
    const store = fakeStore()
    const client = new Sub2ApiClient(store as unknown as AppStore)

    const connected = await client.connect({
      authMethod: 'api-key',
      serverUrl: `http://127.0.0.1:${port}`,
      apiKey: 'admin-test-key'
    })
    const dashboard = await client.fetchDashboard()

    expect(connected.status).toBe('connected')
    expect(dashboard.serverVersion).toBe('v-test')
    expect(dashboard.accounts).toHaveLength(1)
    expect(dashboard.usage['11'].five_hour?.utilization).toBe(42)
    expect(dashboard.todayStats?.['11']).toMatchObject({ requests: 19, tokens: 84000, cost: 1.25 })
    expect(receivedTodayStats).toBe(true)
    expect(receivedKeys.every((key) => key === 'admin-test-key')).toBe(true)
    expect(store.savedCredential).toEqual({ kind: 'api-key', secret: 'admin-test-key' })
  })

  it('loads cached 30-day statistics and scheduler scores only when selected', async () => {
    let periodRequests = 0
    let schedulerRequested = false
    server = createServer((request, response) => {
      const url = new URL(request.url || '/', 'http://localhost')
      if (url.pathname === '/api/v1/admin/system/version') {
        json(response, { code: 0, data: { version: 'v-test' } })
        return
      }
      if (url.pathname === '/api/v1/admin/accounts/21/stats') {
        periodRequests += 1
        expect(url.searchParams.get('days')).toBe('30')
        json(response, {
          code: 0,
          data: {
            history: [],
            summary: {
              days: 30,
              actual_days_used: 2,
              total_cost: 1,
              total_user_cost: 1.2,
              total_standard_cost: 1.1,
              total_requests: 10,
              total_tokens: 2000,
              avg_daily_cost: 0.5,
              avg_daily_user_cost: 0.6,
              avg_daily_requests: 5,
              avg_daily_tokens: 1000,
              avg_duration_ms: 800
            },
            models: [],
            endpoints: [],
            upstream_endpoints: []
          }
        })
        return
      }
      if (url.pathname === '/api/v1/admin/accounts') {
        if (url.searchParams.get('include_scheduler_score') === 'true') schedulerRequested = true
        json(response, {
          code: 0,
          data: {
            items: [{
              id: 21,
              name: 'DeepSeek API',
              platform: 'deepseek',
              type: 'apikey',
              concurrency: 3,
              status: 'active',
              schedulable: true
            }],
            total: 1,
            page: 1,
            page_size: 1000,
            pages: 1
          }
        })
        return
      }
      json(response, { code: 404, message: 'not found' }, 404)
    })

    await new Promise<void>((resolve) => server?.listen(0, '127.0.0.1', resolve))
    const port = (server.address() as AddressInfo).port
    const store = fakeStore()
    store.settings.displayFields = ['period-summary', 'account-scheduling']
    const client = new Sub2ApiClient(store as unknown as AppStore)

    await client.connect({
      authMethod: 'api-key',
      serverUrl: `http://127.0.0.1:${port}`,
      apiKey: 'admin-test-key'
    })
    const first = await client.fetchDashboard()
    const second = await client.fetchDashboard()

    expect(first.accountStats?.['21'].summary.total_requests).toBe(10)
    expect(second.accountStats?.['21'].summary.total_tokens).toBe(2000)
    expect(periodRequests).toBe(1)
    expect(schedulerRequested).toBe(true)
  })
})
