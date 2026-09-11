import { describe, expect, it, vi } from 'vitest'
import path from 'node:path'
import {
  configureGraphics,
  configureUserAgentFallback,
  configureUserDataPath,
  findSharedUserDataDir,
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
    expect(app.setPath).toHaveBeenCalledWith('sessionData', path.join('C:/tmp/multi-publish-dev', 'session'))
    expect(app.setPath).toHaveBeenCalledWith('cache', path.join('C:/tmp/multi-publish-dev', 'cache'))
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
      path: path.join('C:/Users/test/AppData/Local', 'Multi-Publish', 'user-data'),
      fallback: true,
      previousPath: 'C:/restricted/user-data',
    })
    expect(app.setPath).toHaveBeenCalledWith(
      'userData',
      path.join('C:/Users/test/AppData/Local', 'Multi-Publish', 'user-data'),
    )
  })

  it('uses ANGLE SwiftShader by default on Windows but allows explicit GPU opt-in', () => {
    const app = {
      commandLine: { appendSwitch: vi.fn() },
      disableHardwareAcceleration: vi.fn(),
    }

    expect(configureGraphics({ app, env: {}, platform: 'win32' })).toMatchObject({
      disabled: false,
      reason: 'windows-software',
    })
    expect(app.disableHardwareAcceleration).not.toHaveBeenCalled()
    expect(app.commandLine.appendSwitch).toHaveBeenCalledWith('use-gl', 'angle')
    expect(app.commandLine.appendSwitch).toHaveBeenCalledWith('use-angle', 'swiftshader')

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

describe('shared-data anchor detection', () => {
  it('uses shared-user-data when anchor file exists', () => {
    const repoRoot = '/tmp/test-repo'
    const sharedDir = `${repoRoot}/shared-user-data`
    const fsImpl = {
      constants: { W_OK: 2 },
      existsSync: vi.fn((p) => p === path.join(sharedDir, '.shared-data-anchor')),
      mkdirSync: vi.fn(),
      accessSync: vi.fn(),
    }
    const app = {
      getPath: vi.fn(() => '/tmp/default-user-data'),
      setPath: vi.fn(),
    }

    const result = configureUserDataPath({
      app,
      env: {},
      argv: [],
      fsImpl,
      platform: 'linux',
      moduleDir: repoRoot,
    })

    expect(result).toMatchObject({
      path: path.join(repoRoot, 'shared-user-data'),
      shared: true,
      fallback: false,
      explicit: false,
    })
    expect(app.setPath).toHaveBeenCalledWith('userData', path.join(repoRoot, 'shared-user-data'))
  })

  it('falls back to default when no anchor exists', () => {
    const fsImpl = {
      constants: { W_OK: 2 },
      existsSync: vi.fn(() => false),
      mkdirSync: vi.fn(),
      accessSync: vi.fn(),
    }
    const app = {
      getPath: vi.fn(() => '/tmp/default-user-data'),
      setPath: vi.fn(),
    }

    const result = configureUserDataPath({
      app,
      env: {},
      argv: [],
      fsImpl,
      platform: 'linux',
      moduleDir: '/tmp/no-anchor',
    })

    expect(result.shared).toBeUndefined()
    expect(result.path).toBe('/tmp/default-user-data')
  })

  it('explicit env var overrides shared anchor', () => {
    const app = {
      getPath: vi.fn(() => 'ignored'),
      setPath: vi.fn(),
    }

    const result = configureUserDataPath({
      app,
      env: { ELECTRON_USER_DATA_DIR: 'C:/explicit-dir' },
      argv: [],
      moduleDir: '/tmp/has-anchor',
    })

    expect(result).toMatchObject({
      path: 'C:/explicit-dir',
      explicit: true,
    })
    expect(result.shared).toBeUndefined()
  })

  it('findSharedUserDataDir walks up from nested directory', () => {
    const fsImpl = {
      existsSync: vi.fn((p) => p === path.join('/repo', 'shared-user-data', '.shared-data-anchor')),
    }
    const result = findSharedUserDataDir(
      fsImpl,
      '/repo/apps/desktop/electron',
    )
    expect(result).toBe(path.join('/repo', 'shared-user-data'))
  })

  it('findSharedUserDataDir returns null when anchor not found', () => {
    const fsImpl = { existsSync: vi.fn(() => false) }
    const result = findSharedUserDataDir(fsImpl, '/deep/nested/path')
    expect(result).toBeNull()
  })
})

describe('user-agent fallback sanitization', () => {
  it('strips Electron and app name tokens from the default UA', () => {
    const app = {
      getPath: vi.fn(() => '/tmp/default-user-data'),
      setPath: vi.fn(),
      userAgent:
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Multi-Publish/1.2.3 Chrome/150.0.7871.114 Electron/43.1.1 Safari/537.36',
    }

    const result = configureUserAgentFallback({ app })

    expect(result).toEqual({
      configured: true,
      userAgent:
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.7871.114 Safari/537.36',
    })
    expect(app.userAgentFallback).toBe(result.userAgent)
  })

  it('keeps the UA untouched when it carries no Electron markers', () => {
    const plainUa = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36'
    const app = { userAgent: plainUa }

    const result = configureUserAgentFallback({ app })

    expect(result).toEqual({ configured: false })
    expect(app.userAgentFallback).toBeUndefined()
  })

  it('returns not-configured for a non-Electron-like app object', () => {
    expect(configureUserAgentFallback({ app: null })).toEqual({ configured: false })
    expect(configureUserAgentFallback({})).toEqual({ configured: false })
    expect(configureUserAgentFallback({ app: {} })).toEqual({ configured: false })
  })

  it('never produces consecutive spaces when stripping tokens', () => {
    const app = {
      userAgent: 'Mozilla/5.0 Chrome/150.0.0.0 Electron/43.1.1 Multi-Publish/1.2.3 Safari/537.36',
    }

    const result = configureUserAgentFallback({ app })

    expect(result.userAgent).toBe('Mozilla/5.0 Chrome/150.0.0.0 Safari/537.36')
    expect(result.userAgent).not.toMatch(/\s\s/)
  })
})
