const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const fs = require('fs');
const { VisualTestRunner } = require('../src/runners/visual-runner');

describe('VisualTestRunner', () => {
  it('constructor: default threshold and viewport', () => {
    const v = new VisualTestRunner();
    assert.equal(v.threshold, 0.1);
    assert.deepEqual(v.viewport, { width: 1920, height: 1080 });
  });
  it('constructor: custom options', () => {
    const v = new VisualTestRunner({ url: 'http://localhost:9999', threshold: 0.2 });
    assert.equal(v.url, 'http://localhost:9999');
    assert.equal(v.threshold, 0.2);
  });
  it('constructor: creates providers', () => {
    const v = new VisualTestRunner();
    assert.ok(v.pixelDiff);
    assert.ok(v.ocr);
  });
  it('_defaultTargets: returns 3 default views', () => {
    const v = new VisualTestRunner();
    const targets = v._defaultTargets();
    assert.equal(targets.length, 3);
    assert.equal(targets[0].name, 'home-baseline');
  });
  it('_saveMetaFor and _loadMeta: persist metadata', () => {
    const tmp = path.join(__dirname, '.tmp-vr');
    fs.mkdirSync(tmp, { recursive: true });
    const v = new VisualTestRunner({ metaDir: tmp });
    v._saveMetaFor('test-view', { route: '/test', misMatchPercentage: 5 });
    const metaPath = path.join(tmp, 'pixel-tests-meta.json');
    assert.ok(fs.existsSync(metaPath));
    const content = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
    assert.ok(content['test-view']);
    assert.equal(content['test-view'].route, '/test');
    fs.rmSync(tmp, { recursive: true, force: true });
  });
});