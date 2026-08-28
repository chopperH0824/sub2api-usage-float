import {
  app,
  BrowserWindow,
  ipcMain,
  Menu,
  nativeImage,
  screen,
  shell,
  Tray
} from 'electron'
import { join } from 'node:path'
import type {
  AccountFloatPreference,
  AppSettings,
  ConnectPayload,
  ConnectResult,
  DashboardSnapshot,
  TwoFactorPayload
} from '@shared/types'
import { AppStore } from './store'
import { Sub2ApiClient } from './sub2api-client'
import { AccountFloatManager } from './account-float-manager'

const COMPACT_SIZE = { width: 420, height: 382 }

let mainWindow: BrowserWindow | null = null
let tray: Tray | null = null
let floatManager: AccountFloatManager | null = null
let apiClient: Sub2ApiClient | null = null
let latestSnapshot: DashboardSnapshot | null = null
let dashboardRefreshPromise: Promise<DashboardSnapshot> | null = null
let isQuitting = false
let persistBoundsTimer: ReturnType<typeof setTimeout> | null = null

const gotSingleInstanceLock = app.requestSingleInstanceLock()
if (!gotSingleInstanceLock) app.quit()

const assetPath = (name: string): string => {
  if (app.isPackaged) return join(process.resourcesPath, name)
  return join(__dirname, '../../assets', name)
}

function isBoundsVisible(bounds: Electron.Rectangle): boolean {
  return screen.getAllDisplays().some((display) => {
    const area = display.workArea
    const horizontal = Math.min(bounds.x + bounds.width, area.x + area.width) - Math.max(bounds.x, area.x)
    const vertical = Math.min(bounds.y + bounds.height, area.y + area.height) - Math.max(bounds.y, area.y)
    return horizontal >= 80 && vertical >= 80
  })
}

function showMainWindow(): void {
  if (!mainWindow) return
  if (mainWindow.isMinimized()) mainWindow.restore()
  mainWindow.show()
  mainWindow.focus()
}

function applyAlwaysOnTop(value: boolean): void {
  if (!mainWindow) return
  mainWindow.setAlwaysOnTop(value, 'floating')
  mainWindow.setVisibleOnAllWorkspaces(value, { visibleOnFullScreen: true })
}

function applyCompactMode(value: boolean, settings: AppSettings): void {
  if (!mainWindow) return
  if (value) {
    mainWindow.setMinimumSize(380, 320)
    mainWindow.setSize(COMPACT_SIZE.width, COMPACT_SIZE.height, true)
    return
  }
  mainWindow.setMinimumSize(420, 560)
  const width = Math.max(420, settings.windowBounds.width)
  const height = Math.max(560, settings.windowBounds.height)
  mainWindow.setSize(width, height, true)
}

function broadcastSettings(store: AppStore): void {
  const settings = store.getPublicSettings()
  for (const target of BrowserWindow.getAllWindows()) {
    if (!target.isDestroyed()) target.webContents.send('settings:changed', settings)
  }
}

function broadcastSnapshot(snapshot: DashboardSnapshot): void {
  latestSnapshot = snapshot
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('dashboard:updated', snapshot)
  }
  floatManager?.broadcastSnapshot(snapshot)
}

async function refreshDashboard(forceUsage = false): Promise<DashboardSnapshot> {
  if (!apiClient) throw new Error('Sub2API 客户端尚未就绪')
  if (dashboardRefreshPromise) return dashboardRefreshPromise
  dashboardRefreshPromise = apiClient.fetchDashboard(forceUsage)
    .then((snapshot) => {
      broadcastSnapshot(snapshot)
      return snapshot
    })
    .finally(() => {
      dashboardRefreshPromise = null
    })
  return dashboardRefreshPromise
}

