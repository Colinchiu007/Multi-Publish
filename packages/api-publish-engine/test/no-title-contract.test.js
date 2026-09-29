'use strict'
/**
 * test/no-title-contract.test.js — 注册表无标题清单 ↔ 引擎链行为 跨包契约锁
 *
 * 为什么必须有这把锁（openspec/changes/publish-capability-registry）：
 * 无标题平台「标题→描述首行」的行为分散在引擎多条链/适配器里（快手链既有合并、
 * 视频号/Twitter/微博/TikTok 本次修复），而清单单一真源在 shared-utils 注册表。
 * 两侧各自有测试时，任何一侧单方面改动（清单缩水、链里删掉合并逻辑）都不会在
 * 本包内变红——跨包边界上的契约只能由跨包边界的锁拦（先例：
 * cloud-accounts-desktop-contract.test.js）。
 *
 * 双向锁口径：
 *   A) 清单锁：注册表无标题清单必须精确等于 6 平台（视频号/快手/微博/X/Instagram/TikTok）。
 *      从清单移除任一平台 → 精确匹配断言变红（反证场景）。
 *   B) 行为锁：清单内每个具备引擎发布路径的平台，其链/适配器实际执行标题合并
 *      （标题为描述首行）；移除任一链的合并逻辑 → 行为断言变红（反证场景）。
 *   C) 反向锁：有标题平台（bilibili）的链不合并标题（title/desc 各自独立）。
 *
 * 依赖边界：本文件 require 注册表源文件属**测试依赖**，不构成引擎运行时依赖
 * （引擎零依赖约束不变；先例：cloud-accounts 契约锁读桌面端源码）。
 */
const test = require('node:test').test
const assert = require('node:assert/strict')
const fs = require('fs')
const path = require('path')

/**
 * 定位 shared-utils 注册表源文件：从 __dirname 逐级上溯找锚点目录，
 * 禁止数 `..` 层级（node-linker=hoisted 布局下数层级会指到不存在的路径，
 * 「找不到就 skip」的锁会永久静默——找不到即抛错变红，绝不允许 return 跳过）。
 */
function sharedUtilsFile (name) {
  let dir = __dirname
  for (let hop = 0; hop < 10; hop += 1) {
    const candidate = path.join(dir, 'packages', 'shared-utils', 'src', name)
    if (fs.existsSync(candidate)) return candidate
    const parent = path.dirname(dir)
    if (parent === dir) break
    dir = parent
  }
  throw new Error(`找不到注册表锚点 packages/shared-utils/src/${name}（从 ${__dirname} 上溯 10 级）`)
}

const registry = require(sharedUtilsFile('publish-capabilities.js'))
const { buildShipinhaoPostData } = require('../src/publish/platforms/shipinhao-video')
const { buildKuaishouPostData } = require('../src/publish/platforms/kuaishou-video')
const { buildBilibiliPostData } = require('../src/publish/platforms/bilibili-video')
const WeiboAdapter = require('../src/adapters/weibo')
const TwitterAdapter = require('../src/adapters/twitter')
const TikTokAdapter = require('../src/adapters/tiktok')

/** 引擎内具备发布路径的无标题平台 → 行为验证器；instagram 仅 DOM 轨（无引擎适配器）。 */
const ENGINE_NO_TITLE_PLATFORMS = ['tencent_video', 'kuaishou', 'weibo', 'twitter', 'tiktok']

test('A) 清单锁：注册表无标题平台精确等于 6 个（缩水即红）', () => {
  assert.deepEqual(
    [...registry.getNoTitlePlatforms()].sort(),
    ['instagram', 'kuaishou', 'tencent_video', 'tiktok', 'twitter', 'weibo'],
  )
  // 清单内的引擎平台全部被本契约覆盖（instagram 为 DOM-only，无引擎路径）
  for (const platform of registry.getNoTitlePlatforms()) {
    if (platform === 'instagram') continue
    assert.ok(ENGINE_NO_TITLE_PLATFORMS.includes(platform), `清单内平台 ${platform} 缺少引擎行为锁`)
  }
})

test('B-1) tencent_video（视频号 API 链）：标题作为 description 首行，不再丢弃', () => {
  const both = buildShipinhaoPostData({ title: '标题T', content: '正文C' }, {}, {})
  assert.equal(both.description, '标题T\n正文C')
  assert.ok(both.description.indexOf('标题T') < both.description.indexOf('正文C'))

  const titleOnly = buildShipinhaoPostData({ title: '标题T' }, {}, {})
  assert.equal(titleOnly.description, '标题T')

  const contentOnly = buildShipinhaoPostData({ content: '正文C' }, {}, {})
  assert.equal(contentOnly.description, '正文C')

  const neither = buildShipinhaoPostData({}, {}, {})
  assert.equal(neither.description, '')

  // 旧缺陷形态回归：有正文时标题被丢弃（description === content）必须不再出现
  const legacy = buildShipinhaoPostData({ title: '标题T', content: '正文C' }, {}, {})
  assert.notEqual(legacy.description, '正文C')
})

