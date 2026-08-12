'use strict';

const { createLocalFileIngest, DEFAULT_LIMITS: LOCAL_LIMITS } = require('./ingest-local');
const { createUrlIngest, hintPlatform, DEFAULT_LIMITS: URL_LIMITS } = require('./ingest-url');
const { createFfprobeAnalyze, aspectFromResolution } = require('./analyze-ffprobe');
const { createScriptPlan } = require('./plan-script');
const { createVideoClonePipeline } = require('../pipeline');

/** 按 source.type 分派的默认 ingest */
function createDefaultIngest(opts = {}) {
  const local = createLocalFileIngest(opts);
  const url = createUrlIngest(opts);
  return {
    id: 'ingest',
    async run(ctx) {
      const type = ctx.request.source.type;
      return type === 'local' ? local.run(ctx) : url.run(ctx);
    },
  };
}

/** 切片 2 便利工厂：ingest/analyze/plan 真实 adapter，generate/compose/publish 保持 fail-closed */
function createSlice2Pipeline(opts = {}) {
  return createVideoClonePipeline({
    ingest: createDefaultIngest(opts),
    analyze: createFfprobeAnalyze(opts),
    plan: createScriptPlan(opts),
  }, opts.executorOptions);
}

module.exports = {
  createLocalFileIngest, createUrlIngest, createFfprobeAnalyze, createScriptPlan,
  createDefaultIngest, createSlice2Pipeline, hintPlatform, aspectFromResolution,
  LOCAL_LIMITS, URL_LIMITS,
};
