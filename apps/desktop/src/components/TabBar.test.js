import { describe, it, expect, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import TabBar from './TabBar.vue'
import { useTabStore } from '@/stores/tab'
import i18n from '@/i18n'

const srcDir = dirname(fileURLToPath(import.meta.url))
const tabbarSrc = readFileSync(join(srcDir, 'TabBar.vue'), 'utf8')

function seedTabs() {
  const store = useTabStore()
  store.tabs = [
    { tabId: 'home', url: '', title: '首页', isHome: true, loading: false },
    { tabId: 't1', url: 'https://creator.douyin.com/', title: '抖音', isHome: false, loading: false },
  ]
  store.activeTabId = 'home'
  return store
}

function mountBar() {
  seedTabs()
  return mount(TabBar, { global: { plugins: [i18n] } })
}

beforeEach(() => {
  setActivePinia(createPinia())
  i18n.global.locale.value = 'zh'
})

describe('TabBar 功能契约', () => {
  it('活动标签带 .active 类', () => {
    const w = mountBar()
    expect(w.get('[data-testid="tab-home"]').classes()).toContain('active')
    expect(w.get('[data-testid="tab-t1"]').classes()).not.toContain('active')
  })

  it('首页标签无关闭按钮，浏览器标签有关闭按钮', () => {
    const w = mountBar()
    expect(w.find('[data-testid="tab-close-home"]').exists()).toBe(false)
    expect(w.find('[data-testid="tab-close-t1"]').exists()).toBe(true)
  })

  it('点击标签触发 switch-tab，点击 + 触发 create-tab，点击关闭触发 close-tab', async () => {
    const w = mountBar()
    await w.get('[data-testid="tab-t1"]').trigger('click')
    expect(w.emitted('switch-tab')).toEqual([['t1']])
    await w.get('[data-testid="tab-add"]').trigger('click')
    expect(w.emitted('create-tab')).toHaveLength(1)
    await w.get('[data-testid="tab-close-t1"]').trigger('click')
    expect(w.emitted('close-tab')).toEqual([['t1']])
  })
})

describe('TabBar 样式精致化契约（去硬编码灰、改用设计 token）', () => {
  it('保留 36px 高度不变量（WebContentsView TOP=76px 契约）', () => {
    expect(tabbarSrc).toMatch(/\.tab-bar\s*\{[^}]*height:\s*36px/s)
  })

  it('标签栏背景不再使用旧硬编码灰 #e8eaf2，改用设计 token', () => {
    const barBlock = tabbarSrc.slice(tabbarSrc.indexOf('.tab-bar {'), tabbarSrc.indexOf('.tab-bar-tabs'))
    expect(barBlock).not.toMatch(/background:\s*#e8eaf2/)
    expect(barBlock).toMatch(/var\(--color-/)
  })

  it('活动标签用卡片底 + 品牌主色点缀（token 化）', () => {
    const activeBlock = tabbarSrc.slice(tabbarSrc.indexOf('.tab-item.active'))
    expect(activeBlock).toMatch(/var\(--color-bg-card/)
    expect(activeBlock).toMatch(/var\(--color-primary/)
  })

  it('平台图标图片有尺寸约束（tab-icon-img）', () => {
    expect(tabbarSrc).toMatch(/\.tab-icon-img\s*\{/)
  })
})

describe('TabBar 加载态徽标（转圈只在真加载中出现）', () => {
  function mountWithLoading (flags) {
    const store = useTabStore()
    store.tabs = [
      { tabId: 'home', url: '', title: '首页', isHome: true, loading: false },
      { tabId: 't1', url: 'https://creator.douyin.com/', title: '抖音', isHome: false, loading: flags[0] },
      { tabId: 't2', url: 'https://cp.kuaishou.com/article/manage/video', title: '快手', isHome: false, loading: flags[1] },
    ]
    store.activeTabId = 'home'
    return mount(TabBar, { global: { plugins: [i18n] } })
  }

  it('仅 loading=true 的标签渲染 spinner，其余标签不渲染', () => {
    const w = mountWithLoading([true, false])
    expect(w.get('[data-testid="tab-t1"]').find('.tab-spinner').exists()).toBe(true)
    expect(w.get('[data-testid="tab-t2"]').find('.tab-spinner').exists()).toBe(false)
    expect(w.findAll('.tab-spinner')).toHaveLength(1)
  })

  it('全部标签加载完毕时不得残留任何 spinner', () => {
    const w = mountWithLoading([false, false])
    expect(w.findAll('.tab-spinner')).toHaveLength(0)
  })

  it('spinner 必须是 SVG 图标组件，不得是裸 Unicode 字形', () => {
    const w = mountWithLoading([true, false])
    const spinner = w.get('.tab-spinner')
    expect(spinner.find('svg').exists()).toBe(true)
    expect(spinner.text()).toBe('')
  })

  it('结构锁：TabBar.vue 源码不得再出现裸字形 ⟳，且 spinner 动画有 reduced-motion 降级', () => {
    expect(tabbarSrc).not.toMatch(/⟳/)
    expect(tabbarSrc).toMatch(/prefers-reduced-motion/)
  })
})
