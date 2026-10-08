// M-11：发布记录筛选的补页扫描 —— 防抖、页数上限、触顶如实提示。
//
// Why these tests exist
// ---------------------
// 报告 M-11 的两处设计缺陷，既有 70 条用例一条都没覆盖：
//   1. 7 个筛选源裸 watch ⇒ 每敲一个字符就是一轮「串行分页把整张历史表拉完」；
//   2. 补页是 `while (hasActiveFilters && hasMoreRecords)` 的**无上限**循环 ⇒
//      历史积累到几千条后单次搜索引发上百次串行 IPC。
//
// 本文件用「假定时器 + 受控 mock 分页」把这三点变成机械判据：
//   - 连续改多个筛选条件 ⇒ 只拉一次；
//   - 补页页数封顶 20 ⇒ 最坏从「不限」降到 20 次；
//   - 触顶后界面文案必须是「已在已加载 N 条中筛选」+ 提示，而不是谎称扫完全表。
//
//   pnpm exec vitest run src/views/publish-history-filter-scan.test.js

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { nextTick } from 'vue'
import i18n from '@/i18n'

const historyListMock = vi.fn()
const draftListMock = vi.fn()

vi.mock('@/api/publisher', () => ({
  historyList: (...args) => historyListMock(...args),
  historyGet: vi.fn().mockResolvedValue({ code: 0, data: {} }),
  historyDelete: vi.fn().mockResolvedValue({ code: 0, data: { deleted: 1 } }),
  retryTask: vi.fn().mockResolvedValue({ code: 0 }),
  draftList: (...args) => draftListMock(...args),
}))

vi.mock('vue-router', () => ({ useRouter: () => ({ push: vi.fn() }) }))

vi.mock('@/stores/tab', () => ({
  useTabStore: () => ({ createTab: vi.fn() }),
}))

vi.mock('@/composables/useIdentity', () => ({
  useIdentity: () => ({ isAuthenticated: { value: true }, signIn: vi.fn(async () => true) }),
}))

vi.mock('@/utils/confirm-danger', () => ({ confirmDanger: vi.fn(async () => true) }))

vi.mock('@/stores/platforms', () => ({
  usePlatformStore: () => ({
    load: vi.fn(),
    getLabel: () => '',
    getIcon: () => '',
    getContentCategory: () => 'ARTICLE',
  }),
}))

import PublishHistory from './PublishHistory.vue'

const PAGE_SIZE = 50
const FILTER_SCAN_MAX_PAGES = 20

// 每页只放 5 条：页数上限判的是"翻了几页"，与每页多少条无关。
// 用满页 50 × 20 页 = 1000 张卡片会把渲染拖到 30s 超时（实测），而判据强度不变。
const SMALL_PAGE = 5

/** 造一页记录：id/title 可区分，便于断言去重与页数 */
function page (prefix, n = SMALL_PAGE, status = 'success') {
  return Array.from({ length: n }, (_, i) => ({
    id: `${prefix}-${i}`,
    title: `${prefix} 记录 ${i}`,
    platform: 'zhihu',
    status,
  }))
}

/**
 * 等补页扫描跑完。
 *
 * 用**真实定时器**而不是假定时器：假定时器下要驱动 20 轮串行 await 必须反复
 * advanceTimersByTimeAsync + flushPromises 上百次（实测直接把用例拖到 60s 超时）。
 * 真实定时器下这些 IPC mock 是立即 resolve 的，扫描本身几十毫秒就结束。
 */
async function settleScan () {
  for (let i = 0; i < 40; i++) {
    await new Promise((r) => setTimeout(r, 20))
    await flushPromises()
  }
}

function mountView () {
  return mount(PublishHistory, { global: { plugins: [i18n] } })
}

