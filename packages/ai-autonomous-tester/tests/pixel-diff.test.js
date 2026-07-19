const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const fs = require('fs');
const { PixelDiffProvider } = require('../src/providers/pixel-diff');

describe('PixelDiffProvider', () => {
  it('constructor: defaults', () => {
    const p = new PixelDiffProvider();
    assert.equal(p.threshold, 0.1);
    assert.equal(p.outputDir, 'reports/pixel-diff');
  });
  it('constructor: custom options', () => {
    const p = new PixelDiffProvider({ threshold: 0.2 });
    assert.equal(p.threshold, 0.2);
  });
  it('constructor: preserves an exact zero threshold', () => {
    const p = new PixelDiffProvider({ threshold: 0 });
    assert.equal(p.threshold, 0);
  });
  it('updateBaseline: copies file', async () => {
    const tmp = path.join(__dirname, '.tmp-pd');
    fs.mkdirSync(tmp, { recursive: true });
    const src = path.join(tmp, 'src.png');
    const dst = path.join(tmp, 'dst.png');
    fs.writeFileSync(src, 'test-data');
    const p = new PixelDiffProvider();
    const result = await p.updateBaseline(src, dst);
    assert.equal(result, dst);
    assert.equal(fs.readFileSync(dst, 'utf8'), 'test-data');
    fs.rmSync(tmp, { recursive: true, force: true });
  });
  it('compare: throws on invalid images (defensive)', async () => {
    const tmp = path.join(__dirname, '.tmp-pd2');
    fs.mkdirSync(tmp, { recursive: true });
    const img = path.join(tmp, 'img.png');
    fs.writeFileSync(img, 'not-a-png');
    const p = new PixelDiffProvider({ outputDir: tmp });
    await assert.rejects(
      () => p.compare(img, img, 'test'),
      error => error.code === 'ERR_INVALID_IMAGE' && /不是受支持的图片/.test(error.message),
    );
    fs.rmSync(tmp, { recursive: true, force: true });
  });
  it('compare: falls back to conservative binary comparison without skipping', async () => {
    const tmp = path.join(__dirname, '.tmp-pd3');
    fs.mkdirSync(tmp, { recursive: true });
    const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    const baseline = path.join(tmp, 'baseline.png');
    const identical = path.join(tmp, 'identical.png');
    const changed = path.join(tmp, 'changed.png');
    fs.writeFileSync(baseline, Buffer.concat([signature, Buffer.from('baseline')]));
    fs.copyFileSync(baseline, identical);
    fs.writeFileSync(changed, Buffer.concat([signature, Buffer.from('changed')]));

    const p = new PixelDiffProvider({ threshold: 0, outputDir: tmp });
    p.available = false;

    const sameResult = await p.compare(baseline, identical, 'same');
    assert.equal(sameResult.skipped, false);
    assert.equal(sameResult.comparisonMode, 'binary-fallback');
    assert.equal(sameResult.misMatchPercentage, 0);
    assert.equal(sameResult.passed, true);

    const changedResult = await p.compare(baseline, changed, 'changed');
    assert.equal(changedResult.skipped, false);
    assert.equal(changedResult.misMatchPercentage, 100);
    assert.equal(changedResult.passed, false);
    fs.rmSync(tmp, { recursive: true, force: true });
  });
  it('constructor: passed threshold calc', () => {
    const p = new PixelDiffProvider({ threshold: 0.5 });
    assert.ok(p.threshold === 0.5);
  });
});
