import { BrowserWindow, screen, shell } from 'electron'
import { ACCOUNT_FLOAT_DIMENSIONS, DEFAULT_ACCOUNT_FLOAT } from '@shared/account-floats'
import type {
  AccountFloatPreference,
  AccountFloatSize,
  DashboardSnapshot
} from '@shared/types'
import type { AppStore } from './store'

interface AccountFloatManagerOptions {
  store: AppStore
  preloadPath: string
  rendererFile: string
  rendererUrl?: string
  isQuitting: () => boolean
  onStateChanged: () => void
}

function isBoundsVisible(bounds: Electron.Rectangle): boolean {
  return screen.getAllDisplays().some((display) => {
    const area = display.workArea
    const horizontal = Math.min(bounds.x + bounds.width, area.x + area.width) - Math.max(bounds.x, area.x)
    const vertical = Math.min(bounds.y + bounds.height, area.y + area.height) - Math.max(bounds.y, area.y)
    return horizontal >= 64 && vertical >= 48
  })
}

function nearestSize(width: number, height: number): AccountFloatSize {
  const candidates = Object.entries(ACCOUNT_FLOAT_DIMENSIONS) as Array<[
    AccountFloatSize,
    { width: number; height: number }
  ]>
  return candidates.reduce((best, candidate) => {
    const bestDimensions = ACCOUNT_FLOAT_DIMENSIONS[best]
    const bestDistance = Math.abs(bestDimensions.width - width) + Math.abs(bestDimensions.height - height)
    const candidateDistance = Math.abs(candidate[1].width - width) + Math.abs(candidate[1].height - height)
    return candidateDistance < bestDistance ? candidate[0] : best
  }, 'small' as AccountFloatSize)
}

export class AccountFloatManager {
  private readonly windows = new Map<number, BrowserWindow>()
  private readonly persistTimers = new Map<number, ReturnType<typeof setTimeout>>()
  private readonly closingIds = new Set<number>()

  constructor(private readonly options: AccountFloatManagerOptions) {}

  get windowCount(): number {
    return this.windows.size
  }

  getPreference(accountId: number): AccountFloatPreference {
    const stored = this.options.store.getSettings().accountFloats[String(accountId)]
    return stored
      ? {
          ...stored,
          displayFields: [...stored.displayFields],
          ...(stored.bounds ? { bounds: { ...stored.bounds } } : {})
        }
      : { ...DEFAULT_ACCOUNT_FLOAT, displayFields: [...DEFAULT_ACCOUNT_FLOAT.displayFields] }
  }

  async restore(): Promise<void> {
    const preferences = this.options.store.getSettings().accountFloats
    for (const [accountId, preference] of Object.entries(preferences)) {
      if (preference.open) await this.open(Number(accountId), false)
    }
  }

  async open(accountId: number, persist = true): Promise<AccountFloatPreference> {
    if (!Number.isInteger(accountId) || accountId <= 0) throw new Error('账号 ID 无效')
    const existing = this.windows.get(accountId)
    if (existing && !existing.isDestroyed()) {
      existing.showInactive()
      return this.getPreference(accountId)
    }

    const preference = persist
      ? await this.options.store.updateAccountFloat(accountId, { open: true })
      : this.getPreference(accountId)
    this.createWindow(accountId, preference)
    this.options.onStateChanged()
    return preference
  }

  async close(accountId: number): Promise<AccountFloatPreference> {
    const preference = await this.options.store.updateAccountFloat(accountId, { open: false })
    const target = this.windows.get(accountId)
    if (target && !target.isDestroyed()) {
      this.closingIds.add(accountId)
      target.destroy()
    }
    this.options.onStateChanged()
    return preference
  }

  async update(
    accountId: number,
    patch: Partial<AccountFloatPreference>
  ): Promise<AccountFloatPreference> {
    const target = this.windows.get(accountId)
    let nextPatch = { ...patch }

    if (patch.size && target && !target.isDestroyed()) {
      const dimensions = ACCOUNT_FLOAT_DIMENSIONS[patch.size]
      const current = target.getBounds()
      nextPatch = {
        ...nextPatch,
        bounds: { ...current, ...dimensions }
      }
    }

    const preference = await this.options.store.updateAccountFloat(accountId, nextPatch)
    if (target && !target.isDestroyed()) this.applyPreference(target, preference, Boolean(patch.size))
    this.sendPreference(target, accountId, preference)
    this.options.onStateChanged()
    return preference
  }

  showAll(): void {
    for (const target of this.windows.values()) {
      if (!target.isDestroyed()) target.showInactive()
    }
  }

  hideAll(): void {
    for (const target of this.windows.values()) {
      if (!target.isDestroyed()) target.hide()
    }
  }

  async closeAll(persistClosed: boolean): Promise<void> {
    const configuredIds = Object.entries(this.options.store.getSettings().accountFloats)
      .filter(([, preference]) => preference.open)
      .map(([accountId]) => Number(accountId))
    const ids = [...new Set([...this.windows.keys(), ...configuredIds])]
    if (persistClosed) {
      await Promise.all(ids.map((accountId) => this.options.store.updateAccountFloat(accountId, { open: false })))
    }
    for (const accountId of ids) {
      const target = this.windows.get(accountId)
      if (!target || target.isDestroyed()) continue
      this.closingIds.add(accountId)
      target.destroy()
    }
    this.options.onStateChanged()
  }

