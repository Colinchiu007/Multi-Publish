// @ts-check
/**
 * Phase 3: 服务初始化（app.whenReady 后）
 *
 * 从 bootstrap.js runWhenReady 拆出：
 * - usageTracker / store.init / publishIntervalGuard
 * - taskQueue.setStateSaver / callbackServer.start
 * - scheduler.restore / taskQueue.deserialize
 * - keywordMonitor.onAlert + 持久化定时器
 * - login status monitor / analytics providers / cloudPublisher
 *
 * 验收标准 BUGFIX-PLAN Bug-1: phase 文件 <= 80 行（注释/空行不计）
 */
const log = require('../services/logger')

/**
 * 初始化所有异步服务（app.whenReady 后调用）
 * @param {object} deps
 * @param {object} deps.container - DI 容器（获取 usageTracker / publishIntervalGuard）
 * @param {object} deps.store - Store 实例
 * @param {object} deps.taskQueue - 任务队列
 * @param {object} deps.callbackServer - 回调服务器
 * @param {object} deps.scheduler - 调度器
 * @param {object} deps.keywordMonitor - 关键词监控
 * @param {object} deps.analyticsService - 分析服务
 * @param {Function} deps.CloudPublisher - 云端发布构造函数
 * @param {Function} deps.getMainWin - 获取主窗口函数
 */
async function startServices({ container, store, taskQueue, callbackServer, scheduler,
  keywordMonitor, analyticsService, CloudPublisher, getMainWin }) {
  // ─── usageTracker ───
  const usageTracker = container.get('usageTracker')
  usageTracker.trackSession()
  global.usageTracker = usageTracker

  // ─── store + 发布频率控制 ───
  store.init()
  const _publishIntervalGuard = container.get('publishIntervalGuard')

  // ─── taskQueue 持久化 ───
  taskQueue.setStateSaver((jsonStr) => {
    store.setSetting('task_queue_state', jsonStr)
  })

  // ─── callbackServer ───
  try {
    await callbackServer.start((data) => {
      const win = getMainWin()
      if (win && !win.isDestroyed()) {
        win.webContents.send('callback:received', data)
      }
      if (data) {
        store.addCallbackLog(data.type || 'unknown', data.source || data.platform, data)
      }
    })
  } catch (e) {
    log.warn('App', 'Callback server failed to start (port may be in use):', e.message)
  }

  // ─── scheduler + taskQueue 恢复 ───
  const restored = scheduler.restore()
  if (restored > 0) log.info('Scheduler', 'Restored ' + restored + ' pending tasks')

  const savedState = store.getSetting('task_queue_state')
  if (savedState) {
    const recovered = taskQueue.deserialize(savedState)
    if (recovered > 0) {
      log.info('App', 'Recovered ' + recovered + ' tasks from queue state')
      store.setSetting('task_queue_state', null)
    }
  }

  // ─── keywordMonitor 告警 + 持久化 ───
  keywordMonitor.onAlert((keyword, current, previous, ratio) => {
    const win = getMainWin()
    if (win && !win.isDestroyed()) {
      win.webContents.send('notification', {
        type: 'keyword-spike',
        title: '[Spike] ' + keyword + ': ' + previous + ' -> ' + current + ' (' + ratio.toFixed(1) + 'x)',
        keyword, current, previous,
      })
    }
  })

  const keywordPersistTimer = setInterval(() => {
    try {
      const state = keywordMonitor.getAllHistories()
      store.setSetting('keyword_monitor_state', JSON.stringify(state))
    } catch (e) {
      log.warn('App', 'Keyword monitor persist error: ' + e.message)
    }
  }, 5 * 60 * 1000)
  if (keywordPersistTimer.unref) keywordPersistTimer.unref()

  // ─── login status monitor (F1.3) ───
  try {
    const { createLoginStatusMonitor } = require('../services/login-status-monitor')
    const accountManager = require('../publishers/account-manager')
    const loginMonitor = createLoginStatusMonitor({
      store, accountManager, intervalMs: 30 * 60 * 1000, getMainWin,
    })
    loginMonitor.start()
    log.info('App', 'Login status monitor started (F1.3, 30min interval)')
  } catch (e) {
    log.warn('App', 'Login status monitor failed to start: ' + e.message)
  }

  // ─── analytics providers ───
  try {
    const { xiaohongshuProvider, douyinProvider } = require('../services/analytics-providers')
    analyticsService.registerProvider('xiaohongshu', xiaohongshuProvider)
    analyticsService.registerProvider('douyin', douyinProvider)
    log.info('App', 'Analytics providers registered: xiaohongshu, douyin')
  } catch (e) {
    log.warn('App', 'Failed to register analytics providers: ' + e.message)
  }

  // ─── cloudPublisher ───
  const cloudPublisher = new CloudPublisher({
    orchestratorUrl: process.env.ORCHESTRATOR_URL || '',
    store,
  })
  cloudPublisher.registerIpcHandlers()

  // 返回定时器引用，供 shutdown 时 clearInterval 清理
  return { keywordPersistTimer }
}

module.exports = { startServices }