function buildTrayMenu(store: AppStore): Menu {
  const settings = store.getSettings()
  const floatCount = floatManager?.windowCount || 0
  return Menu.buildFromTemplate([
    {
      label: mainWindow?.isVisible() ? '隐藏主看板' : '显示主看板',
      click: () => {
        if (mainWindow?.isVisible()) mainWindow.hide()
        else showMainWindow()
        refreshTrayMenu(store)
      }
    },
    {
      label: `账号浮窗 (${floatCount})`,
      submenu: [
        {
          label: '显示全部',
          enabled: floatCount > 0,
          click: () => floatManager?.showAll()
        },
        {
          label: '隐藏全部',
          enabled: floatCount > 0,
          click: () => floatManager?.hideAll()
        },
        {
          label: '关闭全部',
          enabled: floatCount > 0,
          click: () => { void floatManager?.closeAll(true) }
        }
      ]
    },
    {
      label: '刷新数据',
      click: () => mainWindow?.webContents.send('dashboard:request-refresh')
    },
    { type: 'separator' },
    {
      label: '主看板置顶',
      type: 'checkbox',
      checked: settings.alwaysOnTop,
      click: async (item) => {
        await store.updateSettings({ alwaysOnTop: item.checked })
        applyAlwaysOnTop(item.checked)
        broadcastSettings(store)
        refreshTrayMenu(store)
      }
    },
    { type: 'separator' },
    {
      label: '退出',
      click: () => {
        isQuitting = true
        app.quit()
      }
    }
  ])
}

function refreshTrayMenu(store: AppStore): void {
  tray?.setContextMenu(buildTrayMenu(store))
}

function createTray(store: AppStore): void {
  const image = nativeImage.createFromPath(assetPath('tray-icon.png')).resize({ width: 18, height: 18 })
  image.setTemplateImage(process.platform === 'darwin')
  tray = new Tray(image)
  tray.setToolTip('Sub2API 用量浮窗')
  tray.setContextMenu(buildTrayMenu(store))
  tray.on('click', () => {
    if (mainWindow?.isVisible()) mainWindow.hide()
    else showMainWindow()
    refreshTrayMenu(store)
  })
}

