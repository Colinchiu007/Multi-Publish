import { describe, expect, it } from 'vitest'

const { buildElectronArgs } = require('../../scripts/dev-launcher')

describe('dev-launcher', () => {
  it('uses software compositing so the Electron window is not blank', () => {
    const args = buildElectronArgs({
      electronUserDataDir: 'C:/tmp/multi-publish-dev-user',
      electronCacheDir: 'C:/tmp/multi-publish-dev-user/cache',
      desktopDir: 'C:/tmp/multi-publish-dev-desktop',
      platform: 'win32',
    })

    expect(args).toContain('--no-sandbox')
    expect(args).toContain('--disable-gpu')
    expect(args).toContain('--disable-gpu-compositing')
    expect(args).toContain('--use-gl=angle')
    expect(args).toContain('--use-angle=swiftshader')
    expect(args).toContain('--enable-unsafe-swiftshader')
    expect(args).not.toContain('--in-process-gpu')
    expect(args[args.length - 1]).toBe('C:/tmp/multi-publish-dev-desktop')
  })

  it('keeps explicit user data and cache directories', () => {
    const args = buildElectronArgs({
      electronUserDataDir: 'C:/tmp/multi-publish-dev-user',
      electronCacheDir: 'C:/tmp/multi-publish-dev-user/cache',
      desktopDir: 'C:/tmp/multi-publish-dev-desktop',
      platform: 'win32',
    })

    expect(args).toContain('--user-data-dir=C:/tmp/multi-publish-dev-user')
    expect(args).toContain('--disk-cache-dir=C:/tmp/multi-publish-dev-user/cache')
  })
})
