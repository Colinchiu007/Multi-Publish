'use strict';

const { VideoCloneError } = require('./errors');

/** 统一错误序列化（重试记录/最终失败共用） */
function serializeError(err) {
  if (err && err.toJSON && typeof err.toJSON === 'function') return err.toJSON();
  return { code: String((err && err.code) || err.message || 'UNKNOWN') };
}

/**
 * 顺序阶段执行器（PRD §3.2 流程 + OpenSpec 阶段执行器 Requirement）。
 * - checkpoint：context.progress[stageId]==='complete' 时跳过（断点续跑，completed 去重）
 * - retryable 错误：有界重试（默认 2 次，指数退避，可注入 wait/now 便于测试）
 * - 非 retryable：立即 fail-closed，不执行后续阶段
 * - 每阶段记录 { stage, status, attempts, retries, startedAt, finishedAt, error? }
 * - 跳过的阶段回填 results[stageId] = { skipped: true }
 */
function createStageExecutor(options = {}) {
  const {
    maxRetries = 2,
    baseBackoffMs = 200,
    now = () => Date.now(),
    wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  } = options;

  async function executeStage(stage, context, progress) {
    const record = { stage: stage.id, status: 'running', attempts: 0, retries: 0, startedAt: now() };
    progress.steps.push(record);
    let lastError = null;
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      record.attempts = attempt + 1;
      try {
        const result = await stage.run(context);
        record.status = 'complete';
        record.finishedAt = now();
        record.retries = attempt; // 成功时保留重试次数；错误清空
        delete record.error;
        record.result = result === undefined ? null : result;
        context.progress[stage.id] = 'complete';
        return result;
      } catch (err) {
        lastError = err;
        record.error = serializeError(err);
        const retryable = err && typeof err === 'object' && err.retryable === true;
        if (!retryable || attempt >= maxRetries) {
          record.status = 'failed';
          record.finishedAt = now();
          record.retries = attempt;
          context.progress[stage.id] = 'failed';
          return { failed: true, record, error: err };
        }
        if (wait) await wait(baseBackoffMs * (2 ** attempt));
      }
    }
    /* istanbul ignore next — 循环内必 return，不可达 */
    return { failed: true, record, error: lastError };
  }

  /**
   * 执行阶段列表。stages: [{ id, name, run(ctx) }]
   * 返回 { ok, results, progress }；失败时 { ok:false, failedStage, error }
   */
  async function runStages(stages, context = {}) {
    context.progress = context.progress || {};
    context.progress.completed = Array.isArray(context.progress.completed) ? context.progress.completed : [];
    context.progress.steps = Array.isArray(context.progress.steps) ? context.progress.steps : [];
    const results = {};
    for (const stage of stages) {
      if (context.progress[stage.id] === 'complete') {
        // checkpoint 断点续跑：跳过已完成阶段（去重记录；结果回填 skipped）
        if (!context.progress.completed.includes(stage.id)) context.progress.completed.push(stage.id);
        results[stage.id] = { skipped: true };
        continue;
      }
      const outcome = await executeStage(stage, context, context.progress);
      if (outcome.failed) {
        return { ok: false, failedStage: stage.id, error: outcome.error, results, progress: context.progress };
      }
      results[stage.id] = outcome;
      if (!context.progress.completed.includes(stage.id)) context.progress.completed.push(stage.id);
    }
    return { ok: true, results, progress: context.progress };
  }

  /** 未接线阶段的默认 adapter：fail-closed */
  function notImplemented(stageId) {
    return {
      id: stageId,
      async run() {
        throw new VideoCloneError('VIDEOCLONE_STAGE_NOT_IMPLEMENTED', { phase: stageId });
      },
    };
  }

  return { runStages, notImplemented };
}

module.exports = { createStageExecutor };
