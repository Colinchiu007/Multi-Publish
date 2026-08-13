// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import SceneAssetSelection from './SceneAssetSelection.vue'

vi.mock('@/api/publisher', () => ({
  story2videoCreateShareUrl: vi.fn(async (p) => ({ code: 0, data: { url: 'media://' + p } })),
}))

const CANDIDATES = [
  {
    index: 0,
    text: '场景一',
    prompt: 'prompt-a',
    promptTranslation: '翻译一',
    candidates: [
      { id: 'image-0', kind: 'image', seq: 0, path: 'C:/tmp/a1.png' },
      { id: 'image-1', kind: 'image', seq: 1, path: 'C:/tmp/a2.png' },
      { id: 'video-2', kind: 'video', seq: 2, path: 'C:/tmp/a.mp4' },
    ],
  },
  {
    index: 1,
    text: '场景二',
    prompt: 'prompt-b',
    promptTranslation: '翻译二',
    candidates: [
      { id: 'image-0', kind: 'image', seq: 0, path: 'C:/tmp/b1.png' },
      { id: 'image-1', kind: 'image', seq: 1, path: 'C:/tmp/b2.png' },
    ],
  },
]


// jsdom 中 UiModal Transition 残留 DOM：取最后一个匹配元素（当前激活 modal）
function lastEl (sel) {
  const els = document.querySelectorAll(sel)
  return els[els.length - 1]
}

