'use strict';

const { VideoCloneError } = require('../errors');

/**
 * 逐镜头资产规划（纯函数，可测）：由报告派生每个镜头要生成的素材规格。
 * - kind：默认 image；replication.mode === 'full' 且镜头 type 标记视频时 → video
 * - promptSeed：palette/tone/person/plot 组合，供 provider 提示词注入
 */
function createAssetPlan(report, opts = {}) {
  const shots = (report && report.visual && report.visual.shots) || [];
  const style = (report && report.scriptStyle) || {};
  const visual = (report && report.visual) || {};
  const mode = (report && report.replication && report.replication.mode) || 'structure';
  return shots.map((shot, i) => {
    const kind = mode === 'full' && shot.type === 'video' ? 'video' : 'image';
    return {
      index: i,
      t0: shot.t0,
      t1: shot.t1,
      durationSec: Math.max(0.5, (shot.t1 || 0) - (shot.t0 || 0)),
      kind,
      promptSeed: [
        'palette:' + (visual.palette || 'unknown'),
        'tone:' + (style.tone || 'unknown'),
        'person:' + (style.person || 'unknown'),
        'plot:' + ((report.narrative && report.narrative.plot) || '').slice(0, 80),
      ].join(' | '),
    };
  });
}

/**
 * generate adapter（PRD F3.2 / §17）：按资产规划逐镜头调用 assetGenerator。
 * - 未注入 assetGenerator → VIDEOCLONE_PROVIDER_UNAVAILABLE（fail-closed，retryable）
 * - generator 抛错 → VIDEOCLONE_ASSET_GENERATION_FAILED（retryable）
 * - 产物必须含可读 path 与合法 kind，否则失败
 */
function createGenerateAssets({ assetGenerator = null } = {}) {
  async function run(ctx) {
    const report = ctx.report;
    const plan = createAssetPlan(report);
    if (plan.length === 0) {
      throw new VideoCloneError('VIDEOCLONE_ASSET_GENERATION_FAILED', { phase: 'generate', params: { reason: '报告无镜头' } });
    }
    if (typeof assetGenerator !== 'function') {
      throw new VideoCloneError('VIDEOCLONE_PROVIDER_UNAVAILABLE', { phase: 'generate', params: { reason: '未注入 assetGenerator' } });
    }
    const scenes = [];
    for (const spec of plan) {
      let asset;
      try {
        asset = await assetGenerator(spec, report);
      } catch (err) {
        throw new VideoCloneError('VIDEOCLONE_ASSET_GENERATION_FAILED', { phase: 'generate', cause: err, params: { shotIndex: spec.index } });
      }
      if (!asset || typeof asset.path !== 'string' || asset.path.length === 0) {
        throw new VideoCloneError('VIDEOCLONE_ASSET_GENERATION_FAILED', { phase: 'generate', params: { shotIndex: spec.index, reason: '产物缺少 path' } });
      }
      scenes.push({ index: spec.index, kind: asset.kind || spec.kind, path: asset.path, durationSec: spec.durationSec });
    }
    ctx.artifacts.assets = { scenes, plan };
    return 'generate';
  }

  return { id: 'generate', run };
}

module.exports = { createGenerateAssets, createAssetPlan };
