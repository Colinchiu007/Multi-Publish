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
})
