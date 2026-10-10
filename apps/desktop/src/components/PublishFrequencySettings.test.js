import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import i18n from '@/i18n'

const api = vi.hoisted(() => ({
  getPublishFrequencyPolicy: vi.fn(),
  setPublishFrequencyPolicy: vi.fn(),
  emergencyReleasePublishWait: vi.fn(),
  getPublishEmergencyStatus: vi.fn(),
}))
vi.mock('@/api/publisher', () => api)

const messages = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }))
const box = vi.hoisted(() => ({ confirm: vi.fn() }))
vi.mock('element-plus', async (importOriginal) => {
  const actual = await importOriginal()
  return { ...actual, ElMessage: messages, ElMessageBox: box }
})

import PublishFrequencySettings from './PublishFrequencySettings.vue'

const POLICY_RES = {
  code: 0,
  data: {
    platforms: {
      wechat_mp: { tier: 'long', accountMinMs: 20 * 60000, platformMinMs: 2 * 60000, accountDailyMax: 3 },
      douyin: { tier: 'clip', accountMinMs: 10 * 60000, platformMinMs: 2 * 60000, accountDailyMax: 5 },
      weibo: { tier: 'short', accountMinMs: 3 * 60000, platformMinMs: 2 * 60000, accountDailyMax: 20 },
    },
    overrides: null,
    jitterRatio: 0.4,
    releaseGraceMs: 60000,
  },
}

const STUBS = {
  'el-input-number': { template: '<div class="stub-number" />' },
  'el-switch': { template: '<div class="stub-switch" />' },
  // 必须声明 emits: ['click']：否则 onClick 会作为 fallthrough 属性落到原生 <button> 上，
  // 与显式 $emit('click') 叠加 ⇒ 一次点击触发两次（本仓实测踩过）
  'el-button': {
    props: ['disabled'],
    emits: ['click'],
    template: '<button class="stub-button" :disabled="disabled" @click="$emit(\'click\')"><slot /></button>',
  },
  'el-select': { template: '<div class="stub-select"><slot /></div>' },
  'el-option': { template: '<div />' },
  'el-input': { template: '<div class="stub-input" />' },
  'el-alert': { props: ['title'], template: '<div class="stub-alert">{{ title }}</div>' },
}

async function mountPage () {
  const wrapper = mount(PublishFrequencySettings, {
    global: { plugins: [i18n], stubs: STUBS },
  })
  await new Promise((r) => setTimeout(r, 0))
  await nextTick()
  return wrapper
}

