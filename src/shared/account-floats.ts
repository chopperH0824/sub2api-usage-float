import type { AccountFloatPreference, AccountFloatSize } from './types'

export const ACCOUNT_FLOAT_DIMENSIONS: Record<AccountFloatSize, { width: number; height: number }> = {
  small: { width: 260, height: 126 },
  medium: { width: 300, height: 158 },
  large: { width: 340, height: 190 }
}

export const DEFAULT_ACCOUNT_FLOAT: AccountFloatPreference = {
  open: false,
  opacity: 0.84,
  alwaysOnTop: true,
  size: 'small'
}

export function isAccountFloatSize(value: unknown): value is AccountFloatSize {
  return value === 'small' || value === 'medium' || value === 'large'
}
