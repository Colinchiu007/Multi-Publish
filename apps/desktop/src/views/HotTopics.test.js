// @ts-check
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'

// mock element-plus（ElMessage 等）
vi.mock('element-plus', () => ({
  ElMessage: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() },
  ElMessageBox: { confirm: vi.fn() },
}))

const pushSpy = vi.fn()
vi.mock('vue-router', () => ({
  useRouter: () => ({ push: pushSpy }),
  useRoute: () => ({ query: {} }),
}))

vi.mock('vue-i18n', async (importOriginal) => {
  const actual = await importOriginal()
  return {
    ...actual,
    useI18n: () => ({ t: (key, params) => key + (params ? ':' + JSON.stringify(params) : '') }),
  }
})

vi.mock('@/api/hot-topics', () => ({
  hotTopicsFetch: vi.fn(),
  hotTopicsGetCache: vi.fn(),
}))

vi.mock('@/api/publisher', () => ({
  aiRewrite: vi.fn(),
  draftSave: vi.fn(),
  storeGetSetting: vi.fn(),
  pipelineStartOrchestrated: vi.fn(),
  pipelineGetRunContext: vi.fn(),
  onPipelineUpdate: vi.fn(() => vi.fn()),
}))

vi.mock('@/composables/useNotify', () => ({
  useNotify: () => ({
    notifySuccess: vi.fn(),
    notifyError: vi.fn(),
    notifyInfo: vi.fn(),
  }),
}))

import HotTopics from './HotTopics.vue'
import i18n from '@/i18n'
import { hotTopicsFetch } from '@/api/hot-topics'
import { aiRewrite, draftSave, storeGetSetting, pipelineStartOrchestrated, pipelineGetRunContext } from '@/api/publisher'

const mockTopics = [
  { id: 'zhihu:1', topic: 'AI大模型最新突破进展', channel: 'zhihu', category: 'tech', rank: 1, hotValue: 12000000, url: null, fetchedAt: '2026-09-11T00:00:00Z' },
  { id: 'toutiao:1', topic: 'A股大涨沪指重返3000点', channel: 'toutiao', category: 'finance', rank: 1, hotValue: 456789, url: null, fetchedAt: '2026-09-11T00:00:00Z' },
  { id: 'baidu:1', topic: '普通日常记录', channel: 'baidu', category: 'general', rank: 1, hotValue: null, url: null, fetchedAt: '2026-09-11T00:00:00Z' },
]

function mountPage() {
  return mount(HotTopics, {
    global: { plugins: [i18n], stubs: { 'el-alert': true, 'el-select': true, 'el-option': true, 'el-progress': true, 'el-skeleton': true } },
  })
}

