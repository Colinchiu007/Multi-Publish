const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { FunctionalTestRunner } = require('../src/runners/functional-runner');

describe('FunctionalTestRunner', () => {
  it('constructor: default options', () => {
    const f = new FunctionalTestRunner();
    assert.ok(f.url);
    assert.equal(f.headless, true);
    assert.deepEqual(f.viewport, { width: 1920, height: 1080 });
    assert.equal(f.timeout, 10000);
  });
  it('constructor: custom options', () => {
    const f = new FunctionalTestRunner({ url: 'http://localhost:5000', timeout: 5000 });
    assert.equal(f.url, 'http://localhost:5000');
    assert.equal(f.timeout, 5000);
  });
  it('constructor: browser is null initially', () => {
    const f = new FunctionalTestRunner();
    assert.strictEqual(f.browser, null);
    assert.strictEqual(f.page, null);
  });
  it('runTests: with empty targets returns zero summary', async () => {
    const f = new FunctionalTestRunner();
    f.browser = { close: async () => {} };
    const result = await f.runTests({ targets: [] });
    assert.equal(result.summary.total, 0);
  });
});