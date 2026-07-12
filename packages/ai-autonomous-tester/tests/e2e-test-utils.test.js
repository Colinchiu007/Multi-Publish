const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { parseArgs, resolveDocPaths, resolveFunctionalTargets, makeLlmFn, buildAutoFixScript } = require('../src/e2e-test-utils');

describe('E2E test utils', () => {
  describe('parseArgs', () => {
    it('parses --key=value', () => {
      const args = parseArgs(['--iterations=3', '--threshold=0.1']);
      assert.equal(args.iterations, '3');
      assert.equal(args.threshold, '0.1');
    });
    it('parses --flag (boolean)', () => {
      const args = parseArgs(['--functional', '--skip-visual']);
      assert.equal(args.functional, true);
      assert.equal(args['skip-visual'], true);
    });
    it('empty argv returns empty object', () => {
      assert.deepEqual(parseArgs([]), {});
    });
  });
  describe('resolveDocPaths', () => {
    it('empty returns default PRD path', () => {
      const result = resolveDocPaths(null, '/project');
      assert.equal(result.length, 1);
      assert.ok(result[0].includes('01-docs'));
      assert.ok(result[0].includes('PRD.md'));
    });
    it('comma-separated resolved relative to root', () => {
      const result = resolveDocPaths('PRD.md,README.md', '/project');
      assert.equal(result.length, 2);
      assert.equal(result[0], path.resolve('/project', 'PRD.md'));
    });
    it('filters empty segments', () => {
      const result = resolveDocPaths('a.md,,,b.md', '/p');
      assert.equal(result.length, 2);
    });
    it('trims whitespace', () => {
      const result = resolveDocPaths(' a.md , b.md ', '/p');
      assert.equal(result[0].endsWith(path.join('a.md')), true);
    });
  });
  describe('resolveFunctionalTargets', () => {
    it('disabled returns empty', () => {
      assert.deepEqual(resolveFunctionalTargets(false), []);
    });
    it('enabled without raw returns defaults', () => {
      const t = resolveFunctionalTargets(true);
      assert.equal(t.length, 5);
    });
    it('enabled with raw returns custom', () => {
      const t = resolveFunctionalTargets(true, 'page1,page2');
      assert.deepEqual(t, ['page1', 'page2']);
    });
  });
  describe('makeLlmFn', () => {
    it('null provider returns null', () => {
      assert.equal(makeLlmFn(null), null);
    });
    it('no key returns null', () => {
      assert.equal(makeLlmFn('openai', {}), null);
    });
    it('with key returns config', () => {
      const r = makeLlmFn('openai', { OPENAI_API_KEY: 'sk-test' });
      assert.equal(r.provider, 'openai');
      assert.equal(r.hasKey, true);
    });
    it('anthropic default model', () => {
      const r = makeLlmFn('anthropic', { ANTHROPIC_API_KEY: 'sk-ant' });
      assert.equal(r.model, 'claude-3-5-sonnet-latest');
    });
  });
  describe('buildAutoFixScript', () => {
    it('empty history returns null', () => {
      assert.equal(buildAutoFixScript([]), null);
    });
    it('history with baseline fix generates commands', () => {
      const history = [{
        fixResult: { results: [{ success: true, fix: { type: 'baseline', testName: 'home' } }] }
      }];
      const result = buildAutoFixScript(history, '/app');
      assert.ok(result);
      assert.ok(result.some(l => l.includes('home')));
      assert.ok(result.some(l => l.includes('copy')));
    });
    it('skips failed results', () => {
      const history = [{
        fixResult: { results: [{ success: false, fix: { type: 'baseline', testName: 'x' } }] }
      }];
      assert.equal(buildAutoFixScript(history), null);
    });
  });
});
