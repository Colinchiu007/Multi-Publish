import { describe, expect, it, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import i18n from '@/i18n'
import ConfigSummary from './ConfigSummary.vue'

describe('ConfigSummary', () => {
  beforeEach(() => {
    i18n.global.locale.value = 'zh'
  })

  const config = {
    imageStyle: 'cinematic',
    imageEffect: 'zoom-in',
    voiceProvider: 'edge-tts',
    voiceModel: 'zh-CN-Xiaoxiao',
    voiceId: 'v1',
    videoMode: 'ai-judged',
    splitLanguage: 'zh',
    splitMode: 'balanced',
    platforms: ['douyin'],
  }
  const outputConfig = { resolution: '1080p', fps: 30 }

  it('渲染中文标签与本地化枚举值', () => {
    const wrapper = mount(ConfigSummary, {
      props: { config, outputConfig },
      global: { plugins: [i18n] },
    })
    const text = wrapper.text()
    expect(text).toContain('当前配置')
    expect(text).toContain('图片风格')
    expect(text).toContain('电影感')
    expect(text).toContain('慢慢放大')
    expect(text).toContain('AI 智能选择')
    expect(text).toContain('中文')
    expect(text).toContain('均衡')
    expect(text).toContain('1 个')
    expect(text).toContain('30 fps')
  })

  it('en 语言下标签与枚举切换为英文', () => {
    i18n.global.locale.value = 'en'
    const wrapper = mount(ConfigSummary, {
      props: { config, outputConfig },
      global: { plugins: [i18n] },
    })
    const text = wrapper.text()
    expect(text).toContain('Current Config')
    expect(text).toContain('Cinematic')
    expect(text).toContain('Slow zoom in')
    expect(text).toContain('AI selected')
    expect(text).toContain('1 platform(s)')
  })
})