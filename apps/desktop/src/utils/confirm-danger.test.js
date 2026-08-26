import { describe, it, expect, vi, beforeEach } from 'vitest'

// 钉住核心安全语义：确认→true、任何取消形态（cancel/close/esc/遮罩）→false。
// ElMessageBox 以 vi.mock 模拟 resolve/reject 两态，防止 element-plus 升级语义漂移时静默放行。
const confirmMock = vi.fn()
vi.mock('element-plus', () => ({
  ElMessageBox: { confirm: (...args) => confirmMock(...args) },
}))

import { confirmDanger } from './confirm-danger'

describe('confirmDanger 参数契约', () => {
  beforeEach(() => {
    confirmMock.mockReset()
  })

  it('缺少 message（后果说明）时抛错，不允许静默确认', async () => {
    await expect(confirmDanger({})).rejects.toThrow(/message/)
    await expect(confirmDanger({ message: '' })).rejects.toThrow(/message/)
    await expect(confirmDanger({ message: 123 })).rejects.toThrow(/message/)
    await expect(confirmDanger(null)).rejects.toThrow(/message/)
  })

  it('用户确认 → true', async () => {
    confirmMock.mockResolvedValue('confirm')
    await expect(confirmDanger({ message: '即将删除' })).resolves.toBe(true)
    // warning 类型 + 后果文案透传给 ElMessageBox
    expect(confirmMock).toHaveBeenCalledTimes(1)
    const [message, title, options] = confirmMock.mock.calls[0]
    expect(message).toBe('即将删除')
    expect(options.type).toBe('warning')
    expect(title).toBe('')
  })

  it.each(['cancel', 'close', 'esc', new Error('overlay')])('取消（%s）→ false 且不抛出', async (rejectReason) => {
    confirmMock.mockRejectedValue(rejectReason)
    await expect(confirmDanger({ message: '即将删除' })).resolves.toBe(false)
  })
})
