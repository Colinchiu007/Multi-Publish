import { describe, it, expect, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'

const push = vi.hoisted(() => vi.fn())
vi.mock('vue-router', () => ({ useRouter: () => ({ push }) }))
vi.mock('vue-i18n', () => ({ useI18n: () => ({ t: (key) => key }) }))

describe('ProfileMenu', () => {
  let store
  let wrapper

  async function mountMenu(password) {
    const pinia = createPinia()
    setActivePinia(pinia)
    const { useIdentityStore } = await import('@/stores/identity')
    store = useIdentityStore()
    store.status = 'authenticated'
    store.user = { sub: 'sub-1', name: '用户甲', username: 'user-a', picture: '' }
    store.signIn = vi.fn(async () => true)
    store.switchAccount = vi.fn(async () => true)
    store.signOut = vi.fn(async () => true)
    const { useLicenseStore } = await import('@/stores/license')
    const licenseStore = useLicenseStore()
    licenseStore.info = { type: 'free', isPro: false, isTrial: false, features: [], daysRemaining: 0 }
    const Component = (await import('./ProfileMenu.vue')).default
    wrapper = mount(Component, { attachTo: document.body, global: { plugins: [pinia] } })
    return wrapper
  }

  afterEach(() => {
    wrapper?.unmount()
    wrapper = null
    push.mockReset()
  })

  it('未登录（signed_out）点击头像直接触发登录，不展开菜单', async () => {
    await mountMenu()
    store.status = 'signed_out'
    store.user = null
    await wrapper.vm.$nextTick()
    await wrapper.get('[data-testid="yixiaoer-profile"]').trigger('click')
    expect(store.signIn).toHaveBeenCalledTimes(1)
    expect(wrapper.find('[data-testid="profile-menu-panel"]').exists()).toBe(false)
  })

  it('已登录点击头像展开菜单，含会员中心/切换账号/退出登录', async () => {
    await mountMenu()
    await wrapper.get('[data-testid="yixiaoer-profile"]').trigger('click')
    expect(wrapper.find('[data-testid="profile-menu-panel"]').exists()).toBe(true)
    expect(wrapper.text()).toContain('memberCenter.menuEntry')
    expect(wrapper.text()).toContain('memberCenter.switchAccount')
    expect(wrapper.text()).toContain('memberCenter.signOut')
  })

  it('菜单点击会员中心跳转路由并关闭菜单', async () => {
    await mountMenu()
    await wrapper.get('[data-testid="yixiaoer-profile"]').trigger('click')
    await wrapper.get('[data-testid="profile-menu-member"]').trigger('click')
    expect(push).toHaveBeenCalledWith('/member-center')
    expect(wrapper.find('[data-testid="profile-menu-panel"]').exists()).toBe(false)
  })

  it('菜单点击切换账号与退出登录调用对应操作', async () => {
    await mountMenu()
    await wrapper.get('[data-testid="yixiaoer-profile"]').trigger('click')
    await wrapper.get('[data-testid="profile-menu-switch"]').trigger('click')
    expect(store.switchAccount).toHaveBeenCalledTimes(1)
    await wrapper.get('[data-testid="yixiaoer-profile"]').trigger('click')
    await wrapper.get('[data-testid="profile-menu-signout"]').trigger('click')
    expect(store.signOut).toHaveBeenCalledTimes(1)
  })

  it('disabled 状态点击展开菜单并显示身份服务未启用说明，不触发登录', async () => {
    await mountMenu()
    store.status = 'disabled'
    store.user = null
    await wrapper.vm.$nextTick()
    await wrapper.get('[data-testid="yixiaoer-profile"]').trigger('click')
    expect(store.signIn).not.toHaveBeenCalled()
    expect(wrapper.find('[data-testid="profile-menu-panel"]').exists()).toBe(true)
    expect(wrapper.text()).toContain('memberCenter.identityDisabledHint')
  })

  it('未登录点击面板内重试登录按钮触发登录', async () => {
    await mountMenu()
    store.status = 'error'
    store.error = { code: 'IDENTITY_SIGN_OUT_FAILED', message: '' }
    store.user = null
    await wrapper.vm.$nextTick()
    await wrapper.get('[data-testid="yixiaoer-profile"]').trigger('click')
    expect(wrapper.find('[data-testid="profile-menu-panel"]').exists()).toBe(true)
    await wrapper.get('[data-testid="profile-menu-signin"]').trigger('click')
    expect(store.signIn).toHaveBeenCalledTimes(1)
  })
})