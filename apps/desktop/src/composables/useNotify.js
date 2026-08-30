// @ts-check
/**
 * useNotify.js — 通知 composable（统一通知通道，D1 决策）
 *
 * 职责（对应 01-docs/ARCH-notify-log-standard.md §3.3）：
 *   - 统一入口：notify / notifyError / notifySuccess / notifyWarning / notifyConfirm
 *   - 内部：notifyCore 解析文案 + 日志上报 → ElMessage/ElMessageBox 展示
 *   - 未命中 messageKey 时：error 级用 fallback 兜底，其余静默（避免空白 toast）
 *
 * 依赖（薄封装）：
 *   - notifyCore：文案解析 + notify:log 上报
 *   - element-plus：ElMessage / ElMessageBox 展示
 */
import { ElMessage, ElMessageBox } from 'element-plus'
import i18n from '@/i18n'
import { notifyText, reportNotify } from '@/utils/notifyCore'

/**
 * 统一通知入口。
 * @param {string} messageKey - 如 'story2video.quota_exceeded' / 'operation_failed'
 * @param {object} [options]
 * @param {object} [options.params] - 插值参数
 * @param {string} [options.module]
 * @param {'success'|'info'|'warning'|'warn'|'error'|'confirm'} [options.level]
 * @param {string} [options.fallback] - 未命中 key 时的兜底文案（error 级）
 * @returns {string} 展示的文案（未命中且无 fallback 返回 ''）
 */
export function useNotify () {
  function notify (messageKey, options = {}) {
    const level = options.level || 'info'
    // 支持直接传文案（options.message 优先于 messageKey 解析），用于动态/运行时拼接文案
    const text = typeof options.message === 'string' && options.message
      ? options.message
      : notifyText(messageKey, options)
    if (!text) {
      // 未命中 key：error 级用 fallback 兜底，其余静默
      if (level === 'error' && options.fallback) {
        reportNotify(messageKey, { ...options, level: 'error' })
        ElMessage.error(options.fallback)
        return options.fallback
      }
      return ''
    }
    const show = {
      success: () => ElMessage.success(text),
      info: () => ElMessage.info(text),
      warning: () => ElMessage.warning(text),
      warn: () => ElMessage.warning(text),
      error: () => ElMessage.error(text),
    }[level]
    if (show) show()
    return text
  }

  function notifyError (messageKey, options = {}) {
    return notify(messageKey, { ...options, level: 'error' })
  }

  function notifySuccess (messageKey, options = {}) {
    return notify(messageKey, { ...options, level: 'success' })
  }

  function notifyWarning (messageKey, options = {}) {
    return notify(messageKey, { ...options, level: 'warning' })
  }

  function notifyInfo (messageKey, options = {}) {
    return notify(messageKey, { ...options, level: 'info' })
  }

  /**
   * 确认弹窗（confirm 级）。
   * @param {string} messageKey
   * @param {object} [options]
   * @param {object} [options.params]
   * @param {string} [options.module]
   * @param {string} [options.title] - 弹窗标题（缺省用 messageKey 文案）
   * @param {string} [options.confirmButtonText]
   * @param {string} [options.cancelButtonText]
   * @param {'warning'|'error'|'info'} [options.type]
   * @returns {Promise<boolean>} 用户确认返回 true，取消返回 false
   */
  async function notifyConfirm (messageKey, options = {}) {
    // options.message 直接传文案（动态/运行时拼接），否则用 messageKey 解析
    const text = typeof options.message === 'string' && options.message
      ? options.message
      : notifyText(messageKey, options)
    if (!text) return false
    reportNotify(messageKey, { ...options, level: 'confirm' })
    try {
      await ElMessageBox.confirm(text, options.title || '', {
        confirmButtonText: options.confirmButtonText || i18n.global.t('common.confirm'),
        cancelButtonText: options.cancelButtonText || i18n.global.t('common.cancel'),
        type: options.type || 'warning',
      })
      return true
    } catch (_) {
      return false
    }
  }

  return {
    notify,
    notifyError,
    notifySuccess,
    notifyWarning,
    notifyInfo,
    notifyConfirm,
  }
}