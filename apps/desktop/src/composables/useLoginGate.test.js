import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

vi.mock('element-plus', () => ({
  ElMessageBox: { confirm: vi.fn() },
  ElMessage: { warning: vi.fn(), error: vi.fn(), success: vi.fn(), info: vi.fn() },
}))

const { ElMessageBox, ElMessage } = await import('element-plus')

let mockStore
vi.mock('@/stores/identity', () => ({
  useIdentityStore: () => mockStore,
}))

const { useLoginGate } = await import('./useLoginGate')

function makeStore (overrides = {}) {
  return {
    status: 'signed_out',
    isAuthenticated: false,
    signIn: vi.fn(async () => true),
    ...overrides,
  }
}

describe('useLoginGate 主动操作登录门', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockStore = makeStore()
    ElMessageBox.confirm.mockResolvedValue('confirm')
  })

  afterEach(() => {
    mockStore = null
  })

  it('已登录：直接放行，不弹确认、不调 signIn', async () => {
    mockStore = makeStore({ status: 'authenticated', isAuthenticated: true })
    const { ensureLogin } = useLoginGate()
    await expect(ensureLogin()).resolves.toBe(true)
    expect(ElMessageBox.confirm).not.toHaveBeenCalled()
    expect(mockStore.signIn).not.toHaveBeenCalled()
  })

  it('未登录：确认后调 signIn，登录成功且 authenticated → 放行', async () => {
    const { ensureLogin } = useLoginGate()
    const result = ensureLogin({ message: '发布功能需要登录后使用，是否立即登录？' })
    expect(ElMessageBox.confirm).toHaveBeenCalledWith(
      '发布功能需要登录后使用，是否立即登录？', '需要登录',
      expect.objectContaining({ confirmButtonText: '立即登录' }),
    )
    mockStore.signIn.mockImplementation(async () => {
      mockStore.status = 'authenticated'
      mockStore.isAuthenticated = true
      return true
    })
    await expect(result).resolves.toBe(true)
    expect(mockStore.signIn).toHaveBeenCalledTimes(1)
  })

  it('未登录：确认框取消 → 拒绝且不调 signIn', async () => {
    ElMessageBox.confirm.mockRejectedValue(new Error('cancel'))
    const { ensureLogin } = useLoginGate()
    await expect(ensureLogin()).resolves.toBe(false)
    expect(mockStore.signIn).not.toHaveBeenCalled()
  })

  it('未登录：signIn 失败 → 提示并拒绝', async () => {
    const { ensureLogin } = useLoginGate()
    mockStore.signIn.mockResolvedValue(false)
    await expect(ensureLogin()).resolves.toBe(false)
    expect(ElMessage.warning).toHaveBeenCalledWith('登录未完成，操作已取消')
  })

  it('身份服务不可用（disabled）→ 提示并拒绝，不弹确认', async () => {
    mockStore = makeStore({ status: 'disabled' })
    const { ensureLogin } = useLoginGate()
    await expect(ensureLogin()).resolves.toBe(false)
    expect(ElMessageBox.confirm).not.toHaveBeenCalled()
    expect(ElMessage.warning).toHaveBeenCalledWith(expect.stringContaining('身份服务未配置'))
  })

  it('并发触发：signIn 只调一次（单例防重入）', async () => {
    const { ensureLogin } = useLoginGate()
    mockStore.signIn.mockImplementation(async () => {
      await new Promise(r => setTimeout(r, 20))
      mockStore.status = 'authenticated'
      mockStore.isAuthenticated = true
      return true
    })
    const [a, b] = await Promise.all([ensureLogin(), ensureLogin()])
    expect(a).toBe(true)
    expect(b).toBe(true)
    expect(mockStore.signIn).toHaveBeenCalledTimes(1)
  })

  it('requireLogin：登录成功后执行 action 并返回其结果', async () => {
    mockStore.signIn.mockImplementation(async () => {
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
    ElMessageBox.confirm.mockRejectedValue(new Error('cancel'))
    const { requireLogin } = useLoginGate()
    const action = vi.fn(async () => 'done')
    await expect(requireLogin(action)).resolves.toBe(false)
    expect(action).not.toHaveBeenCalled()
  })
})
