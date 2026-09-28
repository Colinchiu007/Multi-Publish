import { describe, it, expect, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import i18n from '@/i18n'
import SelectedVideoCard from '@/features/publish/components/SelectedVideoCard.vue'

function mountCard (props) {
  return mount(SelectedVideoCard, {
    props,
    global: { plugins: [i18n] },
  })
}

describe('SelectedVideoCard（视频选择常驻反馈卡片）', () => {
  beforeEach(() => {
    i18n.global.locale.value = 'zh'
  })

  it('path 为空时不渲染卡片', () => {
    const w = mountCard({ path: '', info: null })
    expect(w.find('[data-testid="video-selected-card"]').exists()).toBe(false)
  })

  it('渲染文件名、格式化大小与格式徽标', () => {
    const w = mountCard({
      path: 'D:/media/01.mp4',
      info: { name: '01.mp4', sizeBytes: 25 * 1024 * 1024, formatLabel: 'MP4' },
    })
    expect(w.find('[data-testid="video-card-name"]').text()).toBe('01.mp4')
    expect(w.find('[data-testid="video-card-meta"]').text()).toContain('25.00 MB')
    expect(w.find('[data-testid="video-card-meta"]').text()).toContain('MP4')
  })

  it('info 为 null（草稿恢复）时从路径推导文件名并显示大小未知', () => {
    const w = mountCard({ path: 'D:/media/clip.avi', info: null })
    expect(w.find('[data-testid="video-card-name"]').text()).toBe('clip.avi')
    expect(w.find('[data-testid="video-card-meta"]').text()).toContain('AVI')
    expect(w.find('[data-testid="video-card-meta"]').text()).toContain('大小未知')
  })

  it('点击更换/移除按钮分别触发 replace/remove 事件', async () => {
    const w = mountCard({
      path: 'D:/media/01.mp4',
      info: { name: '01.mp4', sizeBytes: 10, formatLabel: 'MP4' },
    })
    await w.find('[data-testid="video-card-replace"]').trigger('click')
    await w.find('[data-testid="video-card-remove"]').trigger('click')
    expect(w.emitted('replace')).toHaveLength(1)
    expect(w.emitted('remove')).toHaveLength(1)
  })

  it('英文 locale 下渲染英文文案', () => {
    i18n.global.locale.value = 'en'
    const w = mountCard({
      path: 'D:/media/01.mp4',
      info: { name: '01.mp4', sizeBytes: 2048, formatLabel: 'MP4' },
    })
    expect(w.text()).toContain('Video file selected')
    expect(w.find('[data-testid="video-card-replace"]').text()).toContain('Change video')
  })
})
