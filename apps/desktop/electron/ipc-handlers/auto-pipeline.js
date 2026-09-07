// @ts-check
/**
 * Auto-Pipeline IPC handlers — 全自动管道前端桥接
 *
 * 通道：
 *   auto-pipeline:start      → 启动全自动管道
 *   auto-pipeline:get-run    → 获取管道运行快照
 *   auto-pipeline:cancel     → 取消管道
 *   auto-pipeline:list-runs  → 列出管道运行历史
 */

function classifyError(e, fallbackMsg) {
  const msg = (e && e.message) ? String(e.message) : String(e || fallbackMsg);
  return { code: -99, message: msg };
}

/**
 * @param {import('electron').IpcMain} ipcMain
 * @param {{
 *   fullAutoPipeline: import('../services/full-auto-pipeline').FullAutoPipeline,
 *   log?: { info: Function, warn: Function, error: Function },
 * }} deps
 */
function registerHandlers(ipcMain, deps) {
  const { fullAutoPipeline, log } = deps;
  const logger = log || { info() {}, warn() {}, error() {} };

  if (!fullAutoPipeline) {
    logger.error('[auto-pipeline] fullAutoPipeline 未注入，IPC handler 不可用');
    return;
  }

  ipcMain.handle('auto-pipeline:start', async (_event, config) => {
    try {
      logger.info('[auto-pipeline] start requested:', JSON.stringify(config).slice(0, 200));
      const result = await fullAutoPipeline.startRun(config);
      return result;
    } catch (e) {
      logger.error('[auto-pipeline] start failed:', e && e.message ? e.message : String(e));
      const err = classifyError(e, '启动管道失败');
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('auto-pipeline:get-run', async (_event, runId) => {
    try {
      const snapshot = fullAutoPipeline.getRunSnapshot(runId);
      return snapshot || { code: -1, message: '运行不存在' };
    } catch (e) {
      logger.error('[auto-pipeline] get-run failed:', e && e.message ? e.message : String(e));
      return { code: -99, message: e && e.message ? e.message : String(e) };
    }
  });

  ipcMain.handle('auto-pipeline:cancel', async (_event, runId) => {
    try {
      const result = fullAutoPipeline.cancelRun(runId);
      return result;
    } catch (e) {
      logger.error('[auto-pipeline] cancel failed:', e && e.message ? e.message : String(e));
      return { success: false, error: e && e.message ? e.message : String(e) };
    }
  });

  ipcMain.handle('auto-pipeline:list-runs', async () => {
    try {
      const runs = fullAutoPipeline.listRuns();
      return { code: 0, data: runs };
    } catch (e) {
      logger.error('[auto-pipeline] list-runs failed:', e && e.message ? e.message : String(e));
      return { code: -99, message: e && e.message ? e.message : String(e), data: [] };
    }
  });

  logger.info('[auto-pipeline] IPC handlers registered');
}

module.exports = registerHandlers;
