import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import CreateViewHistory from './CreateViewHistory.vue'
import zh from '@/locales/zh'

// 复刻 i18n/index.js toMessageFunctions + vue-i18n 函数消息调用语义：
// 无参返回 key（沿用既有断言约定）；带参且目标为函数消息时用 params 构造 named()
// 上下文执行，使真实插值契约进入断言（字符串消息不再隐式插值，与生产行为一致）。
function resolveLocaleMessage (key) {
  return key.split('.').reduce((node, part) => (node == null ? undefined : node[part]), zh)
}

const interpolatingT = (key, params) => {
  if (!params) return key
  const message = resolveLocaleMessage(key)
  if (typeof message === 'function') return message({ named: name => (params[name] ?? '') })
  return key + ' ' + (params.scenes || '')
}

const mountHistory = (history, props = {}) => mount(CreateViewHistory, {
  props: { history, ...props },
  global: {
    mocks: { $t: interpolatingT },
  },
})

describe('CreateViewHistory', () => {
  it('renders accessible status tabs with all selected by default', () => {
    const wrapper = mountHistory([])
    const tablist = wrapper.find('[role="tablist"]')
    expect(tablist.exists()).toBe(true)
    const tabs = wrapper.findAll('[role="tab"]')
    expect(tabs).toHaveLength(6)
    expect(tabs[0].attributes('aria-selected')).toBe('true')
    expect(tabs[0].attributes('tabindex')).toBe('0')
    expect(wrapper.find('select').exists()).toBe(false)
  })

  it('supports Arrow/Home/End keyboard tab selection', async () => {
    const wrapper = mountHistory([{ id: 'running', status: 'running' }])
    const tablist = wrapper.find('[role="tablist"]')
    await tablist.trigger('keydown', { key: 'ArrowRight' })
    expect(wrapper.emitted('update:historyFilter')?.at(-1)).toEqual(['running'])
    await tablist.trigger('keydown', { key: 'End' })
    expect(wrapper.emitted('update:historyFilter')?.at(-1)).toEqual(['cancelled'])
    await tablist.trigger('keydown', { key: 'Home' })
    expect(wrapper.emitted('update:historyFilter')?.at(-1)).toEqual(['all'])
  })

  it('separates paused and failed and sorts every filtered result by effective time', async () => {
    const wrapper = mountHistory([
      { id: 'failed', status: 'failed', updatedAt: '2026-08-15T12:00:00Z', pausedStage: 'compose', error: 'boom' },
      { id: 'paused', status: 'paused', updatedAt: '2026-08-15T11:00:00Z', pausedStage: 'compose' },
    ])
    await wrapper.find('[role="tab"][data-status="paused"]').trigger('click')
    expect(wrapper.findAll('.history-item')).toHaveLength(1)
    expect(wrapper.find('.history-item').attributes('data-history-id')).toBe('paused')
    await wrapper.find('[role="tab"][data-status="failed"]').trigger('click')
    expect(wrapper.findAll('.history-item')).toHaveLength(1)
    expect(wrapper.text()).toContain('boom')
    expect(wrapper.text()).toContain('history.failedStage')
  })

  it('keeps the same card contract in every status tab, including title fallback, thumbnail slot and video duration', async () => {
    const statuses = ['running', 'paused', 'failed', 'completed', 'cancelled']
    const wrapper = mountHistory(statuses.map((status, index) => ({
      id: 'task-' + status,
      projectId: 'project-' + status,
      status,
      sourceText: '任务文案 ' + status,
      videoDuration: 61,
      duration: 900000,
      updatedAt: '2026-08-15T' + String(12 - index).padStart(2, '0') + ':00:00Z',
    })))

    for (const status of statuses) {
      await wrapper.find('[role="tab"][data-status="' + status + '"]').trigger('click')
      const card = wrapper.find('[data-history-id="task-' + status + '"]')
      expect(card.find('.history-name').text()).toContain('任务文案 ' + status)
      expect(card.find('[data-testid="history-thumbnail"]').exists()).toBe(true)
      expect(card.text()).toContain('create.history.notGenerated')
      expect(card.text()).toContain('create.history.contentPreview')
      expect(card.text()).toContain('任务文案 ' + status)
      expect(card.text()).toContain('create.history.videoDuration')
      expect(card.text()).not.toContain('undefined')
      expect(card.text()).not.toContain('null')
    }
  })

  it('thumbnail 加载失败时回退到稳定的未生成占位', async () => {
    const item = { id: 'thumbnail-error', projectId: 'project-thumbnail-error', status: 'completed', thumbnailUrl: 'media://stale' }
    const wrapper = mountHistory([item])
    const image = wrapper.find('[data-testid="history-thumbnail"] img')
    expect(image.exists()).toBe(true)

    await image.trigger('error')

    expect(item.thumbnailUrl).toBeNull()
    expect(item.thumbnailStatus).toBe('failed')
    expect(wrapper.find('[data-testid="history-thumbnail"] img').exists()).toBe(false)
    expect(wrapper.find('[data-testid="history-thumbnail"]').text()).toContain('create.history.notGenerated')
  })

  it('uses explicit media duration and never renders pipeline execution duration as video duration', () => {
    const wrapper = mountHistory([
      { id: 'video-duration', status: 'completed', duration: 900000, video: { duration: 65 } },
      { id: 'missing-video-duration', status: 'completed', duration: 900000 },
      { id: 'invalid-video-duration', status: 'completed', videoDuration: 'NaN', duration: 900000 },
    ])
    expect(wrapper.vm.videoDuration(wrapper.props('history')[0])).toBe(65)
    expect(wrapper.vm.videoDuration(wrapper.props('history')[1])).toBeNull()
    expect(wrapper.vm.videoDuration(wrapper.props('history')[2])).toBeNull()
    expect(wrapper.find('[data-history-id="video-duration"]').text()).toContain('1 create.history.minutes 5 create.history.seconds')
    expect(wrapper.find('[data-history-id="missing-video-duration"]').text()).toContain('create.history.notGenerated')
  })

  it('仅非 running 且有 projectId 的卡片点击进入编辑页，running 不可进入而 cancelled 可编辑', async () => {
    const wrapper = mountHistory([
      { id: 'running', projectId: 'proj-r', status: 'running', updatedAt: '2026-08-15T12:00:00Z' },
      { id: 'cancelled', projectId: 'proj-c', status: 'cancelled', updatedAt: '2026-08-15T11:00:00Z' },
    ])
    const bodies = wrapper.findAll('.history-item-body')
    expect(bodies[0].attributes('role')).toBeUndefined()
    expect(bodies[0].attributes('tabindex')).toBeUndefined()
    expect(wrapper.find('[data-history-id="running"]').classes()).not.toContain('is-interactive')
    await bodies[0].trigger('click')
    expect(wrapper.emitted('open-result')).toBeUndefined()
    expect(wrapper.emitted('resume-history')).toBeUndefined()
    expect(bodies[1].attributes('role')).toBe('button')
    expect(bodies[1].attributes('tabindex')).toBe('0')
    expect(wrapper.find('[data-history-id="cancelled"]').classes()).toContain('is-interactive')
    await bodies[1].trigger('click')
    expect(wrapper.emitted('open-result')?.[0]).toEqual([{ id: 'cancelled', projectId: 'proj-c', status: 'cancelled', updatedAt: '2026-08-15T11:00:00Z' }])
  })

  it('shows localized paused checkpoint and both failed stage and error details', () => {
    const wrapper = mountHistory([
      { id: 'paused', status: 'paused', pausedStage: 'compose', checkpoint: { type: 'scene_asset_selection' } },
      { id: 'failed', status: 'failed', pausedStage: 'optimize', error: 'provider unavailable' },
    ])
    const paused = wrapper.find('[data-history-id="paused"]')
    expect(paused.text()).toContain('create.history.pausedStage')
    expect(paused.text()).toContain('create.history.environments.sceneAssetSelection')
    const failed = wrapper.find('[data-history-id="failed"]')
    expect(failed.text()).toContain('create.history.failedStage')
    expect(failed.text()).toContain('create.history.errorSummary')
    expect(failed.text()).toContain('provider unavailable')
  })

  it('re-sorts visible cards when an updated history prop arrives', async () => {
    const wrapper = mountHistory([
      { id: 'a', status: 'running', updatedAt: '2026-08-15T10:00:00Z' },
      { id: 'b', status: 'running', updatedAt: '2026-08-15T11:00:00Z' },
    ])
    expect(wrapper.findAll('.history-item').map(card => card.attributes('data-history-id'))).toEqual(['b', 'a'])
    await wrapper.setProps({ history: [
      { id: 'a', status: 'running', updatedAt: '2026-08-15T12:00:00Z' },
      { id: 'b', status: 'running', updatedAt: '2026-08-15T11:00:00Z' },
    ] })
    expect(wrapper.findAll('.history-item').map(card => card.attributes('data-history-id'))).toEqual(['a', 'b'])
  })

  it('显式操作按钮（继续/删除）不触发进入编辑页', async () => {
    const wrapper = mountHistory([
      { id: 'failed-1', projectId: 'proj-1', status: 'failed', pausedStage: 'compose', error: 'boom' },
    ])
    await wrapper.find('.s2v-btn-resume').trigger('click')
    expect(wrapper.emitted('resume-history')).toHaveLength(1)
    expect(wrapper.emitted('open-result')).toBeUndefined()
    await wrapper.find('.s2v-btn-danger').trigger('click')
    expect(wrapper.emitted('delete-history')).toHaveLength(1)
    expect(wrapper.emitted('open-result')).toBeUndefined()
  })

  it('已取消卡片允许删除，也可以进入编辑页但不会自动恢复', async () => {
    const wrapper = mountHistory([{ id: 'cancelled-1', projectId: 'proj-c', status: 'cancelled' }])
    const body = wrapper.find('.history-item-body')
    expect(body.attributes('role')).toBe('button')
    await body.trigger('click')
    expect(wrapper.emitted('open-result')).toHaveLength(1)
    expect(wrapper.find('.s2v-btn-danger').exists()).toBe(true)
    await wrapper.find('.s2v-btn-danger').trigger('click')
    expect(wrapper.emitted('delete-history')).toHaveLength(1)
    expect(wrapper.emitted('open-result')).toHaveLength(1)
  })

  it('卡片统一展示通用信息（标题/时间/耗时/ID/流水线）与状态附加信息（失败环节/失败原因）', () => {
    const wrapper = mountHistory([
      {
        id: 'failed-1', projectId: 'proj-1', pipeline: 'story2video-compose', status: 'failed',
        title: '失败任务', updatedAt: '2026-08-15T12:00:00Z', createdAt: '2026-08-15T10:00:00Z',
        duration: 125000, mode: 'auto', pausedStage: 'optimize', error: 'provider timeout with a very long message',
        segments: [{ text: '提示词 A', promptTranslation: 'Prompt A' }],
        stages: [{ name: 'optimize', status: 'failed' }],
      },
    ])
    const card = wrapper.find('[data-history-id="failed-1"]')
    expect(card.text()).toContain('失败任务')
    expect(card.text()).toContain('create.history.updatedAt')
    expect(card.text()).toContain('create.history.createdAt')
    expect(card.text()).toContain('create.history.duration')
    expect(card.text()).toContain('create.history.videoDuration')
    expect(card.text()).toContain('create.history.projectId')
    expect(card.text()).toContain('create.history.contentPreview')
    expect(card.text()).toContain('提示词 A')
    expect(card.text()).toContain('Prompt A')
    expect(card.text()).toContain('create.history.failedStage')
    // 失败原因使用多语言自然语言（formatPipelineError：短文本透传原文）
    expect(card.find('[data-testid="history-failure-reason"]').text()).toContain('provider timeout with a very long message')
    expect(card.find('[data-testid="history-failure-reason"]').text()).not.toContain('…')
  })

  it('completed+projectId 卡片显示编辑与重新合成按钮并发出 open-result', async () => {
    const wrapper = mountHistory([
      { id: 'done-1', projectId: 'proj-1', status: 'completed', updatedAt: '2026-08-15T12:00:00Z' },
      { id: 'no-proj', status: 'completed', updatedAt: '2026-08-15T11:00:00Z' },
    ])
    const buttons = wrapper.findAll('[data-testid="history-edit-recompose-button"]')
    expect(buttons).toHaveLength(1)
    await buttons[0].trigger('click')
    expect(wrapper.emitted('open-result')).toHaveLength(1)
    expect(wrapper.emitted('open-result')[0][0].id).toBe('done-1')
  })

  it('已完成项目和纯运行记录卡片都发出删除事件', async () => {
    const wrapper = mountHistory([
      { id: 'done-project', projectId: 'proj-1', status: 'completed' },
      { id: 'done-run', projectId: null, status: 'completed' },
    ])

    await wrapper.find('[data-history-id="done-project"] [data-testid="history-delete-button"]').trigger('click')
    await wrapper.find('[data-history-id="done-run"] [data-testid="history-delete-button"]').trigger('click')

    expect(wrapper.emitted('delete-history')).toHaveLength(2)
    expect(wrapper.emitted('delete-history').map(([item]) => item.id)).toEqual(['done-project', 'done-run'])
    expect(wrapper.emitted('open-result')).toBeUndefined()
  })

  it('completed+projectId 卡片标题回退原文案前 60 字，编辑按钮发出 open-result', async () => {
    const wrapper = mountHistory([
      {
        id: 'done-1', projectId: 'proj-1', pipeline: 'story2video-compose', status: 'completed',
        segments: [
          { id: 's1', text: '场景一文案', prompt: '图词一' },
          { id: 's2', text: '', prompt: '图词二' },
        ],
      },
    ])
    const card = wrapper.find('[data-history-id="done-1"]')
    expect(card.find('.history-name').text()).toContain('场景一文案')
    const editButton = card.find('[data-testid="history-edit-recompose-button"]')
    expect(editButton.exists()).toBe(true)
    await editButton.trigger('click')
    expect(wrapper.emitted('open-result')).toHaveLength(1)
    expect(wrapper.emitted('open-result')[0][0].projectId).toBe('proj-1')
  })

  it('卡片文案预览统一按 120 字截断（长文案显示省略号）', () => {
    const longText = '旁白'.repeat(80)
    const wrapper = mountHistory([
      {
        id: 'done-long', projectId: 'proj-1', pipeline: 'story2video-compose', status: 'completed',
        segments: [
          { id: 's1', text: longText, prompt: 'A young prince in weathered bronze-toned leather armor' },
          { id: 's2', text: '', prompt: 'only-prompt' },
        ],
      },
    ])
    expect(wrapper.find('.prompt-preview-text').text()).toContain('…')
    expect(wrapper.find('.prompt-preview-text').text()).toHaveLength(120)
  })

  it('政策失败卡片显示不可恢复提示（含场景号），可恢复失败不显示', () => {
    const wrapper = mountHistory([
      {
        id: 'policy-1',
        status: 'failed',
        error: 'Asset scene generation failed. Image #49: Image generation requires user input after content-policy review; Image #73: Image generation requires user input after content-policy review; Image #74: Image generation requires user input after content-policy review',
      },
      { id: 'retry-1', status: 'failed', error: 'provider timeout, please retry' },
    ])
    const policyCard = wrapper.find('[data-history-id="policy-1"]')
    const hint = policyCard.find('[data-testid="history-policy-resume-hint"]')
    expect(hint.exists()).toBe(true)
    expect(hint.text()).toContain('create.history.policyResumeBlockedLabel')
    expect(hint.text()).toContain('涉及场景：#49、#73-74')
    expect(hint.text()).toContain('#49、#73-74')
    expect(policyCard.find('.s2v-btn-resume').exists()).toBe(false)
    expect(wrapper.find('[data-history-id="retry-1"]').find('[data-testid="history-policy-resume-hint"]').exists()).toBe(false)
    expect(wrapper.find('[data-history-id="retry-1"]').find('.s2v-btn-resume').exists()).toBe(true)
  })

  it('政策失败无法解析场景号时显示兜底提示', () => {
    const wrapper = mountHistory([
      { id: 'policy-2', status: 'failed', error: 'content-policy review failed' },
    ])
    const hint = wrapper.find('[data-history-id="policy-2"]').find('[data-testid="history-policy-resume-hint"]')
    expect(hint.exists()).toBe(true)
    expect(hint.text()).toContain('create.history.policyResumeBlockedGeneric')
    expect(hint.text()).not.toContain('#')
  })

  it('政策失败卡片内联展示含场景号提示（旧弹窗能力收敛到卡片）', () => {
    const wrapper = mountHistory([
      {
        id: 'policy-3',
        status: 'failed',
        error: 'Image #49: Image generation requires user input after content-policy review; Image #73: Image generation requires user input after content-policy review',
      },
    ])
    const hint = wrapper.find('[data-history-id="policy-3"]').find('[data-testid="history-policy-resume-hint"]')
    expect(hint.exists()).toBe(true)
    expect(hint.text()).toContain('create.history.policyResumeBlockedLabel')
    expect(hint.text()).toContain('#49、#73')
  })

  it('历史卡片耗时优先使用运行记录 activeMs', () => {
    const wrapper = mountHistory([{
      id: 'run-active-ms', projectId: 'project-active-ms', status: 'running', activeMs: 65000, duration: 3600000,
    }])
    const duration = wrapper.find('.history-meta-item')
    expect(duration.exists()).toBe(true)
    expect(wrapper.vm.historyDuration(wrapper.props('history')[0])).toBe(65000)
    expect(wrapper.vm.formatDuration(65000)).toContain('create.history.minutes')
    expect(wrapper.vm.formatDuration(65000)).toContain('create.history.seconds')
    expect(wrapper.vm.historyDuration(wrapper.props('history')[0])).not.toBe(3600000)
  })

  it('政策失败且有项目时卡片显示修改并重新生成按钮，点击发出 open-result', async () => {
    const wrapper = mountHistory([
      {
        id: 'policy-edit-1', projectId: 'proj-p1', status: 'failed',
        error: 'Image #49: Image generation requires user input after content-policy review',
      },
    ])
    const card = wrapper.find('[data-history-id="policy-edit-1"]')
    const editButton = card.find('[data-testid="history-policy-edit-button"]')
    expect(editButton.exists()).toBe(true)
    expect(editButton.text()).toContain('create.history.policyEditAndRegenerate')
    expect(card.find('.s2v-btn-resume').exists()).toBe(false)
    await editButton.trigger('click')
    expect(wrapper.emitted('open-result')).toHaveLength(1)
    expect(wrapper.emitted('open-result')[0][0].id).toBe('policy-edit-1')
    expect(wrapper.emitted('open-history-detail')).toBeUndefined()
  })

  it('政策失败但无项目时不显示修改按钮，可恢复失败只显示断点继续', () => {
    const wrapper = mountHistory([
      { id: 'policy-no-proj', status: 'failed', error: 'content-policy review failed' },
      { id: 'retry-edit-1', status: 'failed', error: 'provider timeout, please retry' },
    ])
    const policyCard = wrapper.find('[data-history-id="policy-no-proj"]')
    expect(policyCard.find('[data-testid="history-policy-edit-button"]').exists()).toBe(false)
    expect(policyCard.find('[data-testid="history-policy-resume-hint"]').exists()).toBe(true)
    expect(policyCard.find('.s2v-btn-resume').exists()).toBe(false)
    const retryCard = wrapper.find('[data-history-id="retry-edit-1"]')
    expect(retryCard.find('[data-testid="history-policy-edit-button"]').exists()).toBe(false)
    expect(retryCard.find('.s2v-btn-resume').exists()).toBe(true)
  })

  it('政策失败且有项目时卡片内联修改按钮发出 open-result', async () => {
    const wrapper = mountHistory([
      {
        id: 'policy-detail-edit', projectId: 'proj-p9', status: 'failed',
        error: 'Image #73: Image generation requires user input after content-policy review',
      },
    ])
    const card = wrapper.find('[data-history-id="policy-detail-edit"]')
    const editButton = card.find('[data-testid="history-policy-edit-button"]')
    expect(editButton.exists()).toBe(true)
    expect(editButton.text()).toContain('create.history.policyEditAndRegenerate')
    await editButton.trigger('click')
    expect(wrapper.emitted('open-result')).toHaveLength(1)
    expect(wrapper.emitted('open-result')[0][0].projectId).toBe('proj-p9')
  })
})
