// @ts-check
/**
 * 飞书 API 配置 IPC handlers
 *
 * - feishu:get-config: 读取配置，返回 { appId, enabled }（不返回 Secret）
 * - feishu:save-config: 加密 appSecret 后存储
 * - feishu:test-connection: 读取配置 → FeishuClient.testConnection()
 *
 * 加密：使用 services/crypto.js 的 safeStorage 加密（与 model-provider API Key 同一套体系），
 * 密文 base64 落盘。safeStorage 不可用时拒绝存储（与库内安全姿态一致）。
 * 返回格式统一为 { code: 0, data } / { code: <error>, message }。
 */

const crypto = require('../services/crypto')
const { FeishuClient } = require('../services/feishu-client')

const SETTING_KEY = 'feishu_api_config'

function registerHandlers (ipcMain, deps) {
  const EC = require('../core/error-codes').ERROR
  const { withSenderCheck } = require('./helpers')
  const store = deps && deps.store

  if (!store || typeof store.getSetting !== 'function' || typeof store.setSetting !== 'function') return

  // ─── 读取配置（不返回 Secret） ───
  ipcMain.handle('feishu:get-config', withSenderCheck(() => {
    try {
      const raw = store.getSetting(SETTING_KEY)
      const cfg = raw && typeof raw === 'object' ? raw : {}
      return { code: 0, data: { appId: cfg.appId || '', enabled: Boolean(cfg.enabled) } }
    } catch (e) {
      return { code: EC.REQUEST_ERROR, message: e.message }
    }
  }))

  // ─── 保存配置（加密 Secret） ───
  ipcMain.handle('feishu:save-config', withSenderCheck((_event, appId, appSecret) => {
    try {
      if (typeof appId !== 'string' || !appId.trim()) {
        return { code: EC.VALIDATION_ERROR, message: 'appId 不能为空' }
      }
      if (typeof appSecret !== 'string' || !appSecret.trim()) {
        return { code: EC.VALIDATION_ERROR, message: 'appSecret 不能为空' }
      }
      if (!crypto.isAvailable()) {
        return { code: EC.REQUEST_ERROR, message: '系统凭据保护不可用，无法加密保存飞书密钥' }
      }
      const encrypted = crypto.encrypt(appSecret.trim())
      store.setSetting(SETTING_KEY, {
        appId: appId.trim(),
        appSecret: encrypted.toString('base64'),
        enabled: true,
        verifiedAt: null,
      })
      return { code: 0, data: { appId: appId.trim(), enabled: true } }
    } catch (e) {
      return { code: EC.REQUEST_ERROR, message: e.message }
    }
  }))

  // ─── 测试连接 ───
  ipcMain.handle('feishu:test-connection', withSenderCheck(async (_event, appId, appSecret) => {
    try {
      let cfg
      if (typeof appId === 'string' && appId && typeof appSecret === 'string' && appSecret) {
        cfg = { appId: appId.trim(), appSecret: appSecret.trim() }
      } else {
        const raw = store.getSetting(SETTING_KEY)
        const stored = raw && typeof raw === 'object' ? raw : {}
        if (!stored.appId || !stored.appSecret) {
          return { code: EC.REQUEST_ERROR, message: '未配置飞书应用，请先保存配置', data: { ok: false } }
        }
        cfg = { appId: stored.appId, appSecret: crypto.decrypt(Buffer.from(stored.appSecret, 'base64')) }
      }
      const client = new FeishuClient(cfg)
      await client.testConnection()
      return { code: 0, data: { ok: true } }
    } catch (e) {
      return { code: EC.REQUEST_ERROR, message: e.message, data: { ok: false } }
    }
  }))
}

module.exports = registerHandlers
