const assert = require('node:assert/strict');
const { describe, it } = require('node:test');

const { describeFailedCheck, logRouteFailure } = require('./run-all');

/**
 * CI 日志可读性合同（#2491 的档 2）。
 *
 * checks 有两个生产者、两种形状：route-functional-suite.js 写 {kind,name,passed,details}，
 * FunctionalRunner 的 expect* 系列写 {kind,text|selector|errors,passed} 且**从不写 name**。
 * 打印侧原先固定读 c.name / c.details，于是第二类失败项在 CI 日志里变成 `✗ undefined`，
 * 详情段（JSON.stringify(c.details)）也永远不出现 —— 看不出坏的是哪一条断言。
 */
describe('run-all 失败检查点命名合同', () => {
  it('runner 形状的检查（只有 kind + errors）不得打印成 undefined', () => {
    const { subject, detail } = describeFailedCheck({
      kind: 'expectNoConsoleError',
      passed: false,
      errors: ["WebSocket connection to 'ws://127.0.0.1:5174' failed: net::ERR_NO_BUFFER_SPACE"]
    });

    assert.equal(subject, 'expectNoConsoleError');
    assert.match(detail, /^1 项: WebSocket connection/);
  });

  it('suite 形状的检查（带 name + details）保持原口径', () => {
    const { subject, detail } = describeFailedCheck({
      kind: 'functional',
      name: '账号列表渲染',
      passed: false,
      details: { expected: 8 }
    });

    assert.equal(subject, '账号列表渲染');
    assert.equal(detail, '[object Object]', 'details 非字符串时按字符串落进日志');
  });

  it('expectText / expectVisible 用各自的标识字段，而不是静默退回 kind', () => {
    assert.equal(describeFailedCheck({ kind: 'expectText', text: '同步云端', passed: false }).subject, '同步云端');
    assert.equal(describeFailedCheck({ kind: 'expectVisible', selector: '#app', passed: false }).subject, '#app');
  });

  it('两类字段全缺时也必须给出可读兜底，绝不输出字面 undefined', () => {
    const { subject, detail } = describeFailedCheck({ kind: null, passed: false });

    assert.equal(subject, 'unnamed check');
    assert.equal(detail, '');
  });

  /**
   * 结构断言（AGENTS.md QM-3「文本结构断言 MUST」）：直接钉 logRouteFailure 的整行输出，
   * 而不是用 toContain —— 后者对「整行只剩 ✗ undefined」这种回归完全免疫。
   */
  it('logRouteFailure 的整行输出必须可定位到具体检查点', () => {
    const lines = [];
    const original = console.log;
    console.log = (...args) => lines.push(args.join(' '));
    try {
      logRouteFailure('model-providers', {
        details: [
          { kind: 'expectText', text: '同步云端', passed: true },
          {
            kind: 'expectNoConsoleError',
            passed: false,
            errors: ['boom-1', 'boom-2']
          }
        ],
        consoleErrors: [],
        pageErrors: []
      });
    } finally {
      console.log = original;
    }

    assert.deepEqual(lines, [
      '    ── model-providers 失败检查点 (1) ──',
      '      ✗ expectNoConsoleError | 2 项: boom-1'
    ]);
    assert.ok(!lines.some((l) => l.includes('undefined')), '日志不得再出现 undefined');
  });
});
