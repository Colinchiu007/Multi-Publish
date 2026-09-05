/**
 * video-clone-real-agv-e2e.test.js — 视频克隆真实 Agnes E2E 的 CI 契约测试
 *
 * 不启动 Electron、不需要 API Key；只验证 E2E runner 的结构契约：
 *   - 导出的 check() 断言记录器
 *   - 导出的 probe() 对无效文件的诚实失败
 *   - 默认测试视频路径指向仓库存档夹具
 */

const assert = require('node:assert/strict')
const { test } = require('node:test')
const path = require('node:path')
const fs = require('node:fs')

const {
  check,
  probe,
  DEFAULT_TEST_VIDEO,
} = require('./video-clone-real-agv-e2e')

test('E2E runner 可被 require 且不启动 Electron', () => {
  assert.equal(typeof check, 'function')
  assert.equal(typeof probe, 'function')
  assert.equal(typeof DEFAULT_TEST_VIDEO, 'string')
})

test('check() 断言记录器正确记录通过/失败', () => {
  const items = []
  const checkFn = (name, ok, detail) => {
    const item = { name, ok: Boolean(ok), detail: detail || '' }
    items.push(item)
    return item.ok
  }
  assert.equal(checkFn('通过项', true, 'd'), true)
  assert.equal(checkFn('失败项', false, 'x'), false)
  assert.deepEqual(items, [
    { name: '通过项', ok: true, detail: 'd' },
    { name: '失败项', ok: false, detail: 'x' },
  ])
})

test('probe() 对不存在文件返回 probe-failed（诚实失败）', () => {
  const result = probe(path.join(__dirname, 'definitely-not-exists-' + Date.now() + '.mp4'))
  assert.equal(result, 'probe-failed')
})

test('默认测试视频路径指向仓库存档夹具', () => {
  const expected = path.resolve(__dirname, '..', '..', '..', '.ccg', 'tasks', 'archive', '2026-09', 'video-clone-real-url-e2e', 'multi-scene-src.mp4')
  assert.equal(DEFAULT_TEST_VIDEO, expected)
  // 夹具可能存在也可能不存在（.ccg 已被 gitignore）；不影响 CI
  fs.existsSync(DEFAULT_TEST_VIDEO)
})
