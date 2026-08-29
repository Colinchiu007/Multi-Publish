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
