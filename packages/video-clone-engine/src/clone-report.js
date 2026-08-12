'use strict';

const {
  REPLICATION_LEVELS, REPLICATION_MODES, SOURCE_TYPES, PLATFORMS,
  ASPECT_RATIOS, NARRATIVE_SEGMENTS, VISUAL_PALETTES, SCRIPT_TONES,
} = require('./constants');
const { VideoCloneError } = require('./errors');

/** 空报告（默认值，PRD §7.2 schema） */
function emptyReport() {
  return {
    meta: { source: 'local', platform: null, durationSec: 0, resolution: null, fps: null },
    narrative: { structure: 'unknown', timeline: [], plot: '' },
    script: { fullText: '', lines: [], language: 'zh' },
    scriptStyle: { person: 'unknown', tone: 'unknown', sentenceStats: {}, hookLines: [] },
    visual: {
      palette: 'unknown', colorGrade: {}, shots: [], transitions: [], subtitleStyle: {},
    },
    audio: { bgm: { style: '', bpm: null, segments: [] }, sfx: [], voice: { gender: 'unknown', speed: 1.0 } },
    elements: { characters: [], props: [], brand: [], watermark: false },
    platformParams: { aspect: 'unknown', maxDurationSec: null },
    replication: { level: 'L0', mode: 'structure' },
  };
}

function isNum(v) { return typeof v === 'number' && Number.isFinite(v); }
function isNonNegNum(v) { return isNum(v) && v >= 0; }
function isPosNum(v) { return isNum(v) && v > 0; }
function isStr(v) { return typeof v === 'string'; }
function isObj(v) { return v !== null && typeof v === 'object' && !Array.isArray(v); }
function isArr(v) { return Array.isArray(v); }

/**
 * 时间轴校验：逐条 t0>=0、t1>t0，且跨条排序且不重叠（PRD §11.2 / OpenSpec）。
 */
function validTimeline(entries, errors, path) {
  if (!isArr(entries)) { errors.push(path + ': 必须是数组'); return; }
  let prevEnd = -1;
  entries.forEach((e, i) => {
    const p = path + '[' + i + ']';
    if (!isObj(e)) { errors.push(p + ': 必须是对象'); return; }
    if (!isNonNegNum(e.t0)) errors.push(p + '.t0: 必须是非负数字');
    if (!isPosNum(e.t1)) errors.push(p + '.t1: 必须是正数字');
    if (isNonNegNum(e.t0) && isPosNum(e.t1) && e.t1 <= e.t0) errors.push(p + ': t1 必须大于 t0（不可倒置/零长度）');
    if (isNonNegNum(e.t0) && i > 0 && e.t0 < prevEnd) errors.push(p + ': 与上一段重叠（时间轴须排序且不重叠）');
    if (isPosNum(e.t1)) prevEnd = e.t1;
  });
}

/**
 * 校验 CloneReport。返回 { ok, errors[] }，每条错误含字段路径与原因。
 * 规则对应 PRD §3 F2（7 层）与 §11.1/11.2 数据校验。
 */
