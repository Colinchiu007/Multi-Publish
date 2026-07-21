__registerMock('./logger', {
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
})

const KeywordMonitor = require('./keyword-monitor')

describe('KeywordMonitor 用户状态隔离', () => {
  it('加载历史时使用当前用户 setting API', () => {
    const store = {
      _ready: true,
      getUserSetting: vi.fn(() => [{ total: 1 }]),
      getSetting: vi.fn(),
    }
    const monitor = new KeywordMonitor(null, store)

    expect(monitor._loadHistory('热点')).toEqual([{ total: 1 }])
    expect(store.getUserSetting).toHaveBeenCalledWith('kw_history_热点', null)
    expect(store.getSetting).not.toHaveBeenCalled()
  })

  it('持久化历史时使用当前用户 setting API', () => {
    const store = {
      _ready: true,
      setUserSetting: vi.fn(),
      setSetting: vi.fn(),
    }
    const monitor = new KeywordMonitor(null, store)
    monitor._watchers.set('热点', { history: [{ total: 2 }] })

    monitor._persistAll()

    expect(store.setUserSetting).toHaveBeenCalledWith('kw_history_热点', [{ total: 2 }])
    expect(store.setSetting).not.toHaveBeenCalled()
  })

  it('旧 Store 不支持用户 setting API 时保留 legacy 行为', () => {
    const store = {
      _ready: true,
      getSetting: vi.fn(() => [{ total: 3 }]),
      setSetting: vi.fn(),
    }
    const monitor = new KeywordMonitor(null, store)
    monitor._watchers.set('热点', { history: [{ total: 3 }] })

    expect(monitor._loadHistory('热点')).toEqual([{ total: 3 }])
    monitor._persistAll()
    expect(store.setSetting).toHaveBeenCalledWith('kw_history_热点', [{ total: 3 }])
  })
})
