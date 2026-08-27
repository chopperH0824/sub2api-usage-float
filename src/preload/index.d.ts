import type { DashboardApi } from '@shared/types'

declare global {
  interface Window {
    dashboardApi?: DashboardApi
  }
}

export {}
