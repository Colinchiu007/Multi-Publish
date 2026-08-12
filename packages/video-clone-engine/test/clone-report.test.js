'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
  emptyReport, validateCloneReport, normalizeReport, sanitizeReportForIpc, editReport,
} = require('../src/clone-report');
const { VideoCloneError } = require('../src/errors');

test('emptyReport 通过校验', () => {
  const r = emptyReport();
  assert.equal(validateCloneReport(r).ok, true);
});

test('合法报告通过校验', () => {
  const r = emptyReport();
  r.meta = { source: 'local', platform: 'douyin', durationSec: 42, resolution: '1080x1920', fps: 30 };
  r.narrative = { structure: 'hook', timeline: [{ t0: 0, t1: 3, label: 'hook' }], plot: '剧情梗概' };
  r.script = { fullText: '今天教大家一个技巧', lines: [{ t0: 0, t1: 2.4, text: '今天教大家一个技巧' }], language: 'zh' };
  r.scriptStyle = { person: 'second', tone: 'commanding', sentenceStats: { avgLen: 12 }, hookLines: ['今天教大家'] };
  r.visual = { palette: 'warm', colorGrade: { sat: 1.1 }, shots: [{ t0: 0, t1: 2, type: 'close-up', motion: 'push-in' }], transitions: ['hard-cut'], subtitleStyle: { size: 28 } };
  r.audio = { bgm: { style: 'upbeat', bpm: 120, segments: [] }, sfx: ['whoosh'], voice: { gender: 'female', speed: 1.05 } };
  r.elements = { characters: ['主播'], props: ['手机'], brand: [], watermark: false };
  r.platformParams = { aspect: '9:16', maxDurationSec: 60 };
  r.replication = { level: 'L2', mode: 'style' };
  const res = validateCloneReport(r);
  assert.equal(res.ok, true, JSON.stringify(res.errors));
});

test('非法报告逐项拒绝', () => {
  const r = emptyReport();
  r.meta.durationSec = -1;
  r.meta.platform = 'weibo';
  r.narrative.timeline = [{ t0: 5, t1: 2 }];
  r.script.fullText = 123;
  r.visual.palette = 'neon';
  r.platformParams.aspect = '21:9';
  r.replication.level = 'L9';
  const res = validateCloneReport(r);
  assert.equal(res.ok, false);
  const joined = res.errors.join(';');
  for (const expect of ['meta.durationSec', 'meta.platform', 'narrative.timeline[0]', 'script.fullText', 'visual.palette', 'platformParams.aspect', 'replication.level']) {
    assert.ok(joined.includes(expect), `缺少 ${expect}: ${joined}`);
  }
});

test('时间轴边界：t1 必须大于 t0，负值拒绝', () => {
  const r = emptyReport();
  r.narrative.timeline = [{ t0: 0, t1: 0 }];
  assert.equal(validateCloneReport(r).ok, false);
  r.narrative.timeline = [{ t0: -1, t1: 3 }];
  assert.equal(validateCloneReport(r).ok, false);
  r.narrative.timeline = [{ t0: 1, t1: 3 }];
  assert.equal(validateCloneReport(r).ok, true);
});

test('normalizeReport 合并默认值且不修改输入', () => {
  const input = { meta: { durationSec: 10 } };
  const out = normalizeReport(input);
  assert.equal(out.meta.durationSec, 10);
  assert.equal(out.script.fullText, '');
  assert.equal(input.meta.durationSec, 10);
  assert.equal(input.narrative, undefined);
});

test('editReport 编辑往返：原对象不变、新对象通过校验、非法 patch 抛错', () => {
  const r = emptyReport();
  r.script.fullText = '原始文案';
  const next = editReport(r, { path: 'script.fullText', value: '修改后文案' });
  assert.equal(r.script.fullText, '原始文案');
  assert.equal(next.script.fullText, '修改后文案');
  assert.equal(validateCloneReport(next).ok, true);
  assert.throws(() => editReport(r, { path: 'replication.level', value: 'L9' }), VideoCloneError);
  assert.throws(() => editReport(r, { path: 'nope.deep', value: 1 }), VideoCloneError);
});

test('sanitizeReportForIpc 深拷贝，无共享引用', () => {
  const r = emptyReport();
  r.script.fullText = 'x';
  const copy = sanitizeReportForIpc(r);
  copy.script.fullText = 'changed';
  assert.equal(r.script.fullText, 'x');
  copy.elements.characters.push('new');
  assert.equal(r.elements.characters.length, 0);
});

// —— 审查回归（C1/W1/W2/元素类型/重叠/深合并）——

test('C1: editReport 拒绝 __proto__ 路径，防原型污染', () => {
  const r = emptyReport();
  assert.throws(() => editReport(r, { path: '__proto__.polluted', value: true }), VideoCloneError);
  assert.equal({}.polluted, undefined);
  assert.throws(() => editReport(r, { path: 'constructor.prototype.x', value: 1 }), VideoCloneError);
});

test('W1: editReport 支持数组索引路径', () => {
  const r = emptyReport();
  r.narrative.timeline = [{ t0: 0, t1: 3, label: 'hook' }];
  const next = editReport(r, { path: 'narrative.timeline.0.label', value: 'cta' });
  assert.equal(next.narrative.timeline[0].label, 'cta');
  assert.equal(r.narrative.timeline[0].label, 'hook');
  assert.throws(() => editReport(r, { path: 'narrative.timeline.5.label', value: 'x' }), VideoCloneError);
});

test('时间轴跨段重叠拒绝', () => {
  const r = emptyReport();
  r.narrative.timeline = [{ t0: 0, t1: 5 }, { t0: 3, t1: 8 }];
  assert.equal(validateCloneReport(r).ok, false);
  r.narrative.timeline = [{ t0: 0, t1: 5 }, { t0: 5, t1: 8 }];
  assert.equal(validateCloneReport(r).ok, true); // 相邻允许
});

test('数组元素类型校验（characters/transitions/sfx）', () => {
  const r = emptyReport();
  r.elements.characters = ['a', 1];
  assert.equal(validateCloneReport(r).ok, false);
  r.elements.characters = ['a'];
  r.visual.transitions = ['hard-cut', 1];
  assert.equal(validateCloneReport(r).ok, false);
  r.visual.transitions = ['hard-cut'];
  r.audio.sfx = ['whoosh', null];
  assert.equal(validateCloneReport(r).ok, false);
  r.audio.sfx = ['whoosh'];
  assert.equal(validateCloneReport(r).ok, true);
});

test('normalizeReport 深合并：嵌套默认值保留、非对象值覆盖', () => {
  const out = normalizeReport({ audio: { bgm: { bpm: 120 } }, meta: { durationSec: 10 } });
  assert.equal(out.audio.bgm.bpm, 120);
  assert.equal(out.audio.bgm.style, ''); // 嵌套默认保留
  assert.equal(out.audio.bgm.segments.length, 0);
  assert.equal(out.meta.durationSec, 10);
});
