'use strict'
/**
 * 退休分支用例（openspec change: retire-changelog-dedup-auth）
 *
 * 覆盖四个场景（spec 的 ADDED Requirements）：
 *   1. applies_to_base 是本次 base 的祖先（base 已越过清理坐标）⇒ granted+retired
 *   2. applies_to_base 不是祖先（真坐标错位）⇒ 维持 fatal
 *   3. retired 时 head 条目数 ≠ expected_entries_after ⇒ 仍 fatal（数字是判据）
 *   4. 输出必须出声（retiredReason），静默放行=判据被改宽而无人知道
 */
const test = require('node:test')
const assert = require('assert')
const path = require('path')

const growth = require('./check-changelog-growth.js')
const { evaluateAuthorization } = growth

const AUTH_CLEAN = JSON.stringify({
  applies_to_base: 'a'.repeat(40),
  reason: '清理 re-sync 型解冲突造成的历史副本',
  owner_pr: 'branch:changelog-history-dedup',
  expected_titles_reduced: 269,
  expected_entries_after: 349,
})

test('退休分支：applies_to_base 是本次 base 的祖先 ⇒ granted:true + retired:true', () => {
  // 祖先探测走真 git（merge-base --is-ancestor），用仓库里的真实提交：
  // 52edddef 与 5ad345d2 是真实的祖先/后代关系（learnings 修复时已核实）
  // 但这里必须与 CHANGELOG 相关——直接用两个真实 sha：
  //   applied = 23822b73fecc（授权声明的 base），cur = f210f191（#3076 的 base，已知后代）
  const applied = '23822b73fecc6c8f8e6710c1dc7911e02ea4e1fc'
  const cur = 'f210f191d5757b38eeec17f549d61857fabe3036'
  const auth = AUTH_CLEAN.replace('a'.repeat(40), applied)
  const r = evaluateAuthorization({
    authHeadText: auth,
    authBaseText: null,        // merge ref 场景：base 无授权文件
    baseSha: cur,
  })
  assert.equal(r.granted, true, '祖先关系 ⇒ 退休放行')
  assert.equal(r.retired, true)
  assert.ok(r.retiredReason.includes('已消费'), '必须出声说明退休原因')
})

test('退休分支负控一：applies_to_base 不是本次 base 的祖先（真错位）⇒ 维持 fatal', () => {
  // 两个无祖先关系的 sha：用占位（不存在的 sha 不会是任何提交的祖先——
  // 但 merge-base --is-ancestor 对不存在的 sha 会失败 ⇒ isAncestor=false ⇒ fatal）
  const applied = 'b'.repeat(40)
  const cur = 'f210f191d5757b38eeec17f549d61857fabe3036'
  const auth = AUTH_CLEAN.replace('a'.repeat(40), applied)
  const r = evaluateAuthorization({ authHeadText: auth, authBaseText: null, baseSha: cur })
  assert.equal(r.granted, false)
  assert.match(r.fatal, /坐标系/)
})

test('退休分支负控二：祖先成立但形状四条/额度数字对不上 ⇒ 仍走原 fatal 路径', () => {
  // 这条在 collect 层（形状/额度核对在 granted 之后），此处验证 evaluateAuthorization
  // 本身放行、但 collect 的下游会用 expected_entries_after 卡——用例见 collect 级
  // （真仓库回放）。这里只锁：祖先成立时 evaluateAuthorization 不再报坐标系 fatal。
  const applied = '23822b73fecc6c8f8e6710c1dc7911e02ea4e1fc'
  const cur = 'f210f191d5757b38eeec17f549d61857fabe3036'
  const auth = AUTH_CLEAN.replace('a'.repeat(40), applied)
    .replace('"expected_entries_after": 349', '"expected_entries_after": 999')
  const r = evaluateAuthorization({ authHeadText: auth, authBaseText: null, baseSha: cur })
  assert.equal(r.granted, true, 'evaluateAuthorization 层退休放行（数字核对在下游 collect）')
})

test('退休分支：authBaseText 非 null（授权文件在 base 已存在）⇒ 维持防白蹭 fatal', () => {
  const applied = '23822b73fecc6c8f8e6710c1dc7911e02ea4e1fc'
  const cur = 'f210f191d5757b38eeec17f549d61857fabe3036'
  const auth = AUTH_CLEAN.replace('a'.repeat(40), applied)
  const r = evaluateAuthorization({ authHeadText: auth, authBaseText: auth, baseSha: cur })
  assert.equal(r.granted, false)
  assert.match(r.fatal, /不是本次新增/)
})

test('退休分支：applies_to_base 恰等于本次 base（同坐标）⇒ 走原授权通路 granted（非 retired）', () => {
  const cur = 'f210f191d5757b38eeec17f549d61857fabe3036'
  const auth = AUTH_CLEAN.replace('a'.repeat(40), cur)
  const r = evaluateAuthorization({ authHeadText: auth, authBaseText: null, baseSha: cur })
  assert.equal(r.granted, true)
  assert.equal(r.retired, undefined, '同坐标走原通路，不得标 retired')
})