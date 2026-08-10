// @ts-check
/**
 * useOpsCenterSync.test.js — 运营后台同步 composable 测试
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

const apiMock = {
  opsCenterSyncGet: vi.fn(),
  opsCenterSyncSave: vi.fn(),
  opsCenterSyncNow: vi.fn(),
}

vi.mock('@/api/ops-center-sync', function () {
  return {
    opsCenterSyncGet: function () { return apiMock.opsCenterSyncGet() },
    opsCenterSyncSave: function (p) { return apiMock.opsCenterSyncSave(p) },
    opsCenterSyncNow: function () { return apiMock.opsCenterSyncNow() },
  }
})

vi.mock('element-plus', function () {
  return {
    ElMessage: { success: vi.fn(), error: vi.fn(), warning: vi.fn() },
    ElMessageBox: { confirm: vi.fn(() => Promise.resolve()) },
  }
})

import { useOpsCenterSync } from '../composables/useOpsCenterSync'

describe('useOpsCenterSync', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('loadSyncConfig 填充配置且不暴露明文 Key', async () => {
    apiMock.opsCenterSyncGet.mockResolvedValue({
      code: 0,
      config: { url: 'https://ops.example.com', apiKeyConfigured: true, autoSync: true, lastSyncedAt: '2026-08-10T08:00:00.000Z' },
    })
    const s = useOpsCenterSync()
    await s.loadSyncConfig()
    expect(s.syncUrl.value).toBe('https://ops.example.com')
    expect(s.syncApiKey.value).toBe('')
    expect(s.syncApiKeyConfigured.value).toBe(true)
    expect(s.syncConfigured.value).toBe(true)
    expect(s.lastSyncedAt.value).toBe('2026-08-10T08:00:00.000Z')
    expect(s.formatLastSync('2026-08-10T08:00:00.000Z')).toBeTruthy()
  })

  it('IPC 不可用时 fail-closed（不抛错，保持空状态）', async () => {
    apiMock.opsCenterSyncGet.mockResolvedValue({ code: -1, message: 'electronAPI not available', config: null })
    const s = useOpsCenterSync()
    const res = await s.loadSyncConfig()
    expect(res.code).toBe(-1)
    expect(s.syncConfigured.value).toBe(false)
    expect(s.syncUrl.value).toBe('')
  })

  it('saveSyncConfig 成功时清空输入 Key 并更新状态', async () => {
    apiMock.opsCenterSyncSave.mockResolvedValue({
      code: 0,
      config: { url: 'https://ops.example.com', apiKeyConfigured: true, autoSync: false, lastSyncedAt: '' },
    })
    const s = useOpsCenterSync()
    s.syncUrl.value = 'https://ops.example.com'
    s.syncApiKey.value = 'secret'
    s.syncAutoSync.value = true
    const res = await s.saveSyncConfig()
    expect(res.code).toBe(0)
    expect(s.syncApiKey.value).toBe('')
    expect(s.syncAutoSync.value).toBe(false)
    expect(s.syncConfigured.value).toBe(true)
    expect(apiMock.opsCenterSyncSave).toHaveBeenCalledWith({ url: 'https://ops.example.com', apiKey: 'secret', autoSync: true })
  })

  it('saveSyncConfig 失败时提示错误并返回 code -1', async () => {
    apiMock.opsCenterSyncSave.mockResolvedValue({ code: -1, message: 'URL 非法' })
    const s = useOpsCenterSync()
    const res = await s.saveSyncConfig()
    expect(res.code).toBe(-1)
  })

  it('runSyncNow 先持久化表单再同步：成功显示条数、失败显示错误', async () => {
    apiMock.opsCenterSyncSave.mockResolvedValue({
      code: 0,
      config: { url: 'https://ops.example.com', apiKeyConfigured: true, autoSync: true, lastSyncedAt: '' },
    })
    apiMock.opsCenterSyncNow.mockResolvedValue({ code: 0, updated: 3, syncedAt: '2026-08-10T08:01:00.000Z' })
    const s = useOpsCenterSync()
    s.syncUrl.value = 'https://ops.example.com'
    s.syncApiKey.value = 'k'
    const res = await s.runSyncNow()
    expect(res.code).toBe(0)
    // 先保存（携带表单 URL/Key/autoSync），再触发同步
    expect(apiMock.opsCenterSyncSave).toHaveBeenCalledWith({ url: 'https://ops.example.com', apiKey: 'k', autoSync: true })
    expect(apiMock.opsCenterSyncNow).toHaveBeenCalledTimes(1)
    expect(s.syncStatus.value).toContain('3 个服务商')
    expect(s.lastSyncedAt.value).toBe('2026-08-10T08:01:00.000Z')

    // 保存失败则中止同步
    apiMock.opsCenterSyncSave.mockResolvedValue({ code: -1, message: 'URL 非法' })
    const s2 = useOpsCenterSync()
    const res2 = await s2.runSyncNow()
    expect(res2.code).toBe(-1)
    expect(s2.syncError.value).toContain('URL 非法')

    // 同步失败显示映射错误
    apiMock.opsCenterSyncSave.mockResolvedValue({
      code: 0,
      config: { url: 'https://ops.example.com', apiKeyConfigured: true, autoSync: true, lastSyncedAt: '' },
    })
    apiMock.opsCenterSyncNow.mockResolvedValue({ code: -1, message: 'API Key 无效（401/403）' })
    const s3 = useOpsCenterSync()
    const res3 = await s3.runSyncNow()
    expect(res3.code).toBe(-1)
    expect(s3.syncError.value).toContain('401/403')
  })

  it('导出完整性：模板所需属性全部存在', () => {
    const s = useOpsCenterSync()
    for (const key of ['syncUrl', 'syncApiKey', 'syncApiKeyConfigured', 'syncAutoSync', 'lastSyncedAt', 'syncing', 'syncStatus', 'syncError', 'syncConfigured', 'formatLastSync', 'loadSyncConfig', 'saveSyncConfig', 'runSyncNow']) {
      expect(s).toHaveProperty(key)
    }
  })
})
