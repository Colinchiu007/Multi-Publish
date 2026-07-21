import { createPinia, setActivePinia } from 'pinia'

describe('useIdentity', () => {
  it('导出模板使用的完整身份属性和方法', async () => {
    setActivePinia(createPinia())
    const { useIdentity } = await import('./useIdentity')
    const value = useIdentity()
    for (const key of ['status', 'user', 'isAuthenticated', 'displayName', 'subject', 'loading', 'error', 'load', 'signIn', 'switchAccount', 'signOut']) {
      expect(value).toHaveProperty(key)
    }
  })
})
