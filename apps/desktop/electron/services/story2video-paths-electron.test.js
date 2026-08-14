/**
 * story2video-paths 的 Electron 白名单测试。
 * 纯 Node 测试无法 mock require('electron')（该包在 Node 下导出二进制路径字符串），
 * 按仓库惯例通过依赖注入 app 实现验证白名单构成。
 */
import { describe, it, expect } from 'vitest'
import path from 'path'

const { getElectronMediaRoots, getAllowedMediaRoots } = require('./story2video-paths')

describe('Story2Video 媒体白名单（Electron 环境）', () => {
  const userData = 'C:/Users/mock/AppData/Roaming/Multi-Publish'
  const mockApp = { getPath: (name) => (name === 'userData' ? userData : undefined) }

  it('Electron userData 根目录包含项目目录与 BGM 素材库目录', () => {
    const roots = getElectronMediaRoots(mockApp)
    expect(roots).toContain(path.join(userData, 'story2video-projects'))
    expect(roots).toContain(path.join(userData, 'story2video-bgm'))
  })

  it('未注入 app 时（纯 Node）不抛错且不产生白名单根', () => {
    expect(() => getAllowedMediaRoots()).not.toThrow()
    expect(getElectronMediaRoots(undefined)).toEqual([])
  })
})
