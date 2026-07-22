const assert = require('node:assert/strict');
const test = require('node:test');

const { isProductionSourceFile } = require('./check-ipc-bridge');

test('IPC 桥接扫描只包含生产 JavaScript 文件', () => {
  assert.equal(isProductionSourceFile('account.js'), true);
  assert.equal(isProductionSourceFile('account.test.js'), false);
  assert.equal(isProductionSourceFile('types.js'), false);
  assert.equal(isProductionSourceFile('account.ts'), false);
});
