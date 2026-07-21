const sharedScheduler = require('@multi-publish/shared-utils')
const desktopScheduler = require('./scheduler')

describe('Scheduler 单一实现', () => {
  it('桌面兼容入口保留全部既有公共 API', () => {
    expect(Object.keys(desktopScheduler).sort()).toEqual([
      'cancel', 'create', 'list', 'restore', 'setOwnerSubjectProvider', 'setTaskQueue', 'stopAll'
    ])
    expect(sharedScheduler.createScheduler).toBeTypeOf('function')
  })

  it('桌面兼容入口的方法与共享实例 API 完全一致', () => {
    const isolated = sharedScheduler.createScheduler({
      app: { getPath: () => 'C:/tmp' },
      fs: { existsSync: () => false },
      logger: { error: vi.fn(), warn: vi.fn() }
    })

    for (const method of Object.keys(desktopScheduler)) {
      expect(desktopScheduler[method]).toBeTypeOf(typeof isolated[method])
    }
  })
})
