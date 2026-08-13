'use strict';

const { REPLICATION_LEVELS, REPLICATION_MODES, SOURCE_TYPES, STAGES, VIDEO_TYPES } = require('./constants');
const { VideoCloneError } = require('./errors');
const { createStageExecutor } = require('./stage-executor');
const { emptyReport, validateCloneReport, sanitizeReportForIpc } = require('./clone-report');
const { computeSimilarityReport } = require('./similarity');

const STAGE_IDS = STAGES;

/** 请求校验（PRD §3 F1 + §11.1） */
function validateRequest(request) {
  const errors = [];
  if (!request || typeof request !== 'object') return { ok: false, errors: ['request 缺失'] };
  const src = request.source || {};
  if (!SOURCE_TYPES.includes(src.type)) errors.push('source.type: 非法来源（local|url）');
  if (src.type === 'local') {
    if (typeof src.path !== 'string' || src.path.trim() === '') errors.push('source.path: 本地文件必须提供非空 path');
    if (src.url !== undefined && src.url !== null) errors.push('source.url: 本地来源不允许携带 url');
  }
  if (src.type === 'url') {
    if (typeof src.url !== 'string' || src.url.trim() === '' || !String(src.url).toLowerCase().startsWith('https://')) errors.push('source.url: 必须提供 https 链接');
    if (src.path !== undefined && src.path !== null) errors.push('source.path: 链接来源不允许携带 path');
  }
  const opts = request.options || {};
  if (opts.replicationLevel !== undefined && !REPLICATION_LEVELS.includes(opts.replicationLevel)) errors.push('options.replicationLevel: 非法（L0|L1|L2）');
  if (opts.mode !== undefined && !REPLICATION_MODES.includes(opts.mode)) errors.push('options.mode: 非法复刻模式');
  if (opts.videoTypes !== undefined && !Array.isArray(opts.videoTypes)) errors.push('options.videoTypes: 必须是数组');
  if (Array.isArray(opts.videoTypes)) {
    for (const t of opts.videoTypes) if (!VIDEO_TYPES.includes(t)) errors.push('options.videoTypes: 非法视频类型 ' + t);
  }
  if (opts.rewriteScript !== undefined && typeof opts.rewriteScript !== 'boolean') errors.push('options.rewriteScript: 必须是布尔值');
  if (opts.target !== undefined && !['P1', 'P2'].includes(opts.target)) errors.push('options.target: 非法（P1|P2）');
  if (opts.failOnLowSimilarity !== undefined && typeof opts.failOnLowSimilarity !== 'boolean') errors.push('options.failOnLowSimilarity: 必须是布尔值');
  return { ok: errors.length === 0, errors };
}

/** 统一失败形状 */
function failureResult(runId, context, error) {
  return {
    ok: false, runId: runId || null, error,
    report: context ? sanitizeReportForIpc(context.report) : null,
    artifacts: context ? sanitizeReportForIpc(context.artifacts) : null,
    similarity: context ? context.similarity : null,
    publishResult: context ? context.publishResult : null,
  };
}

function serializeErr(err) {
  return err && err.toJSON && typeof err.toJSON === 'function' ? err.toJSON() : { code: String((err && err.code) || (err && err.message) || 'UNKNOWN') };
}

/**
 * 创建视频克隆流水线。executorOptions 支持：
 * - eventSink({type, ...})：stage:started|stage:succeeded|stage:failed|aborted
 * - abortSignal：AbortSignal（阶段边界协作中止）
 */
