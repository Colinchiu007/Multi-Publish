// @ts-check
const path = require('path')
const fs = require('fs')
import { describe, it, expect } from 'vitest'
import { beforeEach, afterEach } from 'vitest'

/**
 * RED 复现（2026-09-12 bug 反思）：SPLITTER_DIR 回退路径解析层级错误。
 *
 * Bug 链条：splitter-bridge.js 的 SPLITTER_DIR 默认值
 *   path.join(__dirname, '..', '..', '..', 'packages', 'smart-sentence-splitter')
 * 从 electron/services/ 出发只回退 2 层到 apps/，拼出 apps/packages/...（不存在）。
 * Windows 上 spawn 的 cwd 不存在 → ENOENT（错误信息伪装成"python 不存在"）
 * → smart-sentence-splitter 降级 → 字幕分句质量差。
 *
 * 本测试锁定：SPLITTER_DIR 必须指向真实存在的目录（开发形态=仓库根下或回退 cwd；
 * 打包形态=extraResources 或回退 cwd），且任何情况下 spawn cwd 不能是不存在的路径。
 */
describe('SplitterBridge SPLITTER_DIR 存在性契约（bug 反思回归）', () => {
  // 清除环境变量保证测试默认路径
  const savedDir = process.env.SPLITTER_DIR
  beforeEach(() => { delete process.env.SPLITTER_DIR })
  afterEach(() => { if (savedDir !== undefined) process.env.SPLITTER_DIR = savedDir })

  it('resolveSplitterDir() 必须返回真实存在的目录（开发环境）', () => {
    const { resolveSplitterDir } = require('./splitter-bridge')
    const resolved = resolveSplitterDir()
    // 契约：无论哪种形态，目录必须存在；不存在则 spawn 必然 ENOENT
    expect(typeof resolved).toBe('string')
    expect(fs.existsSync(resolved)).toBe(true)
  })

  it('SPLITTER_DIR 模块级导出必须真实存在', () => {
    const { SPLITTER_DIR } = require('./splitter-bridge')
    expect(fs.existsSync(SPLITTER_DIR)).toBe(true)
  })

  it('旧解析路径（少退一层）在本仓库中不存在——锁定 bug 形态', () => {
    // bug 形态：apps/packages/smart-sentence-splitter（错误层级）
    const buggy = path.join(__dirname, '..', '..', 'packages', 'smart-sentence-splitter')
    // 该路径在仓库中不应存在（如果存在说明测试环境变了，需重新校验假设）
    expect(fs.existsSync(buggy)).toBe(false)
  })
})
