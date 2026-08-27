import { formatCompactNumber } from '@shared/usage'
import type { CapacityMetric } from '@shared/types'

export function formatResetTime(value: string | null | undefined, now = Date.now()): string {
  if (!value) return '实时'
  const reset = new Date(value).getTime()
  if (!Number.isFinite(reset)) return '时间未知'
  const diff = reset - now
  if (diff <= 0) return '待更新'

  const minutes = Math.ceil(diff / 60_000)
  if (minutes < 60) return `${minutes}m 后`
  const hours = Math.floor(minutes / 60)
  const restMinutes = minutes % 60
  if (hours < 24) return restMinutes ? `${hours}h ${restMinutes}m` : `${hours}h 后`
  const days = Math.floor(hours / 24)
  const restHours = hours % 24
  if (days < 7) return restHours ? `${days}d ${restHours}h` : `${days}d 后`
  return new Intl.DateTimeFormat('zh-CN', { month: '2-digit', day: '2-digit' }).format(new Date(reset))
}

export function formatUpdatedTime(value: string | null | undefined, now = Date.now()): string {
  if (!value) return '尚未采样'
  const time = new Date(value).getTime()
  if (!Number.isFinite(time)) return '更新时间未知'
  const seconds = Math.max(0, Math.floor((now - time) / 1000))
  if (seconds < 10) return '刚刚更新'
  if (seconds < 60) return `${seconds}s 前更新`
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m 前更新`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h 前更新`
  return `${Math.floor(hours / 24)}d 前更新`
}

export function formatCapacityValue(metric: CapacityMetric): string {
  const fractionDigits = metric.unit === '$' ? 2 : 0
  const current = metric.unit === '$'
    ? metric.current.toFixed(fractionDigits)
    : formatCompactNumber(metric.current)
  const limit = metric.unit === '$'
    ? metric.limit.toFixed(fractionDigits)
    : formatCompactNumber(metric.limit)
  const prefix = metric.unit === '$' ? '$' : ''
  return `${prefix}${current}/${prefix}${limit}`
}

export function accountLastSeen(value: string | null | undefined, now = Date.now()): string {
  if (!value) return '暂无调用'
  const time = new Date(value).getTime()
  if (!Number.isFinite(time)) return '调用时间未知'
  const minutes = Math.max(0, Math.floor((now - time) / 60_000))
  if (minutes < 1) return '刚刚调用'
  if (minutes < 60) return `${minutes}m 前调用`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h 前调用`
  return `${Math.floor(hours / 24)}d 前调用`
}

