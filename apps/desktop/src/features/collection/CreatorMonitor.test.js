import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { nextTick } from 'vue'
import { createI18n } from 'vue-i18n'

vi.mock('element-plus', () => ({
  ElMessage: { warning: vi.fn(), success: vi.fn(), error: vi.fn(), info: vi.fn() },
  ElMessageBox: { confirm: vi.fn().mockResolvedValue(undefined) },
}))

const { ElMessage } = await import('element-plus')

import CreatorMonitor from './CreatorMonitor.vue'

/** i18n 桩：给出真实模板，vue-i18n 才会替换 {count} / {max} / {remain} 等占位符。
 *  空 messages 时 t() 只回显 key，插值不会被替换，断言占位符数值就会假失败。 */
const messages = {
  zh: {
    collection: {
      creatorTab: '博主监控',
      creatorListTitle: '关注的博主',
      creatorAddSubmit: '关注',
      creatorAddPlaceholder: '粘贴 YouTube 频道链接、@handle 或频道 ID',
      creatorPendingBadge: '{count} 条新作品',
      creatorCollectNew: '一键采集新作品',
      creatorCollectOne: '采集',
      creatorCollectedAt: '已采集 · {time}',
      creatorCapOfficial: '官方接口',
      creatorCapBestEffort: '尽力而为（可能不稳定）',
      creatorCapUnsupported: '暂不支持',
      creatorQualityFull: '字幕正文，质量高',
      creatorQualityPartial: '描述正文，质量有限',
      creatorQualityStub: '仅标题与简介',
      creatorAutoPaused: '连续失败 {times} 次，已自动暂停。{reason}',
      creatorFatalPaused: '无法检查新作品：{reason}。请在设置中检查 API Key。',
      creatorBatchSuccess: '已采集 {collected} 条内容',
      creatorTruncated: '共发现 {found} 条，已采集最新 {collected} 条，剩余 {remain} 条留待下次',
      creatorErrCountExceedsLimit: '本次最多采集 {max} 条，请调整数量。',
      creatorErrCollectFailed: '采集失败：{message}',
      creatorErrDependencyMissing: '缺少采集依赖。请执行：{command}',
      creatorNoNewWorks: '暂无新作品。系统会每 {interval} 自动检查一次。',
      creatorEmptyTitle: '还没有关注的博主',
      creatorEmptyDesc: '添加 YouTube 博主后，系统会定期检查新作品并在这里提示。',
      creatorPause: '暂停监控',
      creatorResume: '恢复监控',
      creatorCheckNow: '立即检查',
      creatorUnfollow: '取消关注',
    },
  },
  en: { collection: {} },
}

const disc = (over = {}) => ({
  id: 'd1', title: '新视频', thumbnail_url: '', content_quality: 'full',
  collect_state: 'pending', ...over,
})
const i18n = createI18n({
  legacy: false,
  locale: 'zh',
  messages,
  missingWarn: false,
  fallbackWarn: false,
})

function mountMonitor () {
  return mount(CreatorMonitor, {
    global: { plugins: [i18n], mocks: {} },
  })
}

const creator = (over = {}) => ({
  id: 'c1', platform: 'youtube', external_id: 'UC_a', display_name: '频道A',
  capability_tier: 'official', enabled: 1, status: 'active',
  consecutive_failures: 0, pendingCount: 2, ...over,
})

beforeEach(() => {
  vi.clearAllMocks()
  globalThis.electronAPI = {
    creatorList: vi.fn().mockResolvedValue({ code: 0, items: [creator()], totalPending: 2 }),
    creatorFollow: vi.fn().mockResolvedValue({ code: 0, creator: creator(), follow: {} }),
    creatorUnfollow: vi.fn().mockResolvedValue({ code: 0 }),
    creatorToggle: vi.fn().mockResolvedValue({ code: 0, follow: {} }),
    creatorCheckNow: vi.fn().mockResolvedValue({ code: 0, found: 3, inserted: 2 }),
    creatorDiscoveries: vi.fn().mockResolvedValue({ code: 0, items: [] }),
    creatorCollect: vi.fn().mockResolvedValue({ code: 0, collected: 5, remain: 0, truncated: false }),
    creatorCollectOne: vi.fn().mockResolvedValue({ code: 0, collected: 1 }),
    creatorSkipOne: vi.fn().mockResolvedValue({ code: 0 }),
  }
})

