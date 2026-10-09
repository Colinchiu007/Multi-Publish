// M-15：Accounts 账号卡片网格的渲染截断回归测试。
//
// 背景：visibleAccounts computed 原先 filter 后全量返回，账号数增长后
// 一次挂载数百张重组件卡片必然劣化。加 slice(0, 48) 截断 + 「加载更多」。
//
// store mock 形态与 Accounts.test.js 对齐（补齐组件用到的全部方法/属性），
// 但账号数量注入 60 个（> 默认渲染上限 48）。
//
//   pnpm exec vitest run src/views/accounts-truncation.test.js

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import { createPinia } from 'pinia'
import i18n from '@/i18n'

const manyAccounts = Array.from({ length: 60 }, (_, i) => ({
  id: `acc-${i}`,
  platform: 'douyin',
  status: i % 2 === 0 ? 'active' : 'inactive',
  account_name: `账号${i}`,
  nickname: `账号${i}`,
}))

vi.mock('@/composables/useLoginGate', () => ({
  useLoginGate: () => ({ ensureLogin: vi.fn(async () => true) }),
}))

vi.mock('@/stores/accounts', () => ({
  useAccountStore: () => ({
    accounts: manyAccounts,
    loading: false,
    error: null,
    errorCode: null,
    searchQuery: '',
    filterStatus: 'all',
    filterPlatform: '',
    sortBy: 'name',
    sortOrder: 'asc',
    selectedIds: new Set(),
    isAllSelected: false,
    favoriteIds: new Set(),
    groups: [],
    get accountsBeforePlatformFilter() { return manyAccounts },
    loadGroups: vi.fn(),
    toggleSelect: vi.fn(),
    selectAll: vi.fn(),
    clearSelection: vi.fn(),
    batchDelete: vi.fn().mockResolvedValue({ success: 0, failed: 0 }),
    batchSetActive: vi.fn().mockResolvedValue({ success: 0, failed: 0 }),
    createGroup: vi.fn(),
    deleteGroup: vi.fn(),
    renameGroup: vi.fn().mockReturnValue(true),
    getGroupAccounts: vi.fn().mockReturnValue([]),
    getDefault: vi.fn(),
    setDefault: vi.fn().mockResolvedValue({ code: 0 }),
    renameAccount: vi.fn().mockResolvedValue({ code: 0 }),
    toggleFavorite: vi.fn(),
    toggleAccountInGroup: vi.fn(),
    load: vi.fn(async () => {}),
    refresh: vi.fn(async () => {}),
  }),
}))

vi.mock('@/api/publisher', () => ({
  draftList: vi.fn(async () => ({ code: 0, data: [] })),
  getPlatformDefinitions: vi.fn(async () => ({ code: 0, data: [] })),
  listAccounts: vi.fn().mockResolvedValue({ code: 0, data: [] }),
  accountBatchCheckLogin: vi.fn().mockResolvedValue({ code: 0, data: { results: [], checkedAt: null } }),
  // AccountCloudSyncDialog 挂载链路需要（条件渲染，但 vi.mock 必须一次给全）
  accountsCloudDigest: vi.fn().mockResolvedValue({ code: -1, message: 'stub' }),
  accountsCloudSync: vi.fn().mockResolvedValue({ code: -1, message: 'stub' }),
  accountsCloudDisconnect: vi.fn().mockResolvedValue({ code: -1, message: 'stub' }),
  accountsCloudSyncAbort: vi.fn().mockResolvedValue({ code: 0 }),
  onAccountsCloudSyncProgress: vi.fn(() => () => {}),
  onAuthViewOpened: vi.fn(() => () => {}),
  onAuthCompleted: vi.fn(() => () => {}),
  onAuthViewClosed: vi.fn(() => () => {}),
  onQrCodeOpened: vi.fn(() => () => {}),
  onQrCodeCompleted: vi.fn(() => () => {}),
  onQrCodeClosed: vi.fn(() => () => {}),
  onQrCodeDetected: vi.fn(() => () => {}),
  onAccountStatusChanged: vi.fn(() => () => {}),
  onAccountAdded: vi.fn(() => () => {}),
  onAccountRemoved: vi.fn(() => () => {}),
  onAccountUpdated: vi.fn(() => () => {}),
  onAccountLoginSucceeded: vi.fn(() => () => {}),
  onQrCodeLoginError: vi.fn(() => () => {}),
  onAccountBatchCheckLoginProgress: vi.fn(() => () => {}),
  onAccountsSynced: vi.fn(() => () => {}),
  authOpenLogin: vi.fn().mockResolvedValue({ code: 0 }),
  authOpenQrCodeLogin: vi.fn().mockResolvedValue({ code: 0 }),
  authClose: vi.fn().mockResolvedValue({ code: 0 }),
  authQrCodeClose: vi.fn().mockResolvedValue({ code: 0 }),
  authCompleteLogin: vi.fn().mockResolvedValue({ code: 0, data: true }),
  accountAdd: vi.fn().mockResolvedValue({ code: 0 }),
  accountDelete: vi.fn().mockResolvedValue({ code: 0 }),
  accountSetDefault: vi.fn().mockResolvedValue({ code: 0 }),
  accountUpdate: vi.fn().mockResolvedValue({ code: 0 }),
}))