function createVideoClonePipeline(adapters = {}, executorOptions = {}) {
  const { eventSink = null, abortSignal = null, stageIds = null, ...execOpts } = executorOptions || {};
  const executor = createStageExecutor(execOpts);
  const ACTIVE_STAGES = stageIds && Array.isArray(stageIds) && stageIds.length > 0 ? stageIds : STAGE_IDS;

  function emit(type, data) {
    if (typeof eventSink === 'function') { try { eventSink(Object.assign({ type }, data || {})); } catch { /* 事件回调异常不阻断 */ } }
  }

  function stageFor(id) {
    const adapter = adapters[id];
    if (!adapter || typeof adapter.run !== 'function') return executor.notImplemented(id);
    return { id, run: adapter.run };
  }

  async function run(request) {
    const check = validateRequest(request);
    if (!check.ok) {
      return failureResult(null, null, new VideoCloneError('VIDEOCLONE_INVALID_REQUEST', { params: { errors: check.errors } }));
    }
    if (abortSignal && abortSignal.aborted) {
      emit('aborted', { stage: null, reason: 'request-aborted' });
      return failureResult(null, null, new VideoCloneError('VIDEOCLONE_INTERNAL', { params: { reason: 'aborted' } }));
    }

    const runId = 'vc-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8);
    const context = {
      request, report: emptyReport(), sourceReport: null,
      artifacts: {}, similarity: null, publishResult: null,
    };
    if (request.options && request.options.initialReport) {
      const v = validateCloneReport(request.options.initialReport);
      if (!v.ok) {
        return failureResult(null, null, new VideoCloneError('VIDEOCLONE_INVALID_REPORT', { params: { errors: v.errors } }));
      }
      context.report = sanitizeReportForIpc(request.options.initialReport);
      context.sourceReport = sanitizeReportForIpc(request.options.initialReport);
    }

    const wrapped = ACTIVE_STAGES.map((id) => {
      const base = stageFor(id);
      return {
        id,
        run: async (ctx) => {
          if (abortSignal && abortSignal.aborted) {
            emit('aborted', { stage: id });
            throw new VideoCloneError('VIDEOCLONE_INTERNAL', { phase: id, params: { reason: 'aborted' } });
          }
          emit('stage:started', { stage: id });
          try {
            const out = await base.run(ctx);
            if (id === 'analyze') {
              if (!ctx.sourceReport) ctx.sourceReport = sanitizeReportForIpc(ctx.report);
              const v = validateCloneReport(ctx.report);
              if (!v.ok) throw new VideoCloneError('VIDEOCLONE_INVALID_REPORT', { phase: 'analyze', params: { errors: v.errors } });
            }
            if (id === 'compose') {
              const v = validateCloneReport(ctx.report);
              if (!v.ok) throw new VideoCloneError('VIDEOCLONE_INVALID_REPORT', { phase: 'compose', params: { errors: v.errors } });
              const target = (ctx.request.options && ctx.request.options.target) || 'P1';
              // 有效层级：请求显式层级 > 报告（plan 自动定级）> L1（v1.16）
              const reqLevel = ctx.request.options && ctx.request.options.replicationLevel;
              const repLevel = ctx.report.replication && ctx.report.replication.level;
              const sim = computeSimilarityReport({
                source: ctx.sourceReport || ctx.report, clone: ctx.report,
                target, level: reqLevel || repLevel || 'L1',
              });
              ctx.similarity = sim;
              const failOnLow = ctx.request.options && ctx.request.options.failOnLowSimilarity === true;
              if (failOnLow && (sim.verdict === 'needs_review' || sim.verdict === 'insufficient_evidence')) {
                throw new VideoCloneError('VIDEOCLONE_SIMILARITY_LOW', { phase: 'compose', params: { similarity: sim } });
              }
            }
            emit('stage:succeeded', { stage: id });
            return out;
          } catch (err) {
            emit('stage:failed', { stage: id, error: serializeErr(err) });
            throw err;
          }
        },
      };
    });

    const outcome = await executor.runStages(wrapped, context);
    if (!outcome.ok) return failureResult(runId, context, outcome.error);

    return {
      ok: true, runId,
      report: sanitizeReportForIpc(context.report),
      reportSource: sanitizeReportForIpc(context.sourceReport),
      artifacts: sanitizeReportForIpc(context.artifacts),
      similarity: context.similarity,
      publishResult: context.publishResult,
    };
  }

  return { run, stages: STAGE_IDS };
}

module.exports = { createVideoClonePipeline, validateRequest, STAGE_IDS };
