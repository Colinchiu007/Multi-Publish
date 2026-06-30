/**
 * L2 验证（最终版）：asar 内 npm 包 require 链完整性
 * 拦截 Module._resolveFilename，将所有第三方包指向 asar/node_modules/
 */
const path = require('path');
const fs = require('fs');
const Module = require('module');

const ASAR = 'C:/Users/邱领/AppData/Local/Temp/app-test-full';
const nm = path.join(ASAR, 'node_modules');
const electronDir = path.join(ASAR, 'electron');

// 拦截所有包名 require，指向 asar 内 node_modules
const origResolve = Module._resolveFilename;
Module._resolveFilename = function(request, requestPath, isMain, options) {
  if (!request.startsWith('.') && !request.startsWith('/') && !request.match(/^[A-Za-z]:/)) {
    const pkgPath = path.join(nm, request);
    if (fs.existsSync(pkgPath) || fs.existsSync(pkgPath + '.js') || fs.existsSync(pkgPath + '/index.js')) {
      return pkgPath;
    }
  }
  if (request.startsWith('./') || request.startsWith('../')) {
    const base = requestPath ? path.dirname(requestPath) : electronDir;
    return path.resolve(base, request);
  }
  return origResolve.call(this, request, requestPath, isMain, options);
};

// 测试 1：axios
try {
  const axios = require('axios');
  console.log('✅ axios:', axios.VERSION || axios.version);
} catch (e) { console.log('❌ axios:', e.message.split('\n')[0]); }

// 测试 2：form-data
try {
  const fd = require('form-data');
  const f = new fd();
  console.log('✅ form-data: new instance OK');
} catch (e) { console.log('❌ form-data:', e.message.split('\n')[0]); }

// 测试 3：electron（asar unpacked 目录）
const unpacked = path.join(ASAR, '..', 'app.asar.unpacked');
try {
  const electronPath = path.join(unpacked, 'node_modules', 'electron');
  if (fs.existsSync(electronPath)) {
    const e = require(electronPath);
    console.log('✅ electron (unpacked): type=', typeof e.app);
  } else {
    console.log('⚠️  electron: not in unpacked (expected — bundled in Electron runtime)');
  }
} catch (e) { console.log('❌ electron:', e.message.split('\n')[0]); }

console.log('\n--- electron/ 目录关键文件检查 ---');
const criticalFiles = ['callback-server.js', 'publish-monitor.js', 'content-aggregator-bridge.js',
  'credential-store.js', 'account-state-restorer.js', 'video-uploader.js', 'system-tray.js'];
for (const file of criticalFiles) {
  const filePath = path.join(electronDir, file);
  if (!fs.existsSync(filePath)) { console.log('⚠️ ', file, '(not in asar)'); continue; }
  const content = fs.readFileSync(filePath, 'utf8');
  const reqs = [...content.matchAll(/require\(['"]([^'"]+)['"]\)/g)].map(m => m[1]);
  const issues = reqs.filter(r => {
    if (r === 'electron') return false;
    const rp = path.join(nm, r);
    return !fs.existsSync(rp) && !fs.existsSync(rp + '.js') && !fs.existsSync(rp + '/index.js');
  });
  if (issues.length) {
    console.log('❌', file, ': missing', issues.join(', '));
  } else {
    console.log('✅', file, ': all', reqs.length, 'requires OK');
  }
}

console.log('\n=== L2 完成 ===');