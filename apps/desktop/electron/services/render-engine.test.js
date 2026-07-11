import { describe, it, expect, vi, beforeEach } from 'vitest'
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
  })
})
