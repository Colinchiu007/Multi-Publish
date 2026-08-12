'use strict';

const { REPLICATION_LEVELS, REPLICATION_MODES, SOURCE_TYPES, STAGES, VIDEO_TYPES } = require('./constants');
const { VideoCloneError } = require('./errors');
const { createStageExecutor } = require('./stage-executor');
const { emptyReport, validateCloneReport, sanitizeReportForIpc } = require('./clone-report');
const { computeSimilarityReport } = require('./similarity');

const STAGE_IDS = STAGES;

/** 请求校验（PRD §3 F1 + §11.1；W5/I9 加固） */
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
    if (typeof src.url !== 'string' || src.url.trim() === '' || !/^https:\/\//i.test(src.url)) errors.push('source.url: 必须提供 https 链接');
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

/** 统一失败形状（I6：所有路径都带 runId/report/artifacts/similarity/publishResult 键） */
function failureResult(runId, context, error) {
  return {
    ok: false, runId: runId || null, error,
    report: context ? sanitizeReportForIpc(context.report) : null,
    artifacts: context ? sanitizeReportForIpc(context.artifacts) : null,
    similarity: context ? context.similarity : null,
    publishResult: context ? context.publishResult : null,
  };
}

/**
 * 创建视频克隆流水线。adapters 按阶段注入：
 * { ingest, analyze, plan, generate, compose, publish }（缺省 fail-closed）。
 */
function createVideoClonePipeline(adapters = {}, executorOptions = {}) {
  const executor = createStageExecutor(executorOptions);

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

    const runId = 'vc-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8);
    const context = {
      request, report: emptyReport(), sourceReport: null,
      artifacts: {}, similarity: null, publishResult: null,
    };

    const wrapped = STAGE_IDS.map((id) => {
      const base = stageFor(id);
      return {
        id,
        run: async (ctx) => {
          const out = await base.run(ctx);
          if (id === 'analyze') {
            // 固化原片分析报告 + 立即校验（W3：非法报告 fail-closed）
            if (!ctx.sourceReport) ctx.sourceReport = sanitizeReportForIpc(ctx.report);
            const v = validateCloneReport(ctx.report);
            if (!v.ok) throw new VideoCloneError('VIDEOCLONE_INVALID_REPORT', { phase: 'analyze', params: { errors: v.errors } });
          }
          if (id === 'compose') {
            // F4 自检在 compose 阶段内（publish 之前）执行（C2：门禁可拦截发布）
            const v = validateCloneReport(ctx.report);
            if (!v.ok) throw new VideoCloneError('VIDEOCLONE_INVALID_REPORT', { phase: 'compose', params: { errors: v.errors } });
            const target = (ctx.request.options && ctx.request.options.target) || 'P1';
            const sim = computeSimilarityReport({ source: ctx.sourceReport || ctx.report, clone: ctx.report, target });
            ctx.similarity = sim;
            const failOnLow = ctx.request.options && ctx.request.options.failOnLowSimilarity === true;
            if (failOnLow && (sim.verdict === 'needs_review' || sim.verdict === 'insufficient_evidence')) {
              throw new VideoCloneError('VIDEOCLONE_SIMILARITY_LOW', { phase: 'compose', params: { similarity: sim } });
            }
          }
          return out;
        },
      };
    });

    const outcome = await executor.runStages(wrapped, context);
    if (!outcome.ok) return failureResult(runId, context, outcome.error);

    return {
      ok: true, runId,
      report: sanitizeReportForIpc(context.report),
      artifacts: sanitizeReportForIpc(context.artifacts),
      similarity: context.similarity,
      publishResult: context.publishResult,
    };
  }

  return { run, stages: STAGE_IDS };
}

module.exports = { createVideoClonePipeline, validateRequest, STAGE_IDS };
