const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const os = require('os');
const path = require('path');
const fs = require('fs');
const { VisualTestRunner } = require('../src/runners/visual-runner');

function createScreenshotRunner(tempDir, options = {}) {
  const runner = new VisualTestRunner({
    screenshotDir: path.join(tempDir, 'screenshots'),
    baselineDir: path.join(tempDir, 'baselines'),
    metaDir: path.join(tempDir, 'meta'),
    reportDir: path.join(tempDir, 'reports'),
    ...options,
  });
  for (const directory of [runner.screenshotDir, runner.baselineDir, runner.metaDir, runner.reportDir]) {
    fs.mkdirSync(directory, { recursive: true });
  }
  runner.page = {
    goto: async () => {},
    screenshot: async ({ path: screenshotPath }) => {
      fs.mkdirSync(path.dirname(screenshotPath), { recursive: true });
      fs.writeFileSync(screenshotPath, Buffer.from('visual-test'));
    },
  };
  return runner;
}

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
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'visual-runner-meta-'));
    const v = new VisualTestRunner({ metaDir: tmp });
    v._saveMetaFor('test-view', { route: '/test', misMatchPercentage: 5 });
    const metaPath = path.join(tmp, 'pixel-tests-meta.json');
    assert.ok(fs.existsSync(metaPath));
    const content = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
    assert.ok(content['test-view']);
    assert.equal(content['test-view'].route, '/test');
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  it('missing baseline fails closed and does not create an unreviewed file', async () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'visual-runner-missing-'));
    const runner = createScreenshotRunner(tmp);

    try {
      await assert.rejects(
        runner.pixelRegressionTest('missing', '/accounts'),
        error => error && error.code === 'ERR_VISUAL_BASELINE_MISSING',
      );
      assert.equal(fs.existsSync(path.join(tmp, 'baselines', 'missing.png')), false);
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  it('only explicit local maintenance may create a baseline', async () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'visual-runner-maintenance-'));
    const runner = createScreenshotRunner(tmp, { allowBaselineCreation: true });

    try {
      const result = await runner.pixelRegressionTest('approved', '/accounts');
      assert.equal(result.status, 'BASELINE_CREATED');
      assert.equal(fs.existsSync(path.join(tmp, 'baselines', 'approved.png')), true);
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  for (const ciValue of ['true', 'TRUE', '1', 'yes']) {
    it(`CI=${ciValue} rejects explicit baseline creation requests`, async () => {
      const originalCi = process.env.CI;
      process.env.CI = ciValue;
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'visual-runner-ci-'));
    const runner = createScreenshotRunner(tmp, { allowBaselineCreation: true });

    try {
      await assert.rejects(
        runner.pixelRegressionTest('ci-missing', '/accounts'),
        error => error && error.code === 'ERR_VISUAL_BASELINE_MISSING',
      );
      assert.equal(fs.existsSync(path.join(tmp, 'baselines', 'ci-missing.png')), false);
    } finally {
      if (originalCi === undefined) delete process.env.CI;
      else process.env.CI = originalCi;
      fs.rmSync(tmp, { recursive: true, force: true });
    }
    });
  }

  for (const ciValue of ['false', '0', 'no', 'on', '']) {
    it(`CI=${JSON.stringify(ciValue)} keeps explicit local baseline maintenance available`, async () => {
      const originalCi = process.env.CI;
      process.env.CI = ciValue;
      const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'visual-runner-local-'));
      const runner = createScreenshotRunner(tmp, { allowBaselineCreation: true });

      try {
        const result = await runner.pixelRegressionTest('local-approved', '/accounts');
        assert.equal(result.status, 'BASELINE_CREATED');
      } finally {
        if (originalCi === undefined) delete process.env.CI;
        else process.env.CI = originalCi;
        fs.rmSync(tmp, { recursive: true, force: true });
      }
    });
  }

  it('rejects unsafe test names before any screenshot path is constructed', async () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'visual-runner-path-'));
    const runner = createScreenshotRunner(tmp, { allowBaselineCreation: true });

    try {
      await assert.rejects(
        runner.pixelRegressionTest('../outside', '/accounts'),
        error => error && error.code === 'ERR_VISUAL_TEST_NAME_INVALID',
      );
      assert.equal(fs.existsSync(path.join(tmp, 'outside-current.png')), false);
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  it('allows a safe dotted test name without treating it as a path segment', async () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'visual-runner-dots-'));
    const runner = createScreenshotRunner(tmp, { allowBaselineCreation: true });

    try {
      const result = await runner.pixelRegressionTest('v1..2', '/accounts');
      assert.equal(result.status, 'BASELINE_CREATED');
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  it('runTests preserves an explicitly created baseline status', async () => {
    const runner = new VisualTestRunner();
    runner.browser = {};
    runner._runOne = async () => ({ status: 'BASELINE_CREATED', passed: true });

    const result = await runner.runTests({ targets: [{ name: 'approved', route: '/accounts' }] });

    assert.equal(result.details[0].status, 'BASELINE_CREATED');
  });

  it('close clears lifecycle references so the runner can launch again', async () => {
    const runner = new VisualTestRunner();
    const close = async () => {};
    runner.browser = { close };
    runner.context = {};
    runner.page = {};

    await runner.close();

    assert.equal(runner.browser, null);
    assert.equal(runner.context, null);
    assert.equal(runner.page, null);
    let launched = 0;
    runner.launch = async () => { launched++; runner.browser = {}; };
    runner._runOne = async () => ({ passed: true });
    await runner.runTests({ targets: [{ name: 'again', route: '/' }] });
    assert.equal(launched, 1);
  });
});
