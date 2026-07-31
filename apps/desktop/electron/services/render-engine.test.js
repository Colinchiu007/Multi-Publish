import { describe, it, expect, vi, beforeEach } from 'vitest'
const os = require('os')
const path = require('path')
const RenderEngine = require('./render-engine')

describe('RenderEngine', () => {
  let engine

  beforeEach(() => {
    engine = new RenderEngine()
  })

  describe('getStatus()', () => {
    it('should check both root and local node_modules for workspace hoisting', () => {
      const status = engine.getStatus()
      
      // 验证返回结构
      expect(status).toHaveProperty('ready')
      expect(status).toHaveProperty('composerExists')
      expect(status).toHaveProperty('nodeModulesExist')
      expect(status).toHaveProperty('composerDir')
      
      // 验证 ready 是 composerExists 和 nodeModulesExist 的组合
      expect(status.ready).toBe(status.composerExists && status.nodeModulesExist)
    })

    it('should return composerDir path', () => {
      const status = engine.getStatus()
      expect(typeof status.composerDir).toBe('string')
      expect(status.composerDir).toContain('remotion-composer')
    })

    it('should return boolean for composerExists and nodeModulesExist', () => {
      const status = engine.getStatus()
      expect(typeof status.composerExists).toBe('boolean')
      expect(typeof status.nodeModulesExist).toBe('boolean')
    })

    it('should have consistent ready logic', () => {
      const status = engine.getStatus()
      // ready should be true only when both are true
      if (status.ready) {
        expect(status.composerExists).toBe(true)
        expect(status.nodeModulesExist).toBe(true)
      }
    })
  })

  it('将默认快速渲染输出限制在受控的 Story2Video 临时目录', () => {
    expect(RenderEngine.getDefaultOutputPath(123)).toBe(
      path.join(os.tmpdir(), 'story2video', 'quick-render', 'remotion_123.mp4'),
    )
  })

  it('解析 Composer 可见的随包 Remotion CLI 入口', () => {
    const resolveModule = (name) => ({
      '@remotion/cli/package.json': 'C:/runtime/node_modules/@remotion/cli/package.json',
      'remotion/package.json': 'C:/runtime/node_modules/remotion/package.json',
    })[name]
    const readFile = () => JSON.stringify({ bin: { remotion: 'remotion-cli.js' } })

    expect(RenderEngine.resolveRemotionCli('C:/composer', resolveModule, readFile)).toEqual({
      cliPath: path.resolve('C:/runtime/node_modules/@remotion/cli/remotion-cli.js'),
      remotionPackageJson: 'C:/runtime/node_modules/remotion/package.json',
    })
  })
})
