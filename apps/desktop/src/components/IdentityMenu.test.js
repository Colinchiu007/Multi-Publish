import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'

describe('IdentityMenu', () => {
  it('未登录时显示登录命令并触发系统登录', async () => {
    const pinia = createPinia()
    setActivePinia(pinia)
    const { useIdentityStore } = await import('@/stores/identity')
    const store = useIdentityStore()
    store.status = 'signed_out'
    store.signIn = vi.fn(async () => true)
    const Component = (await import('./IdentityMenu.vue')).default
    const wrapper = mount(Component, { global: { plugins: [pinia] } })
    await wrapper.get('[data-testid="identity-trigger"]').trigger('click')
    expect(wrapper.text()).toContain('登录 Multi-Publish')
    await wrapper.get('[data-testid="identity-sign-in"]').trigger('click')
    expect(store.signIn).toHaveBeenCalledTimes(1)
  })

  it('已登录时显示名称和退出命令', async () => {
    const pinia = createPinia()
    setActivePinia(pinia)
    const { useIdentityStore } = await import('@/stores/identity')
    const store = useIdentityStore()
    store.status = 'authenticated'
    store.user = { sub: 'sub-1', name: '用户甲', username: '', picture: '' }
    store.switchAccount = vi.fn(async () => true)
    const Component = (await import('./IdentityMenu.vue')).default
    const wrapper = mount(Component, { global: { plugins: [pinia] } })
    expect(wrapper.text()).toContain('用户甲')
    await wrapper.get('[data-testid="identity-trigger"]').trigger('click')
    expect(wrapper.text()).toContain('切换账号')
    expect(wrapper.text()).toContain('退出登录')
    await wrapper.get('[data-testid="identity-switch-account"]').trigger('click')
    expect(store.switchAccount).toHaveBeenCalledTimes(1)
  })

  it('退出中保持退出语义，不显示登录命令', async () => {
    const pinia = createPinia()
    setActivePinia(pinia)
    const { useIdentityStore } = await import('@/stores/identity')
    const store = useIdentityStore()
    store.status = 'signing_out'
    store.loading = true
    store.user = { sub: 'sub-1', name: '用户甲', username: '', picture: '' }
    const Component = (await import('./IdentityMenu.vue')).default
    const wrapper = mount(Component, { global: { plugins: [pinia] } })

    await wrapper.get('[data-testid="identity-trigger"]').trigger('click')

    expect(wrapper.text()).toContain('正在退出...')
    expect(wrapper.text()).not.toContain('正在打开登录...')
  })

  it('刷新中和退出失败时都保留退出入口', async () => {
    const pinia = createPinia()
    setActivePinia(pinia)
    const { useIdentityStore } = await import('@/stores/identity')
    const store = useIdentityStore()
    store.status = 'refreshing'
    store.user = { sub: 'sub-1', name: '用户甲', username: '', picture: '' }
    const Component = (await import('./IdentityMenu.vue')).default
    const wrapper = mount(Component, { global: { plugins: [pinia] } })

    await wrapper.get('[data-testid="identity-trigger"]').trigger('click')
    expect(wrapper.text()).toContain('刷新中')
    expect(wrapper.find('[data-testid="identity-sign-out"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="identity-sign-in"]').exists()).toBe(false)

    store.status = 'error'
    store.error = { code: 'IDENTITY_SIGN_OUT_FAILED', message: '' }
    await wrapper.vm.$nextTick()
    expect(wrapper.find('[data-testid="identity-sign-out"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="identity-sign-in"]').exists()).toBe(false)
  })

  it('切换账号失败后保留切换和退出入口，不显示重复登录命令', async () => {
    const pinia = createPinia()
    setActivePinia(pinia)
    const { useIdentityStore } = await import('@/stores/identity')
    const store = useIdentityStore()
    store.status = 'error'
    store.user = { sub: 'sub-1', name: '用户甲', username: '', picture: '' }
    store.error = { code: 'IDENTITY_ACCOUNT_SWITCH_FAILED', message: '' }
    const Component = (await import('./IdentityMenu.vue')).default
    const wrapper = mount(Component, { global: { plugins: [pinia] } })

    await wrapper.get('[data-testid="identity-trigger"]').trigger('click')

    expect(wrapper.find('[data-testid="identity-switch-account"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="identity-sign-out"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="identity-sign-in"]').exists()).toBe(false)
  })

  it('点击菜单外部或按 Esc 会关闭菜单', async () => {
    const pinia = createPinia()
    setActivePinia(pinia)
    const { useIdentityStore } = await import('@/stores/identity')
    useIdentityStore().status = 'signed_out'
    const Component = (await import('./IdentityMenu.vue')).default
    const wrapper = mount(Component, { attachTo: document.body, global: { plugins: [pinia] } })
    await wrapper.get('[data-testid="identity-trigger"]').trigger('click')
    expect(wrapper.find('[role="menu"]').exists()).toBe(true)
    expect(wrapper.get('[data-testid="identity-trigger"]').attributes('aria-controls')).toBe('identity-menu-panel')
    expect(wrapper.findAll('[role="menuitem"]').length).toBeGreaterThan(0)

    document.body.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await wrapper.vm.$nextTick()
    expect(wrapper.find('[role="menu"]').exists()).toBe(false)

    await wrapper.get('[data-testid="identity-trigger"]').trigger('click')
    wrapper.get('[data-testid="identity-trigger"]').element.focus()
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    await wrapper.vm.$nextTick()
    expect(wrapper.find('[role="menu"]').exists()).toBe(false)
    expect(document.activeElement).toBe(wrapper.get('[data-testid="identity-trigger"]').element)
    wrapper.unmount()
  })

  it('按向下键打开菜单并聚焦第一个命令', async () => {
    const pinia = createPinia()
    setActivePinia(pinia)
    const { useIdentityStore } = await import('@/stores/identity')
    useIdentityStore().status = 'signed_out'
    const Component = (await import('./IdentityMenu.vue')).default
    const wrapper = mount(Component, { attachTo: document.body, global: { plugins: [pinia] } })

    await wrapper.get('[data-testid="identity-trigger"]').trigger('keydown', { key: 'ArrowDown' })
    await wrapper.vm.$nextTick()

    expect(wrapper.find('[role="menu"]').exists()).toBe(true)
    expect(document.activeElement).toBe(wrapper.get('[data-testid="identity-sign-in"]').element)
    wrapper.unmount()
  })

  it('点击打开菜单后聚焦命令，并用 Tab 关闭菜单', async () => {
    const pinia = createPinia()
    setActivePinia(pinia)
    const { useIdentityStore } = await import('@/stores/identity')
    useIdentityStore().status = 'signed_out'
    const Component = (await import('./IdentityMenu.vue')).default
    const wrapper = mount(Component, { attachTo: document.body, global: { plugins: [pinia] } })

    await wrapper.get('[data-testid="identity-trigger"]').trigger('click')
    await wrapper.vm.$nextTick()
    expect(document.activeElement).toBe(wrapper.get('[data-testid="identity-sign-in"]').element)

    await wrapper.get('[role="menu"]').trigger('keydown', { key: 'Tab' })
    expect(wrapper.find('[role="menu"]').exists()).toBe(false)
    wrapper.unmount()
  })

  it('会话过期时显示重新登录入口和明确状态', async () => {
    const pinia = createPinia()
    setActivePinia(pinia)
    const { useIdentityStore } = await import('@/stores/identity')
    const store = useIdentityStore()
    store.status = 'expired'
    store.user = { sub: 'sub-1', name: '用户甲', username: '', picture: '' }
    const Component = (await import('./IdentityMenu.vue')).default
    const wrapper = mount(Component, { global: { plugins: [pinia] } })

    await wrapper.get('[data-testid="identity-trigger"]').trigger('click')

    expect(wrapper.text()).toContain('会话已过期')
    expect(wrapper.find('[data-testid="identity-sign-in"]').exists()).toBe(true)
    expect(wrapper.find('[aria-live="polite"]').exists()).toBe(true)
  })

  it.each([
    ['signing_in', '登录中'],
    ['offline_authenticated', '离线模式'],
    ['disabled', '身份服务未启用'],
  ])('%s 状态显示稳定且可读的中文文案', async (status, expectedText) => {
    const pinia = createPinia()
    setActivePinia(pinia)
    const { useIdentityStore } = await import('@/stores/identity')
    const store = useIdentityStore()
    store.status = status
    if (status === 'offline_authenticated') {
      store.user = { sub: 'sub-1', name: '离线用户', username: '', picture: '' }
    }
    const Component = (await import('./IdentityMenu.vue')).default
    const wrapper = mount(Component, { global: { plugins: [pinia] } })

    await wrapper.get('[data-testid="identity-trigger"]').trigger('click')

    expect(wrapper.text()).toContain(expectedText)
  })
})
