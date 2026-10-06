// @ts-check
/**
 * account:credential-names —— 只输出 Cookie **名称**的诊断接口（2026-10-07）
 *
 * 背景：xiaohongshu 草稿箱发布的 `Authorization: AT <token>` 来自 Cookie
 * `access-token-creator.xiaohongshu.com`，但应用**没有任何只读通道**能确认这个
 * cookie 是否存在：
 *   - 凭证文件用 AES-256-GCM 加密、主密钥经 DPAPI 封装 ⇒ 进程外解不开（DPAPI 绑定上下文）
 *   - Chromium 分区 Cookie 库被运行中应用独占锁 ⇒ 只读打开也 EBUSY
 *   - `account:list` / `storeGetAccount` 公开 API 不返回 cookie（设计如此）
 * 而登录门禁 `hasPlatformSessionCookie` 用的是 `some`（AT 或 user-id 任一命中即可），
 * 所以**不能**从 `status=active` 反推 AT token 存在。
 *
 * 本接口在**主进程内**解密，只回传 cookie 名列表，绝不回传任何 value。
 * 用途：确认发布链所需凭据是否存在，避免「跑一次才知道」的 fail-closed 试错。
 *
 * 安全约束（改这个文件前必须读）：
 *   - 只输出 `name`，**永不**输出 `value` / `encryptedValue` / 任何可还原凭据的片段
 *   - 不接受任意路径/任意账号，只接受平台 + 已存在账号 id（走既有 isSafePathSegment 校验）
 *   - 走 withSenderCheck，与同文件其它账号接口同一套授权面
 */

const REQUIRED_COOKIE_MARKERS = {
  // 发布链真正依赖的凭据：缺任何一个都会 fail-closed
  xiaohongshu: ['a1', 'access-token-creator.xiaohongshu.com'],
}

/**
 * 注册 credential-names 诊断通道
 * @param {object} deps 注册器依赖（与 registerHandlers 同构）
 * @param {Function} withSenderCheck 统一 sender 校验包装
 * @param {object} EC 错误码表
 * @param {Function} ipcLog 日志函数
 * @param {object} ipcMain Electron ipcMain
 */
function registerCredentialDiagnostics ({ deps, withSenderCheck, EC, ipcLog, ipcMain }) {
  const { AccountManager, credentialStore } = deps

  // 复用 account.js 里的平台/账号校验，避免第二份实现
  const isSafe = (v) => typeof v === 'string' && /^[a-zA-Z0-9_-]+$/.test(v)

  ipcMain.handle('account:credential-names', withSenderCheck(async (event, arg) => {
    const platform = arg && arg.platform
    const accountId = arg && arg.accountId
    try {
      if (!isSafe(platform) || !isSafe(accountId)) {
        return { code: EC.VALIDATION_ERROR, message: 'platform/accountId 非法', data: { names: [], present: {} } }
      }

      // 主进程内解密（这一步在应用进程上下文里做，DPAPI 可用）
      let cookies = []
      try {
        const saved = AccountManager.loadSavedCredentials(accountId, platform)
        cookies = (saved && Array.isArray(saved.cookies)) ? saved.cookies : []
      } catch (e) {
        // 解密失败要如实说，不能当「无 cookie」
        ipcLog('warn', 'account:credential-names', 'load-failed', `platform=${platform} accountId=${accountId} message=${e instanceof Error ? e.message : String(e)}`)
        return { code: EC.REQUEST_ERROR, message: '凭证读取失败（见日志）', data: { names: [], present: {}, readable: false } }
      }

      // 只取 name —— 这是本接口存在的全部理由，也是它的安全边界
      const names = cookies.map(c => c && c.name).filter(n => typeof n === 'string' && n)
      const required = REQUIRED_COOKIE_MARKERS[platform] || []
      const present = {}
      for (const marker of required) present[marker] = names.includes(marker)

      return {
        code: 0,
        data: {
          names: names.slice().sort(),
          count: names.length,
          required,
          present,
          missing: required.filter(m => !present[m]),
          readable: true,
        },
      }
    } catch (e) {
      ipcLog('error', 'account:credential-names', 'error', `message=${e instanceof Error ? e.message : String(e)}`)
      return { code: EC.REQUEST_ERROR, message: e instanceof Error ? e.message : String(e), data: { names: [], present: {} } }
    }
  }))
}

module.exports = { registerCredentialDiagnostics, REQUIRED_COOKIE_MARKERS }