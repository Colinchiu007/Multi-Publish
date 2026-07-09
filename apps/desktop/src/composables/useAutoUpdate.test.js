// @ts-check
/**
 * useAutoUpdate.test.js — 自动更新 composable 测试（Phase 4.1 TDD）
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// mock @/api/publisher 的 4 个更新方法
vi.mock('@/api/publisher', function () {
  return {
    onUpdateStatus: vi.fn(function (cb) {
      // 模拟返回 cancel 函数
      return function cancel() { /* noop */ }
    }),
    updateCheck: vi.fn(function () { return Promise.resolve() }),
    updateDownload: vi.fn(function () { return Promise.resolve() }),
    updateInstall: vi.fn(function () { return Promise.resolve() }),
  }
})

import {
  formatSpeed,
  useAutoUpdate,
} from '../composables/useAutoUpdate'
import { onUpdateStatus, updateCheck, updateDownload, updateInstall } from '@/api/publisher'

// ─── 纯函数测试 ────────────────────────────────────────
describe('useAutoUpdate — formatSpeed 纯函数', () => {
  it('null/undefined/0 返回空字符串', () => {
    expect(formatSpeed(null)).toBe('')
    expect(formatSpeed(undefined)).toBe('')
    expect(formatSpeed(0)).toBe('')
  })

  it('< 1KB 返回 B/s', () => {
    expect(formatSpeed(512)).toBe('512 B/s')
  })

  it('1KB - 1MB 返回 KB/s', () => {
    expect(formatSpeed(2048)).toBe('2.0 KB/s')
    expect(formatSpeed(10240)).toBe('10.0 KB/s')
  })

  it('> 1MB 返回 MB/s', () => {
    expect(formatSpeed(2 * 1024 * 1024)).toBe('2.0 MB/s')
    expect(formatSpeed(2.5 * 1024 * 1024)).toBe('2.5 MB/s')
  })

  it('= 1MB 边界返回 KB/s（原始逻辑严格 >）', () => {
    expect(formatSpeed(1024 * 1024)).toBe('1024.0 KB/s')
  })
})

