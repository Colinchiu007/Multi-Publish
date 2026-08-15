import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import CreateViewHistory from './CreateViewHistory.vue'

const mountHistory = (history, props = {}) => mount(CreateViewHistory, {
  props: { history, ...props },
  global: {
    mocks: {
      $t: key => key,
    },
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
})
