// @ts-check
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { ref, reactive, nextTick } from 'vue'
import { mount, flushPromises } from '@vue/test-utils'
import VideoCloneView from './VideoCloneView.vue'
import i18n from '@/i18n'

const composable = {
  sourceType: ref('url'),
  linkUrl: ref('https://example.test/source.mp4'),
  filePath: ref('C:/private/source.mp4'),
  mode: ref('structure'),
  rewriteScript: ref(false),
  running: ref(false),
  runId: ref(null),
  stageStatus: reactive({ ingest: 'idle', analyze: 'idle', plan: 'idle', generate: 'idle', compose: 'idle', publish: 'idle' }),
  report: ref(null),
  similarity: ref(null),
  outputPath: ref(null),
  STAGE_LABELS: ['ingest', 'analyze', 'plan', 'generate', 'compose', 'publish'],
  start: vi.fn(),
  cancel: vi.fn(),
  editReport: vi.fn(),
  pickFile: vi.fn(),
  regenerate: vi.fn(),
  buildConfigProfileSnapshot: vi.fn(() => ({
    schemaVersion: 1,
    capturedAt: '2026-08-29T00:00:00.000Z',
    kind: 'video-clone',
    videoClone: { sourceType: composable.sourceType.value, mode: composable.mode.value, rewriteScript: composable.rewriteScript.value },
  })),
  applyConfigProfileSnapshot: vi.fn(() => true),
  loadConfigProfiles: vi.fn().mockResolvedValue([]),
  saveConfigProfile: vi.fn().mockResolvedValue({
    code: 0,
    data: { id: 'profile-000000000001', name: '复刻配置', pipelineId: 'video-clone', snapshot: { schemaVersion: 1 }, updatedAt: 1 },
  }),
  renameConfigProfile: vi.fn().mockResolvedValue({ code: 0, data: { id: 'profile-000000000001', name: '新名', pipelineId: 'video-clone', snapshot: { schemaVersion: 1 }, updatedAt: 2 } }),
  deleteConfigProfile: vi.fn().mockResolvedValue({ code: 0, data: { deleted: true, id: 'profile-000000000001' } }),
}

vi.mock('@/composables/useVideoClone', () => ({ useVideoClone: () => composable }))

const publisherApi = {
  story2videoCreateShareUrl: vi.fn().mockResolvedValue({ code: 0, data: { url: 'http://127.0.0.1:16521/media/abc123/clone.mp4' } }),
  story2videoSaveAs: vi.fn().mockResolvedValue({ code: 0, data: { cancelled: false } }),
  story2videoShowInFolder: vi.fn().mockResolvedValue({ code: 0 }),
  story2videoCopyPath: vi.fn().mockResolvedValue({ code: 0 }),
}

vi.mock('@/api/publisher', () => ({
  story2videoCreateShareUrl: (...args) => publisherApi.story2videoCreateShareUrl(...args),
  story2videoSaveAs: (...args) => publisherApi.story2videoSaveAs(...args),
  story2videoShowInFolder: (...args) => publisherApi.story2videoShowInFolder(...args),
  story2videoCopyPath: (...args) => publisherApi.story2videoCopyPath(...args),
}))

