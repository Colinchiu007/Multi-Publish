'use strict';

/**
 * 自动复刻层级评估（PRD §0 L0-L2 / v1.16）。
 *
 * 由拆解报告的证据完备度决定「可复刻目标层级」：
 *   - L2 风格迁移：结构 + 文案 + 风格（≥2 个风格标签）全部充足
 *   - L1 结构近似：结构 + 文案充足，风格不足
 *   - L0 信息一致/文案级：仅文案充足或结构缺失（视觉/风格不强求）
 *
 * 纯函数，仅读取 report；写入由 plan 阶段负责。
 */

function isNonEmptyStr(v) {
  return typeof v === 'string' && v.trim().length > 0;
}

function assessReplicationLevel(report) {
  const r = report || {};
  const narrative = r.narrative || {};
  const script = r.script || {};
  const style = r.scriptStyle || {};
  const visual = r.visual || {};
  const meta = r.meta || {};

  const structure = Array.isArray(narrative.timeline) && narrative.timeline.length >= 2;
  const scriptOk = isNonEmptyStr(script.fullText);

  const styleTags = [];
  if (visual.palette && visual.palette !== 'unknown') styleTags.push('palette:' + visual.palette);
  if (Array.isArray(visual.transitions) && visual.transitions.length > 0) styleTags.push('transitions:' + visual.transitions.length);
  if (style.person && style.person !== 'unknown') styleTags.push('person:' + style.person);
  if (style.tone && style.tone !== 'unknown') styleTags.push('tone:' + style.tone);
  const styleOk = styleTags.length >= 2;

  const metaOk = typeof meta.durationSec === 'number' && Number.isFinite(meta.durationSec) && meta.durationSec > 0;

  const evidence = { structure, script: scriptOk, style: styleOk, meta: metaOk, styleTags };
  const dims = ['structure', 'script', 'style'].map((k) => evidence[k]);
  const level = dims.every(Boolean) ? 'L2' : dims[0] && dims[1] ? 'L1' : 'L0';
  const confidence = Number(((['structure', 'script', 'style', 'meta'].filter((k) => evidence[k]).length) / 4).toFixed(2));

  return { level, evidence, confidence };
}

module.exports = { assessReplicationLevel };