describe('SceneAssetSelection', () => {
  beforeEach(() => vi.clearAllMocks())

  it('默认选中：有视频选视频，纯图选第 1 张', async () => {
    const w = mount(SceneAssetSelection, { props: { runId: 'run-1', candidates: CANDIDATES } })
    await new Promise((resolve) => setTimeout(resolve, 0))
    const radios = w.findAll('input[type=radio]')
    expect(radios[0].element.checked).toBe(false) // image-0 scene0
    expect(radios[1].element.checked).toBe(false) // image-1 scene0
    expect(radios[2].element.checked).toBe(true)  // video-2 scene0 default
    expect(radios[3].element.checked).toBe(true)  // image-0 scene1 default
    expect(radios[4].element.checked).toBe(false) // image-1 scene1
  })

  it('可切换选择并 emit confirm（含全部场景选择）', async () => {
    const w = mount(SceneAssetSelection, { props: { runId: 'run-1', candidates: CANDIDATES } })
    await new Promise((resolve) => setTimeout(resolve, 0))
    const radios = w.findAll('input[type=radio]')
    // 场景 0 改为 image-1
    await radios[1].setValue()
    const confirmBtn = w.find('[data-testid="sas-confirm"]')
    expect(confirmBtn.attributes('disabled')).toBeUndefined()
    await confirmBtn.trigger('click')
    const emitted = w.emitted('confirm')
    expect(emitted).toHaveLength(1)
    expect(emitted[0][0]).toEqual([
      { index: 0, candidateId: 'image-1' },
      { index: 1, candidateId: 'image-0' },
    ])
  })

  it('确认按钮禁用直到全部场景有选择（无候选时禁用）', () => {
    const w = mount(SceneAssetSelection, { props: { runId: 'run-1', candidates: [] } })
    expect(w.find('[data-testid="sas-confirm"]').attributes('disabled')).toBeDefined()
    expect(w.find('[data-testid="sas-empty"]').exists()).toBe(true)
  })

  it('confirming 时禁用确认并展示提交文案', () => {
    const w = mount(SceneAssetSelection, { props: { runId: 'run-1', candidates: CANDIDATES, confirming: true } })
    expect(w.find('[data-testid="sas-confirm"]').attributes('disabled')).toBeDefined()
  })

  it('点击图片缩略图打开预览弹窗并显示大图', async () => {
    const w = mount(SceneAssetSelection, { props: { runId: 'run-1', candidates: CANDIDATES } })
    await new Promise((resolve) => setTimeout(resolve, 0))
    const thumb = w.find('[data-testid="sas-preview-1-image-0"]')
    expect(thumb.exists()).toBe(true)
    await thumb.trigger('click')
    await new Promise((resolve) => setTimeout(resolve, 0))
    const modal = document.body.querySelector('[data-testid="sas-preview-modal"]')
    expect(modal).toBeTruthy()
    const img = document.body.querySelector('[data-testid="sas-preview-image"]')
    expect(img).toBeTruthy()
    expect(img.getAttribute('src')).toContain('media://C:/tmp/b1.png')
  })

  it('点击视频缩略图打开预览弹窗并显示播放器', async () => {
    const w = mount(SceneAssetSelection, { props: { runId: 'run-1', candidates: CANDIDATES } })
    await new Promise((resolve) => setTimeout(resolve, 0))
    const thumb = w.find('[data-testid="sas-preview-0-video-2"]')
    expect(thumb.exists()).toBe(true)
    await thumb.trigger('click')
    await new Promise((resolve) => setTimeout(resolve, 0))
    const modal = document.body.querySelector('[data-testid="sas-preview-modal"]')
    expect(modal).toBeTruthy()
    const video = document.body.querySelector('[data-testid="sas-preview-video"]')
    expect(video).toBeTruthy()
    expect(video.getAttribute('src')).toContain('media://C:/tmp/a.mp4')
  })

  it('点击遮罩/关闭可退出预览，且再次点击可重新打开', async () => {
    const w = mount(SceneAssetSelection, { props: { runId: 'run-1', candidates: CANDIDATES } })
    await new Promise((resolve) => setTimeout(resolve, 0))
    await w.find('[data-testid="sas-preview-1-image-0"]').trigger('click')
    await new Promise((resolve) => setTimeout(resolve, 0))
    const modalComp = w.findComponent({ name: 'UiModal' })
    expect(modalComp.props('visible')).toBe(true)
    expect(w.vm.preview).toBeTruthy()
    // 触发 UiModal close（模拟点击 ×/遮罩）
    modalComp.vm.$emit('close')
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(w.vm.preview).toBeNull()
    expect(modalComp.props('visible')).toBe(false)
    // 再次点击可重新打开
    await w.find('[data-testid="sas-preview-1-image-0"]').trigger('click')
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(w.vm.preview).toBeTruthy()
    expect(modalComp.props('visible')).toBe(true)
  })

  it('预览提示文案展示且不影响单选选择', async () => {
    const w = mount(SceneAssetSelection, { props: { runId: 'run-1', candidates: CANDIDATES } })
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(w.text()).toContain('点击缩略图可放大预览')
    const radios = w.findAll('input[type=radio]')
    expect(radios[2].element.checked).toBe(true) // video-2 默认选中
    // 点击图片缩略图（不改变选择）
    await w.find('[data-testid="sas-preview-1-image-0"]').trigger('click')
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(radios[2].element.checked).toBe(true)
    expect(radios[3].element.checked).toBe(true)
  })

  it('预览左右箭头循环切换：图片/视频候选间前后切换（2026-08-13）', async () => {
    const w = mount(SceneAssetSelection, { props: { runId: 'run-1', candidates: CANDIDATES } })
    await new Promise((resolve) => setTimeout(resolve, 0))
    // 打开场景 0 的 image-0 预览（场景 0 候选顺序：image-0, image-1, video-2）
    await w.find('[data-testid="sas-preview-0-image-0"]').trigger('click')
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(w.vm.preview.candidate.id).toBe('image-0')
    // 右箭头 → image-1
    lastEl('[data-testid="sas-preview-next"]').click()
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(w.vm.preview.candidate.id).toBe('image-1')
    // 右箭头 → video-2（图片/视频混合切换）
    lastEl('[data-testid="sas-preview-next"]').click()
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(w.vm.preview.candidate.id).toBe('video-2')
    // 右箭头 → 循环回第一条 image-0
    lastEl('[data-testid="sas-preview-next"]').click()
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(w.vm.preview.candidate.id).toBe('image-0')
    // 左箭头 → 循环回最后一条 video-2
    lastEl('[data-testid="sas-preview-prev"]').click()
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(w.vm.preview.candidate.id).toBe('video-2')
    // 左箭头 → image-1
    lastEl('[data-testid="sas-preview-prev"]').click()
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(w.vm.preview.candidate.id).toBe('image-1')
    // 场景不变（切换仅限当前场景候选）
    expect(w.vm.preview.scene.index).toBe(0)
  })

  it('切换后媒体类型跟随候选（图片→视频显示播放器）', async () => {
    const w = mount(SceneAssetSelection, { props: { runId: 'run-1', candidates: CANDIDATES } })
    await new Promise((resolve) => setTimeout(resolve, 0))
    await w.find('[data-testid="sas-preview-0-image-0"]').trigger('click')
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(document.body.querySelector('[data-testid="sas-preview-image"]')).toBeTruthy()
    // 切到 video-2
    lastEl('[data-testid="sas-preview-next"]').click()
    await new Promise((resolve) => setTimeout(resolve, 0))
    lastEl('[data-testid="sas-preview-next"]').click()
    await new Promise((resolve) => setTimeout(resolve, 0))
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(w.vm.preview.candidate.kind).toBe('video')
    expect(document.body.querySelector('[data-testid="sas-preview-video"]')).toBeTruthy()
  })
})
