import { describe, expect, it, vi } from 'vitest'

const { createDynamicAccessApi } = require('./access-control')

describe('preload 许可证权限', () => {
  it('免费用户可管理升级订单，但不能完成或模拟支付', () => {
    const methods = {
      paymentCreateOrder: vi.fn(() => 'created'),
      paymentListOrders: vi.fn(() => []),
      paymentGetOrder: vi.fn(() => ({ id: 'order-1' })),
      paymentCancel: vi.fn(() => true),
      paymentComplete: vi.fn(),
      paymentSimulate: vi.fn(),
    }

    const api = createDynamicAccessApi(methods, () => 'public')

    expect(api.paymentCreateOrder({ plan: 'pro', method: 'alipay' })).toBe('created')
    expect(api.paymentListOrders()).toEqual([])
    expect(api.paymentGetOrder('order-1')).toEqual({ id: 'order-1' })
    expect(api.paymentCancel('order-1')).toBe(true)
    expect(api.paymentComplete).toBeUndefined()
    expect(api.paymentSimulate).toBeUndefined()
  })

  it('权限 IPC 失败时按 public 处理', () => {
    const publicMethod = vi.fn(() => 'created')
    const restrictedMethod = vi.fn()
    const api = createDynamicAccessApi(
      {
        paymentCreateOrder: publicMethod,
        publishWechat: restrictedMethod,
        paymentComplete: vi.fn(),
      },
      () => { throw new Error('权限 IPC 不可用') },
    )

    expect(api.paymentCreateOrder({ plan: 'pro', method: 'alipay' })).toBe('created')
    expect(() => api.publishWechat({ title: '禁止发布' })).toThrow(/许可证权限不足/)
    expect(api.paymentComplete).toBeUndefined()
    expect(restrictedMethod).not.toHaveBeenCalled()
  })
})
