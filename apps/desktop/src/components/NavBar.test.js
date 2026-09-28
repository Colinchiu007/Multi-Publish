import { describe, it, expect, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import NavBar from './NavBar.vue'
import i18n from '@/i18n'

const srcDir = dirname(fileURLToPath(import.meta.url))
const navbarSrc = readFileSync(join(srcDir, 'NavBar.vue'), 'utf8')

function mountNavBar (props = {}) {
  return mount(NavBar, { props, global: { plugins: [i18n] } })
}

beforeEach(() => {
  i18n.global.locale.value = 'zh'
})

describe('NavBar 登录标签态（参考产品对标）', () => {
  it('默认不显示保存账号按钮', () => {
    const w = mountNavBar()
    expect(w.find('[data-testid="nav-save-account"]').exists()).toBe(false)
  })

  it('isLoginTab 为 true 时显示蓝色「保存账号」按钮', () => {
    const w = mountNavBar({ isLoginTab: true })
    const button = w.get('[data-testid="nav-save-account"]')
    expect(button.text()).toBe('保存账号')
    expect(button.attributes('disabled')).toBeUndefined()
  })

  it('点击保存账号按钮触发 save-account 事件', async () => {
    const w = mountNavBar({ isLoginTab: true })
    await w.get('[data-testid="nav-save-account"]').trigger('click')
    expect(w.emitted('save-account')).toHaveLength(1)
  })

  it('saving 为 true 时按钮禁用并显示「保存中...」', () => {
    const w = mountNavBar({ isLoginTab: true, saving: true })
    const button = w.get('[data-testid="nav-save-account"]')
    expect(button.text()).toBe('保存中...')
    expect(button.attributes('disabled')).toBeDefined()
  })

  it('导航栏保留后退/前进/刷新/首页与地址栏', () => {
    const w = mountNavBar({ isLoginTab: true, isHome: false, currentUrl: 'https://creator.douyin.com/' })
    expect(w.get('[data-testid="nav-back"]').exists()).toBe(true)
    expect(w.get('[data-testid="nav-forward"]').exists()).toBe(true)
    expect(w.get('[data-testid="nav-reload"]').exists()).toBe(true)
    expect(w.get('[data-testid="nav-home"]').exists()).toBe(true)
    expect(w.get('[data-testid="nav-url-input"]').element.value).toBe('https://creator.douyin.com/')
  })
})

describe('NavBar 首页标签只读态（壳态收敛 6a 修订）', () => {
  it('isHome 为 true 时仍渲染后退/前进/首页与地址栏（消除与浏览器标签的割裂）', () => {
    const w = mountNavBar({ isHome: true })
    expect(w.get('[data-testid="nav-back"]').exists()).toBe(true)
    expect(w.get('[data-testid="nav-forward"]').exists()).toBe(true)
    expect(w.get('[data-testid="nav-home"]').exists()).toBe(true)
    expect(w.get('[data-testid="nav-url-input"]').exists()).toBe(true)
  })

  it('isHome 为 true 时刷新按钮隐藏、地址栏禁用（无语义项不外露）', () => {
    const w = mountNavBar({ isHome: true })
    expect(w.find('[data-testid="nav-reload"]').exists()).toBe(false)
    expect(w.get('[data-testid="nav-url-input"]').attributes('disabled')).toBeDefined()
  })

  it('isHome 时地址栏占位提示为「首页」而非误导性的搜索文案', () => {
    const w = mountNavBar({ isHome: true })
    expect(w.get('[data-testid="nav-url-input"]').attributes('placeholder')).toBe('首页')
  })

  it('非首页标签地址栏不禁用、占位提示为搜索文案', () => {
    const w = mountNavBar({ isHome: false, currentUrl: 'https://example.com' })
    expect(w.get('[data-testid="nav-url-input"]').attributes('disabled')).toBeUndefined()
    expect(w.get('[data-testid="nav-url-input"]').attributes('placeholder')).toContain('搜索')
  })
})

describe('NavBar 导航三键图标（内联 SVG 替换裸 Unicode 字形）', () => {
  it('后退/前进/刷新按钮渲染 SVG 图标且不再输出文本字形', () => {
    const w = mountNavBar({ isHome: false, currentUrl: 'https://example.com' })
    for (const id of ['nav-back', 'nav-forward', 'nav-reload']) {
      const btn = w.get(`[data-testid="${id}"]`)
      expect(btn.find('svg').exists()).toBe(true)
      expect(btn.text()).toBe('')
    }
  })

  it('禁用态仍由 canGoBack / canGoForward 驱动（换图标不改行为）', () => {
    const off = mountNavBar({ isHome: false, currentUrl: 'https://example.com' })
    expect(off.get('[data-testid="nav-back"]').attributes('disabled')).toBeDefined()
    expect(off.get('[data-testid="nav-forward"]').attributes('disabled')).toBeDefined()

    const on = mountNavBar({ isHome: false, currentUrl: 'https://example.com', canGoBack: true, canGoForward: true })
    expect(on.get('[data-testid="nav-back"]').attributes('disabled')).toBeUndefined()
    expect(on.get('[data-testid="nav-forward"]').attributes('disabled')).toBeUndefined()
  })

  it('点击三键仍分别发出 go-back / go-forward / reload', async () => {
    const w = mountNavBar({ isHome: false, currentUrl: 'https://example.com', canGoBack: true, canGoForward: true })
    await w.get('[data-testid="nav-back"]').trigger('click')
    await w.get('[data-testid="nav-forward"]').trigger('click')
    await w.get('[data-testid="nav-reload"]').trigger('click')
    expect(w.emitted('go-back')).toHaveLength(1)
    expect(w.emitted('go-forward')).toHaveLength(1)
    expect(w.emitted('reload')).toHaveLength(1)
  })

  it('loading 为 true 才渲染导航栏 spinner，且为 SVG', () => {
    expect(mountNavBar({ isHome: false, currentUrl: 'https://example.com' }).find('.nav-loading').exists()).toBe(false)
    const w = mountNavBar({ isHome: false, currentUrl: 'https://example.com', loading: true })
    const spinner = w.get('.nav-loading')
    expect(spinner.find('svg').exists()).toBe(true)
    expect(spinner.text()).toBe('')
  })

  it('结构锁：NavBar.vue 源码不得再出现 ← → ⟳ 裸字形，且 spinner 有 reduced-motion 降级', () => {
    expect(navbarSrc).not.toMatch(/[←→⟳]/)
    expect(navbarSrc).toMatch(/prefers-reduced-motion/)
  })
})