function mountView () {
  return mount(VideoCloneView, {
    global: {
      plugins: [i18n],
      compilerOptions: {
        isCustomElement: (tag) => tag.startsWith('el-'),
      },
      stubs: {
        Teleport: { template: '<div><slot /></div>' },
        Transition: { template: '<div><slot /></div>' },
      },
    },
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  composable.sourceType.value = 'url'
  composable.linkUrl.value = 'https://example.test/source.mp4'
  composable.filePath.value = 'C:/private/source.mp4'
  composable.mode.value = 'structure'
  composable.rewriteScript.value = false
  composable.running.value = false
  composable.runId.value = null
  composable.report.value = null
  composable.similarity.value = null
  composable.outputPath.value = null
  for (const key of Object.keys(composable.stageStatus)) composable.stageStatus[key] = 'idle'
})

describe('VideoCloneView configuration profiles', () => {
  it('renders the profile manager with the video-clone pipeline and keeps the main controls', () => {
    const wrapper = mountView()
    expect(wrapper.find('[data-testid="video-clone-config-profile-save"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="video-clone-config-profile-manage"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="video-clone-mode"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="video-clone-rewrite-script"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="video-clone-start"]').exists()).toBe(true)
  })

  it('routes manager save through the composable with a current JSON snapshot', async () => {
    const wrapper = mountView()
    await wrapper.find('[data-testid="video-clone-config-profile-save"]').trigger('click')
    await wrapper.find('[data-testid="video-clone-config-profile-name-input"]').setValue('  复刻配置  ')
    await wrapper.find('[data-testid="video-clone-config-profile-save-confirm"]').trigger('click')
    await flushPromises()
    expect(composable.saveConfigProfile).toHaveBeenCalledWith('复刻配置', expect.objectContaining({
      overwrite: false,
      snapshot: expect.objectContaining({ kind: 'video-clone', videoClone: expect.any(Object) }),
    }))
  })

  it('routes apply after confirmation and preserves the selected profile snapshot', async () => {
    composable.sourceType.value = 'local'
    composable.mode.value = 'style'
    composable.rewriteScript.value = true
    composable.loadConfigProfiles.mockResolvedValueOnce([
      { id: 'profile-000000000001', name: '保存项', pipelineId: 'video-clone', snapshot: { kind: 'video-clone', videoClone: { sourceType: 'url', mode: 'structure', rewriteScript: false } }, updatedAt: 3 },
    ])
    const wrapper = mountView()
    await wrapper.find('[data-testid="video-clone-config-profile-manage"]').trigger('click')
    await flushPromises()
    await wrapper.find('[data-testid="video-clone-config-profile-apply"]').trigger('click')
    expect(wrapper.find('[data-testid="video-clone-config-profile-apply-dialog"]').exists()).toBe(true)
    await wrapper.find('[data-testid="video-clone-config-profile-apply-confirm"]').trigger('click')
    await flushPromises()
    expect(composable.applyConfigProfileSnapshot).toHaveBeenCalledWith(expect.objectContaining({ kind: 'video-clone' }))
  })

  it('keeps the original start action wired after profile integration', async () => {
    const wrapper = mountView()
    await wrapper.find('[data-testid="video-clone-start"]').trigger('click')
    expect(composable.start).toHaveBeenCalledTimes(1)
    await nextTick()
  })
})

describe('VideoCloneView output video', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    composable.outputPath.value = null
  })

  it('outputPath 为空时不渲染成品视频卡片', async () => {
    const wrapper = mountView()
    await flushPromises()
    expect(wrapper.find('[data-testid="video-clone-output-video"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="video-clone-download"]').exists()).toBe(false)
  })

  it('outputPath 设置后渲染视频卡片和播放器', async () => {
    composable.outputPath.value = 'C:/tmp/vc-out/clone.mp4'
    const wrapper = mountView()
    await flushPromises()
    expect(wrapper.find('[data-testid="video-clone-output-video"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="video-clone-download"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="video-clone-show-in-folder"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="video-clone-copy-path"]').exists()).toBe(true)
  })

  it('点击下载按钮调用 story2videoSaveAs', async () => {
    composable.outputPath.value = 'C:/tmp/vc-out/clone.mp4'
    const wrapper = mountView()
    await flushPromises()
    await wrapper.find('[data-testid="video-clone-download"]').trigger('click')
    expect(publisherApi.story2videoSaveAs).toHaveBeenCalledWith('C:/tmp/vc-out/clone.mp4', expect.stringContaining('video_clone_'))
  })

  it('点击打开文件夹调用 story2videoShowInFolder', async () => {
    composable.outputPath.value = 'C:/tmp/vc-out/clone.mp4'
    const wrapper = mountView()
    await flushPromises()
    await wrapper.find('[data-testid="video-clone-show-in-folder"]').trigger('click')
    expect(publisherApi.story2videoShowInFolder).toHaveBeenCalledWith('C:/tmp/vc-out/clone.mp4')
  })

  it('点击复制路径调用 story2videoCopyPath', async () => {
    composable.outputPath.value = 'C:/tmp/vc-out/clone.mp4'
    const wrapper = mountView()
    await flushPromises()
    await wrapper.find('[data-testid="video-clone-copy-path"]').trigger('click')
    expect(publisherApi.story2videoCopyPath).toHaveBeenCalledWith('C:/tmp/vc-out/clone.mp4')
  })
})