describe('PublishFrequencySettings（publish-frequency-policy-v2 设置页）', () => {
  beforeEach(() => {
    i18n.global.locale.value = 'zh'
    api.getPublishFrequencyPolicy.mockReset().mockResolvedValue(POLICY_RES)
    api.setPublishFrequencyPolicy.mockReset().mockResolvedValue({ code: 0, data: { saved: true } })
    api.emergencyReleasePublishWait.mockReset().mockResolvedValue({ code: 0, data: { released: true, taskId: 't-1', used: 1, max: 1 } })
    messages.success.mockReset()
    messages.error.mockReset()
    box.confirm.mockReset().mockResolvedValue('confirm')
  })

  it('挂载即拉取策略，并展示按档位分组的当前口径', async () => {
    const wrapper = await mountPage()
    expect(api.getPublishFrequencyPolicy).toHaveBeenCalledTimes(1)
    const text = wrapper.find('[data-testid="pubfreq-current"]').text()
    // 三个档位各一行摘要（不是逐平台 15 行噪音）
    expect(text).toContain('long')
    expect(text).toContain('clip')
    expect(text).toContain('short')
    expect(text).toContain('20 min')
  })

  it('读失败时显示错误且不渲染表单（不静默降级成默认值糊弄用户）', async () => {
    api.getPublishFrequencyPolicy.mockResolvedValue({ code: -1, message: '守卫未初始化' })
    const wrapper = await mountPage()
    expect(wrapper.find('[data-testid="pubfreq-load-error"]').exists()).toBe(true)
    expect(wrapper.text()).toContain('守卫未初始化')
    expect(wrapper.find('[data-testid="pubfreq-save"]').exists()).toBe(false)
  })

  it('保存时提交的字段名与主进程 resolvePolicyOverrides 逐一对应（自创字段名会被静默忽略）', async () => {
    const wrapper = await mountPage()
    await wrapper.find('[data-testid="pubfreq-save"]').trigger('click')
    await new Promise((r) => setTimeout(r, 0))

    expect(api.setPublishFrequencyPolicy).toHaveBeenCalledTimes(1)
    const payload = api.setPublishFrequencyPolicy.mock.calls[0][0]
    expect(Object.keys(payload).sort()).toEqual(['accountMinMs', 'dailyMax', 'jitterRatio', 'platformMinMs'])
    expect(payload).toMatchObject({ accountMinMs: 20 * 60000, platformMinMs: 2 * 60000, jitterRatio: 0.4 })
    expect(Object.keys(payload.dailyMax).sort()).toEqual(['clip', 'long', 'short'])
  })

  it('保存被主进程拒绝（全有或全无）⇒ 报错且**不报成功**', async () => {
    api.setPublishFrequencyPolicy.mockResolvedValue({ code: -2, message: '策略配置非法：已整体拒绝（未保存任何字段）' })
    const wrapper = await mountPage()
    await wrapper.find('[data-testid="pubfreq-save"]').trigger('click')
    await new Promise((r) => setTimeout(r, 0))

    expect(messages.error).toHaveBeenCalled()
    expect(messages.success).not.toHaveBeenCalled()
  })

  it('保存成功 ⇒ 成功提示 + 重新拉取（避免界面与生效值不一致）', async () => {
    const wrapper = await mountPage()
    await wrapper.find('[data-testid="pubfreq-save"]').trigger('click')
    await new Promise((r) => setTimeout(r, 0))
    expect(messages.success).toHaveBeenCalled()
    expect(api.getPublishFrequencyPolicy).toHaveBeenCalledTimes(2)
  })

  it('恢复默认提交 null（清空覆盖），不是提交一份「默认值」冒充', async () => {
    const wrapper = await mountPage()
    await wrapper.find('[data-testid="pubfreq-reset"]').trigger('click')
    await new Promise((r) => setTimeout(r, 0))
    expect(api.setPublishFrequencyPolicy).toHaveBeenCalledWith(null)
  })

  it('取消二次确认 ⇒ 不调用紧急放行 IPC、不提示（取消不是失败）', async () => {
    box.confirm.mockRejectedValue(new Error('cancel'))
    const wrapper = await mountPage()
    await wrapper.find('[data-testid="pubfreq-emergency-submit"]').trigger('click')
    await new Promise((r) => setTimeout(r, 0))
    expect(api.emergencyReleasePublishWait).not.toHaveBeenCalled()
    expect(messages.error).not.toHaveBeenCalled()
  })

  it('紧急放行成功 ⇒ 明确回显成功', async () => {
    const wrapper = await mountPage()
    // 选一个平台（stub 下直接改组件状态不可行，改为不做选择时按钮 disabled 的验证）
    expect(wrapper.find('[data-testid="pubfreq-emergency-submit"]').attributes('disabled')).toBeDefined()
    wrapper.vm.emergency.platform = 'douyin'
    await nextTick()
    await wrapper.find('[data-testid="pubfreq-emergency-submit"]').trigger('click')
    await new Promise((r) => setTimeout(r, 0))
    expect(api.emergencyReleasePublishWait).toHaveBeenCalledWith(expect.objectContaining({ platform: 'douyin' }))
    expect(wrapper.find('[data-testid="pubfreq-emergency-result"]').text()).toContain('已解除等待')
  })

  it('紧急放行四态各自回显，且都不静默（exhausted / cooldown / no_waiting_window / disabled）', async () => {
    const cases = [
      { data: { released: false, reason: 'exhausted', max: 1 }, expect: '已用尽' },
      { data: { released: false, reason: 'cooldown', max: 1, retryAfterMs: 300000 }, expect: '距上次放行不足 5 分钟' },
      { data: { released: false, reason: 'no_waiting_window', max: 1 }, expect: '当前没有等待中的窗口' },
      { data: { released: false, reason: 'disabled', max: 0 }, expect: '已被关闭' },
    ]
    for (const c of cases) {
      api.emergencyReleasePublishWait.mockResolvedValue({ code: 0, data: c.data })
      const wrapper = await mountPage()
      wrapper.vm.emergency.platform = 'douyin'
      await nextTick()
      await wrapper.find('[data-testid="pubfreq-emergency-submit"]').trigger('click')
      await new Promise((r) => setTimeout(r, 0))
      const text = wrapper.find('[data-testid="pubfreq-emergency-result"]').text()
      expect(text, JSON.stringify(c.data)).toContain(c.expect)
      wrapper.unmount()
    }
  })

  it('紧急放行的 reason 透传，但 operator 不由渲染层自报（不给伪造操作者的入口）', async () => {
    const wrapper = await mountPage()
    wrapper.vm.emergency.platform = 'douyin'
    wrapper.vm.emergency.accountId = 'acc_1'
    wrapper.vm.emergency.reason = '客户催稿'
    await nextTick()
    await wrapper.find('[data-testid="pubfreq-emergency-submit"]').trigger('click')
    await new Promise((r) => setTimeout(r, 0))

    const payload = api.emergencyReleasePublishWait.mock.calls[0][0]
    expect(payload).toMatchObject({ platform: 'douyin', accountId: 'acc_1', reason: '客户催稿' })
    expect(payload).not.toHaveProperty('operator')
  })
})
