import { describe, expect, it, beforeEach, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import i18n from '@/i18n'

// publish tab 自 publish-frequency-policy-v2 起可用：它会挂载 PublishFrequencySettings，
// 该组件挂载即拉策略。此处 mock 掉以免测试依赖真实 electronAPI 是否存在。
// ⚠️ 必须用 importOriginal 保留其余导出：整模块替换会让同一对话框里「通用设置」的
//    LogsSettings 拿不到 logsGetInfo（实测产生 4 个未捕获 TypeError，测试虽过但 CI 红）。
vi.mock('@/api/publisher', async (importOriginal) => {
  const actual = await importOriginal()
  return {
    ...actual,
    getPublishFrequencyPolicy: vi.fn().mockResolvedValue({
      code: 0,
      data: {
        platforms: { wechat_mp: { tier: 'long', accountMinMs: 1200000, platformMinMs: 120000, accountDailyMax: 3 } },
        overrides: null,
        jitterRatio: 0.4,
        releaseGraceMs: 60000,
      },
    }),
    setPublishFrequencyPolicy: vi.fn().mockResolvedValue({ code: 0, data: { saved: true } }),
    emergencyReleasePublishWait: vi.fn().mockResolvedValue({ code: 0, data: { released: false, reason: 'no_waiting_window', max: 1 } }),
    getPublishEmergencyStatus: vi.fn().mockResolvedValue({ code: 0, data: { max: 1 } }),
  }
})

import SettingsDialog from './SettingsDialog.vue'

function mountDialog (locale = 'zh') {
  i18n.global.locale.value = locale
  return mount(SettingsDialog, {
    props: { visible: true },
    global: { plugins: [i18n], stubs: { teleport: true } },
  })
}

describe('SettingsDialog', () => {
  beforeEach(() => {
    i18n.global.locale.value = 'zh'
  })

  it('渲染五个 Tab，默认选中模型设置；发布设置为可用、账号设置仍禁用', () => {
    const wrapper = mountDialog()
    const tabs = wrapper.findAll('.settings-tab')
    expect(tabs).toHaveLength(5)
    expect(tabs[0].text()).toContain('模型设置')
    expect(tabs[1].text()).toContain('通用设置')
    expect(tabs[2].text()).toContain('飞书 API')
    // publish-frequency-policy-v2：发布设置由 disabled 转为可用（不再是「敬请期待」）
    expect(tabs[3].text()).toContain('发布设置')
    expect(tabs[3].text()).not.toContain('敬请期待')
    expect(tabs[3].attributes('disabled')).toBeUndefined()
    // 账号设置仍禁用（未在本变更范围内）
    expect(tabs[4].text()).toContain('账号设置')
    expect(tabs[4].text()).toContain('敬请期待')
    expect(tabs[4].attributes('disabled')).toBeDefined()
    expect(wrapper.get('.settings-tab.active').text()).toContain('模型设置')
  })

  it('点击禁用 Tab（账号设置）不切换激活态', async () => {
    const wrapper = mountDialog()
    await wrapper.findAll('.settings-tab')[4].trigger('click')
    await nextTick()
    expect(wrapper.get('.settings-tab.active').text()).toContain('模型设置')
  })

  it('点击发布设置切换到发布频率策略面板', async () => {
    const wrapper = mountDialog()
    await wrapper.findAll('.settings-tab')[3].trigger('click')
    await nextTick()
    await new Promise(resolve => setTimeout(resolve, 0))
    await nextTick()
    expect(wrapper.get('.settings-tab.active').text()).toContain('发布设置')
    expect(wrapper.find('[data-testid="publish-frequency-settings"]').exists()).toBe(true)
  })

  it('切换到通用设置渲染日志设置面板（i18n 文案）', async () => {
    const wrapper = mountDialog()
    await wrapper.findAll('.settings-tab')[1].trigger('click')
    await nextTick()
    await new Promise(resolve => setTimeout(resolve, 0))
    await nextTick()
    expect(wrapper.get('.settings-tab.active').text()).toContain('通用设置')
    expect(wrapper.text()).toContain('应用日志')
    expect(wrapper.text()).toContain('语言')
  })

  it('每个 Tab 渲染图标位（.tab-icon）', () => {
    const wrapper = mountDialog()
    const icons = wrapper.findAll('.settings-tab .tab-icon')
    expect(icons).toHaveLength(5)
  })

  it('en 语言下 Tab 为英文，发布设置不再是 Coming Soon', () => {
    const wrapper = mountDialog('en')
    const tabs = wrapper.findAll('.settings-tab')
    expect(tabs[0].text()).toContain('Model Settings')
    expect(tabs[3].text()).toContain('Publish Settings')
    expect(tabs[4].text()).toContain('Coming Soon')
  })
})
