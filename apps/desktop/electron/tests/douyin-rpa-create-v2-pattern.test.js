// @ts-check
/**
 * 抖音 RPA 链：图文发布成功却判 publish timeout（2026-10-07 E2E 实证）
 *
 * 现象：ha-c 批次 douyin 报 `publish timeout url=https://creator.douyin.com/creator-micro/content/post/image?default-tab=3...`
 * 日志显示前置步骤全部正常（image uploaded → filling desc → publishing），点了发布按钮，
 * 60 秒后仍无成功信号。
 *
 * 关键结构事实（本次定位的核心）：
 *   **抖音走的是专用链 `_publish_douyin`（rpa-view-platforms.js:992-1005），
 *   完全绕开了通用链那段 DOM 成功判定（:823-835）。**
 *   所以给通用链补词形（含 #3017 的视频号修复）对抖音**无效**。
 *
 * 抖音链只等两个端点：`['aweme/create', 'aweme/post']`。
 * 但同仓 API 直连链的实证（douyin-ticket-guard.js:20）是
 *   `CREATE_V2_PATH = '/web/api/media/aweme/create_v2/'`
 * 且 douyin-image.js:224 用它提交图文。也就是说**抖音图文真实提交端点带
 * `_v2` 后缀**，RPA 链等的两个形态与之不匹配（`aweme/post` 属旧链，
 * 已被 douyin-legacy-chain-gate 判定为「下线远程签名链」）。
 *
 * 边界：只补端点形态，不放宽成功判据；仍要求 statusCode===200。
 */
import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

const SRC = path.resolve(__dirname, '..', 'services', 'rpa-view-platforms.js')

/** 从生产源码抽出抖音链等待的端点模式数组 */
function extractDouyinPatternsFromSource () {
  const src = fs.readFileSync(SRC, 'utf8')
  const m = /_waitForResponse\(win,\s*\[([^\]]*)\]/.exec(src)
  if (!m) throw new Error('rpa-view-platforms.js 中未找到 _waitForResponse 端点数组，源码结构已变')
  return m[1].split(',').map(s => s.trim().replace(/^['"]|['"]$/g, '')).filter(Boolean)
}

describe('douyin RPA 链发布成功判定（publish timeout 修复）', () => {
  it('抖音链等待的端点必须覆盖真实提交端点 create_v2', () => {
    const patterns = extractDouyinPatternsFromSource()
    // 实证端点（douyin-ticket-guard.js CREATE_V2_PATH）
    expect(patterns.some(p => p.includes('create_v2'))).toBe(true)
  })

  it('create_v2 形态必须真的命中真实提交 URL', () => {
    const patterns = extractDouyinPatternsFromSource()
    const realUrl = 'https://creator.douyin.com/web/api/media/aweme/create_v2/?aid=1128'
    expect(patterns.some(p => realUrl.includes(p))).toBe(true)
  })

  it('不得只剩已下线的 aweme/post（旧远程签名链，legacy gate 已判死）', () => {
    const patterns = extractDouyinPatternsFromSource()
    // 允许保留它（历史兼容无妨），但不能是唯一形态
    if (patterns.includes('aweme/post')) {
      expect(patterns.length).toBeGreaterThan(1)
    }
    expect(patterns).toContain('aweme/create')
  })

  it('不得引入过宽的片段导致无关请求被误判成功', () => {
    const patterns = extractDouyinPatternsFromSource()
    // 这些过宽片段会命中大量无关请求，禁止出现
    for (const bad of ['aweme', '/web/api', 'media/', 'creator']) {
      expect(patterns.some(p => p === bad), bad).toBe(false)
    }
    // 每个模式都必须仍带足够区分度
    for (const p of patterns) {
      expect(p.length).toBeGreaterThanOrEqual(9)
    }
  })
})