function validateCloneReport(report) {
  const errors = [];
  if (!isObj(report)) return { ok: false, errors: ['report: 必须是对象'] };

  const { meta, narrative, script, scriptStyle, visual, audio, elements, platformParams, replication } = report;

  // meta
  if (!isObj(meta)) errors.push('meta: 缺失或非对象');
  else {
    if (meta.source !== undefined && !SOURCE_TYPES.includes(meta.source)) errors.push('meta.source: 非法来源（local|url）');
    if (meta.platform !== undefined && meta.platform !== null && !PLATFORMS.includes(meta.platform)) errors.push('meta.platform: 非法平台');
    if (!isNonNegNum(meta.durationSec)) errors.push('meta.durationSec: 必须是非负数字');
    if (meta.resolution !== undefined && meta.resolution !== null && !/^\d+x\d+$/.test(meta.resolution)) errors.push('meta.resolution: 必须是 WxH 格式（如 1080x1920）');
    if (meta.fps !== undefined && meta.fps !== null && !isPosNum(meta.fps)) errors.push('meta.fps: 必须是正数字');
  }

  // narrative
  if (!isObj(narrative)) errors.push('narrative: 缺失或非对象');
  else {
    if (narrative.structure !== undefined && !NARRATIVE_SEGMENTS.includes(narrative.structure) && narrative.structure !== 'unknown') errors.push('narrative.structure: 非法段落');
    validTimeline(narrative.timeline, errors, 'narrative.timeline');
    if (narrative.plot !== undefined && !isStr(narrative.plot)) errors.push('narrative.plot: 必须是字符串');
  }

  // script
  if (!isObj(script)) errors.push('script: 缺失或非对象');
  else {
    if (!isStr(script.fullText)) errors.push('script.fullText: 缺失或非字符串');
    if (script.language !== undefined && !isStr(script.language)) errors.push('script.language: 必须是字符串');
    validTimeline(script.lines, errors, 'script.lines');
    if (isArr(script.lines)) {
      script.lines.forEach((l, i) => { if (l && !isStr(l.text)) errors.push('script.lines[' + i + '].text: 必须是字符串'); });
    }
  }

  // scriptStyle
  if (!isObj(scriptStyle)) errors.push('scriptStyle: 缺失或非对象');
  else {
    if (scriptStyle.person !== undefined && !['first', 'second', 'third', 'mixed', 'unknown'].includes(scriptStyle.person)) errors.push('scriptStyle.person: 非法人称');
    if (scriptStyle.tone !== undefined && !SCRIPT_TONES.includes(scriptStyle.tone) && scriptStyle.tone !== 'unknown') errors.push('scriptStyle.tone: 非法语气');
    if (scriptStyle.sentenceStats !== undefined && !isObj(scriptStyle.sentenceStats)) errors.push('scriptStyle.sentenceStats: 必须是对象');
    if (scriptStyle.hookLines !== undefined && !isArr(scriptStyle.hookLines)) errors.push('scriptStyle.hookLines: 必须是数组');
  }

  // visual
  if (!isObj(visual)) errors.push('visual: 缺失或非对象');
  else {
    if (visual.palette !== undefined && !VISUAL_PALETTES.includes(visual.palette) && visual.palette !== 'unknown') errors.push('visual.palette: 非法画面风格');
    if (visual.colorGrade !== undefined && !isObj(visual.colorGrade)) errors.push('visual.colorGrade: 必须是对象');
    validTimeline(visual.shots, errors, 'visual.shots');
    if (visual.shots !== undefined && isArr(visual.shots)) {
      visual.shots.forEach((s, i) => { if (s && !isStr(s.type)) errors.push('visual.shots[' + i + '].type: 必须是字符串'); });
    }
    if (visual.transitions !== undefined && !isArr(visual.transitions)) errors.push('visual.transitions: 必须是数组');
    if (isArr(visual.transitions) && visual.transitions.some((x) => !isStr(x))) errors.push('visual.transitions: 元素必须是字符串');
    if (visual.subtitleStyle !== undefined && !isObj(visual.subtitleStyle)) errors.push('visual.subtitleStyle: 必须是对象');
  }
  // audio
  if (!isObj(audio)) errors.push('audio: 缺失或非对象');
  else {
    if (!isObj(audio.bgm)) errors.push('audio.bgm: 必须是对象');
    else {
      if (audio.bgm.bpm !== undefined && audio.bgm.bpm !== null && !isPosNum(audio.bgm.bpm)) errors.push('audio.bgm.bpm: 必须是正数字');
      if (audio.bgm.segments !== undefined && !isArr(audio.bgm.segments)) errors.push('audio.bgm.segments: 必须是数组');
    }
    if (audio.sfx !== undefined && !isArr(audio.sfx)) errors.push('audio.sfx: 必须是数组');
    if (isArr(audio.sfx) && audio.sfx.some((x) => !isStr(x))) errors.push('audio.sfx: 元素必须是字符串');
    if (!isObj(audio.voice)) errors.push('audio.voice: 必须是对象');
    else {
      if (audio.voice.gender !== undefined && !['female', 'male', 'unknown'].includes(audio.voice.gender)) errors.push('audio.voice.gender: 非法性别');
      if (audio.voice.speed !== undefined && !isPosNum(audio.voice.speed)) errors.push('audio.voice.speed: 必须是正数字');
    }
  }

  // elements
  if (!isObj(elements)) errors.push('elements: 缺失或非对象');
  else {
    for (const k of ['characters', 'props', 'brand']) {
      if (elements[k] !== undefined && !isArr(elements[k])) errors.push('elements.' + k + ': 必须是数组');
      if (isArr(elements[k]) && elements[k].some((x) => !isStr(x))) errors.push('elements.' + k + ': 元素必须是字符串');
    }
    if (elements.watermark !== undefined && typeof elements.watermark !== 'boolean') errors.push('elements.watermark: 必须是布尔值');
  }

  // platformParams
  if (!isObj(platformParams)) errors.push('platformParams: 缺失或非对象');
  else {
    if (platformParams.aspect !== undefined && !ASPECT_RATIOS.includes(platformParams.aspect) && platformParams.aspect !== 'unknown') errors.push('platformParams.aspect: 非法画幅');
    if (platformParams.maxDurationSec !== undefined && platformParams.maxDurationSec !== null && !isPosNum(platformParams.maxDurationSec)) errors.push('platformParams.maxDurationSec: 必须是正数字');
  }

  // replication
  if (!isObj(replication)) errors.push('replication: 缺失或非对象');
  else {
    if (replication.level !== undefined && !REPLICATION_LEVELS.includes(replication.level)) errors.push('replication.level: 非法复刻层级（L0|L1|L2）');
    if (replication.mode !== undefined && !REPLICATION_MODES.includes(replication.mode)) errors.push('replication.mode: 非法复刻模式');
  }

  return { ok: errors.length === 0, errors };
}

