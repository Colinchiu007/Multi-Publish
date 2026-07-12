const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { OCRProvider } = require('../src/providers/ocr');

describe('OCRProvider', () => {
  it('constructor: default lang', () => {
    const o = new OCRProvider();
    assert.equal(o.lang, 'chi_sim+eng');
  });
  it('constructor: custom lang', () => {
    const o = new OCRProvider({ lang: 'eng' });
    assert.equal(o.lang, 'eng');
  });
  it('constructor: worker starts null', () => {
    const o = new OCRProvider();
    assert.strictEqual(o.worker, null);
  });
});