describe('M-11：筛选补页扫描的防抖与上限', () => {
  beforeEach(() => {
    i18n.global.locale.value = 'zh'
    vi.clearAllMocks()
    draftListMock.mockResolvedValue({ code: 0, data: [] })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('防抖窗口内不发起补页（撤掉防抖则此条转红）', async () => {
    let seq = 0
    historyListMock.mockImplementation(async () => {
      seq += 1
      return { code: 0, data: { total: 60, records: page(`m${seq}`) } }
    })

    const wrapper = mountView()
    await flushPromises()
    await nextTick()
    const callsAfterMount = historyListMock.mock.calls.length

    // 改完筛选后只推进 100ms —— 仍在 300ms 防抖窗口内。
    // 这一步是判据的关键：必须**推进真实时间但仍小于防抖延迟**才能区分
    // "延迟生效"与"立刻生效"。只 await nextTick() 不够 —— nextTick 是微任务，
    // 连 0ms 定时器都还没轮到，两者表现相同（首版反证因此失败）。
    await wrapper.get('[data-testid="status-filter"]').setValue('failed')
    await new Promise((r) => setTimeout(r, 100))
    await flushPromises()

    expect(
      historyListMock.mock.calls.length,
      '防抖窗口内（改完 100ms）就发起了补页 ⇒ 防抖没生效。' +
      '把 useDebouncedWatchSources 的延迟改成 0 后此条转红'
    ).toBe(callsAfterMount)

    // 越过防抖窗口后必须真的发起（否则就是"永久不触发"，修成了另一种静默失效）
    await settleScan()
    expect(
      historyListMock.mock.calls.length,
      '过了防抖窗口仍未发起补页 ⇒ 防抖把请求吞掉了，功能静默失效'
    ).toBeGreaterThan(callsAfterMount)
    wrapper.unmount()
  })

  it('同一防抖窗口内连改三个条件只走一轮（防抖把多源合并）', async () => {
    // 有上限且永远有更多 ⇒ 一轮扫描 = 恰好 FILTER_SCAN_MAX_PAGES 次。
    // 若三个源各自触发一轮，调用数会是它的倍数，这条就红。
    let seq = 0
    historyListMock.mockImplementation(async () => {
      seq += 1
      return { code: 0, data: { total: 100000, records: page(`n${seq}`) } }
    })

    const wrapper = mountView()
    await flushPromises()
    await nextTick()
    const callsAfterMount = historyListMock.mock.calls.length

    // 三个 setValue 之间不推进时间 ⇒ 都落在同一个 300ms 窗口内
    await wrapper.get('[data-testid="status-filter"]').setValue('failed')
    await wrapper.get('[data-testid="platform-filter"]').setValue('zhihu')
    await wrapper.get('[data-testid="history-search"]').setValue('记录')
    await nextTick()
    await settleScan()

    const scanCalls = historyListMock.mock.calls.length - callsAfterMount
    expect(
      scanCalls,
      '三个筛选条件在同一防抖窗口内连改，却发起了超过一轮的补页扫描 ⇒ ' +
      '多源快照没有合并，用户改 N 个条件仍是 N 轮 IPC'
    ).toBe(FILTER_SCAN_MAX_PAGES)
    wrapper.unmount()
  })

  it('补页页数封顶 20 页（最坏情况从"不限"降到 20 次串行 IPC）', async () => {
    // 永远有更多记录：total 远大于已加载量，且**每页 id 各不相同**。
    // 注意：若每页返回相同 id，组件会按 id 去重 ⇒ addedCount=0 ⇒ 判定已到底而提前
    // 退出 —— 那是去重保护在正常工作，测不到"页数上限"这条路径。
    let seq = 0
    historyListMock.mockImplementation(async () => {
      seq += 1
      return { code: 0, data: { total: 100000, records: page(`big${seq}`) } }
    })

    const wrapper = mountView()
    await flushPromises()
    await nextTick()
    const callsAfterMount = historyListMock.mock.calls.length

    await wrapper.get('[data-testid="history-search"]').setValue('记录')
    await nextTick()
    await settleScan()

    const scanCalls = historyListMock.mock.calls.length - callsAfterMount
    // 反证价值：把 FILTER_SCAN_MAX_PAGES 改成 99999 后这条会转红（且用例会拖到超时，
    // 因为扫描真的会一直翻页）—— 已实测。
    expect(
      scanCalls,
      `补页扫描超过 ${FILTER_SCAN_MAX_PAGES} 页上限 ⇒ 无上限循环没有真的被封顶，` +
      '历史表一大仍会引发上百次串行 IPC'
    ).toBeLessThanOrEqual(FILTER_SCAN_MAX_PAGES)
    // 且必须真的跑满了上限（否则说明是别的原因提前退出，封顶逻辑没被走到）
    expect(
      scanCalls,
      '扫描没有跑满上限 ⇒ 可能在别处提前退出了，"封顶"这条路径实际没被验证'
    ).toBe(FILTER_SCAN_MAX_PAGES)
    wrapper.unmount()
  })

  it('触顶后如实提示"已在已加载 N 条中筛选"，不谎称扫完全表', async () => {
    // 每页 id 各不相同且 total 远大于已加载量 ⇒ 会一直有更多记录，直到页数封顶
    let seq = 0
    historyListMock.mockImplementation(async () => {
      seq += 1
      return { code: 0, data: { total: 100000, records: page(`trunc${seq}`) } }
    })

    const wrapper = mountView()
    await flushPromises()
    await nextTick()

    await wrapper.get('[data-testid="history-search"]').setValue('记录')
    await nextTick()
    await settleScan()

    // 精确断言筛选结果节点，不用整页 text 的子串匹配 —— 页面其他地方也有"已从…"
    // 字样（草稿进入提示等），子串断言会命中无关文案、把这条判据变成噪音。
    const filterText = wrapper.get('.filter-result').text()
    expect(
      filterText.includes('已从'),
      '触顶时仍在用"已从 N 条中筛选"（暗示扫完全表），用户会把"没搜到"误判为"没有这条记录"'
    ).toBe(false)
    expect(
      filterText.includes('已在已加载'),
      '触顶时必须改用"已在已加载 N 条中筛选"，如实说明扫描范围'
    ).toBe(true)
    expect(
      wrapper.get('.filter-truncated').text().includes('已停止继续翻页'),
      '触顶时必须给出可操作提示（补充更具体的筛选条件）'
    ).toBe(true)
    wrapper.unmount()
  })

  it('清空筛选后不再继续补页（防止筛选已取消仍在翻表）', async () => {
    // 每页 id 各不相同、永远有更多 ⇒ 不清空的话会一直翻到上限
    let seq = 0
    historyListMock.mockImplementation(async () => {
      seq += 1
      return { code: 0, data: { total: 100000, records: page(`c${seq}`) } }
    })

    const wrapper = mountView()
    await flushPromises()
    await nextTick()
    const callsAfterMount = historyListMock.mock.calls.length

    // 起一个筛选让扫描开始
    await wrapper.get('[data-testid="history-search"]').setValue('记录')
    await nextTick()
    // 只等一小会儿：扫描进行中
    await new Promise((r) => setTimeout(r, 150))
    await flushPromises()
    const midScan = historyListMock.mock.calls.length

    // 用户清空筛选 —— 扫描必须停下来，而不是继续翻完 20 页
    await wrapper.get('[data-testid="history-search"]').setValue('')
    await nextTick()
    await settleScan()

    const afterClear = historyListMock.mock.calls.length
    expect(
      afterClear - midScan,
      '清空筛选后仍在持续补页 ⇒ 扫描没有感知到筛选已取消。' +
      '用户清空了搜索框，后台还在串行翻表，既浪费 IPC 也会让列表内容继续变化'
    ).toBeLessThan(FILTER_SCAN_MAX_PAGES)

    // 且触顶提示必须复位（筛选都没了，不该再说"已停止继续翻页"）
    expect(
      wrapper.find('.filter-truncated').exists(),
      '筛选已清空却仍显示截断提示 ⇒ filterScanTruncated 没有复位'
    ).toBe(false)
    wrapper.unmount()
  })

  it('反证：未触顶时用"已从 N 条中筛选"（防判据被写反）', async () => {
    // total=60，首页 50 ⇒ 补一页就到底，不会触顶
    historyListMock
      .mockResolvedValueOnce({ code: 0, data: { total: 60, records: page('a', PAGE_SIZE) } })
      .mockResolvedValueOnce({ code: 0, data: { total: 60, records: page('b', 10) } })

    const wrapper = mountView()
    await flushPromises()
    await nextTick()

    await wrapper.get('[data-testid="history-search"]').setValue('记录')
    await nextTick()
    await settleScan()

    const filterText = wrapper.get('.filter-result').text()
    const truncated = wrapper.find('.filter-truncated')
    expect(
      filterText.includes('已从'),
      '扫描完整时应当显示"已从 N 条中筛选"——若这条也变成"已在已加载"，' +
      '说明触顶判据恒真，正常路径被误标为截断'
    ).toBe(true)
    expect(filterText.includes('已在已加载')).toBe(false)
    expect(truncated.exists(), '未触顶时不该出现截断提示').toBe(false)
    wrapper.unmount()
  })
})
