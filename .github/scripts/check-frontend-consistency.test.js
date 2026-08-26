const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const { findViolations, isExcluded, parseArgs, PATTERNS } = require('./check-frontend-consistency');

function makeTmpSrc (files) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'frontend-consistency-'));
  for (const [rel, content] of Object.entries(files)) {
    const full = path.join(root, rel);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, content);
  }
  return root;
}

test('检出视图中的 window.confirm 违规', () => {
  const src = makeTmpSrc({
    'views/Demo.vue': '<script>\nexport default {\n  methods: {\n    del() { if (window.confirm( "sure" )) this.remove(); }\n  }\n}\n</script>\n',
  });
  const result = findViolations(src);
  assert.equal(result.windowConfirm.length, 1);
  assert.match(result.windowConfirm[0].file, /views\/Demo\.vue$/);
  assert.equal(result.windowConfirm[0].line, 4);
});

test('检出 composable 中直调 window.electronAPI 违规', () => {
  const src = makeTmpSrc({
    'composables/useDemo.js': 'export function useDemo() {\n  return window.electronAPI.storeList()\n}\n',
  });
  const result = findViolations(src);
  assert.equal(result.rendererIpcDirect.length, 1);
  assert.equal(result.rendererIpcDirect[0].line, 2);
});

test('干净文件零违规', () => {
  const src = makeTmpSrc({
    'views/Clean.vue': '<template><el-button @click="onDel">删除</el-button></template>\n<script>\nimport { ElMessageBox } from \'element-plus\'\nimport { deleteRecord } from \'@/api/publisher\'\nexport default { methods: { async onDel() { await ElMessageBox.confirm(\'确认删除?\'); await deleteRecord() } } }\n</script>\n',
    'api/bridge.js': 'export const invoke = (ch, payload) => window.electronAPI.invoke(ch, payload)\n',
  });
  const result = findViolations(src);
  assert.equal(result.windowConfirm.length, 0);
  // api/ 目录不在扫描范围（白名单桥接层）
  assert.equal(result.rendererIpcDirect.length, 0);
});

test('测试文件与 __tests__ 目录被排除', () => {
  assert.equal(isExcluded('views/PublishHistory.test.js'), true);
  assert.equal(isExcluded('components/__tests__/x.js'), true);
  assert.equal(isExcluded('views/PublishHistory.vue'), false);
});

test('parseArgs 拒绝未知选项', () => {
  assert.throws(() => parseArgs(['--bogus']), /unknown option/);
  assert.deepEqual(parseArgs(['--json']).json, true);
});

test('src 根入口文件（App.vue/main.js）纳入扫描', () => {
  const src = makeTmpSrc({
    'App.vue': '<script>\nconst api = window.electronAPI\n</script>\n<template><div /></template>\n',
    'main.js': 'if (window.electronAPI?.logError) window.electronAPI.logError(e)\n',
    'views/Ok.vue': '<template><div /></template>\n',
  });
  const result = findViolations(src);
  assert.equal(result.rendererIpcDirect.length, 2); // App.vue 1 + main.js 1
});

test('注释行不计违规，行内代码仍计入', () => {
  const src = makeTmpSrc({
    'composables/useDoc.js': [
      '// 通过 window.electronAPI 调用（注释不计数）',
      ' * window.confirm 的 JSDoc 续行也不计数',
      '/* block window.electronAPI */',
      '<!-- html comment window.electronAPI -->',
      'export const x = 1 // trailing window.confirm( 仍计数',
    ].join('\n'),
  });
  const result = findViolations(src);
  assert.equal(result.rendererIpcDirect.length, 0);
  assert.equal(result.windowConfirm.length, 1);
});

test('PATTERNS 覆盖两个契约维度', () => {
  assert.deepEqual(Object.keys(PATTERNS).sort(), ['rendererIpcDirect', 'windowConfirm']);
});
