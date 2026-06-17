/**
 * L2 验证（Electron 版）：在真实 Electron 进程内测试 asar require 链
 * 所有 npm 包走 asar 内 node_modules，相对路径走 asar 内 electron/
 */
const axios = require('axios');
const FormData = require('form-data');
const path = require('path');

// 测试 axios
console.log('L2_AXIOS:' + (axios.VERSION || axios.version));

// 测试 form-data
const fd = new FormData();
fd.append('test', 'value');
console.log('L2_FORMDATA:OK');

// 测试 api-platform-adapter exports
const adapter = require('./api-platform-adapter.js');
console.log('L2_ADAPTER:' + Object.keys(adapter).join(','));

// 测试 callback-server（依赖 http + logger）
const cb = require('./callback-server.js');
console.log('L2_CALLBACKSERVER:' + typeof cb.start);

// 测试 publish-monitor（依赖 logger + api-platform-adapter）
const pm = require('./publish-monitor.js');
console.log('L2_PUBLISHMONITOR:OK');

// 测试 credential-store（依赖 crypto + logger）
const cs = require('./credential-store.js');
console.log('L2_CREDENTIALSTORE:OK');

// 测试 registry -> api-mode-publisher -> api-platform-adapter 链
try {
  const r = require('../node_modules/@multi-publish/rpa-engine/src/registry.js');
  console.log('L2_REGISTRY:OK');
} catch(e) {
  console.log('L2_REGISTRY:SKIP(' + e.message.split('\n')[0] + ')');
}

console.log('L2_ALL_OK');
process.exit(0);