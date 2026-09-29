const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const { findViolations, isExcluded, parseArgs, PATTERNS, mergeBaseline, evaluateBaseline } = require('./check-frontend-consistency');

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
  // 口径（批次 0 收紧）：按**消费点**逐次计数 —— main.js 那一行有 2 处引用即计 2
  // （旧实现按行计 1）。生产基线 windowConfirm/rendererIpcDirect 均为 0，收紧不改变判定。
  assert.equal(result.rendererIpcDirect.length, 3); // App.vue 1 + main.js 2
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

test('PATTERNS 覆盖三个契约维度', () => {
  assert.deepEqual(Object.keys(PATTERNS).sort(), ['appleAlias', 'rendererIpcDirect', 'windowConfirm']);
});

// ---- 批次 0：别名回潮门禁（ui-apple-token-retirement）----

test('appleAlias：检出 CSS 中的 var(--apple- 消费（含文件与行号）', () => {
  const src = makeTmpSrc({
    'styles/history-page.css': 'a {\n  color: var(--apple-accent);\n}\n',
  });
  const result = findViolations(src);
  assert.equal(result.appleAlias.length, 1);
  assert.match(result.appleAlias[0].file, /styles\/history-page\.css$/);
  assert.equal(result.appleAlias[0].line, 2);
});

test('appleAlias：按消费点计数（同一行 2 次算 2 处）', () => {
  const src = makeTmpSrc({
    'components/UiButton.vue': [
      '<style scoped>',
      '.ui-btn-primary {',
      '  background: var(--apple-accent);',
      '  border-color: var(--apple-accent, #007aff);',
      '}',
      '.ui-btn-secondary { background: var(--apple-surface-primary); color: var(--apple-text-primary) }',
      '</style>',
    ].join('\n'),
  });
  const result = findViolations(src);
  assert.equal(result.appleAlias.length, 4); // 1 + 1 + 2（同一行两处）
  assert.deepEqual(result.appleAlias.map((v) => v.line), [3, 4, 6, 6]);
});

test('appleAlias：CSS 注释不计（块注释；CSS 里 // * <!-- 不是注释）', () => {
  const src = makeTmpSrc({
    'styles/x.css': [
      '/* var(--apple-accent) 待退役 */',
      '.a { color: var(--apple-accent) } /* trailing 仍计数 */',
    ].join('\n'),
  });
  const result = findViolations(src);
  assert.equal(result.appleAlias.length, 1);
  assert.equal(result.appleAlias[0].line, 2);
});

test('appleAlias：.vue/.js 的 // 与 JSDoc 续行不计，行内尾注释仍计入', () => {
  const src = makeTmpSrc({
    'components/Demo.vue': [
      '<style scoped>',
      '// var(--apple-accent) 行注释',
      '/* var(--apple-accent) 块注释 */',
      '/*',
      ' * var(--apple-accent) JSDoc 续行',
      ' */',
      '.x { color: var(--apple-surface-primary) } /* trailing 仍计数 */',
      '</style>',
    ].join('\n'),
  });
  const result = findViolations(src);
  assert.equal(result.appleAlias.length, 1);
  assert.equal(result.appleAlias[0].line, 7);
});

test('appleAlias：注释在前、代码在同一行必须仍被检出（批次 0 反证暴露的盲区）', () => {
  const src = makeTmpSrc({
    'styles/y.css': '/* 说明 */ .a { color: var(--apple-accent) }\n',
  });
  const result = findViolations(src);
  assert.equal(result.appleAlias.length, 1);
  assert.equal(result.appleAlias[0].line, 1);
});

test('appleAlias：跨行块注释内的 var(--apple- 不计', () => {
  const src = makeTmpSrc({
    'styles/z.css': [
      '/*',
      '  var(--apple-accent) 在块注释内部',
      '*/',
      '.a { color: var(--apple-surface-primary) }',
    ].join('\n'),
  });
  const result = findViolations(src);
  assert.equal(result.appleAlias.length, 1);
  assert.equal(result.appleAlias[0].line, 4);
});

test('appleAlias：测试文件与 __tests__ 目录被排除', () => {
  const src = makeTmpSrc({
    'styles/x.test.css': 'a { color: var(--apple-accent) }\n',
    'components/__tests__/y.vue': '<style>a{color:var(--apple-accent)}</style>\n',
  });
  const result = findViolations(src);
  assert.equal(result.appleAlias.length, 0);
});

test('新增扫描面不放宽既有两模式的判定（CSS 不进入渲染层扫描面）', () => {
  const src = makeTmpSrc({
    'styles/legacy.css': '/* window.confirm( 与 window.electronAPI 在样式里只是注释提及 */\n',
    'views/Ok.vue': '<template><div /></template>\n',
  });
  const result = findViolations(src);
  assert.equal(result.windowConfirm.length, 0);
  assert.equal(result.rendererIpcDirect.length, 0);
});

test('共享基线写入必须保留他方键（check-color-literals / check-css-var-defined 同文件）', () => {
  const old = { windowConfirm: 0, rendererIpcDirect: 0, colorLiterals: 129, cssVarUndefined: 64 };
  const merged = mergeBaseline(old, { windowConfirm: 0, rendererIpcDirect: 0, appleAlias: 339 });
  assert.deepEqual(merged, {
    windowConfirm: 0,
    rendererIpcDirect: 0,
    colorLiterals: 129,
    cssVarUndefined: 64,
    appleAlias: 339,
  });
});

test('共享基线写入：他方键在旧基线缺失时不得凭空补 0（避免掩盖配置错误）', () => {
  const merged = mergeBaseline({ windowConfirm: 1 }, { windowConfirm: 0, appleAlias: 5 });
  assert.deepEqual(merged, { windowConfirm: 0, appleAlias: 5 });
});

test('基线缺键必须 fail-closed（不得因 undefined 比较而静默放行）', () => {
  const failures = evaluateBaseline(
    { windowConfirm: 0, rendererIpcDirect: 0, appleAlias: 339 },
    { windowConfirm: 0, rendererIpcDirect: 0 }, // 缺 appleAlias
  );
  assert.equal(failures.length, 1);
  assert.match(failures[0], /appleAlias/);
  assert.match(failures[0], /基线缺少/);
});

test('基线判定：等于基线通过，超出基线失败', () => {
  const full = { windowConfirm: 0, rendererIpcDirect: 0, appleAlias: 339 };
  assert.deepEqual(evaluateBaseline(full, { ...full }), []);
  const over = evaluateBaseline({ ...full, appleAlias: 340 }, { ...full });
  assert.equal(over.length, 1);
  assert.match(over[0], /340 处 > 基线 339 处/);
});
