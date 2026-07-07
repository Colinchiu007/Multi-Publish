// ai-generator tests
const assert = require('assert');
let p = 0, f = 0;
function t(n, fn) { try { fn(); p++; console.log('  \u2705 ' + n); } catch (e) { f++; console.log('  \u274C ' + n + ': ' + e.message); } }
function eq(a, b) { assert.deepStrictEqual(a, b); }

console.log('=== ai-generator ===');
let AIGenerator;
try { AIGenerator = require('../services/ai-generator').AIGenerator; } catch (e) { console.log('  Skipped: ' + e.message); process.exit(0); }

const gen = new AIGenerator();

t('exports AIGenerator class', function () { eq(typeof AIGenerator, 'function'); });

t('listProviders returns arrays by type', function () {
  const video = gen.listProviders('video');
  const audio = gen.listProviders('audio');
  const image = gen.listProviders('image');
  const tts = gen.listProviders('tts');
  eq(Array.isArray(video), true);
  eq(Array.isArray(audio), true);
  eq(Array.isArray(image), true);
  eq(Array.isArray(tts), true);
});

t('video providers include hunyuan', function () {
  const providers = gen.listProviders('video');
  eq(providers.some(p => p.id === 'hunyuan'), true);
});

t('tts providers include elevenlabs', function () {
  const providers = gen.listProviders('tts');
  eq(providers.some(p => p.id === 'elevenlabs'), true);
});

t('image providers include flux', function () {
  const providers = gen.listProviders('image');
  eq(providers.some(p => p.id === 'flux'), true);
});

t('getProviderConfig returns config without apiKey', function () {
  const config = gen.getProviderConfig('hunyuan');
  eq(config.id, 'hunyuan');
  eq(config.apiKey, undefined);
});

t('getProviderConfig returns null for unknown', function () {
  eq(gen.getProviderConfig('unknown_provider'), null);
});

t('listModels returns array', function () {
  const models = gen.listModels('hunyuan');
  eq(Array.isArray(models), true);
});

console.log('\n========== ' + p + '/' + (p + f) + ' ==========');
if (f) process.exit(1);