describe('HotTopics.vue', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    pushSpy.mockClear()
  })

  it('renders topic list after fetch', async () => {
    hotTopicsFetch.mockResolvedValue({ code: 0, data: { topics: mockTopics, fetchedAt: Date.now(), channelStats: { zhihu: { ok: true } } } })
    const wrapper = mountPage()
    await flushPromises()
    const items = wrapper.findAll('[data-testid="hot-topic-item"]')
    expect(items).toHaveLength(3)
    expect(wrapper.text()).toContain('AI大模型最新突破进展')
  })

  it('shows empty state when no topics', async () => {
    hotTopicsFetch.mockResolvedValue({ code: 0, data: { topics: [], fetchedAt: Date.now(), channelStats: {} } })
    const wrapper = mountPage()
    await flushPromises()
    expect(wrapper.find('[data-testid="hot-topics-empty"]').exists()).toBe(true)
  })

  it('category filter narrows the list', async () => {
    hotTopicsFetch.mockResolvedValue({ code: 0, data: { topics: mockTopics, fetchedAt: Date.now(), channelStats: {} } })
    const wrapper = mountPage()
    await flushPromises()
    // 点击「科技」chip（第 5 个：全部/综合/社会/财经/科技）
    const chips = wrapper.findAll('.category-chip')
    await chips[4].trigger('click')
    expect(wrapper.findAll('[data-testid="hot-topic-item"]')).toHaveLength(1)
  })

  it('checkbox toggle updates selection', async () => {
    hotTopicsFetch.mockResolvedValue({ code: 0, data: { topics: mockTopics, fetchedAt: Date.now(), channelStats: {} } })
    const wrapper = mountPage()
    await flushPromises()
    const check = wrapper.find('[data-testid="hot-topic-check-zhihu:1"]')
    await check.setValue(true)
    expect(wrapper.text()).toContain('selectedCount')
  })

  it('single create-copy navigates to /rewrite with topic query', async () => {
    hotTopicsFetch.mockResolvedValue({ code: 0, data: { topics: mockTopics, fetchedAt: Date.now(), channelStats: {} } })
    const wrapper = mountPage()
    await flushPromises()
    await wrapper.find('.item-create-btn').trigger('click')
    expect(pushSpy).toHaveBeenCalledWith('/rewrite?topic=' + encodeURIComponent('AI大模型最新突破进展'))
  })

  it('batch publish flow: rewrite all, save drafts, navigate', async () => {
    hotTopicsFetch.mockResolvedValue({ code: 0, data: { topics: mockTopics, fetchedAt: Date.now(), channelStats: {} } })
    aiRewrite.mockResolvedValue({ code: 0, data: { success: true, result: '改写后的文案内容' } })
    draftSave.mockResolvedValue({ code: 0 })
    const wrapper = mountPage()
    await flushPromises()
    // 全选 + 一键发布（teleport 弹窗挂到 document.body）
    const el = document.createElement('div')
    document.body.appendChild(el)
    const attached = mount(HotTopics, {
      attachTo: el,
      global: { plugins: [i18n], stubs: { 'el-alert': true, 'el-select': true, 'el-option': true, 'el-progress': true, 'el-skeleton': true } },
    })
    await flushPromises()
    await attached.find('.select-all-label input').setValue(true)
    // 重新 mount 后 hotTopicsFetch 已被调用过，直接触发发布
    attached.vm.selectedIds = new Set(mockTopics.map(x => x.id))
    await attached.vm.$nextTick()
    const publishBtn = attached.findAll('.batch-actions button').find(b => b.text().includes('publishBtn'))
    await publishBtn.trigger('click')
    const articleBtn = document.body.querySelector('[data-testid="publish-dest-article"]')
    expect(articleBtn).toBeTruthy()
    articleBtn.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await flushPromises()
    expect(aiRewrite).toHaveBeenCalledTimes(3)
    expect(draftSave).toHaveBeenCalledTimes(3)
    attached.unmount()
    el.remove()
  })

  // ─── Bug 回归：改写完成后进度区不消失，完成提示与去发布按钮可见 ───
  // E2E 2026-09-11 发现：publishing=false 时 v-if 切回批量条，
  // 「改写完成，已生成 n 条草稿」和「去发布」按钮一闪而过用户看不到。
  it('publish progress area stays visible after completion with done text and go-publish button', async () => {
    hotTopicsFetch.mockResolvedValue({ code: 0, data: { topics: mockTopics, fetchedAt: Date.now(), channelStats: {} } })
    aiRewrite.mockResolvedValue({ code: 0, data: { success: true, result: '改写结果' } })
    draftSave.mockResolvedValue({ code: 0 })
    const el = document.createElement('div')
    document.body.appendChild(el)
    const attached = mount(HotTopics, {
      attachTo: el,
      global: { plugins: [i18n], stubs: { 'el-alert': true, 'el-select': true, 'el-option': true, 'el-progress': true, 'el-skeleton': true } },
    })
    await flushPromises()
    attached.vm.selectedIds = new Set(mockTopics.map(x => x.id))
    await attached.vm.$nextTick()
    const publishBtn = attached.findAll('.batch-actions button').find(b => b.text().includes('publishBtn'))
    await publishBtn.trigger('click')
    const articleBtn = document.body.querySelector('[data-testid="publish-dest-article"]')
    articleBtn.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await flushPromises()
    // 完成后：批量条隐藏，进度区仍在，完成提示与去发布按钮可见
    expect(attached.find('[data-testid="hot-topics-batch-bar"]').exists()).toBe(false)
    expect(attached.find('.publish-progress').exists()).toBe(true)
    expect(attached.find('.publish-done').exists()).toBe(true)
    expect(attached.text()).toContain('publishDone')
    // 点返回 → 回到批量条
    const backBtn = attached.findAll('button').find(b => b.text().includes('backToBatch'))
    await backBtn.trigger('click')
    expect(attached.find('[data-testid="hot-topics-batch-bar"]').exists()).toBe(true)
    expect(attached.find('.publish-progress').exists()).toBe(false)
    attached.unmount()
    el.remove()
  })

  // ─── 一键生成视频 ───

  it('generate-video button renders on each topic row', async () => {
    hotTopicsFetch.mockResolvedValue({ code: 0, data: { topics: mockTopics, fetchedAt: Date.now(), channelStats: {} } })
    const wrapper = mountPage()
    await flushPromises()
    const btns = wrapper.findAll('[data-testid^="hot-topic-generate-video-"]')
    expect(btns).toHaveLength(3)
    expect(btns[0].text()).toContain('generateVideo')
  })

  it('generate-video opens modal, rewrites, saves draft, and starts story2video pipeline', async () => {
    hotTopicsFetch.mockResolvedValue({ code: 0, data: { topics: mockTopics, fetchedAt: Date.now(), channelStats: {} } })
    aiRewrite.mockResolvedValue({ code: 0, data: { success: true, result: '改写后的视频文案内容' } })
    draftSave.mockResolvedValue({ code: 0 })
    storeGetSetting.mockResolvedValue(null)
    pipelineStartOrchestrated.mockResolvedValue({ code: 0, data: { success: true, runId: 'run-123', stages: [{ name: 'split', status: 'running' }] } })
    pipelineGetRunContext.mockResolvedValue({ code: 0, data: { runId: 'run-123', status: { status: 'running', progress: 10, stages: [{ name: 'split', status: 'running' }] } } })

    const wrapper = mountPage()
    await flushPromises()
    await wrapper.find('[data-testid="hot-topic-generate-video-zhihu:1"]').trigger('click')
    await flushPromises()

    // 弹窗打开，改写完成，流水线启动
    expect(aiRewrite).toHaveBeenCalledWith({ mode: 'create', content: expect.stringContaining('AI大模型最新突破进展') })
    expect(draftSave).toHaveBeenCalledTimes(1)
    expect(pipelineStartOrchestrated).toHaveBeenCalledWith('story2video-compose', expect.objectContaining({
      text: '改写后的视频文案内容',
      inputMode: 'text',
      story2videoTextConfig: expect.objectContaining({ mode: 'text', prompt: '改写后的视频文案内容' }),
    }))
    // stages 数组含 rewrite_copy 在最前 + 7 个流水线阶段
    const stageNames = wrapper.vm.genVideoStages.map(s => s.name)
    expect(stageNames[0]).toBe('rewrite_copy')
    expect(stageNames).toHaveLength(8)
    expect(wrapper.vm.genVideoStages.find(s => s.name === 'rewrite_copy').status).toBe('completed')
  })

  it('generate-video rewrite failure marks stage failed with retry available', async () => {
    hotTopicsFetch.mockResolvedValue({ code: 0, data: { topics: mockTopics, fetchedAt: Date.now(), channelStats: {} } })
    aiRewrite.mockResolvedValue({ code: 0, data: { success: false, error: 'quota exceeded' } })

    const wrapper = mountPage()
    await flushPromises()
    await wrapper.find('[data-testid="hot-topic-generate-video-toutiao:1"]').trigger('click')
    await flushPromises()

    expect(wrapper.vm.genVideoPhase).toBe('failed')
    expect(wrapper.vm.genVideoStages.find(s => s.name === 'rewrite_copy').status).toBe('failed')
    expect(pipelineStartOrchestrated).not.toHaveBeenCalled()
  })

  it('generate-video pipeline start failure keeps rewrite completed and allows retry without re-rewriting', async () => {
    hotTopicsFetch.mockResolvedValue({ code: 0, data: { topics: mockTopics, fetchedAt: Date.now(), channelStats: {} } })
    aiRewrite.mockResolvedValue({ code: 0, data: { success: true, result: '改写结果文案' } })
    draftSave.mockResolvedValue({ code: 0 })
    storeGetSetting.mockResolvedValue(null)
    pipelineStartOrchestrated.mockResolvedValue({ code: -1, message: 'concurrency limit' })

    const wrapper = mountPage()
    await flushPromises()
    await wrapper.find('[data-testid="hot-topic-generate-video-zhihu:1"]').trigger('click')
    await flushPromises()

    expect(wrapper.vm.genVideoPhase).toBe('failed')
    expect(wrapper.vm.genVideoStages.find(s => s.name === 'rewrite_copy').status).toBe('completed')

    // 重试：不重新改写，直接再启动流水线
    pipelineStartOrchestrated.mockClear()
    aiRewrite.mockClear()
    pipelineStartOrchestrated.mockResolvedValue({ code: 0, data: { success: true, runId: 'run-456' } })
    pipelineGetRunContext.mockResolvedValue({ code: 0, data: { runId: 'run-456', status: { status: 'running', progress: 5 } } })
    await wrapper.vm.retryGenVideo()
    await flushPromises()
    expect(aiRewrite).not.toHaveBeenCalled()
    expect(pipelineStartOrchestrated).toHaveBeenCalledTimes(1)
  })

  it('generate-video completes and navigates to result page with videoPath', async () => {
    hotTopicsFetch.mockResolvedValue({ code: 0, data: { topics: mockTopics, fetchedAt: Date.now(), channelStats: {} } })
    aiRewrite.mockResolvedValue({ code: 0, data: { success: true, result: '完整流程文案' } })
    draftSave.mockResolvedValue({ code: 0 })
    storeGetSetting.mockResolvedValue(null)
    pipelineStartOrchestrated.mockResolvedValue({ code: 0, data: { success: true, runId: 'run-done-1' } })
    pipelineGetRunContext.mockResolvedValue({ code: 0, data: {
      runId: 'run-done-1',
      status: { status: 'completed', progress: 100, stages: [
        { name: 'split', status: 'completed' }, { name: 'scene_context', status: 'completed' },
        { name: 'optimize', status: 'completed' }, { name: 'select_video_scenes', status: 'skipped' },
        { name: 'generate_assets', status: 'completed' }, { name: 'compose', status: 'completed' },
        { name: 'publish', status: 'skipped' },
      ] },
      context: { compose: { data: { videoPath: 'D:/videos/out.mp4' } }, story2videoProject: { projectId: 'p1' } },
    } })

    const wrapper = mountPage()
    await flushPromises()
    await wrapper.find('[data-testid="hot-topic-generate-video-zhihu:1"]').trigger('click')
    await flushPromises()
    await new Promise(r => setTimeout(r, 50))
    await flushPromises()

    expect(wrapper.vm.genVideoPhase).toBe('completed')
    expect(wrapper.vm.genVideoModalOpen).toBe(false)
    expect(pushSpy).toHaveBeenCalledWith({ path: '/create/result', query: { path: 'D:/videos/out.mp4', project: 'p1', runId: 'run-done-1' } })
  })
})
