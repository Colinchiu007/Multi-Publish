// @vitest-environment node
const { Arch } = require('builder-util')
const beforePack = require('../../scripts/before-pack')

describe('electron-builder beforePack 媒体工具合同', () => {
  it('把目标平台和架构传给媒体工具 staging', async () => {
    const buildPreload = vi.fn().mockResolvedValue(undefined)
    const stageMediaTools = vi.fn()

    await beforePack(
      { electronPlatformName: 'win32', arch: Arch.x64 },
      { buildPreload, stageMediaTools },
    )

    expect(buildPreload).toHaveBeenCalledOnce()
    expect(stageMediaTools).toHaveBeenCalledWith({ platform: 'win32', arch: 'x64' })
  })
})
