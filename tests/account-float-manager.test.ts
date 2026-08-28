import { EventEmitter } from 'node:events'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { AccountFloatPreference, AppSettings, DashboardSnapshot } from '../src/shared/types'
import { DEFAULT_ACCOUNT_FLOAT } from '../src/shared/account-floats'
import { DEFAULT_DISPLAY_FIELDS } from '../src/shared/display-fields'

interface FakeWindowOptions {
  width: number
  height: number
  x: number
  y: number
  transparent: boolean
  frame: boolean
  backgroundColor: string
}

class FakeWindow extends EventEmitter {
  static instances: FakeWindow[] = []
  readonly options: FakeWindowOptions
  readonly webContents = {
    send: vi.fn(),
    setWindowOpenHandler: vi.fn()
  }
  destroyed = false
  visible = false
  opacity = 1
  alwaysOnTop = false
  visibleOnAllWorkspaces = false
  loadedUrl = ''
  title = ''
  bounds: { x: number; y: number; width: number; height: number }

  constructor(options: FakeWindowOptions) {
    super()
    this.options = options
    this.bounds = { x: options.x, y: options.y, width: options.width, height: options.height }
    FakeWindow.instances.push(this)
  }

  isDestroyed(): boolean { return this.destroyed }
  showInactive(): void { this.visible = true }
  hide(): void { this.visible = false }
  destroy(): void {
    this.destroyed = true
    this.emit('closed')
  }
  getBounds(): typeof this.bounds { return { ...this.bounds } }
  setSize(width: number, height: number): void {
    this.bounds.width = width
    this.bounds.height = height
  }
  setOpacity(value: number): void { this.opacity = value }
  setAlwaysOnTop(value: boolean): void { this.alwaysOnTop = value }
  setVisibleOnAllWorkspaces(value: boolean): void { this.visibleOnAllWorkspaces = value }
  setTitle(value: string): void { this.title = value }
  loadURL(value: string): Promise<void> {
    this.loadedUrl = value
    return Promise.resolve()
  }
  loadFile(): Promise<void> { return Promise.resolve() }
}

import type { AppStore } from '../src/main/store'

function settings(): AppSettings {
  return {
    serverUrl: 'https://sub2api.example.com',
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
  }
}

function fakeStore(): AppStore {
  const state = settings()
  return {
    getSettings: () => ({
      ...state,
      accountFloats: Object.fromEntries(Object.entries(state.accountFloats).map(([key, value]) => [key, { ...value }]))
    }),
    updateAccountFloat: async (accountId: number, patch: Partial<AccountFloatPreference>) => {
      const key = String(accountId)
      const next: AccountFloatPreference = {
        ...DEFAULT_ACCOUNT_FLOAT,
        ...state.accountFloats[key],
        ...patch,
        bounds: patch.bounds
          ? { ...state.accountFloats[key]?.bounds, ...patch.bounds }
          : state.accountFloats[key]?.bounds
      }
      state.accountFloats[key] = next
      return { ...next, ...(next.bounds ? { bounds: { ...next.bounds } } : {}) }
    }
  } as unknown as AppStore
}

beforeEach(() => {
  FakeWindow.instances = []
  vi.resetModules()
  vi.doMock('electron', () => ({
    BrowserWindow: FakeWindow,
    screen: {
      getAllDisplays: () => [{ workArea: { x: 0, y: 0, width: 1440, height: 900 } }],
      getPrimaryDisplay: () => ({ workArea: { x: 0, y: 0, width: 1440, height: 900 } })
    },
    shell: { openExternal: vi.fn() }
  }))
})

describe('AccountFloatManager', () => {
  it('creates, updates, broadcasts to, and closes an independent transparent window', async () => {
    const { AccountFloatManager } = await import('../src/main/account-float-manager')
    const store = fakeStore()
    const onStateChanged = vi.fn()
    const manager = new AccountFloatManager({
      store,
      preloadPath: '/tmp/preload.js',
      rendererFile: '/tmp/index.html',
      rendererUrl: 'http://127.0.0.1:5173/',
      isQuitting: () => false,
      onStateChanged
    })

    const opened = await manager.open(7)
    const target = FakeWindow.instances[0]

    expect(opened.open).toBe(true)
    expect(manager.windowCount).toBe(1)
    expect(target.options).toMatchObject({
      width: 320,
      height: 172,
      transparent: true,
      frame: false,
      backgroundColor: '#00000000'
    })
    expect(target.loadedUrl).toContain('view=account-float')
    expect(target.loadedUrl).toContain('accountId=7')
    expect(target.alwaysOnTop).toBe(true)

    const updated = await manager.update(7, {
      opacity: 0.61,
      alwaysOnTop: false,
      size: 'large'
    })
    expect(updated).toMatchObject({ opacity: 0.61, alwaysOnTop: false, size: 'large' })
    expect(target.opacity).toBe(0.61)
    expect(target.alwaysOnTop).toBe(false)
    expect(target.bounds).toMatchObject({ width: 440, height: 480 })

    const snapshot: DashboardSnapshot = {
      accounts: [{
        id: 7,
        name: 'Codex Team',
        platform: 'openai',
        type: 'oauth',
        concurrency: 5,
        status: 'active',
        schedulable: true
      }],
      usage: {},
      usageErrors: {},
      fetchedAt: new Date().toISOString()
    }
    manager.broadcastSnapshot(snapshot)
    expect(target.title).toBe('Codex Team · Sub2API')
    expect(target.webContents.send).toHaveBeenCalledWith('dashboard:updated', snapshot)

    const closed = await manager.close(7)
    expect(closed.open).toBe(false)
    expect(target.destroyed).toBe(true)
    expect(manager.windowCount).toBe(0)
    expect(onStateChanged).toHaveBeenCalled()
  })
})
