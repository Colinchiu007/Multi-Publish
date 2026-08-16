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

  it('opens detail for non-cancelled cards without emitting resume and keeps cancelled inert', async () => {
    const wrapper = mountHistory([
      { id: 'running', status: 'running', updatedAt: '2026-08-15T12:00:00Z' },
      { id: 'cancelled', status: 'cancelled', updatedAt: '2026-08-15T11:00:00Z' },
    ])
    const bodies = wrapper.findAll('.history-item-body')
    expect(bodies[0].attributes('role')).toBe('button')
    expect(bodies[0].attributes('tabindex')).toBe('0')
    await bodies[0].trigger('click')
    expect(wrapper.emitted('open-history-detail')?.[0]).toEqual([{ id: 'running', status: 'running', updatedAt: '2026-08-15T12:00:00Z' }])
    expect(wrapper.emitted('resume-history')).toBeUndefined()
    expect(bodies[1].attributes('role')).toBeUndefined()
    expect(bodies[1].attributes('tabindex')).toBeUndefined()
    await bodies[1].trigger('click')
    expect(wrapper.emitted('open-history-detail')).toHaveLength(1)
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

  it('explicit action buttons never open the detail modal', async () => {
    const wrapper = mountHistory([
      { id: 'failed-1', projectId: 'proj-1', status: 'failed', pausedStage: 'compose', error: 'boom' },
    ])
    await wrapper.find('.s2v-btn-resume').trigger('click')
    expect(wrapper.emitted('resume-history')).toHaveLength(1)
    expect(wrapper.emitted('open-history-detail')).toBeUndefined()
    await wrapper.find('.s2v-btn-danger').trigger('click')
    expect(wrapper.emitted('delete-history')).toHaveLength(1)
    expect(wrapper.emitted('open-history-detail')).toBeUndefined()
    expect(wrapper.findComponent({ name: 'UiModal' }).props('visible')).toBe(false)
  })

  it('cancelled cards allow explicit delete but remain non-clickable', async () => {
    const wrapper = mountHistory([{ id: 'cancelled-1', projectId: 'proj-c', status: 'cancelled' }])
    const body = wrapper.find('.history-item-body')
    expect(body.attributes('role')).toBeUndefined()
    await body.trigger('click')
    expect(wrapper.emitted('open-history-detail')).toBeUndefined()
    expect(wrapper.find('.s2v-btn-danger').exists()).toBe(true)
    await wrapper.find('.s2v-btn-danger').trigger('click')
    expect(wrapper.emitted('delete-history')).toHaveLength(1)
    expect(wrapper.emitted('open-history-detail')).toBeUndefined()
  })

  it('detail modal shows common, status-specific and full text fields', async () => {
    const wrapper = mount(CreateViewHistory, {
      props: {
        history: [{
          id: 'failed-1', projectId: 'proj-1', pipeline: 'story2video-compose', status: 'failed',
          title: '失败任务', updatedAt: '2026-08-15T12:00:00Z', createdAt: '2026-08-15T10:00:00Z',
          duration: 125000, mode: 'auto', pausedStage: 'optimize', error: 'provider timeout with a very long message',
          segments: [{ text: '提示词 A', promptTranslation: 'Prompt A' }],
          stages: [{ name: 'optimize', status: 'failed' }],
        }],
      },
      global: {
        mocks: { $t: key => key },
        stubs: {
          UiModal: {
            props: ['visible'],
            template: '<div v-if="visible" class="ui-modal-stub"><slot /></div>',
          },
        },
      },
    })
    await wrapper.find('.history-item-body').trigger('click')
    const modal = wrapper.find('.ui-modal-stub')
    expect(modal.exists()).toBe(true)
    expect(modal.find('[data-testid="history-detail-duration"]').text()).toContain('create.history.minutes')
    expect(modal.find('[data-testid="history-detail-prompt"]').text()).toContain('提示词 A')
    expect(modal.find('[data-testid="history-detail-translation"]').text()).toContain('Prompt A')
    expect(modal.find('[data-testid="history-detail-error"]').text()).toContain('provider timeout with a very long message')
    expect(modal.find('[data-testid="history-detail-error"]').text()).not.toContain('…')
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

  it('详情弹窗展示场景列表与提示文案，footer 可编辑并重新合成', async () => {
    const wrapper = mount(CreateViewHistory, {
      props: {
        history: [{
          id: 'done-1', projectId: 'proj-1', pipeline: 'story2video-compose', status: 'completed',
          segments: [
            { id: 's1', text: '场景一文案', prompt: '图词一' },
            { id: 's2', text: '', prompt: '图词二' },
            { id: 's3', text: '', prompt: '' },
          ],
        }],
      },
      global: {
        mocks: { $t: key => key },
        stubs: {
          UiModal: {
            props: ['visible'],
            template: '<div v-if="visible" class="ui-modal-stub"><slot /><slot name="footer" /></div>',
          },
        },
      },
    })
    await wrapper.find('.history-item-body').trigger('click')
    const modal = wrapper.find('.ui-modal-stub')
    expect(modal.exists()).toBe(true)
    const scenes = modal.find('[data-testid="history-detail-scenes"]')
    expect(scenes.exists()).toBe(true)
    expect(scenes.findAll('.history-detail-scene-item')).toHaveLength(2)
    expect(scenes.text()).toContain('create.history.sceneListLabel')
    expect(scenes.text()).toContain('create.history.sceneListHint')
    expect(scenes.text()).toContain('场景一文案')
    const footerBtn = modal.find('[data-testid="history-detail-edit-recompose-button"]')
    expect(footerBtn.exists()).toBe(true)
    await footerBtn.trigger('click')
    expect(wrapper.emitted('open-result')).toHaveLength(1)
    expect(wrapper.emitted('open-result')[0][0].projectId).toBe('proj-1')
  })
  it('详情弹窗完整展示长图片提示词（不截断），旁白/画面提示词分行，空字段不渲染，卡片预览仍 120 截断', async () => {
    const longPrompt = 'A young prince in weathered bronze-toned leather armor and layered hemp-and-fur robes of deep amber and charcoal, standing at the edge of a misty mountain ridge with a contemplative gaze toward an ancient walled fortress perched atop steep forested peaks, his travel-worn cloak draped over one shoulder. He gazes south across a sweeping vista of the Zuben River valley, mist curling through dense conifer forests and rocky cliffs that rise dramatically in the background. The fortress city of Wunü Mo'
    const longText = '旁白'.repeat(80)
    const wrapper = mount(CreateViewHistory, {
      props: {
        history: [{
          id: 'done-long', projectId: 'proj-1', pipeline: 'story2video-compose', status: 'completed',
          segments: [
            { id: 's1', text: longText, prompt: longPrompt },
            { id: 's2', text: '', prompt: 'only-prompt' },
            { id: 's3', text: 'only-text', prompt: '' },
          ],
        }],
      },
      global: {
        mocks: { $t: key => key },
        stubs: {
          UiModal: {
            props: ['visible'],
            template: '<div v-if="visible" class="ui-modal-stub"><slot /><slot name="footer" /></div>',
          },
        },
      },
    })
    // 历史卡片预览仍按 120 截断（设计如此），详情弹窗不截断
    expect(wrapper.find('.prompt-preview-text').text()).toContain('…')
    await wrapper.find('.history-item-body').trigger('click')
    const modal = wrapper.find('.ui-modal-stub')
    const scenes = modal.find('[data-testid="history-detail-scenes"]')
    const items = scenes.findAll('.history-detail-scene-item')
    expect(items).toHaveLength(3)
    const rows1 = items[0].findAll('.history-detail-scene-row')
    expect(rows1).toHaveLength(2)
    expect(rows1[0].text()).toContain('create.history.sceneNarration')
    expect(rows1[0].text()).toContain(longText)
    expect(rows1[1].text()).toContain('create.history.scenePrompt')
    expect(rows1[1].text()).toContain(longPrompt)
    expect(rows1[1].text()).not.toContain('…')
    const rows2 = items[1].findAll('.history-detail-scene-row')
    expect(rows2).toHaveLength(1)
    expect(rows2[0].text()).toContain('create.history.scenePrompt')
    expect(rows2[0].text()).toContain('only-prompt')
    const rows3 = items[2].findAll('.history-detail-scene-row')
    expect(rows3).toHaveLength(1)
    expect(rows3[0].text()).toContain('create.history.sceneNarration')
    expect(rows3[0].text()).toContain('only-text')
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

  it('政策失败详情弹窗展示含场景号提示', async () => {
    const wrapper = mount(CreateViewHistory, {
      props: {
        history: [{
          id: 'policy-3',
          status: 'failed',
          error: 'Image #49: Image generation requires user input after content-policy review; Image #73: Image generation requires user input after content-policy review',
        }],
      },
      global: {
        mocks: {
          $t: interpolatingT,
        },
        stubs: {
          UiModal: {
            props: ['visible'],
            template: '<div v-if="visible" class="ui-modal-stub"><slot /></div>',
          },
        },
      },
    })
    await wrapper.find('.history-item-body').trigger('click')
    const modal = wrapper.find('.ui-modal-stub')
    expect(modal.exists()).toBe(true)
    const hint = modal.find('[data-testid="history-detail-policy-resume-hint"]')
    expect(hint.exists()).toBe(true)
    expect(hint.text()).toContain('create.history.policyResumeBlockedLabel')
    expect(hint.text()).toContain('#49、#73')
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

  it('政策失败详情弹窗 footer 显示修改并重新生成按钮并发出 open-result', async () => {
    const wrapper = mount(CreateViewHistory, {
      props: {
        history: [{
          id: 'policy-detail-edit', projectId: 'proj-p9', status: 'failed',
          error: 'Image #73: Image generation requires user input after content-policy review',
        }],
      },
      global: {
        mocks: { $t: interpolatingT },
        stubs: {
          UiModal: {
            props: ['visible'],
            template: '<div v-if="visible" class="ui-modal-stub"><slot /><slot name="footer" /></div>',
          },
        },
      },
    })
    await wrapper.find('.history-item-body').trigger('click')
    const modal = wrapper.find('.ui-modal-stub')
    const footerBtn = modal.find('[data-testid="history-detail-policy-edit-button"]')
    expect(footerBtn.exists()).toBe(true)
    expect(footerBtn.text()).toContain('create.history.policyEditAndRegenerate')
    await footerBtn.trigger('click')
    expect(wrapper.emitted('open-result')).toHaveLength(1)
    expect(wrapper.emitted('open-result')[0][0].projectId).toBe('proj-p9')
  })
})