function createWindow(store: AppStore): void {
  const settings = store.getSettings()
  const saved = settings.windowBounds
  const candidateBounds: Electron.Rectangle = {
    x: saved.x ?? 0,
    y: saved.y ?? 0,
    width: settings.compactMode ? COMPACT_SIZE.width : saved.width,
    height: settings.compactMode ? COMPACT_SIZE.height : saved.height
  }
  const useSavedPosition = saved.x !== undefined && saved.y !== undefined && isBoundsVisible(candidateBounds)

  mainWindow = new BrowserWindow({
    title: 'Sub2API 用量浮窗',
    width: candidateBounds.width,
    height: candidateBounds.height,
    x: useSavedPosition ? candidateBounds.x : undefined,
    y: useSavedPosition ? candidateBounds.y : undefined,
    minWidth: settings.compactMode ? 380 : 420,
    minHeight: settings.compactMode ? 320 : 560,
    maxWidth: 1000,
    maxHeight: 1200,
    show: false,
    frame: true,
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 14, y: 14 },
    transparent: true,
    backgroundColor: '#00000000',
    icon: assetPath('app-icon.png'),
    opacity: settings.opacity,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      backgroundThrottling: false
    }
  })

  applyAlwaysOnTop(settings.alwaysOnTop)

  mainWindow.on('ready-to-show', () => mainWindow?.show())
  mainWindow.on('close', (event) => {
    if (!isQuitting) {
      event.preventDefault()
      mainWindow?.hide()
      refreshTrayMenu(store)
    }
  })
  mainWindow.on('show', () => refreshTrayMenu(store))
  mainWindow.on('hide', () => refreshTrayMenu(store))

  const scheduleBoundsPersistence = (): void => {
    if (!mainWindow || store.getSettings().compactMode) return
    if (persistBoundsTimer) clearTimeout(persistBoundsTimer)
    persistBoundsTimer = setTimeout(() => {
      if (!mainWindow || mainWindow.isDestroyed()) return
      const bounds = mainWindow.getBounds()
      void store.updateSettings({ windowBounds: bounds })
    }, 300)
  }
  mainWindow.on('resize', scheduleBoundsPersistence)
  mainWindow.on('move', scheduleBoundsPersistence)

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://') || url.startsWith('http://')) void shell.openExternal(url)
    return { action: 'deny' }
  })

  if (process.env.ELECTRON_RENDERER_URL) {
    void mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    void mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

function registerIpc(store: AppStore, client: Sub2ApiClient, manager: AccountFloatManager): void {
  ipcMain.handle('app:bootstrap', async () => ({
    settings: store.getPublicSettings(),
    connection: client.getConnectionState()
  }))

  const restoreFloatsAfterConnect = async (result: ConnectResult): Promise<ConnectResult> => {
    if (result.status === 'connected') {
      latestSnapshot = null
      await manager.restore()
    }
    return result
  }

  ipcMain.handle('auth:connect', async (_event, payload: ConnectPayload) => {
    return restoreFloatsAfterConnect(await client.connect(payload))
  })
  ipcMain.handle('auth:complete-2fa', async (_event, payload: TwoFactorPayload) => {
    return restoreFloatsAfterConnect(await client.completeTwoFactor(payload.code))
  })
  ipcMain.handle('auth:retry-saved', async () => {
    const connection = await client.retrySavedConnection()
    if (connection.connected) {
      latestSnapshot = null
      await manager.restore()
    }
    return connection
  })
  ipcMain.handle('auth:disconnect', async () => {
    await manager.closeAll(true)
    await client.disconnect()
    latestSnapshot = null
    broadcastSettings(store)
    return {
      settings: store.getPublicSettings(),
      connection: client.getConnectionState()
    }
  })
  ipcMain.handle('dashboard:refresh', async (_event, forceUsage = false) => {
    return refreshDashboard(forceUsage)
  })
  ipcMain.handle('dashboard:get-latest', async () => latestSnapshot || refreshDashboard(false))

  ipcMain.handle('settings:update', async (_event, patch: Partial<AppSettings>) => {
    const previous = store.getSettings()
    const settings = await store.updateSettings(patch)
    if (app.isPackaged && settings.launchAtLogin !== previous.launchAtLogin) {
      app.setLoginItemSettings({ openAtLogin: settings.launchAtLogin })
    }
    if (settings.opacity !== previous.opacity) mainWindow?.setOpacity(settings.opacity)
    if (settings.alwaysOnTop !== previous.alwaysOnTop) applyAlwaysOnTop(settings.alwaysOnTop)
    if (settings.compactMode !== previous.compactMode) applyCompactMode(settings.compactMode, settings)
    broadcastSettings(store)
    refreshTrayMenu(store)
    return store.getPublicSettings()
  })

  ipcMain.handle('window:set-always-on-top', async (_event, value: boolean) => {
    await store.updateSettings({ alwaysOnTop: value })
    applyAlwaysOnTop(value)
    broadcastSettings(store)
    refreshTrayMenu(store)
    return value
  })
  ipcMain.handle('window:set-compact', async (_event, value: boolean) => {
    const settings = await store.updateSettings({ compactMode: value })
    applyCompactMode(value, settings)
    broadcastSettings(store)
    return value
  })
  ipcMain.handle('window:resize', async (_event, size: { width: number; height: number }) => {
    if (!mainWindow) return
    const width = Math.max(380, Math.round(size.width))
    const height = Math.max(320, Math.round(size.height))
    mainWindow.setSize(width, height, true)
    await store.updateSettings({ windowBounds: { width, height } })
    return { width, height }
  })
  ipcMain.handle('window:hide', () => mainWindow?.hide())
  ipcMain.handle('account-float:open', async (_event, accountId: number) => manager.open(accountId))
  ipcMain.handle('account-float:close', async (_event, accountId: number) => manager.close(accountId))
  ipcMain.handle(
    'account-float:update',
    async (_event, accountId: number, patch: Partial<AccountFloatPreference>) => manager.update(accountId, patch)
  )
  ipcMain.handle('app:open-server', async () => {
    const url = client.getConnectionState().serverUrl || store.getSettings().serverUrl
    if (url) await shell.openExternal(url)
  })
}

async function start(): Promise<void> {
  const store = new AppStore()
  await store.load()
  const client = new Sub2ApiClient(store)
  await client.restore()

  apiClient = client
  floatManager = new AccountFloatManager({
    store,
    preloadPath: join(__dirname, '../preload/index.js'),
    rendererFile: join(__dirname, '../renderer/index.html'),
    rendererUrl: process.env.ELECTRON_RENDERER_URL,
    isQuitting: () => isQuitting,
    onStateChanged: () => {
      broadcastSettings(store)
      refreshTrayMenu(store)
    }
  })

  registerIpc(store, client, floatManager)
  createWindow(store)
  createTray(store)
  if (client.getConnectionState().connected) await floatManager.restore()
  if (app.isPackaged && store.getSettings().launchAtLogin) {
    app.setLoginItemSettings({ openAtLogin: store.getSettings().launchAtLogin })
  }
}

app.whenReady().then(start).catch((error) => {
  console.error('Failed to start Sub2API usage dashboard:', error)
  app.quit()
})

app.on('second-instance', showMainWindow)
app.on('activate', showMainWindow)
app.on('before-quit', () => {
  isQuitting = true
})
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin' && isQuitting) app.quit()
})