vi.mock('@/api/services', () => ({
  servicesGetStatus: vi.fn(async () => ({ code: 0, data: [] })),
}))

vi.mock('vue-router', () => ({
  useRoute: () => ({ query: {} }),
  useRouter: () => ({ push: vi.fn() }),
}))

import Accounts from './Accounts.vue'

function mountView () {
  return mount(Accounts, { global: { plugins: [createPinia(), i18n] } })
}

describe('M-15：Accounts 账号卡片渲染截断', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('超过 48 个账号时只渲染前 48 张卡片，并显示截断提示与加载更多', async () => {
    const w = mountView()
    await nextTick()
    await nextTick()

    const grid = w.find('.account-card-grid')
    expect(grid.exists()).toBe(true)
    const rendered = grid.findAll('.account-card').length
    expect(rendered, `应只渲染 48 张卡片，实际 ${rendered}`).toBe(48)
    expect(
      w.find('[data-testid="load-more"]').exists(),
      '有未渲染账号时必须出现「加载更多」按钮'
    ).toBe(true)
    expect(w.text()).toContain('共 60 个账号')
    w.unmount()
  })

  it('点击「加载更多」后渲染数量增加', async () => {
    const w = mountView()
    await nextTick()
    await nextTick()
    const before = w.find('.account-card-grid').findAll('.account-card').length
    expect(before, '前置：初始应截断在 48 张').toBe(48)

    // LoadMoreRow 是 props/emit 组件：点它的按钮会 emit 'more' ⇒ Accounts.loadMoreAccounts
    await w.find('[data-testid="load-more"]').trigger('click')
    await nextTick()
    await nextTick()
    const after = w.find('.account-card-grid').findAll('.account-card').length
    expect(after, '加载更多后渲染数量应增加（48 → 96 上限，账号共 60 ⇒ 渲染 60）').toBe(60)
    // 加载完全部后「加载更多」消失
    expect(w.find('[data-testid="load-more"]').exists()).toBe(false)
    w.unmount()
  })

  it('反证：渲染上限调到超过总数（等于不截断）时，截断提示必须消失', async () => {
    const w = mountView()
    await nextTick()
    // 把渲染上限拉到超过总数 —— 等于退回"全量渲染"旧行为
    w.vm.accountsRenderLimit = 1000
    await nextTick()
    expect(
      w.find('[data-testid="load-more"]').exists(),
      '渲染上限覆盖全部账号后不得再显示「加载更多」——若仍显示说明截断判据失效'
    ).toBe(false)
    w.unmount()
  })
})
