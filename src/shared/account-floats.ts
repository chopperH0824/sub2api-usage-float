import type { AccountFloatPreference, AccountFloatSize } from './types'
import { DEFAULT_FLOAT_DISPLAY_FIELDS } from './display-fields'

export const ACCOUNT_FLOAT_DIMENSIONS: Record<AccountFloatSize, { width: number; height: number }> = {
  small: { width: 320, height: 172 },
  medium: { width: 380, height: 280 },
  large: { width: 440, height: 480 }
}

export const DEFAULT_ACCOUNT_FLOAT: AccountFloatPreference = {
  open: false,
  opacity: 0.84,
  alwaysOnTop: true,
  size: 'small',
  displayFields: [...DEFAULT_FLOAT_DISPLAY_FIELDS]
}

export function isAccountFloatSize(value: unknown): value is AccountFloatSize {
  return value === 'small' || value === 'medium' || value === 'large'
}
