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

const { createGenerateAssets, createAssetPlan } = require('./generate-assets');
const { createFfmpegCompose, buildComposeCommand, buildAssScript } = require('./compose-ffmpeg');
const { createPublish } = require('./publish');

/** 切片 3 便利工厂：全六阶段真实/契约 adapter（generate 需注入 assetGenerator，否则 fail-closed） */
function createSlice3Pipeline(opts = {}) {
  return createVideoClonePipeline({
    ingest: createDefaultIngest(opts),
    analyze: createFfprobeAnalyze(opts),
    plan: createScriptPlan(opts),
    generate: createGenerateAssets(opts),
    compose: createFfmpegCompose(opts),
    publish: createPublish(opts),
  }, opts.executorOptions);
}

module.exports = {
  createLocalFileIngest, createUrlIngest, createFfprobeAnalyze, createScriptPlan,
  createDefaultIngest, createSlice2Pipeline, createSlice3Pipeline, hintPlatform, aspectFromResolution,
  createGenerateAssets, createAssetPlan, createFfmpegCompose, buildComposeCommand, buildAssScript, createPublish,
  LOCAL_LIMITS, URL_LIMITS,
};
