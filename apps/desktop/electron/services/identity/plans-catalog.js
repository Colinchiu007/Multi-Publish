// @ts-check
/**
 * 价目目录同步与缓存（2026-10-07 新增）
 *
 * 为什么单独成文件、且挂载在 factory 的**投递层**而不是 auth-service 内部：
 * `auth-service.js` 在 main 上已是 498 行、上限 500，只剩 2 行余量。把取价塞进去
 * 必然触发 `check-max-lines.js` 的 NEW_OVER_LIMIT（新代码不得引入超限文件）；
 * 而拆分 auth-service 属结构性重构，不该由一个取价功能承担。
 * 挂载点见 `identity-service-factory.js` 的 onStateChanged。
 *
 * 取价是异步的（要打服务端 `/api/v1/plans`），而 state 推送是同步的，因此：
 *   1) 首次推送带 `plans: null` → UI 显示「价格暂不可用」
 *   2) 取到后再触发**一次**推送 → UI 显示真实价格
 * 「先空后实」是刻意的：宁可短暂显示不可用，也绝不显示未经服务端确认的数字。
 */

/**
 * 取价目目录，失败降级为 null。
 *
 * 降级是刻意设计：
 * - 价目失败**不得**影响权益（权益是核心，价目是辅助）。
 * - 降级为 `null`（明确「不可用」）而不是空数组 —— 空数组会被 UI 渲染成
 *   「无套餐」的空目录，与「取价失败」混淆。
 * - **绝不兜硬编码价格** —— 那正是本功能要消除的「凭记忆写死金额」反模式。
 *
 * @param {any} entitlementService entitlement-service 实例（可为 null）
 * @param {string} accessToken Logto access token
 * @param {any} [logger] 可注入的 logger
 * @returns {Promise<Array|null>}
 */
async function syncPlans(entitlementService, accessToken, logger) {
  if (!entitlementService || typeof entitlementService.fetchPlans !== 'function') return null
  try {
    return await entitlementService.fetchPlans({ accessToken })
  } catch (error) {
    if (logger && typeof logger.warn === 'function') {
      logger.warn('[identity] 价目目录获取失败，降级为不可用: ' + ((error && error.message) || String(error)))
    }
    return null
  }
}

/**
 * 价目目录缓存：状态 + 单飞（single-flight）加载。
 *
 * `loading` 闸保证并发调用只打服务端一次；失败后 finally 复位允许重试。
 *
 * @param {{ entitlementService: any, authService: any, logger?: any }} options
 * @returns {{ current: any, loading: boolean, load: () => Promise<any> }}
 */
function createPlansCache({ entitlementService, authService, logger }) {
  const cache = {
    current: null, // null = 未取到/取价失败；数组 = 服务端目录
    loading: false,
    async load() {
      if (cache.loading) return cache.current
      cache.loading = true
      try {
        if (!authService || typeof authService.getAccessToken !== 'function') return null
        const accessToken = await authService.getAccessToken()
        cache.current = await syncPlans(entitlementService, accessToken, logger)
        return cache.current
      } catch (error) {
        // getAccessToken 自身失败（如会话过期）时同样降级，不打断身份状态机
        if (logger && typeof logger.warn === 'function') {
          logger.warn('[identity] 价目目录取 token 失败，降级为不可用: ' + ((error && error.message) || String(error)))
        }
        cache.current = null
        return null
      } finally {
        cache.loading = false
      }
    },
  }
  return cache
}

module.exports = { syncPlans, createPlansCache }
