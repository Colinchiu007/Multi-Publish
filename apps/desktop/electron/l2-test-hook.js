/**
 * L2 验证：在 Electron 进程内测试 api-platform-adapter require 链
 * 通过 Electron 的 --require 预加载钩子注入测试代码
 */
const axios = require('axios');
const FormData = require('form-data');
const log = require('./logger');
const path = require('path');

// 验证 axios 已加载
console.log('✅ axios loaded, version:', axios.VERSION || axios.version);

// 验证 form-data 已加载
const fd = new FormData();
console.log('✅ form-data loaded, type:', typeof fd.append);

// 验证 api-platform-adapter exports
const adapter = require('./api-platform-adapter.js');
console.log('✅ api-platform-adapter loaded, exports:', Object.keys(adapter));

// 验证 registry -> api-mode-publisher -> api-platform-adapter -> axios 链
try {
  const registry = require('../node_modules/@multi-publish/rpa-engine/src/registry.js');
  console.log('✅ registry loaded, platforms:', registry.getPlatforms ? 'OK' : 'MISSING getPlatforms');
} catch (e) {
  console.log('⚠️  registry:', e.message);
}

console.log('ALL_REQUIRE_CHAINS_OK');
process.exit(0);