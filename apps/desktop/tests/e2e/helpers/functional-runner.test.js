const assert = require('node:assert/strict');
const { describe, it } = require('node:test');

const { FunctionalRunner } = require('./functional-runner');

function createRunner({ navigationResults }) {
  const runner = new FunctionalRunner({ url: 'http://127.0.0.1:5174' });
  const pendingResults = [...navigationResults];
  const calls = [];
  const readyCalls = [];

  runner.page = {
    goto: async (...args) => {
      calls.push(args);
      const result = pendingResults.shift();
      if (result instanceof Error) throw result;
      return result;
    },
  };
  runner.waitForAppReady = async (...args) => {
    readyCalls.push(args);
  };

  return { runner, calls, readyCalls };
}

describe('FunctionalRunner 导航瞬时故障恢复合同', () => {
  it('仅对 ERR_NO_BUFFER_SPACE 重试一次，第二次成功后才等待应用就绪', async () => {
    const transientError = new Error('page.goto: net::ERR_NO_BUFFER_SPACE at http://127.0.0.1:5174/#/accounts');
    const { runner, calls, readyCalls } = createRunner({
      navigationResults: [transientError, undefined],
    });

    await runner.goto('/accounts');

    assert.equal(calls.length, 2);
    assert.deepEqual(readyCalls, [['/accounts']]);
    assert.deepEqual(runner.actions.map((action) => action.kind), ['navigationRetry', 'goto']);
  });

  it('不重试其他导航错误', async () => {
    const error = new Error('page.goto: net::ERR_CONNECTION_REFUSED');
    const { runner, calls, readyCalls } = createRunner({
      navigationResults: [error],
    });

    await assert.rejects(() => runner.goto('/accounts'), (received) => received === error);

    assert.equal(calls.length, 1);
    assert.equal(readyCalls.length, 0);
    assert.equal(runner.actions.length, 0);
  });

  it('瞬时错误在一次重试后仍失败时抛出最后一次错误', async () => {
    const firstError = new Error('page.goto: net::ERR_NO_BUFFER_SPACE at first attempt');
    const finalError = new Error('page.goto: net::ERR_NO_BUFFER_SPACE at retry');
    const { runner, calls, readyCalls } = createRunner({
      navigationResults: [firstError, finalError],
    });

    await assert.rejects(() => runner.goto('/accounts'), (received) => received === finalError);

    assert.equal(calls.length, 2);
    assert.equal(readyCalls.length, 0);
    assert.deepEqual(runner.actions.map((action) => action.kind), ['navigationRetry']);
  });

  it('resetToRoute 复用相同恢复逻辑，并且只在成功导航后等待目标路由', async () => {
    const order = [];
    const transientError = new Error('page.goto: net::ERR_NO_BUFFER_SPACE at reset');
    const { runner, calls, readyCalls } = createRunner({
      navigationResults: [transientError, undefined],
    });
    const originalGoto = runner.page.goto;
    runner.page.goto = async (...args) => {
      order.push('goto');
      return originalGoto(...args);
    };
    runner.waitForAppReady = async (...args) => {
      order.push('ready');
      readyCalls.push(args);
    };

    await runner.resetToRoute('/create', { readyTimeout: 1234 });

    assert.deepEqual(order, ['goto', 'goto', 'ready']);
    assert.equal(calls.length, 2);
    assert.deepEqual(readyCalls, [['/create', 1234]]);
    assert.deepEqual(runner.actions.map((action) => action.kind), ['navigationRetry', 'resetToRoute']);
  });
});
