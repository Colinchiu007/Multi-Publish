// @ts-check
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { nextTick } from 'vue'
import i18n from '@/i18n'
import CoverCropDialog from './CoverCropDialog.vue'

function mockApi () {
  const readCoverData = vi.fn().mockResolvedValue({ code: 0, data: { dataUrl: 'data:image/jpeg;base64,AAAA' }, message: 'ok' })
  const cropVideoCover = vi.fn().mockResolvedValue({ code: 0, data: { path: 'C:/tmp/crop.jpg', sizeBytes: 100, width: 320, height: 180 } })
  vi.stubGlobal('electronAPI', {
    readCoverData,
    cropVideoCover,
    getPathForFile: vi.fn(async (f) => f?.path || ''),
  })
  return { readCoverData, cropVideoCover }
}

function mountDialog (props = {}) {
  i18n.global.locale.value = 'zh'
  return mount(CoverCropDialog, {
    props: { visible: true, imagePath: 'C:/tmp/video-cover.jpg', ...props },
    global: { plugins: [i18n], stubs: { teleport: true } },
  })
}

async function simulateImageLoad (wrapper) {
  // jsdom 不真正加载 <img>，手动触发 onload 以初始化裁剪框
  const img = wrapper.find('.crop-img')
  Object.defineProperty(img.element, 'naturalWidth', { value: 640, configurable: true })
  Object.defineProperty(img.element, 'naturalHeight', { value: 360, configurable: true })
  await img.trigger('load')
  await nextTick()
}

describe('CoverCropDialog', () => {
  beforeEach(() => {
    vi.unstubAllGlobals()
    i18n.global.locale.value = 'zh'
  })

  it('渲染标题/预览区/比例预设/确认按钮', async () => {
    mockApi()
    const wrapper = mountDialog()
    await flushPromises()
    expect(wrapper.find('.cover-crop-dialog').exists()).toBe(true)
    expect(wrapper.find('.crop-preview').exists()).toBe(true)
    const ratioBtns = wrapper.findAll('.ratio-btn')
    expect(ratioBtns.length).toBeGreaterThanOrEqual(4)
    expect(wrapper.find('.crop-confirm').exists()).toBe(true)
  })

  it('visible=false 不渲染弹窗内容', () => {
    mockApi()
    const wrapper = mountDialog({ visible: false })
    expect(wrapper.find('.cover-crop-dialog').exists()).toBe(false)
  })

  it('点击比例预设切换选中态', async () => {
    mockApi()
    const wrapper = mountDialog()
    await flushPromises()
    await simulateImageLoad(wrapper)
    const btns = wrapper.findAll('.ratio-btn')
    await btns[2].trigger('click')
    await nextTick()
    expect(btns[2].classes()).toContain('active')
  })

  it('确认时调用 cropVideoCover 并 emit success', async () => {
    const { cropVideoCover } = mockApi()
    const wrapper = mountDialog()
    await flushPromises()
    await simulateImageLoad(wrapper)
    await wrapper.find('.crop-confirm').trigger('click')
    await flushPromises()
    expect(cropVideoCover).toHaveBeenCalledTimes(1)
    const emitted = wrapper.emitted('success')
    expect(emitted).toBeTruthy()
    expect(emitted[0][0].path).toBe('C:/tmp/crop.jpg')
  })

  it('crop 失败时 emit error 且不 emit success', async () => {
    const { cropVideoCover } = mockApi()
    cropVideoCover.mockResolvedValue({ code: 1, message: '裁剪失败' })
    const wrapper = mountDialog()
    await flushPromises()
    await simulateImageLoad(wrapper)
    await wrapper.find('.crop-confirm').trigger('click')
    await flushPromises()
    expect(wrapper.emitted('success')).toBeFalsy()
    expect(wrapper.emitted('error')).toBeTruthy()
  })

  it('关闭按钮 emit close', async () => {
    mockApi()
    const wrapper = mountDialog()
    await flushPromises()
    await wrapper.find('.crop-close').trigger('click')
    expect(wrapper.emitted('close')).toBeTruthy()
  })

  it('readCoverData 失败时显示错误提示', async () => {
    mockApi()
    vi.stubGlobal('electronAPI', {
      readCoverData: vi.fn().mockResolvedValue({ code: 1, message: '读取失败' }),
      cropVideoCover: vi.fn(),
    })
    const wrapper = mountDialog()
    await flushPromises()
    expect(wrapper.find('.crop-error').exists()).toBe(true)
  })
})