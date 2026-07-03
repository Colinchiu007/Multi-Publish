// TDD: P2模块 — 代理管理 + 任务池 + 双入口映射
const assert = require('assert');

// === 1. 代理管理测试 ===
function testProxyManager() {
  const { createProxyAgent } = require('../src/proxy-manager');
  const result = createProxyAgent({ host: '127.0.0.1', port: 8080 });
  assert(result !== null, 'should return agent');
  assert(result.httpAgent, 'should have httpAgent');
  assert(result.httpsAgent, 'should have httpsAgent');
  const nullResult = createProxyAgent(null);
  assert(nullResult === null, 'null input returns null');
  const noHost = createProxyAgent({ port: 8080 });
  assert(noHost === null, 'missing host returns null');
  console.log('  [PASS] proxy-manager');
}

// === 2. 任务池测试 ===
function testTaskPool() {
  const { TaskPool } = require('../src/task-pool');
  const pool = new TaskPool({ concurrency: 2 });
  assert(pool.concurrency === 2, 'concurrency setting');
  assert(typeof pool.add === 'function', 'has add method');
  assert(typeof pool.waitAll === 'function', 'has waitAll method');
  console.log('  [PASS] task-pool');
}

// === 3. 双入口映射测试 ===
function testPlatformEntries() {
  const { videoPublishUrls, imagePublishUrls, getPublishUrl } = require('../src/platform-entries');
  assert(videoPublishUrls.douyin, 'douyin video entry exists');
  assert(imagePublishUrls.douyin, 'douyin image entry exists');
  assert(typeof getPublishUrl === 'function', 'has getPublishUrl');
  const videoUrl = getPublishUrl('douyin', 'video');
  assert(videoUrl && videoUrl.includes('creator.douyin.com'), 'video URL format');
  const imageUrl = getPublishUrl('douyin', 'image');
  assert(imageUrl && imageUrl.includes('default-tab=3'), 'image URL has default-tab');
  const fallback = getPublishUrl('unknown', 'video');
  assert(fallback === null, 'unknown platform returns null');
  console.log('  [PASS] platform-entries');
}

console.log('=== P2 Module TDD Tests ===');
testProxyManager();
testTaskPool();
testPlatformEntries();
console.log('All P2 module tests PASSED');