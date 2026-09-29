'use strict'
/**
 * test/content-formatter-registry-sync.test.js — 引擎限制表 ↔ 注册表 契约锁（CCG W4）
 *
 * 为什么必须有这把锁：content-formatter 的 CONTENT_LIMITS/TITLE_LIMITS 是引擎侧
 * 第三份限制表（引擎零依赖约束下不能运行时 import 注册表）。CCG 双模型评审（claude 路
 * W4）实锤其与注册表多处矛盾（douyin title 30 vs 55、xiaohongshu title 40 vs 20、
 * weibo title 120 vs 无标题、wechat_mp content 50000 vs 20000 等），且 formatContent
 * 在 base-adapter/kuaishou/douyin 的真实发布路径上执行——用户经渲染层校验（注册表
 * 口径）通过的标题会被引擎按旧值静默截断。
 *
 * 锁口径：本文件 require 注册表源文件属**测试依赖**（先例 no-title-contract.test.js），
 * 逐级上溯定位锚点、找不到即抛错（禁止数 `..` 层级、禁止 return 跳过）。两表任一值
 * 与注册表派生期望漂移即红。
 *
 * 派生规则：
 *   - 有标题平台：TITLE_LIMITS = 注册表 titleMax（字符口径）
 *   - 百家号：注册表按 UTF-8 字节 149（≈49 中文字符），引擎按字符截断 → 49
 *   - 无标题平台（titleMode=caption）：标题合并进描述由 contentMax 管辖，标题不
 *     单独截断 → TITLE_LIMITS 必须 ≥ 100000（no-op 语义，防止 formatContent 把
 *     待合并的标题截短/截空）
 *   - 全部 15 平台：CONTENT_LIMITS = 注册表 contentMax
 */
const test = require('node:test').test
const assert = require('node:assert/strict')
const fs = require('fs')
const path = require('path')

/** 定位 shared-utils 注册表源文件：逐级上溯找锚点，找不到即抛错。 */
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
const { truncateTitle, truncateContent } = require('../src/content-formatter')

const NO_TITLE_NOOP_LIMIT = 100000

test('A) 全 15 平台：CONTENT_LIMITS 与注册表 contentMax 逐平台一致', () => {
  const platforms = Object.keys(registry.PLATFORM_PUBLISH_META)
  assert.equal(platforms.length, 15)
  for (const platform of platforms) {
    const expected = registry.getPlatformContentLimit(platform).contentMax
    // 经真实 truncateContent 行为断言（而非读内部表）：恰好边界保留、超限截断到注册表值
    const atLimit = 'x'.repeat(expected)
    assert.equal(truncateContent(platform, atLimit).length, expected, `${platform} 边界长度被改变`)
    const overLimit = 'x'.repeat(expected + 10)
    assert.equal(truncateContent(platform, overLimit).length, expected, `${platform} 超限未按注册表 ${expected} 截断`)
  }
})

test('B) 有标题平台：truncateTitle 按注册表 titleMax 截断', () => {
  const cases = [
    ['wechat_mp', 64], ['zhihu', 50], ['douyin', 55], ['xiaohongshu', 20],
    ['toutiao', 30], ['bilibili', 80], ['youtube', 100], ['facebook', 100],
  ]
  for (const [platform, expected] of cases) {
    const over = '标'.repeat(expected + 5)
    assert.equal(Array.from(truncateTitle(platform, over)).length, expected, `${platform} 标题未按注册表 ${expected} 截断`)
  }
})

test('C) 百家号：注册表按字节 149，引擎按字符 49（≈49 中文）', () => {
  const registryLimit = registry.getPlatformContentLimit('baijiahao')
  assert.equal(registryLimit.titleMaxBytes, 149)
  assert.equal(Array.from(truncateTitle('baijiahao', '标'.repeat(60))).length, 49)
})

test('D) 无标题平台：标题不单独截断（no-op 上限），合并长度由 contentMax 管辖', () => {
  for (const platform of registry.getNoTitlePlatforms()) {
    // 标题 300 字（远超任何 contentMax）不得被 truncateTitle 截短——
    // 否则适配器合并时标题已残缺（旧值 weibo 120 / 默认 100 会截）
    const longTitle = '题'.repeat(300)
    assert.equal(Array.from(truncateTitle(platform, longTitle)).length, 300, `${platform} 无标题平台标题被单独截断`)
  }
})

test('E) 反证口径：无标题平台若回退单独截断（<100000）即红', () => {
  // 本用例锁语义而非实现：无标题平台的 title 截断上限必须 ≥ NO_TITLE_NOOP_LIMIT。
  // 若有人把 weibo 的 title 上限改回 120，D 用例的 300 字标题会被截到 120 → 红。
  const weiboTitle = '题'.repeat(NO_TITLE_NOOP_LIMIT)
  assert.equal(Array.from(truncateTitle('weibo', weiboTitle)).length, NO_TITLE_NOOP_LIMIT)
})

test('F) 行为级反证：douyin 40 字标题经 formatContent 管线不再被截到 30（CCG W4 事故场景）', () => {
  // 事故场景：渲染层按注册表 55 放行 40 字标题，旧引擎表按 30 截断 → 用户标题被静默砍 10 字
  const { formatContent } = require('../src/content-formatter')
  const title40 = '标'.repeat(40)
  const td = formatContent('douyin', { title: title40, content: '正文', tags: [] })
  assert.equal(Array.from(td.title).length, 40, 'douyin 40 字标题被引擎截断（旧值 30 未同步注册表 55）')
})
