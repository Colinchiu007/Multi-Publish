/**
 * L2 验证：asar 内所有 electron 文件的 require 链完整性测试
 * 测试 main.js 和所有被 files 配置覆盖的 .js 模块
 */
const path = require('path');
const fs = require('fs');
const Module = require('module');

// asar 提取目录（可通过命令行参数或环境变量覆盖）
const ASAR_ROOT = process.argv[2] || process.env.ASAR_ROOT || '/tmp/app-test-full';

// 替换所有 require 路径，指向 asar 提取后的目录
const originalResolve = Module._resolveFilename;
Module._resolveFilename = function(request, parent, isMain, options) {
  if (!request.startsWith('.') && !request.startsWith('/') && !request.match(/^[A-Za-z]:/)) {
    // npm 包名 — 指向 asar 内 node_modules
    const resolved = path.join(ASAR_ROOT, 'node_modules', request);
    if (fs.existsSync(resolved) || fs.existsSync(resolved + '.js')) return resolved;
  }
  if (request.startsWith('./') || request.startsWith('../')) {
    const parentPath = parent ? parent.filename : path.join(ASAR_ROOT, 'electron', 'main.js');
    return path.resolve(path.dirname(parentPath), request);
  }
  return originalResolve.call(this, request, parent, isMain, options);
};

// electron 目录（asar 内）
const ELECTRON_DIR = path.join(ASAR_ROOT, 'electron');

// 需要验证的所有 electron JS 文件
const ELECTRON_FILES = [
  'main.js',
  'preload.js',
  'services/logger.js',
  'services/store.js',
  'services/credential-store.js',
  'services/account-state-restorer.js',
  'services/webview-manager.js',
  'monitor-preload.js',
  'auth-qrcode-preload.js',
  'services/qrcode-login.js',
  'services/oauth-manager.js',
  'services/batch-manager.js',
  'services/url-collector.js',
  'services/hotkeys.js',
  'services/system-tray.js',
  'services/publish-monitor.js',
  'services/api-platform-adapter.js',
  'services/callback-server.js',
];

let passed = 0;
let failed = 0;
const errors = [];

for (const file of ELECTRON_FILES) {
  const filePath = path.join(ELECTRON_DIR, file);
  if (!fs.existsSync(filePath)) {
    console.log(`⚠️  ${file} — 文件不存在（可能正常）`);
    continue;
  }
  try {
    require(filePath);
    console.log(`✅ ${file}`);
    passed++;
  } catch (e) {
    console.log(`❌ ${file}: ${e.message}`);
    errors.push({ file, error: e.message });
    failed++;
  }
}

console.log(`\n=== 结果 ===`);
console.log(`通过: ${passed}`);
console.log(`失败: ${failed}`);
if (errors.length) {
  console.log('\n失败详情:');
  for (const { file, error } of errors) {
    console.log(`  ${file}: ${error}`);
  }
}

process.exit(failed > 0 ? 1 : 0);