// @ts-check
/**
 * 效果闭环 IPC handlers — 表现数据查询 / 手动录入 / 归因重算 / 追踪列表
 */
function registerHandlers(ipcMain, deps) {
  const { withSenderCheck, resolveIpcOwnerSubject } = require('./helpers')
  const EC = require('../core/error-codes').ERROR
  const log = require('../services/logger')
  const { buildPerformanceOverview } = require('../services/performance-overview')
  const { store, patternAttributionService, performanceRecrawlService, identityService } = deps

  if (!store) return

  ipcMain.handle('performance:list-tracked', async (_event, params) => {
    try {
      const page = Math.max(1, Number(params && params.page) || 1)
      const pageSize = Math.min(100, Math.max(1, Number(params && params.pageSize) || 20))
      const countRow = store.db.prepare('SELECT COUNT(*) AS n FROM tracked_content').get()
      const total = countRow ? Number(countRow.n) || 0 : 0
      const rows = store.db.prepare('SELECT * FROM tracked_content ORDER BY created_at DESC LIMIT ? OFFSET ?')
        .all(pageSize, (page - 1) * pageSize)
      // 附带最新快照
      const items = rows.map(r => {
        const snap = store.getLatestSnapshot(r.id)
        return { ...r, latest_snapshot: snap || null }
      })
      return { code: EC.SUCCESS, data: { items, total } }
    } catch (e) { log.warn('[ipc:performance]', ((e && e.message) || String(e))); return { code: EC.REQUEST_ERROR, message: e.message } }
  })

  ipcMain.handle('performance:add-manual-snapshot', withSenderCheck(async (_event, trackedContentId, metrics) => {
    try {
      if (!trackedContentId) return { code: EC.VALIDATION_ERROR, message: '缺少追踪条目 ID' }
      if (!metrics || typeof metrics !== 'object') return { code: EC.VALIDATION_ERROR, message: '参数无效' }
      const snapId = store.addPerformanceSnapshot({
        trackedContentId: String(trackedContentId),
        source: 'manual',
        views: metrics.views, likes: metrics.likes, comments: metrics.comments,
        favorites: metrics.favorites, shares: metrics.shares,
        raw: { manual: true },
      })
      if (!snapId) return { code: EC.REQUEST_ERROR, message: '保存失败' }
      // 手动录入后更新追踪状态（manual/unsupported → ok，继续自动节奏）
      store.updateTrackedContent(String(trackedContentId), { recrawlStatus: 'ok' })
      return { code: EC.SUCCESS, data: { id: snapId } }
    } catch (e) { log.warn('[ipc:performance]', ((e && e.message) || String(e))); return { code: EC.REQUEST_ERROR, message: e.message } }
  }))

  ipcMain.handle('performance:recompute-attribution', withSenderCheck(async () => {
    try {
      if (!patternAttributionService) return { code: EC.REQUEST_ERROR, message: '归因服务未就绪' }
      return patternAttributionService.recomputeAll()
    } catch (e) { log.warn('[ipc:performance]', ((e && e.message) || String(e))); return { code: EC.REQUEST_ERROR, message: e.message } }
  }))

  /**
   * 归因榜读侧：必须按归属筛（P2-6d）。
   * 门禁与 performance:overview / dashboard:stats 同口径：认不出是谁 = AUTH_ERROR，
   * 而不是「0 条数据」——把「没验出身份」渲染成空榜单，用户会以为这个功能坏了。
   * 身份服务缺席（undefined）走 legacy 桶，不是报错。
   */
  ipcMain.handle('performance:list-pattern-performance', withSenderCheck(async (_event, params) => {
    try {
      const owner = resolveIpcOwnerSubject(identityService)
      if (owner === null) return { code: EC.AUTH_ERROR, message: '无法识别当前用户' }
      const rows = store.listPatternPerformance(params || {}, owner)
      return { code: EC.SUCCESS, data: { items: rows } }
    } catch (e) { log.warn('[ipc:performance]', ((e && e.message) || String(e))); return { code: EC.REQUEST_ERROR, message: e.message } }
  }))

  /**
   * P2-6c 数据看板：作品互动回流总量 / 日增趋势 / 平台分布 / 回采健康度。
   * 口径只在 services/performance-overview.js 一处，本 handler 不得自己求和。
   * 门禁与 dashboard:stats 同口径：认不出是谁 = AUTH_ERROR，而不是「0 条数据」。
   */
  ipcMain.handle('performance:overview', withSenderCheck(async (_event, params) => {
    try {
      const owner = resolveIpcOwnerSubject(identityService)
      if (owner === null) return { code: EC.AUTH_ERROR, message: '无法识别当前用户' }
      const tracked = store.listTrackedForOverview(owner)
      const snapshots = store.listSnapshotsForOverview(owner)
      // store 的读侧把 SQL 故障吞成空行是既有风格；这里必须把它翻成错误信封，
      // 否则「查询失败」会被渲染成「从未发布」这块空态（QM-6 后端轴 FB7）
      const storeError = tracked && tracked.error ? tracked.error : (snapshots && snapshots.error ? snapshots.error : null)
      if (storeError) return { code: EC.REQUEST_ERROR, message: storeError }
      const overview = buildPerformanceOverview({
        trackedRows: tracked.rows,
        snapshotRows: snapshots.rows,
        windowDays: params && params.windowDays,
        nowMs: Date.now(),
        trackedTruncated: tracked.truncated,
        snapshotTruncated: snapshots.truncated,
      })
      // 库级孤儿计数与聚合层孤儿是两回事：前者是「关联不到任何作品」的完整性信号，
      // 后者只看到本次入参里的行。两者都如实给出，排障时才能分辨是数据坏了还是被归属过滤挡了。
      overview.diagnostics.orphanSnapshotsDb = snapshots.orphanTotal
      log.info('[ipc:performance]', 'overview owner=' + (owner === undefined ? 'legacy' : owner) +
        ' tracked=' + tracked.total + ' covered=' + overview.health.covered +
        ' snapshots=' + snapshots.total + ' interactions=' + overview.totals.interactions +
        ' truncated=' + (tracked.truncated || snapshots.truncated) + ' orphanDb=' + snapshots.orphanTotal)
      return { code: EC.SUCCESS, data: overview }
    } catch (e) { log.warn('[ipc:performance]', ((e && e.message) || String(e))); return { code: EC.REQUEST_ERROR, message: e.message } }
  }))

  // 立即回采调试入口：真正触发一轮巡检（此前为空壳只 return supported）。
  // force=true 忽略 T+1h 排期纳入窗口内全部可回采条目，用于当场观测「回采→爆款库写回」闭环。
  ipcMain.handle('performance:trigger-recrawl', withSenderCheck(async (_event, opts) => {
    try {
      const { supportedPlatforms } = require('../services/platform-metrics')
      const supported = supportedPlatforms()
      const force = Boolean(opts && opts.force)
      let ran = false
      if (performanceRecrawlService && typeof performanceRecrawlService.processRound === 'function') {
        await performanceRecrawlService.processRound({ force })
        ran = true
      }
      return { code: EC.SUCCESS, data: { supported, ran, force } }
    } catch (e) { return { code: EC.REQUEST_ERROR, message: e.message } }
  }))
}

module.exports = registerHandlers
