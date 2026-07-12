const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { A11yProvider } = require('../src/providers/a11y');

describe('A11yProvider', () => {
  it('constructor: default tags', () => {
    const a = new A11yProvider();
    assert.deepEqual(a.tags, ['wcag2a','wcag2aa']);
  });
  it('constructor: not enabled when axe-core missing', () => {
    const a = new A11yProvider();
    assert.equal(a.enabled, false);
  });
  it('formatViolations: empty returns no violations', () => {
    const a = new A11yProvider();
    const result = a.formatViolations([]);
    assert.ok(result.includes('No accessibility violations'));
  });
  it('formatViolations: single violation formatting', () => {
    const a = new A11yProvider();
    const violations = [{
      id: 'color-contrast',
      impact: 'critical',
      description: '?????????',
      helpUrl: 'https://deque.com/color-contrast',
      nodes: [{ html: '<button class="btn">??</button>' }]
    }];
    const result = a.formatViolations(violations);
    assert.ok(result.includes('CRITICAL'));
    assert.ok(result.includes('color-contrast'));
    assert.ok(result.includes('??'));
  });
  it('formatViolations: multi node truncated', () => {
    const a = new A11yProvider();
    const violations = [{
      id: 'test-rule',
      impact: 'serious',
      description: 'test',
      nodes: [{ html: '<div>1</div>' },{ html: '<div>2</div>' },{ html: '<div>3</div>' },{ html: '<div>4</div>' }]
    }];
    const result = a.formatViolations(violations);
    assert.ok(result.includes('...1 more'));
  });
  it('formatViolations: output contains violation markers', () => {
    const a = new A11yProvider();
    const violations = [
      { id: 'a', impact: 'minor', description: '', nodes: [] },
      { id: 'b', impact: 'critical', description: '', nodes: [] },
    ];
    const result = a.formatViolations(violations);
    assert.ok(result.includes('[MINOR]'));
    assert.ok(result.includes('[CRITICAL]'));
  });
  it('run: not enabled returns error', async () => {
    const a = new A11yProvider();
    const r = await a.run(null);
    assert.ok(r.error.includes('not installed'));
  });
});