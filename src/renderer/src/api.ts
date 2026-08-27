import type { DashboardApi } from '@shared/types'
import { createDemoApi } from './demo'

export const dashboardApi: DashboardApi = window.dashboardApi || createDemoApi()