test('B-2) kuaishou（快手 API 链）：标题首行 + 正文（含内联话题）合并；话题内联后不再拼 tags', () => {
  // 话题内联描述（publish-topic-inline-description）：描述为话题真源——话题以
  // `#话题` 内联在 content 里（UI 追加管道），caption 不再把 tags 数组拼进来
  // （旧「tags 拼进 caption」会造成描述+字段双份重复，2026-10-09 下线）。
  const data = buildKuaishouPostData({ title: '标题T', content: '正文C #话题', tags: ['话题'] })
  assert.equal(data.caption, '标题T\n正文C #话题')
  assert.ok(data.caption.startsWith('标题T'))
  // 无话题时与旧形态兼容（标题 + 正文）
  const plain = buildKuaishouPostData({ title: '标题T', content: '正文C' })
  assert.equal(plain.caption, '标题T\n正文C')
})

test('B-3) weibo（微博适配器）：buildPostData 正文以标题为首行', () => {
  const adapter = new WeiboAdapter()
  const data = adapter.buildPostData({ title: '标题T', content: '正文C', tags: ['标签'] })
  assert.equal(data.content, '标题T\n正文C')
  assert.equal(data.tags, '标签')
  // 仅标题时正文即标题（旧实现会得到空串）
  const titleOnly = adapter.buildPostData({ title: '标题T' })
  assert.equal(titleOnly.content, '标题T')
})

test('B-3b) weibo（微博适配器）：visible 可见性透传（P1-5）', () => {
  const adapter = new WeiboAdapter()
  // 合法值透传（0 公开 / 1 仅自己 / 6 好友圈）
  assert.equal(adapter.buildPostData({ title: 'T', visible: 1 }).visible, 1)
  assert.equal(adapter.buildPostData({ title: 'T', visible: 6 }).visible, 6)
  assert.equal(adapter.buildPostData({ title: 'T', visible: 0 }).visible, 0)
  // 字符串数字同样接受（payload 经 JSON 往返后可能为字符串）
  assert.equal(adapter.buildPostData({ title: 'T', visible: '6' }).visible, 6)
  // 非法值/缺省一律不透传（交平台默认，不产出错误可见性）
  assert.ok(!('visible' in adapter.buildPostData({ title: 'T' })))
  assert.ok(!('visible' in adapter.buildPostData({ title: 'T', visible: 99 })))
  assert.ok(!('visible' in adapter.buildPostData({ title: 'T', visible: 'hack' })))
})

test('B-4) twitter（X 适配器）：execute 的推文 text 以标题为首行（源码结构锁）', () => {
  // execute 需要网络与 OAuth 环境变量，无法在单测直跑；按本仓结构锁先例读源码钉住
  // 合并形态，并确保旧「content || title 丢弃标题」形态不复存在。
  const source = fs.readFileSync(require.resolve('../src/adapters/twitter'), 'utf8')
  assert.ok(source.includes('无标题平台'), 'twitter 适配器必须声明无标题平台合并语义')
  assert.ok(/join\("\\n"\)/.test(source), 'twitter 推文 text 必须以标题为首行合并')
  assert.ok(!/taskData\.content \|\| taskData\.title/.test(source), '旧「content || title」丢弃标题形态必须移除')
})

test('B-5) tiktok（TikTok 适配器）：post_info.description 以标题为首行（源码结构锁）', () => {
  const source = fs.readFileSync(require.resolve('../src/adapters/tiktok'), 'utf8')
  assert.ok(source.includes('无标题平台'), 'tiktok 适配器必须声明无标题平台合并语义')
  assert.ok(/join\("\\n"\)/.test(source), 'tiktok description 必须以标题为首行合并')
})

test('C) 反向锁：有标题平台（bilibili）title 与 desc 独立，不合并', () => {
  const data = buildBilibiliPostData({ title: '标题T', content: '正文C', video: {} }, {})
  assert.equal(data.title, '标题T')
  assert.equal(data.desc, '正文C')
  assert.ok(!String(data.desc).includes('标题T'), '有标题平台的 desc 不得混入标题')
})

test('注册表结构自检在引擎侧同样通过（双版本 parity 之外的第三道锁）', () => {
  assert.deepEqual(registry.validateRegistry(), [])
  // 引擎侧消费的 isNoTitlePlatform 口径与清单一致
  for (const platform of registry.getNoTitlePlatforms()) {
    assert.equal(registry.isNoTitlePlatform(platform), true)
  }
  assert.equal(registry.isNoTitlePlatform('bilibili'), false)
  assert.equal(registry.isNoTitlePlatform('nonexistent'), false)
})