describe('CreatorMonitor · 空态', () => {
  it('未关注任何博主时显示引导空态', async () => {
    globalThis.electronAPI.creatorList.mockResolvedValue({ code: 0, items: [], totalPending: 0 })
    const w = mountMonitor()
    await flushPromises()
    expect(w.find('[data-testid="creator-empty"]').exists()).toBe(true)
  })
})

describe('CreatorMonitor · 博主列表', () => {
  it('渲染博主与待采集角标', async () => {
    const w = mountMonitor()
    await flushPromises()
    expect(w.find('[data-testid="creator-list"]').exists()).toBe(true)
    expect(w.find('[data-testid="creator-pending"]').text()).toContain('2')
  })

  it('能力等级按 tier 渲染不同徽章', async () => {
    globalThis.electronAPI.creatorList.mockResolvedValue({
      code: 0, totalPending: 0,
      items: [creator({ id: 'c1', capability_tier: 'official' }),
              creator({ id: 'c2', capability_tier: 'best_effort' }),
              creator({ id: 'c3', capability_tier: 'unsupported' })],
    })
    const w = mountMonitor()
    await flushPromises()
    expect(w.find('[data-testid="creator-item-c1"] [data-tier="official"]').text()).toBe('官方接口')
    expect(w.find('[data-testid="creator-item-c2"] [data-tier="best_effort"]').exists()).toBe(true)
    expect(w.find('[data-testid="creator-item-c3"] [data-tier="unsupported"]').exists()).toBe(true)
  })

  it('暂停中的任务显示置灰样式', async () => {
    globalThis.electronAPI.creatorList.mockResolvedValue({
      code: 0, totalPending: 0, items: [creator({ enabled: 0 })],
    })
    const w = mountMonitor()
    await flushPromises()
    expect(w.find('[data-testid="creator-item-c1"]').classes()).toContain('disabled')
  })

  it('auto_paused 显示连续失败次数与原因', async () => {
    globalThis.electronAPI.creatorList.mockResolvedValue({
      code: 0, totalPending: 0,
      items: [creator({ status: 'auto_paused', consecutive_failures: 3, paused_reason: 'net' })],
    })
    const w = mountMonitor()
    await flushPromises()
    const txt = w.find('[data-testid="creator-item-c1"]').text()
    expect(txt).toContain('3')
    expect(txt).toContain('net')
  })

  it('fatal_paused 与 auto_paused 用不同文案（凭证问题不该让用户去点重试）', async () => {
    globalThis.electronAPI.creatorList.mockResolvedValue({
      code: 0, totalPending: 0, items: [creator({ status: 'fatal_paused', paused_reason: 'keyInvalid' })],
    })
    const w = mountMonitor()
    await flushPromises()
    expect(w.text()).toContain('API Key')
    expect(w.text()).not.toContain('creatorAutoPaused')
  })
})

describe('CreatorMonitor · 一键采集', () => {
  it('不传 count，由主进程应用默认数量', async () => {
    globalThis.electronAPI.creatorDiscoveries.mockResolvedValue({ code: 0, items: [disc()] })
    const w = mountMonitor()
    await flushPromises(); await nextTick()
    await w.find('[data-testid="creator-collect-all"]').trigger('click')
    await nextTick()
    expect(globalThis.electronAPI.creatorCollect).toHaveBeenCalled()
    expect(globalThis.electronAPI.creatorCollect.mock.calls[0][0].count).toBeUndefined()
  })

  it('超限时提示上限值，不静默截断', async () => {
    globalThis.electronAPI.creatorCollect.mockResolvedValue({
      code: -10, reason: 'creator:count_exceeds_limit', max: 100,
    })
    globalThis.electronAPI.creatorDiscoveries.mockResolvedValue({ code: 0, items: [disc()] })
    const w = mountMonitor()
    await flushPromises(); await nextTick()
    await w.find('[data-testid="creator-collect-all"]').trigger('click')
    await nextTick()
    expect(ElMessage.warning).toHaveBeenCalled()
    expect(ElMessage.success).not.toHaveBeenCalled()
  })

  it('采少于可采数时 MUST 告知剩余（禁止静默截断）', async () => {
    globalThis.electronAPI.creatorCollect.mockResolvedValue({
      code: 0, collected: 5, available: 12, remain: 7, truncated: true,
    })
    globalThis.electronAPI.creatorDiscoveries.mockResolvedValue({ code: 0, items: [disc()] })
    const w = mountMonitor()
    await flushPromises(); await nextTick()
    await w.find('[data-testid="creator-collect-all"]').trigger('click')
    await nextTick()
    expect(ElMessage.success).toHaveBeenCalled()
    expect(ElMessage.info).toHaveBeenCalled()
    expect(ElMessage.info.mock.calls[0][0]).toContain('7')
  })

  it('全部采完时不提示剩余', async () => {
    globalThis.electronAPI.creatorCollect.mockResolvedValue({
      code: 0, collected: 5, available: 5, remain: 0, truncated: false,
    })
    const w = mountMonitor()
    await flushPromises()
    await w.find('[data-testid="creator-collect-all"]').trigger('click')
    await nextTick()
    expect(ElMessage.info).not.toHaveBeenCalled()
  })

  it('无新作品时按钮禁用', async () => {
    globalThis.electronAPI.creatorDiscoveries.mockResolvedValue({ code: 0, items: [] })
    const w = mountMonitor()
    await flushPromises()
    expect(w.find('[data-testid="creator-collect-all"]').attributes('disabled')).toBeDefined()
  })
})

