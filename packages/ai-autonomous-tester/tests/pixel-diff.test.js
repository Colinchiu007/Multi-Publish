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
    await assert.rejects(() => p.compare(img, img, 'test'));
    fs.rmSync(tmp, { recursive: true, force: true });
  });
  it('constructor: passed threshold calc', () => {
    const p = new PixelDiffProvider({ threshold: 0.5 });
    assert.ok(p.threshold === 0.5);
  });
});