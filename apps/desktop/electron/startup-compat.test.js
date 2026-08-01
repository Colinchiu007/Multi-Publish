import { describe, expect, it, vi } from 'vitest'
import {
  configureGraphics,
  configureUserDataPath,
  getExplicitUserDataDir,
} from './startup-compat.js'

describe('startup compatibility', () => {
  it('prefers an explicit userData directory and configures related paths', () => {
    const app = {
      getPath: vi.fn(() => 'ignored'),
      setPath: vi.fn(),
    }

    const result = configureUserDataPath({
      app,
      env: { ELECTRON_USER_DATA_DIR: 'C:/tmp/multi-publish-dev' },
      argv: [],
    })

    expect(result).toMatchObject({
      path: 'C:/tmp/multi-publish-dev',
      explicit: true,
      fallback: false,
    })
    expect(app.setPath).toHaveBeenCalledWith('userData', 'C:/tmp/multi-publish-dev')
    expect(app.setPath).toHaveBeenCalledWith('sessionData', 'C:/tmp/multi-publish-dev/session')
    expect(app.setPath).toHaveBeenCalledWith('cache', 'C:/tmp/multi-publish-dev/cache')
  })

  it('falls back to LOCALAPPDATA when the default userData path is not writable', () => {
    const app = {
      getPath: vi.fn(() => 'C:/restricted/user-data'),
      setPath: vi.fn(),
    }
    const fsImpl = {
      constants: { W_OK: 2 },
      mkdirSync: vi.fn((directory) => {
        if (directory === 'C:/restricted/user-data') throw new Error('EPERM')
      }),
      accessSync: vi.fn(),
    }

    const result = configureUserDataPath({
      app,
      env: { LOCALAPPDATA: 'C:/Users/test/AppData/Local' },
      argv: [],
      fsImpl,
      platform: 'win32',
    })

    expect(result).toMatchObject({
      path: 'C:/Users/test/AppData/Local/Multi-Publish/user-data',
      fallback: true,
      previousPath: 'C:/restricted/user-data',
    })
    expect(app.setPath).toHaveBeenCalledWith(
      'userData',
      'C:/Users/test/AppData/Local/Multi-Publish/user-data',
    )
  })

  it('uses software rendering by default on Windows but allows explicit GPU opt-in', () => {
    const app = {
      commandLine: { appendSwitch: vi.fn() },
      disableHardwareAcceleration: vi.fn(),
    }

    expect(configureGraphics({ app, env: {}, platform: 'win32' })).toMatchObject({
      disabled: true,
      reason: 'windows-default',
    })
    expect(app.disableHardwareAcceleration).toHaveBeenCalledTimes(1)
    expect(app.commandLine.appendSwitch).toHaveBeenCalledWith('disable-gpu')

    app.commandLine.appendSwitch.mockClear()
    app.disableHardwareAcceleration.mockClear()
    expect(configureGraphics({ app, env: { ELECTRON_ENABLE_GPU: '1' }, platform: 'win32' })).toEqual({
      disabled: false,
      reason: null,
    })
    expect(app.disableHardwareAcceleration).not.toHaveBeenCalled()
    expect(app.commandLine.appendSwitch).not.toHaveBeenCalled()
  })

  it('enables the explicit safe mode without changing the normal GPU policy', () => {
    const app = {
      commandLine: { appendSwitch: vi.fn() },
      disableHardwareAcceleration: vi.fn(),
    }

    expect(configureGraphics({ app, env: { ELECTRON_GPU_SAFE_MODE: '1' }, platform: 'linux' }))
      .toMatchObject({ disabled: true, reason: 'safe-mode' })
    expect(app.commandLine.appendSwitch).toHaveBeenCalledWith('disable-gpu-sandbox')
  })

  it('recognizes the Electron command-line userData override', () => {
    expect(getExplicitUserDataDir({}, ['electron', '.', '--user-data-dir=C:/tmp/profile']))
      .toBe('C:/tmp/profile')
  })
})
