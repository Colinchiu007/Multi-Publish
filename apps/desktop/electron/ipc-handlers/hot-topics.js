// @ts-check
/**
 * Hot Topics IPC handlers — 热门选题模块前端桥接
 *
 * 通道：
 *   hot-topics:fetch      → HotTopicsService.fetchTopics({ force })
 *   hot-topics:get-cache  → HotTopicsService.getCache()
 */

/**
 * @param {import('electron').IpcMain} ipcMain
 * @param {{ hotTopicsService: { fetchTopics: Function, getCache: Function }, log?: object }} deps
 */
function registerHandlers(ipcMain, deps) {
  const { hotTopicsService, log } = deps
  const logger = log || { info: () => {}, warn: () => {}, error: () => {} }
  // deps 缺失时 warn + 跳过注册（不中断其他模块的 IPC 注册链），调用方会拿到 invoke 超时/不存在
  if (!hotTopicsService) {
    logger.warn('[hot-topics] deps.hotTopicsService missing, skip channel registration')
    return
  }

  ipcMain.handle('hot-topics:fetch', async (_event, payload) => {
    try {
      const force = !!(payload && payload.force)
      const data = await hotTopicsService.fetchTopics({ force })
      return { code: 0, data }
    } catch (e) {
      logger.error('[hot-topics] fetch failed:', e && e.message ? e.message : String(e))
      return { code: -99, message: 'HOT_TOPICS_FETCH_FAILED' }
    }
  })

  ipcMain.handle('hot-topics:get-cache', async () => {
    try {
      return { code: 0, data: hotTopicsService.getCache() }
    } catch (e) {
      logger.error('[hot-topics] get-cache failed:', e && e.message ? e.message : String(e))
      return { code: -99, message: 'HOT_TOPICS_CACHE_FAILED' }
    }
  })
}

module.exports = registerHandlers
