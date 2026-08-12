'use strict';

const { VideoCloneError } = require('./errors');

/**
 * IPC-ready 运行器（切片 4 契约）：构造 pipeline 时注入 eventSink/abortSignal，
 * 暴露阶段级进度事件与协作中止。
 * - onEvent({type, ...})：stage:started|stage:succeeded|stage:failed|aborted|completed
 * - signal：AbortSignal（阶段边界中止；长阶段需 adapter 自身协作检查）
 * 事件已注入 pipeline（executorOptions.eventSink），此处仅负责生命周期事件与结果包装。
 */
function createVideoCloneRunner({ createPipeline, pipelineOptions = {}, onEvent = () => {}, signal = null } = {}) {
  if (typeof createPipeline !== 'function') {
    throw new VideoCloneError('VIDEOCLONE_INTERNAL', { params: { reason: 'runner 需要 createPipeline' } });
  }
  const pipeline = createPipeline(Object.assign({}, pipelineOptions, {
    executorOptions: Object.assign({}, pipelineOptions.executorOptions, {
      eventSink: onEvent,
      abortSignal: signal,
    }),
  }));

  async function run(request) {
    const startAt = Date.now();
    try {
      const result = await pipeline.run(request);
      onEvent({ type: 'completed', runId: result.runId, ok: result.ok, elapsedMs: Date.now() - startAt });
      return result;
    } catch (err) {
      const e = err && err.toJSON && typeof err.toJSON === 'function' ? err.toJSON() : { code: String((err && err.message) || 'UNKNOWN') };
      onEvent({ type: 'failed', error: e });
      return { ok: false, runId: null, error: err };
    }
  }

  return { run, stages: pipeline.stages };
}

module.exports = { createVideoCloneRunner };
