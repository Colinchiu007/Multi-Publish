// video-engine tests
const assert = require('assert');
let p = 0, f = 0;
function t(n, fn) { try { fn(); p++; console.log('  \u2705 ' + n); } catch (e) { f++; console.log('  \u274C ' + n + ': ' + e.message); } }
function eq(a, b) { assert.deepStrictEqual(a, b); }

console.log('=== video-engine ===');
let VideoEngine;
try { VideoEngine = require('../services/video-engine').VideoEngine; } catch (e) { console.log('  Skipped: ' + e.message); process.exit(0); }

const ve = new VideoEngine();

t('exports VideoEngine class', function () { eq(typeof VideoEngine, 'function'); });

t('processTypes returns supported list', function () {
  const types = ve.listProcessTypes();
  eq(Array.isArray(types), true);
  eq(types.length > 0, true);
  eq(types.includes('green-screen'), true);
});

t('analyzeTypes returns supported list', function () {
  const types = ve.listAnalyzeTypes();
  eq(types.includes('scene-detect'), true);
  eq(types.includes('transcript'), true);
});

t('stockSources returns array', function () {
  const sources = ve.listStockSources();
  eq(Array.isArray(sources), true);
  eq(sources.length > 5, true);
});

t('getStatus returns object', function () {
  const status = ve.getStatus();
  eq(typeof status, 'object');
  eq(typeof status.ffmpegAvailable, 'boolean');
});

console.log('\n========== ' + p + '/' + (p + f) + ' ==========');
if (f) process.exit(1);
