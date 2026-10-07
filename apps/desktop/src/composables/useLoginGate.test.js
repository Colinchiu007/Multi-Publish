import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const { mockNotifyWarning, mockNotifyConfirm } = vi.hoisted(() => ({
  mockNotifyWarning: vi.fn(),
  mockNotifyConfirm: vi.fn(async () => true),
}))

vi.mock('@/composables/useNotify', () => ({
  useNotify: () => ({
    notify: vi.fn(),
    notifyError: vi.fn(),
    notifySuccess: vi.fn(),
    notifyWarning: mockNotifyWarning,
    notifyInfo: vi.fn(),
    notifyConfirm: mockNotifyConfirm,
  }),
}))

let mockStore
vi.mock('@/stores/identity', () => ({
  useIdentityStore: () => mockStore,
}))

// i18n 打桩：透传真实 zh locale 词条。
// 不能用 `t: (k) => 't:' + k` 之类改写 —— 本文件里既有用例断言的是真实中文
// （confirmButtonText: '立即登录'），改写式 mock 会让它们全红且掩盖真实回归。
// 引用 locale 模块既拿到稳定文案，又随 zh.js 同步更新。
vi.mock('@/i18n', async () => {
  const zh = (await import('@/locales/zh')).default
  const lookup = (key) => key.split('.').reduce((o, k) => (o == null ? o : o[k]), zh) ?? key
  return { default: { global: { t: lookup } } }
})

const { useLoginGate } = await import('./useLoginGate')

function makeStore (overrides = {}) {
  return {
    status: 'signed_out',
    isAuthenticated: false,
    error: null,
    signIn: vi.fn(async () => true),
    signInOrSwitch: vi.fn(async () => true),
    ...overrides,
  }
}

