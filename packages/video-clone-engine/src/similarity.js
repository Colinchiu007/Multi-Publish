'use strict';

/**
 * F4 相似度自检（PRD §3 F4）。
 * 权重：结构 0.35 / 文案 0.25 / 风格 0.25 / 时长 0.15。
 * 按复刻层级验收（v1.16）：L0 文案级仅文案必须；L1 结构≥0.8/文案≥0.7/风格≥0.6/时长≤10%；
 * L2 结构≥0.85/文案≥0.7/风格≥0.7/时长≤5%。兼容 target：P1→L1、P2→L2。
 * 证据门控：缺数据（空时间轴/空文案/空风格标签/无时长）的指标不计 PASS；
 * 全局置信度 < 0.5 → insufficient_evidence（防空报告假通过）；否则按该层级必须维度是否全部达标判 pass/needs_review。
 */

const { REPLICATION_LEVELS } = require('./constants');

/** 按层级验收阈值（v1.16；duration 为偏差上限，Infinity=不要求） */
const LEVEL_THRESHOLDS = Object.freeze({
  L0: { structure: 0, script: 0.7, style: 0, duration: Infinity },
  L1: { structure: 0.8, script: 0.7, style: 0.6, duration: 0.1 },
  L2: { structure: 0.85, script: 0.7, style: 0.7, duration: 0.05 },
});

/** 各层级必须达标的维度 */
const LEVEL_REQUIRED = Object.freeze({
  L0: ['script'],
  L1: ['structure', 'script', 'style', 'duration'],
  L2: ['structure', 'script', 'style', 'duration'],
});

/** 有效层级：显式 level > target 映射（P1→L1/P2→L2）> L1 */
function resolveLevel(level, target) {
  if (level && REPLICATION_LEVELS.includes(level)) return level;
  if (target === 'P2') return 'L2';
  if (target === 'P1') return 'L1';
  return 'L1';
}

/** 时长偏差率：|clone-source|/source，0 为完全一致 */
function durationDeviation(sourceSec, cloneSec) {
  if (!Number.isFinite(sourceSec) || sourceSec <= 0) return null;
  if (!Number.isFinite(cloneSec) || cloneSec < 0) return null;
  return Math.abs(cloneSec - sourceSec) / sourceSec;
}

/** 区间交集/并集 IoU（两个 [t0,t1]） */
function intervalIoU(a, b) {
  const lo = Math.max(a.t0, b.t0);
  const hi = Math.min(a.t1, b.t1);
  const inter = Math.max(0, hi - lo);
  const union = (a.t1 - a.t0) + (b.t1 - b.t0) - inter;
  return union <= 0 ? 0 : inter / union;
}

/**
 * 结构相似度：保序最优对齐（近似 DTW，O(n·m) DP）。
 * 对齐收益 = IoU × 源段时长；允许跳过（gap）；结果 = 最优对齐收益 / 源总时长。
 * 相比贪心：不低估、且对段落顺序敏感（倒序时间轴不会得高分）。
 */
function structureSimilarity(sourceTimeline, cloneTimeline) {
  if (!Array.isArray(sourceTimeline) || !Array.isArray(cloneTimeline)) return 0;
  if (sourceTimeline.length === 0) return cloneTimeline.length === 0 ? 1 : 0;
  if (cloneTimeline.length === 0) return 0;
  const n = sourceTimeline.length; const m = cloneTimeline.length;
  const dp = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
  for (let i = 1; i <= n; i++) {
    const s = sourceTimeline[i - 1];
    const sLen = Math.max(0, (s.t1 || 0) - (s.t0 || 0));
    for (let j = 1; j <= m; j++) {
      const gain = intervalIoU(s, cloneTimeline[j - 1]) * sLen;
      dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1] + gain);
    }
  }
  const srcDur = sourceTimeline.reduce((a, s) => a + Math.max(0, (s.t1 || 0) - (s.t0 || 0)), 0);
  return srcDur <= 0 ? 0 : dp[n][m] / srcDur;
}

/** 编辑距离（Levenshtein），用于文案/文本相似度（字符级；对中文同义改写会偏低，切片 1 已知偏差方向） */
function levenshtein(a, b) {
  if (a === b) return 0;
  const m = a.length; const n = b.length;
  if (m === 0) return n; if (n === 0) return m;
  let prev = new Array(n + 1);
  let cur = new Array(n + 1);
  for (let j = 0; j <= n; j++) prev[j] = j;
  for (let i = 1; i <= m; i++) {
    cur[0] = i;
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
    }
    [prev, cur] = [cur, prev];
  }
  return prev[n];
}

