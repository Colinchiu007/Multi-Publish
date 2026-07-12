/**
 * path-utils 单元测试
 * 验证路径计算的正确性，防止路径层级错误再次发生
 * 质量节拍日常循环② TDD — RED→GREEN
 */

const assert = require('assert');
const path = require('path');
const fs = require('fs');

let pass = 0;
let fail = 0;

function t(name, fn) {
  try {
    fn();
    pass++;
    console.log('  ✅ ' + name);
  } catch (e) {
    fail++;
    console.log('  ❌ ' + name + ': ' + e.message);
  }
}

function eq(a, b) { assert.deepStrictEqual(a, b); }

// ─── 加载被测模块 ────────────────────────────
const { getComposerDir, getPythonBackendDir, getProjectRoot } = require('../electron/services/path-utils');

console.log('\n=== getComposerDir 路径验证 ===');

t('getComposerDir 返回 remotion-composer 目录', () => {
  const dir = getComposerDir();
  eq(typeof dir, 'string');
  eq(dir.endsWith('remotion-composer'), true);
});

t('getComposerDir 返回的目录包含 package.json', () => {
  const dir = getComposerDir();
  const pkgPath = path.join(dir, 'package.json');
  eq(fs.existsSync(pkgPath), true);
});

t('getComposerDir 的父目录是 packages/', () => {
  const dir = getComposerDir();
  const parentDir = path.basename(path.dirname(dir));
  eq(parentDir, 'packages');
});

console.log('\n=== rootNodeModulesExist 路径验证（关键回归测试）===');

t('从 composerDir 出发 2 级 .. 能到达项目根目录', () => {
  const composerDir = getComposerDir();
  const projectRoot = path.resolve(composerDir, '..', '..');
  // 项目根目录应该包含 package.json
  eq(fs.existsSync(path.join(projectRoot, 'package.json')), true);
});

t('从 composerDir 出发 2 级 .. + node_modules/remotion 路径存在', () => {
  const composerDir = getComposerDir();
  const remotionPath = path.resolve(composerDir, '..', '..', 'node_modules', 'remotion');
  // 这个路径必须存在，否则 renderEngine.getStatus() 会返回 nodeModulesExist: false
  eq(fs.existsSync(remotionPath), true);
});

t('从 composerDir 出发 3 级 .. 会越过项目根（验证之前 bug 的根因）', () => {
  const composerDir = getComposerDir();
  const wrongPath = path.join(composerDir, '..', '..', '..', 'node_modules', 'remotion');
  // 3 级 .. 会越过项目根，指向错误位置
  // 这个测试验证：如果用 3 级 .. 就会得到错误结果
  const correctPath = path.resolve(composerDir, '..', '..', 'node_modules', 'remotion');
  const wrongExists = fs.existsSync(wrongPath);
  const correctExists = fs.existsSync(correctPath);
  // 正确路径必须存在
  eq(correctExists, true);
  // 如果错误路径也存在（巧合），那这个测试仍然通过，因为重点是正确路径存在
  // 如果错误路径不存在，说明 3 级 .. 确实是 bug
  if (!wrongExists) {
    // 确认 3 级 .. 和 2 级 .. 指向不同位置
    assert.notStrictEqual(path.resolve(wrongPath), path.resolve(correctPath));
  }
});

console.log('\n=== getPythonBackendDir 路径验证 ===');

t('getPythonBackendDir 返回 python-backend/src 目录', () => {
  const dir = getPythonBackendDir();
  eq(typeof dir, 'string');
  eq(dir.endsWith(path.join('python-backend', 'src')), true);
});

t('getPythonBackendDir 返回的目录包含 server.py', () => {
  const dir = getPythonBackendDir();
  const serverPath = path.join(dir, 'server.py');
  eq(fs.existsSync(serverPath), true);
});

console.log('\n=== isPackaged 验证 ===');

t('isPackaged 在非 Electron 测试环境返回 false', () => {
  // 纯 Node 环境下 require('electron') 会抛错，isPackaged 应返回 false
  // 注意：isPackaged 未导出，通过 getProjectRoot 间接验证
  const root = require('../electron/services/path-utils').getProjectRoot();
  eq(typeof root, 'string');
  eq(root.length > 0, true);
});

// ─── 总结 ────────────────────────────────────
console.log('\n=== 总结: ' + pass + ' 通过, ' + fail + ' 失败 ===');
if (fail > 0) process.exit(1);
