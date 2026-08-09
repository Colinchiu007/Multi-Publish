// @ts-check
/**
 * window-close-policy.test.js — 窗口关闭行为平台策略单测（macOS 前瞻）
 *
 * 覆盖：macOS 不拦截（系统约定关闭窗口不退出应用）、
 * Windows/Linux 运行任务+托盘可用才隐藏到托盘、任一缺失不拦截。
 */
import { describe, it, expect } from 'vitest'

const { shouldHideToTrayOnClose } = require('./window-close-policy')

describe('window-close-policy — 平台窗口关闭策略', () => {
  it('macOS：即使有运行任务且托盘可用也不隐藏到托盘（窗口正常关闭，进程留在 Dock）', () => {
    expect(shouldHideToTrayOnClose({
      platform: 'darwin',
      hasRunningPipeline: true,
      trayAvailable: true,
    })).toBe(false)
    expect(shouldHideToTrayOnClose({
      platform: 'darwin',
      hasRunningPipeline: true,
      trayAvailable: false,
    })).toBe(false)
  })

  it('Windows：运行任务 + 托盘可用 → 隐藏到托盘后台继续', () => {
    expect(shouldHideToTrayOnClose({
      platform: 'win32',
      hasRunningPipeline: true,
      trayAvailable: true,
    })).toBe(true)
  })

  it('Windows：运行任务但托盘不可用 → 不拦截（避免窗口关闭后进程无法恢复）', () => {
    expect(shouldHideToTrayOnClose({
      platform: 'win32',
      hasRunningPipeline: true,
      trayAvailable: false,
    })).toBe(false)
  })

  it('Windows：无运行任务 → 不拦截（照旧关闭退出）', () => {
    expect(shouldHideToTrayOnClose({
      platform: 'win32',
      hasRunningPipeline: false,
      trayAvailable: true,
    })).toBe(false)
  })

  it('Linux 等非 darwin 平台与 Windows 同策略', () => {
    expect(shouldHideToTrayOnClose({
      platform: 'linux',
      hasRunningPipeline: true,
      trayAvailable: true,
    })).toBe(true)
    expect(shouldHideToTrayOnClose({
      platform: 'linux',
      hasRunningPipeline: true,
      trayAvailable: false,
    })).toBe(false)
  })

  it('缺省参数安全（默认不拦截）', () => {
    expect(shouldHideToTrayOnClose()).toBe(false)
    expect(shouldHideToTrayOnClose({ platform: 'win32' })).toBe(false)
  })
})