/** 文案相似度：1 - normalized edit distance（0..1） */
function scriptSimilarity(sourceText, cloneText) {
  if (typeof sourceText !== 'string' || typeof cloneText !== 'string') return 0;
  if (sourceText.length === 0 && cloneText.length === 0) return 1;
  if (sourceText.length === 0 || cloneText.length === 0) return 0;
  return 1 - levenshtein(sourceText, cloneText) / Math.max(sourceText.length, cloneText.length);
}

/** 风格重叠：标签集合 Jaccard */
function styleOverlap(sourceTags, cloneTags) {
  const a = new Set(sourceTags || []);
  const b = new Set(cloneTags || []);
  if (a.size === 0 && b.size === 0) return 1;
  if (a.size === 0 || b.size === 0) return 0;
  let inter = 0;
  for (const t of a) if (b.has(t)) inter++;
  return inter / (a.size + b.size - inter);
}

/** 从报告抽取风格标签（palette + transitions + person/tone） */
function styleTagsFromReport(report) {
  const tags = [];
  if (!report) return tags;
  const v = report.visual || {};
  if (v.palette && v.palette !== 'unknown') tags.push('palette:' + v.palette);
  (v.transitions || []).forEach((t) => tags.push('transition:' + t));
  const ss = report.scriptStyle || {};
  if (ss.person && ss.person !== 'unknown') tags.push('person:' + ss.person);
  if (ss.tone && ss.tone !== 'unknown') tags.push('tone:' + ss.tone);
  return tags;
}

/**
 * 综合相似度报告。入参：{ source: CloneReport, clone: CloneReport, target: 'P1'|'P2' }
 * 输出：{ score, confidence, metrics, passes, warnings, grade, verdict, target }
 * - confidence = 有证据指标数/4；<0.5 → verdict=insufficient_evidence（不判定 pass）
 * - warnings.verbatimScript：文案相似度 >0.9 且双方非空 → 照抄警告（合规提示，不影响 pass）
 */
function computeSimilarityReport({ source, clone, target = 'P1', level = null }) {
  const srcNarr = (source && source.narrative && source.narrative.timeline) || [];
  const clnNarr = (clone && clone.narrative && clone.narrative.timeline) || [];
  const srcScript = (source && source.script && source.script.fullText) || '';
  const clnScript = (clone && clone.script && clone.script.fullText) || '';
  const srcTags = styleTagsFromReport(source);
  const clnTags = styleTagsFromReport(clone);
  const srcDur = (source && source.meta && source.meta.durationSec) || 0;
  const clnDur = (clone && clone.meta && clone.meta.durationSec) || 0;

  const structure = structureSimilarity(srcNarr, clnNarr);
  const script = scriptSimilarity(srcScript, clnScript);
  const style = styleOverlap(srcTags, clnTags);
  const dev = durationDeviation(srcDur, clnDur);
  const duration = dev === null ? 0 : Math.max(0, 1 - dev * 2); // ±50% → 0

  const evidence = {
    structure: srcNarr.length > 0 || clnNarr.length > 0,
    script: srcScript.length > 0 || clnScript.length > 0,
    style: srcTags.length > 0 || clnTags.length > 0,
    duration: dev !== null,
  };
  const confidence = Object.values(evidence).filter(Boolean).length / 4;

  const score = 0.35 * structure + 0.25 * script + 0.25 * style + 0.15 * duration;
  const effLevel = resolveLevel(level, target);
  const th = LEVEL_THRESHOLDS[effLevel] || LEVEL_THRESHOLDS.L1;
  const required = LEVEL_REQUIRED[effLevel] || LEVEL_REQUIRED.L1;
  const passes = {
    structure: evidence.structure && structure >= th.structure,
    script: evidence.script && script >= th.script,
    style: evidence.style && style >= th.style,
    duration: evidence.duration && (th.duration === Infinity ? true : dev <= th.duration),
  };
  const requiredPassed = required.every((k) => passes[k] === true);
  const warnings = { verbatimScript: script > 0.9 && srcScript.length > 0 && clnScript.length > 0 };
  const grade = score >= 0.85 ? 'L2' : score >= 0.7 ? 'L1' : 'L0';

  return {
    score: Number(score.toFixed(4)),
    confidence: Number(confidence.toFixed(2)),
    metrics: { structure, script, style, durationDeviation: dev },
    passes,
    warnings,
    grade,
    level: effLevel,
    // 证据门禁沿用全局置信度（防空报告假通过）；层级只决定 pass/needs_review 的达标维度
    verdict: confidence < 0.5 ? 'insufficient_evidence' : requiredPassed ? 'pass' : 'needs_review',
    target,
  };
}

module.exports = {
  durationDeviation, intervalIoU, structureSimilarity, scriptSimilarity,
  styleOverlap, styleTagsFromReport, computeSimilarityReport,
  resolveLevel, LEVEL_THRESHOLDS, LEVEL_REQUIRED,
};
