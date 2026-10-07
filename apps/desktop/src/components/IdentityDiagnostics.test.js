import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'

const { writeClipboard } = vi.hoisted(() => ({ writeClipboard: vi.fn() }))
const notifySuccess = vi.hoisted(() => vi.fn())
const notifyWarning = vi.hoisted(() => vi.fn())
const diagnostic = vi.hoisted(() => vi.fn())

vi.mock('vue-i18n', () => ({ useI18n: () => ({ t: (key) => key }) }))
vi.mock('@/utils/clipboard', () => ({ writeClipboard }))
vi.mock('@/api/identity', () => ({ identityDiagnosticReport: diagnostic }))
vi.mock('@/composables/useNotify', () => ({
  useNotify: () => ({ notifySuccess, notifyWarning }),
}))

const SAMPLE = '状态: offline_authenticated\n错误码: IDENTITY_NETWORK_UNAVAILABLE'

async function mountComponent () {
  const Component = (await import('./IdentityDiagnostics.vue')).default
  return mount(Component)
}

const flush = () => new Promise((r) => setTimeout(r, 0))

describe('IdentityDiagnostics 诊断信息折叠区', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    diagnostic.mockResolvedValue({ code: 0, data: { text: SAMPLE, fields: [] } })
    writeClipboard.mockResolvedValue(true)
  })

  it('默认收起，不请求主进程（避免每次失败都多一次跨进程往返）', async () => {
    const wrapper = await mountComponent()
    expect(wrapper.find('[data-testid="identity-diagnostics-body"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="identity-diagnostics-toggle"]').attributes('aria-expanded')).toBe('false')
    expect(diagnostic).not.toHaveBeenCalled()
  })

  it('展开时才拉取诊断文本', async () => {
    const wrapper = await mountComponent()
    await wrapper.get('[data-testid="identity-diagnostics-toggle"]').trigger('click')
    await flush()
    expect(diagnostic).toHaveBeenCalledTimes(1)
    expect(wrapper.find('pre').text()).toBe(SAMPLE)
  })

  it('缓存后重复展开不再请求', async () => {
    const wrapper = await mountComponent()
    const toggle = wrapper.get('[data-testid="identity-diagnostics-toggle"]')
    await toggle.trigger('click'); await flush()
    await toggle.trigger('click'); await flush()
    await toggle.trigger('click'); await flush()
    expect(diagnostic).toHaveBeenCalledTimes(1)
  })

  it('复制成功给成功提示', async () => {
    const wrapper = await mountComponent()
    await wrapper.get('[data-testid="identity-diagnostics-toggle"]').trigger('click')
    await flush()
    await wrapper.get('[data-testid="identity-diagnostics-copy"]').trigger('click')
    await flush()
    expect(writeClipboard).toHaveBeenCalledWith(SAMPLE)
    expect(notifySuccess).toHaveBeenCalledWith('memberCenter.diagnosticsCopied')
    expect(notifyWarning).not.toHaveBeenCalled()
  })

  // 剪贴板在 Electron 旧内核/非安全上下文会失败；必须有兜底文案而不是静默无反应
  it('复制失败给兜底提示，且不静默', async () => {
    writeClipboard.mockResolvedValue(false)
    const wrapper = await mountComponent()
    await wrapper.get('[data-testid="identity-diagnostics-toggle"]').trigger('click')
    await flush()
    await wrapper.get('[data-testid="identity-diagnostics-copy"]').trigger('click')
    await flush()
    expect(notifyWarning).toHaveBeenCalledWith('memberCenter.diagnosticsCopyFailed')
    expect(notifySuccess).not.toHaveBeenCalled()
  })

  it('无可用诊断时展示空态且复制按钮禁用', async () => {
    diagnostic.mockResolvedValue({ code: 0, data: { text: '', fields: [] } })
    const wrapper = await mountComponent()
    await wrapper.get('[data-testid="identity-diagnostics-toggle"]').trigger('click')
    await flush()
    expect(wrapper.text()).toContain('memberCenter.diagnosticsEmpty')
    expect(wrapper.get('[data-testid="identity-diagnostics-copy"]').attributes('disabled')).toBeDefined()
  })

  it('IPC 不可用时降级为空态，不抛异常', async () => {
    diagnostic.mockResolvedValue({ code: -1, message: 'IDENTITY_API_UNAVAILABLE' })
    const wrapper = await mountComponent()
    await wrapper.get('[data-testid="identity-diagnostics-toggle"]').trigger('click')
    await flush()
    expect(wrapper.text()).toContain('memberCenter.diagnosticsEmpty')
  })

  it('复制按钮在无文本时不会触发写入', async () => {
    diagnostic.mockResolvedValue({ code: 0, data: { text: '', fields: [] } })
    const wrapper = await mountComponent()
    await wrapper.get('[data-testid="identity-diagnostics-toggle"]').trigger('click')
    await flush()
    await wrapper.get('[data-testid="identity-diagnostics-copy"]').trigger('click')
    await flush()
    expect(writeClipboard).not.toHaveBeenCalled()
  })

  it('无障碍：aria-expanded 随展开切换，aria-controls 指向内容区', async () => {
    const wrapper = await mountComponent()
    const toggle = wrapper.get('[data-testid="identity-diagnostics-toggle"]')
    expect(toggle.attributes('aria-controls')).toBe('identity-diagnostics-body')
    expect(toggle.attributes('aria-expanded')).toBe('false')
    await toggle.trigger('click')
    expect(wrapper.get('[data-testid="identity-diagnostics-toggle"]').attributes('aria-expanded')).toBe('true')
    expect(wrapper.find('#identity-diagnostics-body').exists()).toBe(true)
  })
})