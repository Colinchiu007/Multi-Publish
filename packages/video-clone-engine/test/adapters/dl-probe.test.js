'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const path = require('node:path');

/**
 * 下载探针集成测试（真实网络，可选）：
 * 设置环境变量 VC_DL_TEST_URL=https://<宽松平台公开视频> 后运行；
 * 未设置时跳过（CI 默认不依赖外部网络/平台）。
 */
test('探针脚本：真实平台下载+分析（需要 VC_DL_TEST_URL 环境变量）', (t) => {
  const url = process.env.VC_DL_TEST_URL;
  if (!url) {
    t.skip('未设置 VC_DL_TEST_URL，跳过真实网络探针（示例：VC_DL_TEST_URL=https://www.bilibili.com/video/BV1xx411c7mD）');
    return;
  }
  const script = path.join(__dirname, '..', '..', 'scripts', 'video-clone-dl-probe.js');
  const r = spawnSync(process.execPath, [script, url], { encoding: 'utf8', timeout: 240000 });
  assert.equal(r.status, 0, '探针应成功退出。stdout=' + r.stdout + ' stderr=' + r.stderr);
  assert.ok(r.stdout.includes('INGEST_OK'), '应包含下载成功摘要');
  assert.ok(r.stdout.includes('ANALYZE_OK'), '应包含分析成功摘要');
});
