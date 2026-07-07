/**
 * Pinia Store 单元测试
 */
import { setActivePinia, createPinia } from 'pinia'
import { useAccountStore } from '../src/stores/accounts'
import { usePlatformStore } from '../src/stores/platforms'

describe('usePlatformStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('返回所有平台列表', () => {
    const store = usePlatformStore()
    expect(store.platforms.length).toBeGreaterThanOrEqual(11)
    expect(store.platforms.find(p => p.id === 'bilibili')).toBeTruthy()
    expect(store.platforms.find(p => p.id === 'wechat_mp')).toBeTruthy()
  })

  it('getLabel 返回平台名称', () => {
    const store = usePlatformStore()
    expect(store.getLabel('bilibili')).toBe('B站')
    expect(store.getLabel('unknown')).toBe('unknown')
  })
})

describe('useAccountStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    // Mock electronAPI
    global.window = {
      electronAPI: {
        listAccounts: async () => ({
          code: 0,
          data: [
            { id: 'a1', platform: 'bilibili', name: 'B站号1', is_default: true },
            { id: 'a2', platform: 'bilibili', name: 'B站号2' },
            { id: 'a3', platform: 'wechat_mp', name: '公众号1', is_default: true },
          ],
        }),
      },
    }
  })

  it('load() 加载账号列表', async () => {
    const store = useAccountStore()
    expect(store.accounts.length).toBe(0)
    await store.load()
    expect(store.accounts.length).toBe(3)
    expect(store.loading).toBe(false)
    expect(store.error).toBeNull()
  })

  it('byPlatform 按平台分组', async () => {
    const store = useAccountStore()
    await store.load()
    expect(store.byPlatform.bilibili.length).toBe(2)
    expect(store.byPlatform.wechat_mp.length).toBe(1)
  })

  it('getDefault 返回默认账号', async () => {
    const store = useAccountStore()
    await store.load()
    const def = store.getDefault('bilibili')
    expect(def.is_default).toBe(true)
    expect(store.getDefault('unknown')).toBeNull()
  })

  it('load() 处理空返回', async () => {
    global.window.electronAPI.listAccounts = async () => ({ code: 0, data: [] })
    const store = useAccountStore()
    await store.load()
    expect(store.accounts).toEqual([])
  })

  it('load() 处理错误', async () => {
    global.window.electronAPI.listAccounts = async () => { throw new Error('API error') }
    const store = useAccountStore()
    await store.load()
    expect(store.error).toBe('API error')
    expect(store.accounts).toEqual([])
  })
})
