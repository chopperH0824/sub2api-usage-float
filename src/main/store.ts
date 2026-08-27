import { app, safeStorage } from 'electron'
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import type { AppSettings, AuthMethod, PublicSettings, ThemeMode, WindowBounds } from '@shared/types'

type CredentialKind = 'api-key' | 'refresh-token' | 'access-token'

interface PersistedCredential {
  kind: CredentialKind
  encrypted: string
}

interface PersistedState {
  version: 1
  settings: AppSettings
  credential?: PersistedCredential
}

const DEFAULT_BOUNDS: WindowBounds = {
  width: 468,
  height: 760
}

export const DEFAULT_SETTINGS: AppSettings = {
  serverUrl: '',
  authMethod: 'api-key',
  email: '',
  refreshIntervalSeconds: 60,
  alwaysOnTop: true,
  launchAtLogin: false,
  compactMode: false,
  opacity: 1,
  warningThreshold: 75,
  dangerThreshold: 90,
  theme: 'system',
  windowBounds: DEFAULT_BOUNDS
}

function isAuthMethod(value: unknown): value is AuthMethod {
  return value === 'api-key' || value === 'password'
}

function isTheme(value: unknown): value is ThemeMode {
  return value === 'system' || value === 'light' || value === 'dark'
}

function clampNumber(value: unknown, min: number, max: number, fallback: number): number {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return fallback
  return Math.min(max, Math.max(min, parsed))
}

function sanitizeBounds(value: unknown): WindowBounds {
  const candidate = value && typeof value === 'object' ? value as Partial<WindowBounds> : {}
  const result: WindowBounds = {
    width: clampNumber(candidate.width, 380, 1000, DEFAULT_BOUNDS.width),
    height: clampNumber(candidate.height, 480, 1200, DEFAULT_BOUNDS.height)
  }
  if (Number.isFinite(candidate.x)) result.x = Number(candidate.x)
  if (Number.isFinite(candidate.y)) result.y = Number(candidate.y)
  return result
}

function sanitizeSettings(value: unknown): AppSettings {
  const input = value && typeof value === 'object' ? value as Partial<AppSettings> : {}
  const warningThreshold = clampNumber(input.warningThreshold, 50, 95, DEFAULT_SETTINGS.warningThreshold)
  const dangerThreshold = Math.max(
    warningThreshold + 1,
    clampNumber(input.dangerThreshold, 60, 100, DEFAULT_SETTINGS.dangerThreshold)
  )

  return {
    serverUrl: typeof input.serverUrl === 'string' ? input.serverUrl : '',
    authMethod: isAuthMethod(input.authMethod) ? input.authMethod : DEFAULT_SETTINGS.authMethod,
    email: typeof input.email === 'string' ? input.email : '',
    refreshIntervalSeconds: clampNumber(input.refreshIntervalSeconds, 15, 900, DEFAULT_SETTINGS.refreshIntervalSeconds),
    alwaysOnTop: typeof input.alwaysOnTop === 'boolean' ? input.alwaysOnTop : DEFAULT_SETTINGS.alwaysOnTop,
    launchAtLogin: typeof input.launchAtLogin === 'boolean' ? input.launchAtLogin : false,
    compactMode: typeof input.compactMode === 'boolean' ? input.compactMode : false,
    opacity: clampNumber(input.opacity, 0.72, 1, 1),
    warningThreshold,
    dangerThreshold,
    theme: isTheme(input.theme) ? input.theme : DEFAULT_SETTINGS.theme,
    windowBounds: sanitizeBounds(input.windowBounds)
  }
}

function isCredential(value: unknown): value is PersistedCredential {
  if (!value || typeof value !== 'object') return false
  const candidate = value as Partial<PersistedCredential>
  return (
    (candidate.kind === 'api-key' || candidate.kind === 'refresh-token' || candidate.kind === 'access-token') &&
    typeof candidate.encrypted === 'string' &&
    candidate.encrypted.length > 0
  )
}

export class AppStore {
  private state: PersistedState = {
    version: 1,
    settings: { ...DEFAULT_SETTINGS, windowBounds: { ...DEFAULT_BOUNDS } }
  }

  private readonly filePath = join(app.getPath('userData'), 'settings.json')

  async load(): Promise<void> {
    try {
      const raw = await readFile(this.filePath, 'utf8')
      const parsed = JSON.parse(raw) as Partial<PersistedState>
      this.state = {
        version: 1,
        settings: sanitizeSettings(parsed.settings),
        credential: isCredential(parsed.credential) ? parsed.credential : undefined
      }
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code
      if (code !== 'ENOENT') {
        console.warn('Unable to load local settings:', error)
      }
    }
  }

  getSettings(): AppSettings {
    return {
      ...this.state.settings,
      windowBounds: { ...this.state.settings.windowBounds }
    }
  }

  getPublicSettings(): PublicSettings {
    return {
      ...this.getSettings(),
      hasSavedCredential: Boolean(this.state.credential),
      secureStorageAvailable: safeStorage.isEncryptionAvailable()
    }
  }

  async updateSettings(patch: Partial<AppSettings>): Promise<AppSettings> {
    this.state.settings = sanitizeSettings({
      ...this.state.settings,
      ...patch,
      windowBounds: patch.windowBounds
        ? { ...this.state.settings.windowBounds, ...patch.windowBounds }
        : this.state.settings.windowBounds
    })
    await this.save()
    return this.getSettings()
  }

  async saveCredential(kind: CredentialKind, secret: string): Promise<void> {
    if (!safeStorage.isEncryptionAvailable()) {
      this.state.credential = undefined
      await this.save()
      return
    }
    this.state.credential = {
      kind,
      encrypted: safeStorage.encryptString(secret).toString('base64')
    }
    await this.save()
  }

  readCredential(): { kind: CredentialKind; secret: string } | null {
    if (!this.state.credential || !safeStorage.isEncryptionAvailable()) return null
    try {
      const encrypted = Buffer.from(this.state.credential.encrypted, 'base64')
      return {
        kind: this.state.credential.kind,
        secret: safeStorage.decryptString(encrypted)
      }
    } catch (error) {
      console.warn('Unable to decrypt saved credential:', error)
      return null
    }
  }

  async clearCredential(): Promise<void> {
    this.state.credential = undefined
    await this.save()
  }

  private async save(): Promise<void> {
    await mkdir(dirname(this.filePath), { recursive: true })
    const temporaryPath = `${this.filePath}.tmp`
    await writeFile(temporaryPath, JSON.stringify(this.state, null, 2), { mode: 0o600 })
    await rename(temporaryPath, this.filePath)
  }
}

