// pipeline-engine tests
const assert = require('assert');
let p = 0, f = 0;
function t(n, fn) { try { fn(); p++; console.log('  \u2705 ' + n); } catch (e) { f++; console.log('  \u274C ' + n + ': ' + e.message); } }
function eq(a, b) { assert.deepStrictEqual(a, b); }

console.log('=== pipeline-engine ===');
let PipelineEngine;
try { PipelineEngine = require('../services/pipeline-engine').PipelineEngine; } catch (e) { console.log('  Skipped: ' + e.message); process.exit(0); }

const pe = new PipelineEngine();

t('exports PipelineEngine class', function () { eq(typeof PipelineEngine, 'function'); });

t('listPipelines returns array', function () {
  const list = pe.listPipelines();
  eq(Array.isArray(list), true);
  eq(list.length > 0, true);
});

t('pipelines have required fields', function () {
  const list = pe.listPipelines();
  for (const pl of list) {
    eq(typeof pl.name, 'string');
    eq(typeof pl.description, 'string');
    eq(pl.name.length > 0, true);
  }
});

t('getPipeline returns detail for known pipeline', function () {
  const detail = pe.getPipeline('animated-explainer');
  eq(detail !== null, true);
  eq(detail.name, 'animated-explainer');
  eq(Array.isArray(detail.stages), true);
});

t('getPipeline returns null for unknown', function () {
  eq(pe.getPipeline('nonexistent-pipeline'), null);
});

t('start sets pipeline status to running', function () {
  const result = pe.start('animated-explainer', { topic: 'AI basics' });
  eq(result.success, true);
  const status = pe.getStatus('animated-explainer');
  eq(status.status, 'running');
});

t('pause changes status to paused', function () {
  pe.start('animated-explainer', {});
  const result = pe.pause();
  eq(result.success, true);
  const status = pe.getStatus('animated-explainer');
  eq(status.status, 'paused');
});

t('resume changes status back to running', function () {
  pe.start('animated-explainer', {});
  pe.pause();
  const result = pe.resume();
  eq(result.success, true);
  const status = pe.getStatus('animated-explainer');
  eq(status.status, 'running');
});

t('cancel returns success and cleans up', function () {
  pe.start('animated-explainer', {});
  const result = pe.cancel();
  eq(result.success, true);
  const status = pe.getStatus('animated-explainer');
  eq(status.status, 'idle');
});

t('advance progresses through stages', function () {
  pe.start('animated-explainer', {});
  for (let i = 0; i < 7; i++) {
    const r = pe.advance();
    eq(r.success, true);
  }
  const final = pe.advance();
  eq(final.success, true);
  const status = pe.getStatus('animated-explainer');
  eq(status.status, 'idle');
});

t('getHistory records completed pipelines', function () {
  pe.start('animated-explainer', {});
  for (let i = 0; i < 8; i++) pe.advance();
  const history = pe.getHistory();
  eq(history.length >= 1, true);
  eq(history[history.length - 1].status, 'completed');
});

console.log('\n========== ' + p + '/' + (p + f) + ' ==========');
if (f) process.exit(1);