  broadcastSnapshot(snapshot: DashboardSnapshot): void {
    for (const [accountId, target] of this.windows) {
      if (target.isDestroyed()) continue
      const account = snapshot.accounts.find((item) => item.id === accountId)
      if (account) target.setTitle(`${account.name} · Sub2API`)
      target.webContents.send('dashboard:updated', snapshot)
    }
  }

  private createWindow(accountId: number, preference: AccountFloatPreference): void {
    const dimensions = ACCOUNT_FLOAT_DIMENSIONS[preference.size]
    const saved = preference.bounds
    const workArea = screen.getPrimaryDisplay().workArea
    const stackIndex = this.windows.size
    const rows = Math.max(1, Math.floor((workArea.height - 36) / (dimensions.height + 10)))
    const row = stackIndex % rows
    const column = Math.floor(stackIndex / rows) % 3
    const fallbackBounds: Electron.Rectangle = {
      x: workArea.x + workArea.width - dimensions.width - 18 - column * (dimensions.width + 10),
      y: workArea.y + 18 + row * (dimensions.height + 10),
      width: dimensions.width,
      height: dimensions.height
    }
    const candidateBounds: Electron.Rectangle = {
      x: saved?.x ?? fallbackBounds.x,
      y: saved?.y ?? fallbackBounds.y,
      width: saved?.width ?? dimensions.width,
      height: saved?.height ?? dimensions.height
    }
    const bounds = saved?.x !== undefined && saved.y !== undefined && isBoundsVisible(candidateBounds)
      ? candidateBounds
      : fallbackBounds

    const target = new BrowserWindow({
      title: `账号 ${accountId} · Sub2API`,
      ...bounds,
      minWidth: 230,
      minHeight: 118,
      maxWidth: 460,
      maxHeight: 560,
      show: false,
      frame: false,
      transparent: true,
      backgroundColor: '#00000000',
      hasShadow: true,
      roundedCorners: true,
      resizable: true,
      minimizable: false,
      maximizable: false,
      fullscreenable: false,
      skipTaskbar: true,
      opacity: preference.opacity,
      webPreferences: {
        preload: this.options.preloadPath,
        sandbox: true,
        contextIsolation: true,
        nodeIntegration: false,
        backgroundThrottling: false
      }
    })

    this.windows.set(accountId, target)
    this.applyPreference(target, preference, false)

    target.on('ready-to-show', () => target.showInactive())
    target.on('closed', () => {
      const timer = this.persistTimers.get(accountId)
      if (timer) clearTimeout(timer)
      this.persistTimers.delete(accountId)
      this.windows.delete(accountId)
      const intentional = this.closingIds.delete(accountId)
      if (!intentional && !this.options.isQuitting()) {
        void this.options.store.updateAccountFloat(accountId, { open: false }).then(() => {
          this.options.onStateChanged()
        })
      }
    })

    const schedulePersistence = (): void => {
      const currentTimer = this.persistTimers.get(accountId)
      if (currentTimer) clearTimeout(currentTimer)
      this.persistTimers.set(accountId, setTimeout(() => {
        if (target.isDestroyed()) return
        const current = target.getBounds()
        void this.options.store.updateAccountFloat(accountId, {
          bounds: current,
          size: nearestSize(current.width, current.height)
        }).then((next) => {
          this.sendPreference(target, accountId, next)
          this.options.onStateChanged()
        })
      }, 280))
    }
    target.on('move', schedulePersistence)
    target.on('resize', schedulePersistence)

    target.webContents.setWindowOpenHandler(({ url }) => {
      if (url.startsWith('https://') || url.startsWith('http://')) void shell.openExternal(url)
      return { action: 'deny' }
    })

    if (this.options.rendererUrl) {
      const url = new URL(this.options.rendererUrl)
      url.searchParams.set('view', 'account-float')
      url.searchParams.set('accountId', String(accountId))
      void target.loadURL(url.toString())
    } else {
      void target.loadFile(this.options.rendererFile, {
        query: { view: 'account-float', accountId: String(accountId) }
      })
    }
  }

  private applyPreference(
    target: BrowserWindow,
    preference: AccountFloatPreference,
    applySize: boolean
  ): void {
    target.setOpacity(preference.opacity)
    target.setAlwaysOnTop(preference.alwaysOnTop, 'floating')
    target.setVisibleOnAllWorkspaces(preference.alwaysOnTop, { visibleOnFullScreen: true })
    if (applySize) {
      const dimensions = ACCOUNT_FLOAT_DIMENSIONS[preference.size]
      target.setSize(dimensions.width, dimensions.height, true)
    }
  }

  private sendPreference(
    target: BrowserWindow | undefined,
    accountId: number,
    preference: AccountFloatPreference
  ): void {
    if (!target || target.isDestroyed()) return
    target.webContents.send('account-float:updated', accountId, preference)
  }
}