function isPlainObj(v) { return v !== null && typeof v === 'object' && !Array.isArray(v); }

/** 深合并：嵌套对象按层合并，数组整体替换 */
function deepMerge(base, extra) {
  const out = {};
  for (const k of Object.keys(base)) {
    const bv = base[k];
    const hasEv = extra && Object.hasOwn(extra, k);
    const ev = hasEv ? extra[k] : undefined;
    if (isPlainObj(bv) && isPlainObj(ev)) {
      out[k] = deepMerge(bv, ev);
    } else if (hasEv) {
      out[k] = ev;
    } else {
      out[k] = bv;
    }
  }
  for (const k of Object.keys(extra || {})) {
    if (!(k in base)) out[k] = extra[k];
  }
  return out;
}

/** 归一化：以空报告为底深合并输入（不改变输入对象） */
function normalizeReport(report) {
  const base = emptyReport();
  if (!isObj(report)) return base;
  return deepMerge(base, report);
}

function deepClone(v) {
  if (typeof structuredClone === 'function') { try { return structuredClone(v); } catch { /* fall through */ } }
  return JSON.parse(JSON.stringify(v));
}

/** IPC 脱壳：深拷贝，杜绝共享引用 / reactive proxy 泄漏（QM-2 IPC 参数序列化安全） */
function sanitizeReportForIpc(report) {
  return deepClone(report);
}

const FORBIDDEN_PATH_SEGMENTS = new Set(['__proto__', 'prototype', 'constructor']);

/**
 * 编辑往返：按点号路径设置值 → 重新校验。原对象不变；非法 patch 抛错。
 * 安全：拒绝 __proto__/prototype/constructor 路径段（防原型污染）；支持数组索引路径。
 */
function editReport(report, patch) {
  if (!isObj(patch) || !isStr(patch.path) || patch.path.length === 0) {
    throw new VideoCloneError('VIDEOCLONE_REPORT_EDIT_INVALID', { params: { path: patch && patch.path, reason: 'path 缺失' } });
  }
  const parts = patch.path.split('.');
  if (parts.some((seg) => FORBIDDEN_PATH_SEGMENTS.has(seg))) {
    throw new VideoCloneError('VIDEOCLONE_REPORT_EDIT_INVALID', { params: { path: patch.path, reason: '禁止路径段（__proto__/prototype/constructor）' } });
  }
  const next = deepClone(report);
  let cur = next;
  for (let i = 0; i < parts.length - 1; i++) {
    const seg = parts[i];
    if (Array.isArray(cur)) {
      const idx = Number(seg);
      if (!Number.isInteger(idx) || idx < 0 || idx >= cur.length) {
        throw new VideoCloneError('VIDEOCLONE_REPORT_EDIT_INVALID', { params: { path: patch.path, reason: '数组索引越界' } });
      }
      cur = cur[idx];
    } else if (isObj(cur) && Object.hasOwn(cur, seg)) {
      cur = cur[seg];
    } else {
      throw new VideoCloneError('VIDEOCLONE_REPORT_EDIT_INVALID', { params: { path: patch.path, reason: '中间路径不存在' } });
    }
  }
  const last = parts[parts.length - 1];
  if (Array.isArray(cur)) {
    const idx = Number(last);
    if (!Number.isInteger(idx) || idx < 0 || idx >= cur.length) {
      throw new VideoCloneError('VIDEOCLONE_REPORT_EDIT_INVALID', { params: { path: patch.path, reason: '数组索引越界' } });
    }
    cur[idx] = patch.value;
  } else if (isObj(cur)) {
    cur[last] = patch.value;
  } else {
    throw new VideoCloneError('VIDEOCLONE_REPORT_EDIT_INVALID', { params: { path: patch.path, reason: '路径末端不是对象/数组' } });
  }
  const result = validateCloneReport(next);
  if (!result.ok) {
    throw new VideoCloneError('VIDEOCLONE_REPORT_EDIT_INVALID', { params: { path: patch.path, errors: result.errors } });
  }
  return next;
}

module.exports = { emptyReport, validateCloneReport, normalizeReport, sanitizeReportForIpc, editReport };
