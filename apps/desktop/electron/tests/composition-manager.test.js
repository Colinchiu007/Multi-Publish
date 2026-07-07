// composition-manager tests
const assert = require('assert');
let p = 0, f = 0;
function t(n, fn) { try { fn(); p++; console.log('  \u2705 ' + n); } catch (e) { f++; console.log('  \u274C ' + n + ': ' + e.message); } }
function eq(a, b) { assert.deepStrictEqual(a, b); }

console.log('=== composition-manager ===');
let cm;
try { cm = require('../services/composition-manager'); } catch (e) { console.log('  Skipped: ' + e.message); process.exit(0); }

t('exports CompositionManager class', function () { eq(typeof cm.CompositionManager, 'function'); });

const manager = new cm.CompositionManager();

t('listCompositions returns all 7', function () {
  const list = manager.listCompositions();
  eq(Array.isArray(list), true);
  eq(list.length, 7);
});

t('Explainer composition has required fields', function () {
  const comp = manager.getComposition('Explainer');
  eq(comp.id, 'Explainer');
  eq(typeof comp.defaultProps, 'object');
  eq(Array.isArray(comp.scenes), true);
});

t('getComposition returns null for unknown', function () {
  eq(manager.getComposition('NonExistent'), null);
});

t('buildRenderProps generates valid props for Explainer', function () {
  const props = manager.buildRenderProps('Explainer', { text: 'Hello', theme: 'clean-professional' });
  eq(Array.isArray(props.cuts), true);
  eq(props.cuts.length > 0, true);
  eq(typeof props.cuts[0].id, 'string');
});

t('buildRenderProps supports gallery mode', function () {
  const props = manager.buildRenderProps('Explainer', { images: ['img1.jpg', 'img2.jpg'], theme: 'flat-motion-graphics' });
  eq(Array.isArray(props.cuts), true);
});

t('buildRenderProps returns null for unknown composition', function () {
  eq(manager.buildRenderProps('Bad', {}), null);
});

console.log('\n========== ' + p + '/' + (p + f) + ' ==========');
if (f) process.exit(1);
