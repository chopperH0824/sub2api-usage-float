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
import type { AppSettings, ConnectPayload, TwoFactorPayload } from '@shared/types'
import { AppStore } from './store'
import { Sub2ApiClient } from './sub2api-client'

const COMPACT_SIZE = { width: 420, height: 382 }

let mainWindow: BrowserWindow | null = null
let tray: Tray | null = null
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

function buildTrayMenu(store: AppStore): Menu {
  const settings = store.getSettings()
  return Menu.buildFromTemplate([
    {
      label: mainWindow?.isVisible() ? '隐藏用量浮窗' : '显示用量浮窗',
      click: () => {
        if (mainWindow?.isVisible()) mainWindow.hide()
        else showMainWindow()
        refreshTrayMenu(store)
      }
    },
    {
      label: '刷新数据',
      click: () => {
        showMainWindow()
        mainWindow?.webContents.send('dashboard:request-refresh')
      }
    },
    { type: 'separator' },
    {
      label: '窗口置顶',
      type: 'checkbox',
      checked: settings.alwaysOnTop,
      click: async (item) => {
        await store.updateSettings({ alwaysOnTop: item.checked })
        applyAlwaysOnTop(item.checked)
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
    backgroundColor: '#f4f5f3',
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

function registerIpc(store: AppStore, client: Sub2ApiClient): void {
  ipcMain.handle('app:bootstrap', async () => ({
    settings: store.getPublicSettings(),
    connection: client.getConnectionState()
  }))

  ipcMain.handle('auth:connect', async (_event, payload: ConnectPayload) => client.connect(payload))
  ipcMain.handle('auth:complete-2fa', async (_event, payload: TwoFactorPayload) => {
    return client.completeTwoFactor(payload.code)
  })
  ipcMain.handle('auth:retry-saved', async () => client.retrySavedConnection())
  ipcMain.handle('auth:disconnect', async () => {
    await client.disconnect()
    return {
      settings: store.getPublicSettings(),
      connection: client.getConnectionState()
    }
  })
  ipcMain.handle('dashboard:refresh', async (_event, forceUsage = false) => client.fetchDashboard(forceUsage))

  ipcMain.handle('settings:update', async (_event, patch: Partial<AppSettings>) => {
    const previous = store.getSettings()
    const settings = await store.updateSettings(patch)
    if (app.isPackaged && settings.launchAtLogin !== previous.launchAtLogin) {
      app.setLoginItemSettings({ openAtLogin: settings.launchAtLogin })
    }
    if (settings.opacity !== previous.opacity) mainWindow?.setOpacity(settings.opacity)
    if (settings.alwaysOnTop !== previous.alwaysOnTop) applyAlwaysOnTop(settings.alwaysOnTop)
    if (settings.compactMode !== previous.compactMode) applyCompactMode(settings.compactMode, settings)
    refreshTrayMenu(store)
    return store.getPublicSettings()
  })

  ipcMain.handle('window:set-always-on-top', async (_event, value: boolean) => {
    await store.updateSettings({ alwaysOnTop: value })
    applyAlwaysOnTop(value)
    refreshTrayMenu(store)
    return value
  })
  ipcMain.handle('window:set-compact', async (_event, value: boolean) => {
    const settings = await store.updateSettings({ compactMode: value })
    applyCompactMode(value, settings)
    return value
  })
  ipcMain.handle('window:hide', () => mainWindow?.hide())
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

  registerIpc(store, client)
  createWindow(store)
  createTray(store)
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
