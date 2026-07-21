import { beforeEach, describe, expect, it, vi } from 'vitest'

const api = vi.hoisted(() => ({
  accountCheckLogin: vi.fn(),
  accountDelete: vi.fn(),
  authClose: vi.fn(),
  authCompleteLogin: vi.fn(),
  authOpenLogin: vi.fn(),
  authOpenQrCodeLogin: vi.fn(),
  authQrCodeClose: vi.fn(),
}))

vi.mock('@/api/publisher', () => api)

import { useAccountActions } from './useAccountActions'

describe('useAccountActions', () => {
  beforeEach(() => vi.clearAllMocks())

  it('统一路由网页登录和扫码登录动作', async () => {
    api.authOpenLogin.mockResolvedValue({ code: 0 })
    api.authOpenQrCodeLogin.mockResolvedValue({ code: 0 })
    const actions = useAccountActions()

    await actions.openLogin('browser', 'zhihu')
    await actions.openLogin('qrcode', 'wechat_mp')

    expect(api.authOpenLogin).toHaveBeenCalledWith('zhihu')
    expect(api.authOpenQrCodeLogin).toHaveBeenCalledWith('wechat_mp')
  })

  it('统一关闭登录、检查状态和删除账号动作', async () => {
    const actions = useAccountActions()
    await actions.closeLogin('browser')
    await actions.closeLogin('qrcode')
    await actions.checkLogin({ platform: 'wechat_mp', id: 'acc-1' })
    await actions.remove('acc-1')

    expect(api.authClose).toHaveBeenCalledTimes(1)
    expect(api.authQrCodeClose).toHaveBeenCalledTimes(1)
    expect(api.accountCheckLogin).toHaveBeenCalledWith('wechat_mp', 'acc-1')
    expect(api.accountDelete).toHaveBeenCalledWith('acc-1')
  })

  it('完成网页登录只调用主进程确认通道', async () => {
    api.authCompleteLogin.mockResolvedValue({ code: 0, data: true })
    const actions = useAccountActions()

    await expect(actions.completeLogin('browser')).resolves.toEqual({ code: 0, data: true })
    expect(api.authCompleteLogin).toHaveBeenCalledTimes(1)
    await expect(actions.completeLogin('qrcode')).rejects.toThrow('扫码登录会自动完成')
  })

  it('在调用 API 前拒绝非法动作参数', async () => {
    const actions = useAccountActions()

    await expect(actions.openLogin('other', 'wechat_mp')).rejects.toThrow('不支持的登录方式')
    await expect(actions.checkLogin({ platform: '', id: '' })).rejects.toThrow('账号信息不完整')
    await expect(actions.remove('')).rejects.toThrow('账号 ID 不能为空')
  })
})