// ─── composable setup 测试 ────────────────────────────
describe('useAutoUpdate — composable setup', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('返回响应式状态和方法', () => {
    const r = useAutoUpdate()
    expect(r.showUpdateDialog).toBeDefined()
    expect(r.updateStatus).toBeDefined()
    expect(r.updateInfo).toBeDefined()
    expect(r.downloading).toBeDefined()
    expect(r.downloadPercent).toBeDefined()
    expect(r.downloadSpeed).toBeDefined()
    expect(r.showNotAvailable).toBeDefined()
    expect(r.showError).toBeDefined()
    expect(r.updateError).toBeDefined()
    expect(typeof r.handleUpdateStatus).toBe('function')
    expect(typeof r.handleDownload).toBe('function')
    expect(typeof r.handleInstall).toBe('function')
    expect(typeof r.start).toBe('function')
    expect(typeof r.cleanup).toBe('function')
  })

  it('初始状态：showUpdateDialog=false, updateStatus=null', () => {
    const r = useAutoUpdate()
    expect(r.showUpdateDialog.value).toBe(false)
    expect(r.updateStatus.value).toBeNull()
    expect(r.downloading.value).toBe(false)
    expect(r.downloadPercent.value).toBe(0)
  })

  it('handleUpdateStatus(null) 不抛错', () => {
    const r = useAutoUpdate()
    expect(function () { r.handleUpdateStatus(null) }).not.toThrow()
    expect(r.updateStatus.value).toBeNull()
  })

  it('handleUpdateStatus type=available 显示对话框', () => {
    const r = useAutoUpdate()
    r.handleUpdateStatus({ type: 'available', data: { version: '2.0.0' } })
    expect(r.updateStatus.value).toBe('available')
    expect(r.updateInfo.value).toEqual({ version: '2.0.0' })
    expect(r.showUpdateDialog.value).toBe(true)
  })

  it('handleUpdateStatus type=downloading 更新进度', () => {
    const r = useAutoUpdate()
    r.handleUpdateStatus({ type: 'downloading', data: { percent: 50, bytesPerSecond: 2048 } })
    expect(r.updateStatus.value).toBe('downloading')
    expect(r.downloading.value).toBe(true)
    expect(r.downloadPercent.value).toBe(50)
    expect(r.downloadSpeed.value).toBe('2.0 KB/s')
  })

  it('handleUpdateStatus type=downloaded 完成下载', () => {
    const r = useAutoUpdate()
    r.handleUpdateStatus({ type: 'downloaded', data: {} })
    expect(r.updateStatus.value).toBe('downloaded')
    expect(r.downloading.value).toBe(false)
    expect(r.downloadPercent.value).toBe(100)
    expect(r.showUpdateDialog.value).toBe(true)
  })

  it('handleUpdateStatus type=error 显示错误', () => {
    const r = useAutoUpdate()
    r.handleUpdateStatus({ type: 'error', data: '网络失败' })
    expect(r.updateStatus.value).toBe('error')
    expect(r.updateError.value).toBe('网络失败')
    expect(r.showError.value).toBe(true)
    expect(r.showUpdateDialog.value).toBe(false)
    expect(r.downloading.value).toBe(false)
  })

  it('handleUpdateStatus type=error 无 data 时使用默认错误消息', () => {
    const r = useAutoUpdate()
    r.handleUpdateStatus({ type: 'error' })
    expect(r.updateError.value).toBe('未知错误')
  })

  it('handleUpdateStatus type=not-available 显示通知（对话框未开时）', () => {
    const r = useAutoUpdate()
    r.handleUpdateStatus({ type: 'not-available' })
    expect(r.updateStatus.value).toBe('not-available')
    expect(r.showNotAvailable.value).toBe(true)
  })

  it('handleUpdateStatus type=not-available 对话框已开时不显示通知', () => {
    const r = useAutoUpdate()
    r.showUpdateDialog.value = true
    r.handleUpdateStatus({ type: 'not-available' })
    expect(r.showNotAvailable.value).toBe(false)
  })

  it('handleUpdateStatus type=not-available 4 秒后自动隐藏', () => {
    const r = useAutoUpdate()
    r.handleUpdateStatus({ type: 'not-available' })
    expect(r.showNotAvailable.value).toBe(true)
    vi.advanceTimersByTime(4000)
    expect(r.showNotAvailable.value).toBe(false)
  })

  it('handleDownload 调用 updateDownload API', async () => {
    const r = useAutoUpdate()
    r.handleDownload()
    expect(r.downloading.value).toBe(true)
    expect(updateDownload).toHaveBeenCalledTimes(1)
    await Promise.resolve()
  })

  it('handleDownload API 失败时显示错误', async () => {
    updateDownload.mockRejectedValueOnce(new Error('下载失败'))
    const r = useAutoUpdate()
    await r.handleDownload()
    expect(r.updateError.value).toBe('下载失败')
    expect(r.showError.value).toBe(true)
    expect(r.downloading.value).toBe(false)
  })

  it('handleDownload API 失败无 message 时使用默认', async () => {
    updateDownload.mockRejectedValueOnce({})
    const r = useAutoUpdate()
    await r.handleDownload()
    expect(r.updateError.value).toBe('下载失败')
  })

  it('handleInstall 调用 updateInstall API', () => {
    const r = useAutoUpdate()
    r.handleInstall()
    expect(updateInstall).toHaveBeenCalledTimes(1)
  })

  it('start 注册 onUpdateStatus 监听 + 3 秒后 updateCheck', () => {
    const r = useAutoUpdate()
    r.start()
    expect(onUpdateStatus).toHaveBeenCalledTimes(1)
    expect(r._cancelUpdateListen).toBeDefined()
    vi.advanceTimersByTime(3000)
    expect(updateCheck).toHaveBeenCalledTimes(1)
  })

  it('cleanup 调用 cancel 函数', () => {
    const r = useAutoUpdate()
    r.start()
    // _cancelUpdateListen 是闭包变量，通过 start 后再 cleanup 不抛错间接验证
    expect(function () { r.cleanup() }).not.toThrow()
  })

  it('start 可重入（cleanup 后再 start 注册新监听）', () => {
    const r = useAutoUpdate()
    r.start()
    r.cleanup()
    r.start()
    expect(onUpdateStatus).toHaveBeenCalledTimes(2)
  })

  it('cleanup 无监听时不抛错', () => {
    const r = useAutoUpdate()
    expect(function () { r.cleanup() }).not.toThrow()
  })
})
