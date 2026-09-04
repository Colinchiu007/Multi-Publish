'use strict';

const { VideoCloneError } = require('../errors');

/**
 * 逐镜头资产规划（纯函数，可测）：由报告派生每个镜头要生成的素材规格。
 * - kind：默认 image；replication.mode === 'full' 且镜头 type 标记视频时 → video
 * - promptSeed：palette/tone/person/plot 组合，供 provider 提示词注入
 * - L0 文案级（v1.16）：不逐镜头生成，产出单张封面图（text-first），无有效内容时返回空数组
 */
function createAssetPlan(report, opts = {}) {
  const level = (report && report.replication && report.replication.level) || 'L1';
  const meta = (report && report.meta) || {};
  if (level === 'L0') {
    const plot = ((report && report.narrative && report.narrative.plot) || '').slice(0, 80);
    const script = (report && report.script && report.script.fullText) || '';
    const total = (typeof meta.durationSec === 'number' && meta.durationSec > 0) ? meta.durationSec : 10;
    if (!script.trim() && !plot.trim() && !(typeof meta.durationSec === 'number' && meta.durationSec > 0)) return [];
    return [{
      // index 从 0 开始：消费方（如占位图生成器 colors[index % len]）依赖非负索引
      index: 0, t0: 0, t1: total, durationSec: Math.max(1, total), kind: 'cover',
      promptSeed: 'text-first | cover | ' + (plot ? 'plot:' + plot : '') + (script.trim() ? ' | text:' + script.trim().slice(0, 60) : ''),
    }];
  }
  const shots = (report && report.visual && report.visual.shots) || [];
  const style = (report && report.scriptStyle) || {};
  const visual = (report && report.visual) || {};
  const mode = (report && report.replication && report.replication.mode) || 'structure';
  return shots.map((shot, i) => {
    // 视频克隆默认按镜头生成动态视频片段（真实视频模型，2026-09-05）；
    // L0 文案级走封面图分支，不受此影响。
    const kind = 'video';
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
      ].join(' | ') + (level === 'L2' ? ' | level:L2' : ''),
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
      // 降级标记透传（占位图等）：消费方（相似度警告/UI）据此诚实展示
      const extra = asset.degraded === true ? { degraded: true, source: asset.source } : {};
      scenes.push({ index: spec.index, kind: asset.kind || spec.kind, path: asset.path, durationSec: spec.durationSec, ...extra });
    }
    const level = (report && report.replication && report.replication.level) || 'L1';
    ctx.artifacts.assets = { scenes, plan, level, degraded: scenes.some((s) => s.degraded === true) };
    return 'generate';
  }

  return { id: 'generate', run };
}

module.exports = { createGenerateAssets, createAssetPlan };