describe('useLoginGate 主动操作登录门', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockStore = makeStore()
    mockNotifyConfirm.mockResolvedValue(true)
  })

  afterEach(() => {
    mockStore = null
  })

  it('已登录：直接放行，不弹确认、不调 signIn', async () => {
    mockStore = makeStore({ status: 'authenticated', isAuthenticated: true })
    const { ensureLogin } = useLoginGate()
    await expect(ensureLogin()).resolves.toBe(true)
    expect(mockNotifyConfirm).not.toHaveBeenCalled()
    expect(mockStore.signInOrSwitch).not.toHaveBeenCalled()
  })

  it('未登录：确认后调 signIn，登录成功且 authenticated → 放行', async () => {
    const { ensureLogin } = useLoginGate()
    const result = ensureLogin({ message: '发布功能需要登录后使用，是否立即登录？' })
    expect(mockNotifyConfirm).toHaveBeenCalledWith(
      'loginGate.defaultMessage',
      expect.objectContaining({
        message: '发布功能需要登录后使用，是否立即登录？',
        confirmButtonText: '立即登录',
      }),
    )
    mockStore.signInOrSwitch.mockImplementation(async () => {
      mockStore.status = 'authenticated'
      mockStore.isAuthenticated = true
      return true
    })
    await expect(result).resolves.toBe(true)
    expect(mockStore.signInOrSwitch).toHaveBeenCalledTimes(1)
  })

  it('未登录：确认框取消 → 拒绝且不调 signIn', async () => {
    mockNotifyConfirm.mockResolvedValue(false)
    const { ensureLogin } = useLoginGate()
    await expect(ensureLogin()).resolves.toBe(false)
    expect(mockStore.signInOrSwitch).not.toHaveBeenCalled()
  })

  it('未登录：signIn 失败 → 提示并拒绝', async () => {
    const { ensureLogin } = useLoginGate()
    mockStore.signInOrSwitch.mockResolvedValue(false)
    await expect(ensureLogin()).resolves.toBe(false)
    expect(mockNotifyWarning).toHaveBeenCalledWith('loginGate.loginIncomplete', expect.any(Object))
  })

  it('身份服务不可用（disabled）→ 提示并拒绝，不弹确认', async () => {
    mockStore = makeStore({ status: 'disabled' })
    const { ensureLogin } = useLoginGate()
    await expect(ensureLogin()).resolves.toBe(false)
    expect(mockNotifyConfirm).not.toHaveBeenCalled()
    // 复用唯一映射：disabled 对应 identityDisabledHint，不再用开发者文案 disabledMessage
    expect(mockNotifyWarning).toHaveBeenCalledWith('memberCenter.identityDisabledHint', expect.any(Object))
  })

  it('error 态按 error.code 给出具体原因（不再是笼统的"未配置"）', async () => {
    mockStore = makeStore({
      status: 'error',
      error: { code: 'IDENTITY_NETWORK_UNAVAILABLE' },
    })
    const { ensureLogin } = useLoginGate()
    await expect(ensureLogin()).resolves.toBe(false)
    expect(mockNotifyWarning).toHaveBeenCalledWith('memberCenter.retryHint', expect.any(Object))
    const payload = mockNotifyWarning.mock.calls[0][1]
    // 文案取自 error.code 对应的词条，而非 loginGate.disabledMessage 那句开发者文案
    expect(payload.message).toBe('网络暂时不可用，请稍后重试。')
    expect(payload.message).not.toContain('主进程')
  })

  it('disabled 与 error 不再共用同一句文案', async () => {
    mockStore = makeStore({ status: 'disabled' })
    const disabledGate = useLoginGate()
    await disabledGate.ensureLogin()
    const disabledCall = mockNotifyWarning.mock.calls[0]

    mockNotifyWarning.mockClear()
    mockStore = makeStore({ status: 'error', error: { code: 'IDENTITY_OPERATION_FAILED' } })
    const errorGate = useLoginGate()
    await errorGate.ensureLogin()
    const errorCall = mockNotifyWarning.mock.calls[0]

    expect(disabledCall[0]).not.toBe(errorCall[0])
  })

  it('error 态无 error.code 时回落到中性状态提示，不归因', async () => {
    mockStore = makeStore({ status: 'error', error: null })
    const { ensureLogin } = useLoginGate()
    await expect(ensureLogin()).resolves.toBe(false)
    expect(mockNotifyWarning).toHaveBeenCalledWith('memberCenter.retryHint', expect.any(Object))
    const payload = mockNotifyWarning.mock.calls[0][1]
    // 回落文案不得包含开发者术语
    expect(payload.message).not.toContain('主进程')
    expect(payload.message).toBe('上次操作未完成，可重试。')
  })

  it('调用方仍可用 options.disabledMessage 覆盖文案', async () => {
    mockStore = makeStore({ status: 'disabled' })
    const { ensureLogin } = useLoginGate()
    await expect(ensureLogin({ disabledMessage: '自定义提示' })).resolves.toBe(false)
    const payload = mockNotifyWarning.mock.calls[0][1]
    expect(payload.message).toBe('自定义提示')
  })

  it('并发触发：signIn 只调一次（单例防重入）', async () => {
    const { ensureLogin } = useLoginGate()
    mockStore.signInOrSwitch.mockImplementation(async () => {
      await new Promise(r => setTimeout(r, 20))
      mockStore.status = 'authenticated'
      mockStore.isAuthenticated = true
      return true
    })
    const [a, b] = await Promise.all([ensureLogin(), ensureLogin()])
    expect(a).toBe(true)
    expect(b).toBe(true)
    expect(mockStore.signInOrSwitch).toHaveBeenCalledTimes(1)
  })

  it('requireLogin：登录成功后执行 action 并返回其结果', async () => {
    mockStore.signInOrSwitch.mockImplementation(async () => {
      mockStore.status = 'authenticated'
      mockStore.isAuthenticated = true
      return true
    })
    const { requireLogin } = useLoginGate()
    const action = vi.fn(async () => 'done')
    await expect(requireLogin(action)).resolves.toBe('done')
    expect(action).toHaveBeenCalledTimes(1)
  })

  it('requireLogin：取消登录时不执行 action', async () => {
    mockNotifyConfirm.mockResolvedValue(false)
    const { requireLogin } = useLoginGate()
    const action = vi.fn(async () => 'done')
    await expect(requireLogin(action)).resolves.toBe(false)
    expect(action).not.toHaveBeenCalled()
  })
})
