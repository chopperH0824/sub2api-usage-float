import { contextBridge, ipcRenderer } from 'electron'
import type {
  AccountFloatPreference,
  AppSettings,
  ConnectPayload,
  DashboardApi,
  DashboardSnapshot,
  PublicSettings,
  TwoFactorPayload
} from '@shared/types'

const api: DashboardApi = {
  bootstrap: () => ipcRenderer.invoke('app:bootstrap'),
  connect: (payload: ConnectPayload) => ipcRenderer.invoke('auth:connect', payload),
  completeTwoFactor: (payload: TwoFactorPayload) => ipcRenderer.invoke('auth:complete-2fa', payload),
  retrySavedConnection: () => ipcRenderer.invoke('auth:retry-saved'),
  disconnect: () => ipcRenderer.invoke('auth:disconnect'),
  refresh: (forceUsage = false) => ipcRenderer.invoke('dashboard:refresh', forceUsage),
  getLatestDashboard: () => ipcRenderer.invoke('dashboard:get-latest'),
  updateSettings: (patch: Partial<AppSettings>) => ipcRenderer.invoke('settings:update', patch),
  setAlwaysOnTop: (value: boolean) => ipcRenderer.invoke('window:set-always-on-top', value),
  setCompactMode: (value: boolean) => ipcRenderer.invoke('window:set-compact', value),
  resizeWindow: (size: { width: number; height: number }) => ipcRenderer.invoke('window:resize', size),
  openServer: () => ipcRenderer.invoke('app:open-server'),
  hideWindow: () => ipcRenderer.invoke('window:hide'),
  openAccountFloat: (accountId: number) => ipcRenderer.invoke('account-float:open', accountId),
  closeAccountFloat: (accountId: number) => ipcRenderer.invoke('account-float:close', accountId),
  updateAccountFloat: (accountId: number, patch: Partial<AccountFloatPreference>) => {
    return ipcRenderer.invoke('account-float:update', accountId, patch)
  },
  onRefreshRequested: (callback: () => void) => {
    const listener = (): void => callback()
    ipcRenderer.on('dashboard:request-refresh', listener)
    return () => ipcRenderer.removeListener('dashboard:request-refresh', listener)
  },
  onDashboardUpdated: (callback: (snapshot: DashboardSnapshot) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, snapshot: DashboardSnapshot): void => callback(snapshot)
    ipcRenderer.on('dashboard:updated', listener)
    return () => ipcRenderer.removeListener('dashboard:updated', listener)
  },
  onSettingsChanged: (callback: (settings: PublicSettings) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, settings: PublicSettings): void => callback(settings)
    ipcRenderer.on('settings:changed', listener)
    return () => ipcRenderer.removeListener('settings:changed', listener)
  }
}

contextBridge.exposeInMainWorld('dashboardApi', api)
