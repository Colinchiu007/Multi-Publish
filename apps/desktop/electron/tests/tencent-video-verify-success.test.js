// @ts-check
/**
 * 腾讯视频（视频号）发布验证：发布成功却判超时（2026-10-07 E2E 实证）
 *
 * 现象：ha-c 批次 tencent_video 报 `publish verification timeout`，但同一份诊断快照里
 *   页面文本明确写着「视频57 注册51」「视频ID: sphOuKJ6GWCmZLB」
 *   —— 即**发布确实成功了**，只是成功文案形态没被识别。
 *
 * 第一性原因：通用 DOM 成功判定的正则只列了
 *   「发布成功|投稿成功|发布完成|提交成功|作品已发布|已发布」，
 * 而视频号创作者后台用的是「**发布并登记完成**」这个形态 ——
 * 「登记完成」既不含「完成」前的「发布/提交」二字，也不匹配「已发布」。
 * 于是命中不了 → 一路走到超时分支 → 把成功上报成失败（假失败）。
 *
 * 风险边界：判定成功**只能加词，不能放宽** —— 仍须保留 failure 优先短路，
 * 且不能引入任何可能出现在「未发布」页面上的宽泛词（如「已完成」「登记」），
 * 否则会把真失败判成成功（假成功），比假失败更危险。
 *
 * 本测试**从生产源码里抽正则**，而不是在测试里重写一份 —— 后者会在
 * 「测试自己写对了、实现没改」时全绿而生产仍坏（同源于
 * learnings 记录的「单测漏掉与真实实现的连通性」）。
 */
import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

const SRC = path.resolve(__dirname, '..', 'services', 'rpa-view-platforms.js')

/** 从生产源码抽出注入页面的两个正则字面量 */
function extractPatternsFromSource () {
  const src = fs.readFileSync(SRC, 'utf8')
  const success = /var success=\/\(([^)]*)\)\//.exec(src)
  const failure = /var failure=\/\(([^)]*)\)\//.exec(src)
  if (!success || !failure) {
    throw new Error('rpa-view-platforms.js 中未找到 DOM 成功/失败判定正则，源码结构已变')
  }
  return { success: new RegExp(success[1]), failure: new RegExp(failure[1]) }
}

/** 模拟页面判定：failure 优先短路 */
function judge (text, patterns) {
  if (patterns.failure.test(text)) return false
  return patterns.success.test(text)
}

describe('tencent_video 发布成功判定（假失败修复，E2E 实证）', () => {
  it('必须识别视频号真实成功文案「发布并登记完成」（含真实快照文本）', () => {
    const p = extractPatternsFromSource()
    // 逐字取自 E2E 诊断快照（app-2026-10-07.log 21:40:27）
    const pageText = '视频号 作品管理 9 条历史记录 本次发布并登记完成 视频ID: sphOuKJ6GWCmZLB 视频57 注册51'
    expect(judge(pageText, p)).toBe(true)
  })

  it('E2E 快照里的成功标记需与成功文案同现才算成功（视频ID 本身不是成功信号）', () => {
    const p = extractPatternsFromSource()
    // 成功文案形态（含 E2E 快照里的带标点形态）
    // 2026-10-07 收窄：去掉裸「登记完成」。真实快照（视频ID: sphOuKJ6GWCmZLB
    // 视频57 注册51 发布并登记完成）里该词始终与「发布/提交」同现；
    // 孤立出现时缺少上下文，可能在未发布页面上误判为成功。
    for (const t of ['发布并登记完成', '发布并登记完成。', '提交并登记完成']) {
      expect(judge(t, p), t).toBe(true)
    }
    // 单独一个「视频ID: ...」不构成成功证据 —— 它是成功页的伴随字段，
    // 未发布/编辑态页面同样可能残留该字段，单独命中会造成假成功。
    expect(judge('视频ID: sphOuKJ6GWCmZLB', p)).toBe(false)
    // 但与成功文案同现时整体判成功
    expect(judge('视频ID: sphOuKJ6GWCmZLB 发布并登记完成', p)).toBe(true)
  })

  it('孤立的「登记完成」不得单独构成成功证据（收窄回归锁）', () => {
    const p = extractPatternsFromSource()
    // 这条是 2026-10-07 主动收窄的判据：视频号真实文案总是「发布并登记完成」，
    // 剥离前缀的裸词没有证据价值，只会放大假成功面。
    expect(judge('登记完成', p)).toBe(false)
    expect(judge('本次登记完成', p)).toBe(false)
    // 带前缀的仍必须命中
    expect(judge('发布并登记完成', p)).toBe(true)
  })

  it('旧文案不得回归（覆盖既有全部形态）', () => {
    const p = extractPatternsFromSource()
    for (const t of ['发布成功', '投稿成功', '发布完成', '提交成功', '作品已发布', '已发布']) {
      expect(judge(t, p), t).toBe(true)
    }
  })

  it('真失败文案绝不能被判成功（假成功比假失败更危险）', () => {
    const p = extractPatternsFromSource()
    for (const t of ['发布失败', '提交失败', '上传失败', '登录失效', '请登录']) {
      expect(judge(t, p), t).toBe(false)
    }
    // 混合页：failure 必须优先短路
    expect(judge('发布并登记完成 但随后 发布失败', p)).toBe(false)
  })

  it('不得引入宽泛词造成假成功（未发布页面上的普通词）', () => {
    const p = extractPatternsFromSource()
    for (const t of ['已完成编辑', '登记信息', '提交记录为空', '未发布', '草稿已保存']) {
      expect(judge(t, p), t).toBe(false)
    }
  })
})