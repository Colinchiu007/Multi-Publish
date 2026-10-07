/**
 * creator-limits.js — 采集数量双轨与硬上限
 *
 * 需求原文：「需要设置默认数量，同时有个上限，一次采集数量不能超过上限」。
 * 本模块把这条规则做成**纯函数**，便于穷举边界，也便于 UI 与主进程共用同一判据。
 *
 * ## 三条不可让步的规则
 *
 *  1. **超限拒绝且零副作用**：必须在下发任何 SQL 之前判定。已经入库的内容
 *     撤不回来，「先执行再回滚」不是可接受的实现方式。
 *  2. **禁止静默截断**：采少了必须如实告知「发现 N 条、采集 M 条、剩余 K 条
 *     留待下次」。静默截断会让用户以为全采了。
 *  3. **单条仅豁免数量上限**：单条采集不受数量上限约束（一条不存在「超限」），
 *     但**仍受配额约束**——豁免范围不得悄悄扩大。
 */

'use strict'

const COLLECT_DEFAULTS = {
  /** 「一键采集新作品」默认数量 */
  oneClick: 5,
  /** 「手动批量采集」默认数量 */
  manual: 50,
  /** 全局硬上限，任何路径不可超 */
  hardLimit: 100,
}

class ClampError extends Error {
  constructor (count, max) {
    super(`本次最多采集 ${max} 条，请调整数量`)
    this.name = 'ClampError'
    this.code = 'creator:count_exceeds_limit'
    this.count = count
    this.max = max
  }
}

/**
 * 计算生效上限 = min(个人上限, 全局硬上限)。
 * 非法个人上限（非正数 / 非数字）一律回落到全局，不得产生 0 或 NaN 上限——
 * 那会让后续所有 count 都被判超限，或让比较永远为 false。
 */
function resolveEffectiveLimit (perCreatorLimit, hardLimit = COLLECT_DEFAULTS.hardLimit) {
  const n = Number(perCreatorLimit)
  const hard = Number.isFinite(Number(hardLimit)) && Number(hardLimit) > 0
    ? Number(hardLimit)
    : COLLECT_DEFAULTS.hardLimit
  if (!Number.isFinite(n) || n <= 0) return hard
  return Math.min(n, hard)
}

/** 校验 count 是否可执行。不合法一律抛错，绝不静默修正成「看起来合理」的值。 */
function assertCollectCount (count, effectiveLimit) {
  const n = Number(count)
  if (!Number.isInteger(n)) {
    const err = new Error('采集数量必须是整数')
    err.code = 'creator:count_not_integer'
    throw err
  }
  if (n <= 0) {
    const err = new Error('采集数量必须大于 0')
    err.code = 'creator:count_not_positive'
    throw err
  }
  if (n > effectiveLimit) throw new ClampError(n, effectiveLimit)
  return n
}

/**
 * 生成采集计划：选哪些、剩多少、要不要提示。
 *
 * @param {{pending: Array, count: number, effectiveLimit: number}} input
 * @returns {{selected: Array, remain: number, truncated: boolean}}
 * @throws {ClampError} 超限时直接抛，不返回部分计划——已产生的副作用无法回滚。
 */
function planCollect ({ pending, count, effectiveLimit }) {
  assertCollectCount(count, effectiveLimit)
  const list = Array.isArray(pending) ? pending.slice() : []

  // 默认按发布时间倒序取最新；缺失时间的排在最后而不是崩在比较函数里
  list.sort((a, b) => {
    const av = a && a.published_at ? String(a.published_at) : ''
    const bv = b && b.published_at ? String(b.published_at) : ''
    if (!av && !bv) return 0
    if (!av) return 1
    if (!bv) return -1
    return av < bv ? 1 : (av > bv ? -1 : 0)
  })

  const selected = list.slice(0, count)
  const remain = Math.max(0, list.length - selected.length)
  // truncated 只表示「还有没采的」，需要 UI 告知；不代表超限
  return { selected, remain, truncated: remain > 0, available: list.length }
}

module.exports = {
  COLLECT_DEFAULTS,
  ClampError,
  resolveEffectiveLimit,
  assertCollectCount,
  planCollect,
}