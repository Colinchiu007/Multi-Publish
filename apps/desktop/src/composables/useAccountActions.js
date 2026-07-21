import {
  accountCheckLogin,
  accountDelete,
  authClose,
  authCompleteLogin,
  authOpenLogin,
  authOpenQrCodeLogin,
  authQrCodeClose,
} from '@/api/publisher'

export function useAccountActions() {
  async function openLogin(mode, platform) {
    if (!platform) throw new Error('平台不能为空')
    if (mode === 'browser') return authOpenLogin(platform)
    if (mode === 'qrcode') return authOpenQrCodeLogin(platform)
    throw new Error('不支持的登录方式')
  }

  async function closeLogin(mode) {
    if (mode === 'qrcode') return authQrCodeClose()
    return authClose()
  }

  async function completeLogin(mode) {
    if (mode === 'qrcode') throw new Error('扫码登录会自动完成，无需手动确认')
    if (mode !== 'browser') throw new Error('没有正在进行的网页登录')
    return authCompleteLogin()
  }

  async function checkLogin(account) {
    if (!account?.platform || !account?.id) throw new Error('账号信息不完整')
    return accountCheckLogin(account.platform, account.id)
  }

  async function remove(accountId) {
    if (!accountId) throw new Error('账号 ID 不能为空')
    return accountDelete(accountId)
  }

  return { openLogin, completeLogin, closeLogin, checkLogin, remove }
}
