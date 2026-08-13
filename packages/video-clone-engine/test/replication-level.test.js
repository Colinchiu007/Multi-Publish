'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { assessReplicationLevel } = require('../src/replication-level');
const { emptyReport } = require('../src/clone-report');

function richReport() {
  const r = emptyReport();
  r.meta.durationSec = 60;
  r.narrative.timeline = [{ t0: 0, t1: 10 }, { t0: 10, t1: 20 }];
  r.script.fullText = '完整文案';
  r.visual.palette = 'warm';
  r.visual.transitions = ['hard-cut'];
  r.scriptStyle.person = 'second';
  r.scriptStyle.tone = 'commanding';
  return r;
}

test('证据齐全 → L2（结构+文案+风格≥2）', () => {
  const out = assessReplicationLevel(richReport());
  assert.equal(out.level, 'L2');
  assert.equal(out.evidence.structure, true);
  assert.equal(out.evidence.script, true);
  assert.equal(out.evidence.style, true);
  assert.ok(out.confidence >= 0.75);
});

test('结构+文案足、风格弱 → L1', () => {
  const r = richReport();
  r.visual.palette = 'unknown';
  r.visual.transitions = [];
  r.scriptStyle.person = 'unknown';
  r.scriptStyle.tone = 'unknown';
  const out = assessReplicationLevel(r);
  assert.equal(out.level, 'L1');
  assert.equal(out.evidence.style, false);
});

test('仅文案（无结构）→ L0', () => {
  const r = richReport();
  r.narrative.timeline = [];
  r.visual.palette = 'unknown';
  r.visual.transitions = [];
  r.scriptStyle.person = 'unknown';
  r.scriptStyle.tone = 'unknown';
  const out = assessReplicationLevel(r);
  assert.equal(out.level, 'L0');
});

test('空报告 → L0 且低置信度', () => {
  const out = assessReplicationLevel(emptyReport());
  assert.equal(out.level, 'L0');
  assert.ok(out.confidence < 0.5);
});

test('风格标签计数：palette/transitions/person/tone 逐项计入', () => {
  const r = richReport();
  r.visual.palette = 'unknown'; // 去掉 palette
  const out = assessReplicationLevel(r);
  assert.ok(out.evidence.style, 'transitions+person+tone 仍 ≥2');
});
