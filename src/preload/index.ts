import { contextBridge, ipcRenderer } from 'electron'
import type { AppSettings, ConnectPayload, DashboardApi, TwoFactorPayload } from '@shared/types'

const api: DashboardApi = {
  bootstrap: () => ipcRenderer.invoke('app:bootstrap'),
  connect: (payload: ConnectPayload) => ipcRenderer.invoke('auth:connect', payload),
  completeTwoFactor: (payload: TwoFactorPayload) => ipcRenderer.invoke('auth:complete-2fa', payload),
  retrySavedConnection: () => ipcRenderer.invoke('auth:retry-saved'),
  disconnect: () => ipcRenderer.invoke('auth:disconnect'),
  refresh: (forceUsage = false) => ipcRenderer.invoke('dashboard:refresh', forceUsage),
  updateSettings: (patch: Partial<AppSettings>) => ipcRenderer.invoke('settings:update', patch),
  setAlwaysOnTop: (value: boolean) => ipcRenderer.invoke('window:set-always-on-top', value),
  setCompactMode: (value: boolean) => ipcRenderer.invoke('window:set-compact', value),
  openServer: () => ipcRenderer.invoke('app:open-server'),
  hideWindow: () => ipcRenderer.invoke('window:hide'),
  onRefreshRequested: (callback: () => void) => {
    const listener = (): void => callback()
    ipcRenderer.on('dashboard:request-refresh', listener)
    return () => ipcRenderer.removeListener('dashboard:request-refresh', listener)
  }
}

contextBridge.exposeInMainWorld('dashboardApi', api)
