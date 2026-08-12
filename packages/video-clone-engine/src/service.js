'use strict';

const { createVideoCloneRunner } = require('./runner');
const { editReport } = require('./clone-report');

/**
 * 会话级服务（切片 4b 契约）：run 会话表 + 协作取消 + 报告编辑校验。
 * Electron 无关（webContents/清理由桌面层注入或包装），node:test 可测。
 */
function createVideoCloneService({ createPipeline, onProgress = null } = {}) {
  if (typeof createPipeline !== 'function') {
    throw new TypeError('createVideoCloneService 需要 createPipeline');
  }
  const sessions = new Map();

  async function run(request, opts = {}) {
    const sendProgress = opts.sendProgress || onProgress || (() => {});
    const controller = new AbortController();
    const runner = createVideoCloneRunner({
      createPipeline,
      onEvent: sendProgress,
      signal: controller.signal,
    });
    const runId = (request && request.runId) || 'vc-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8);
    const session = { controller, runner, startedAt: Date.now() };
    sessions.set(runId, session);
    try {
      const result = await runner.run(request);
      return Object.assign({}, result, { runId });
    } finally {
      sessions.delete(runId);
    }
  }

  function cancel(runId) {
    const s = sessions.get(runId);
    if (!s) return false;
    s.controller.abort();
    return true;
  }

  function activeCount() {
    return sessions.size;
  }

  /** 报告编辑校验（IPC video-clone:report:edit 复用） */
  function applyReportPatch(report, patch) {
    return editReport(report, patch);
  }

  return { run, cancel, activeCount, applyReportPatch, sessions };
}

module.exports = { createVideoCloneService };
