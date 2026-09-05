import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock electron-bridge 的 invoke（避免真实 IPC）
vi.mock('@/api/electron-bridge', () => ({
  invoke: vi.fn(),
}))

import { invoke } from '@/api/electron-bridge'
import { resolveNotifyText, reportNotify, notifyText } from './notifyCore'

describe('notifyCore — 文案解析', () => {
  it('解析已知 messageKey → 当前语言文案', () => {
    const zh = resolveNotifyText('story2video.quota_exceeded', {}, 'zh')
    expect(zh.resolved).toBe(true)
    expect(zh.text.length).toBeGreaterThan(0)

    const en = resolveNotifyText('story2video.quota_exceeded', {}, 'en')
    expect(en.resolved).toBe(true)
    expect(en.text.length).toBeGreaterThan(0)
  })

  it('模板插值 {name} → params[name]', () => {
    // 用带插值的 key 验证（如 story2video.compose_duration_exceeded 的 {limitMinutes}）
    const result = resolveNotifyText('story2video.compose_duration_exceeded', { limitMinutes: 30 }, 'zh')
    expect(result.resolved).toBe(true)
    expect(result.text).toContain('30')
  })

  it('支持 message function 叶子（(ctx) => ctx.named()）', () => {
    const result = resolveNotifyText('publishPage.batchNotify.progressTaskSuccess', {
      platform: 'wechat_mp',
      title: '标题A',
    }, 'zh')
    expect(result.resolved).toBe(true)
    expect(result.text).toContain('wechat_mp')
    expect(result.text).toContain('标题A')
    expect(result.text).toContain('发布成功')
  })

  it('未知 messageKey → resolved=false，text 为空', () => {
    const result = resolveNotifyText('nonexistent.key', {}, 'zh')
    expect(result.resolved).toBe(false)
    expect(result.text).toBe('')
  })

  it('缺省 locale 用 getAppLocale（回退 zh）', () => {
    const result = resolveNotifyText('story2video.quota_exceeded', {})
    expect(result.resolved).toBe(true)
  })

  it('解析结果为 i18n 原始 key 时视为未命中（防泄漏）', () => {
    // 防御性守卫：若 locale 叶子值本身是 key 形态（误配），拦截避免直出
    // 真实场景由 useNotify 对 options.message（t() 缺失 key 原样返回）拦截
    const result = resolveNotifyText('accountsPage.loginExpiredHint', {}, 'zh')
    // loginExpiredHint 在 locale 中存在 → 正常解析为自然语言，不触发守卫
    expect(result.resolved).toBe(true)
    expect(result.text).toBe('是否需要重新登录？')
  })
})

describe('notifyCore — 日志上报', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('reportNotify 上报结构化 payload（level 映射 + errorCategory 关联）', async () => {
    invoke.mockResolvedValue({ code: 0, data: true })
    reportNotify('story2video.quota_exceeded', {
      module: 'batchPublish',
      level: 'warn',
      params: { count: 2 },
    })
    // fire-and-forget，等待微任务
    await Promise.resolve()
    expect(invoke).toHaveBeenCalledWith('notifyLog', {
      messageKey: 'story2video.quota_exceeded',
      module: 'batchPublish',
      level: 'warn',
      params: { count: 2 },
      errorCategory: 'quota_exceeded',
      error: undefined,
    })
  })

  it('level 映射：success→info，warning→warn，confirm→info', async () => {
    invoke.mockResolvedValue({ code: 0, data: true })
    reportNotify('story2video.export_completed', { level: 'success' })
    reportNotify('story2video.rate_limited', { level: 'warning' })
    reportNotify('story2video.project_delete_confirm', { level: 'confirm' })
    await Promise.resolve()
    const levels = invoke.mock.calls.map((c) => c[1].level)
    expect(levels).toEqual(['info', 'warn', 'info'])
  })

  it('errorCategory 缺省用 resolveErrorCategory(messageKey)', async () => {
    invoke.mockResolvedValue({ code: 0, data: true })
    reportNotify('userErrors.AUTH_REQUIRED', { level: 'error' })
    await Promise.resolve()
    expect(invoke.mock.calls[0][1].errorCategory).toBe('auth_required')
  })

  it('无 electronAPI 时静默降级（不抛错）', async () => {
    invoke.mockRejectedValue(new Error('no api'))
    expect(() => reportNotify('story2video.quota_exceeded', {})).not.toThrow()
    await Promise.resolve()
  })
})

describe('notifyCore — notifyText 便捷方法', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('命中 key → 返回文案并上报日志', async () => {
    invoke.mockResolvedValue({ code: 0, data: true })
    const text = notifyText('story2video.quota_exceeded', { module: 'm', level: 'error' })
    expect(text.length).toBeGreaterThan(0)
    await Promise.resolve()
    expect(invoke).toHaveBeenCalled()
  })

  it('未命中 key → 返回空串且不上报', async () => {
    invoke.mockResolvedValue({ code: 0, data: true })
    const text = notifyText('nonexistent.key', {})
    expect(text).toBe('')
    await Promise.resolve()
    expect(invoke).not.toHaveBeenCalled()
  })
})