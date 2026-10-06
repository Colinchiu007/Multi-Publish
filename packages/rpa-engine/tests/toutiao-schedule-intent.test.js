// @ts-nocheck
// TDD —— 先红：头条「定时意图不可被静默丢弃」
//
// 背景（2026-10-07 平台侧定时改造）：
// `publishToutiao` 的三条路径里，只有 Node 直连兜底（publishDirect）会带上
// `timer_status` / `timer_time`。DOM 主路径成功时直接 `return domResult`，
// **从不设置定时** —— 于是用户排了期、内容却立即发布，正是本次改造要消灭的
// 「以为已排期、实际已发出」形态。
//
// 契约：只要 article 上带 publishTime（= 用户确实要求定时），
// 三条路径中**任何一条**返回 success 都必须附带 scheduled 标记，
// 绝不能出现「success 但没排期」。

const { publishToutiao, publishToutiaoWithFallback } = require('../src/toutiao-direct-bridge')

function makeLog () {
  return { info: vi.fn(), warn: vi.fn(), error: vi.fn() }
}

describe('toutiao-direct-bridge —— 定时意图不可被静默丢弃', () => {
  it('DOM 路径成功但文章带 publishTime 时，不得返回「已成功但没排期」', async () => {
    const log = makeLog()
    const host = {
      _getPlatformConfig: () => ({}),
      _publish_generic: vi.fn(async () => ({ success: true, platform: 'toutiao' })),
    }
    const article = { title: 'T', content: '正文', publishTime: '2026-10-08T02:00:00.000Z' }

    const result = await publishToutiao({
      // 空的 webContents.session ⇒ 直连必然失败（NO_SESSION），
      // 正好构造「DOM 成功、直连不可用」的最坏情形。
      win: { webContents: {} },
      article,
      host,
      log,
      sign: vi.fn(),
      getPublishUrl: () => 'https://mp.toutiao.com/profile_v4/graphic/publish',
      stripHtml: (v) => v,
    })

    // 关键契约：绝不能出现「success=true 但没排期」——
    // 那意味着 DOM 已经把内容立即发出，而用户以为排了期。
    if (result.success) {
      expect(result.scheduled).toBe(true)
    } else {
      expect(result.success).toBe(false)
      expect(String(result.error || '')).not.toBe('')
    }
  })

  it('带 publishTime 时即便 DOM 成功，也必须尝试走直连（不得直接返回 DOM 结果）', async () => {
    const log = makeLog()
    const host = {
      _getPlatformConfig: () => ({}),
      _publish_generic: vi.fn(async () => ({ success: true, platform: 'toutiao' })),
    }

    await publishToutiao({
      win: { webContents: {} },
      article: { title: 'T', content: '正文', publishTime: '2026-10-08T02:00:00.000Z' },
      host,
      log,
      sign: vi.fn(),
      getPublishUrl: () => 'https://mp.toutiao.com/profile_v4/graphic/publish',
      stripHtml: (v) => v,
    })

    // 应记录「改走 Node 直连以提交排期」的告警（log.warn(scope, message)）
    const warned = log.warn.mock.calls.map(c => c.map(x => String(x || '')).join(' ')).join('\n')
    expect(warned).toContain('DOM 路径不携带定时字段')
  })

  it('文章无 publishTime（立即发布）时不得标记为已排期', async () => {
    const log = makeLog()
    const host = {
      _getPlatformConfig: () => ({}),
      _publish_generic: vi.fn(async () => ({ success: true, platform: 'toutiao' })),
    }

    const result = await publishToutiao({
      win: { webContents: { session: {} } },
      article: { title: 'T', content: '正文' },
      host,
      log,
      sign: vi.fn(),
      getPublishUrl: () => 'https://mp.toutiao.com/profile_v4/graphic/publish',
      stripHtml: (v) => v,
    })

    expect(result.success).toBe(true)
    expect(result.scheduled).not.toBe(true)
  })

  it('直连兜底成功时同样标记已排期', async () => {
    const log = makeLog()
    const result = await publishToutiaoWithFallback({
      win: { webContents: { session: {} } },
      article: { title: 'T', content: '正文', publishTime: '2026-10-08T02:00:00.000Z' },
      domResult: { success: false, error: 'verification timeout' },
      sign: vi.fn(async () => ({ ok: true, signature: 'sig' })),
      log,
    })

    // 签名成功但 cookie 导出失败 => 直连失败；此用例只关心「成功时才可能带 scheduled」
    if (result.success) expect(result.scheduled).toBe(true)
    else expect(result.scheduled).not.toBe(true)
  })
})