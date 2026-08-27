import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const electronState = vi.hoisted(() => ({ userData: '' }))

vi.mock('electron', () => ({
  app: {
    getPath: () => electronState.userData
  },
  safeStorage: {
    isEncryptionAvailable: () => true,
    encryptString: (value: string) => Buffer.from(value, 'utf8'),
    decryptString: (value: Buffer) => value.toString('utf8')
  }
}))

import { AppStore } from '../src/main/store'
import { DEFAULT_DISPLAY_FIELDS } from '../src/shared/display-fields'

beforeEach(async () => {
  electronState.userData = await mkdtemp(join(tmpdir(), 'sub2api-float-store-'))
})

afterEach(async () => {
  await rm(electronState.userData, { recursive: true, force: true })
})

describe('AppStore account floats', () => {
  it('migrates legacy settings without account float data', async () => {
    await writeFile(join(electronState.userData, 'settings.json'), JSON.stringify({
      version: 1,
      settings: {
        serverUrl: 'https://sub2api.example.com',
        authMethod: 'api-key',
        opacity: 0.9,
        windowBounds: { width: 468, height: 760 }
      }
    }))

    const store = new AppStore()
    await store.load()

    expect(store.getSettings().serverUrl).toBe('https://sub2api.example.com')
    expect(store.getSettings().displayFields).toEqual(DEFAULT_DISPLAY_FIELDS)
    expect(store.getSettings().accountFloats).toEqual({})
  })

  it('persists independent, sanitized preferences for each account', async () => {
    const store = new AppStore()
    await store.load()

    const first = await store.updateAccountFloat(7, {
      open: true,
      opacity: 0.2,
      size: 'large',
      displayFields: ['usage-windows', 'period-summary', 'invalid-field' as never],
      bounds: { x: 120, y: 80, width: 900, height: 20 }
    })
    await store.updateAccountFloat(8, {
      open: true,
      opacity: 0.72,
      alwaysOnTop: false,
      size: 'medium'
    })

    expect(first).toMatchObject({
      open: true,
      opacity: 0.45,
      size: 'large',
      displayFields: ['usage-windows', 'period-summary'],
      bounds: { x: 120, y: 80, width: 460, height: 118 }
    })
    expect(store.getSettings().accountFloats['7'].open).toBe(true)
    expect(store.getSettings().accountFloats['8']).toMatchObject({
      open: true,
      opacity: 0.72,
      alwaysOnTop: false,
      size: 'medium'
    })

    const persisted = JSON.parse(await readFile(join(electronState.userData, 'settings.json'), 'utf8'))
    expect(Object.keys(persisted.settings.accountFloats)).toEqual(['7', '8'])
    expect((await stat(join(electronState.userData, 'settings.json'))).mode & 0o777).toBe(0o600)
  })
})