describe('CreatorMonitor · 发现列表与单条采集', () => {
  const disc = (over = {}) => ({
    id: 'd1', title: '新视频', thumbnail_url: '', content_quality: 'full',
    collect_state: 'pending', ...over,
  })

  it('渲染新作品与质量徽章', async () => {
    globalThis.electronAPI.creatorDiscoveries.mockResolvedValue({ code: 0, items: [disc()] })
    const w = mountMonitor()
    await flushPromises(); await nextTick()
    expect(w.find('[data-testid="discovery-d1"]').exists()).toBe(true)
    expect(w.find('[data-testid="discovery-d1"] [data-quality="full"]').exists()).toBe(true)
  })

  it('单条采集零填参', async () => {
    globalThis.electronAPI.creatorDiscoveries.mockResolvedValue({ code: 0, items: [disc()] })
    const w = mountMonitor()
    await flushPromises(); await nextTick()
    await w.find('[data-testid="creator-collect-one"]').trigger('click')
    await nextTick()
    expect(globalThis.electronAPI.creatorCollectOne).toHaveBeenCalledWith({ discoveryId: 'd1' })
  })

  it('已采集项不显示采集按钮，改显示已采集状态', async () => {
    globalThis.electronAPI.creatorDiscoveries.mockResolvedValue({
      code: 0, items: [disc({ collect_state: 'collected', collected_at: '2026-10-07 12:00' })],
    })
    const w = mountMonitor()
    await flushPromises(); await nextTick()
    expect(w.find('[data-testid="creator-collect-one"]').exists()).toBe(false)
    expect(w.find('[data-testid="creator-collected"]').exists()).toBe(true)
  })

  it('quality=stub 使用「仅标题与简介」文案（区别于 full）', async () => {
    globalThis.electronAPI.creatorDiscoveries.mockResolvedValue({
      code: 0, items: [disc({ content_quality: 'stub' })],
    })
    const w = mountMonitor()
    await flushPromises(); await nextTick()
    expect(w.find('[data-quality="stub"]').text()).toBe('仅标题与简介')
  })
})

describe('CreatorMonitor · 降级与错误', () => {
  it('服务未就绪时显示降级提示而非空白', async () => {
    globalThis.electronAPI.creatorList.mockResolvedValue({
      code: -1, reason: 'service-unavailable', message: 'x',
    })
    const w = mountMonitor()
    await flushPromises()
    expect(w.find('[data-testid="creator-degraded"]').exists()).toBe(true)
  })

  it('IPC 返回非 0 时弹错误（降级返回长得像成功，最容易漏）', async () => {
    globalThis.electronAPI.creatorCollectOne.mockResolvedValue({
      code: -11, reason: 'creator:invalid_input', message: 'bad',
    })
    globalThis.electronAPI.creatorDiscoveries.mockResolvedValue({ code: 0, items: [disc()] })
    const w = mountMonitor()
    await flushPromises(); await nextTick()
    await w.find('[data-testid="creator-collect-one"]').trigger('click')
    await nextTick()
    expect(ElMessage.error).toHaveBeenCalledWith('bad')
    expect(ElMessage.success).not.toHaveBeenCalled()
  })

  it('electronAPI 缺失时不抛异常（渲染层先于 preload 就绪的时序）', async () => {
    const saved = globalThis.electronAPI
    delete globalThis.electronAPI
    expect(() => mountMonitor()).not.toThrow()
    globalThis.electronAPI = saved
  })
})