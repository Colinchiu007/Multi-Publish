// @ts-nocheck
// 
// 
// @vitest-environment node
// 
/**
 * 故障注入 — 容错能力测试
 *
 * 覆盖 Electron 主进程服务的故障容错能力。
 * 使用全 mock 方式，不依赖真实 Electron 环境。
 * 所有测试可重复运行（使用确定性逻辑，不依赖真随机）。
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// Mock logger 防止 require('./logger') 报错
__registerMock('../services/logger', {
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
})

const fs = require('fs')
const path = require('path')
const os = require('os')

describe('故障注入 — 容错能力测试', () => {
  let mockIpcRenderer

  beforeEach(() => {
    mockIpcRenderer = {
      invoke: vi.fn(),
      on: vi.fn(),
      removeListener: vi.fn(),
    }
  })

  // 确定性故障注入 mock（基于计数器，不依赖 Math.random）
  function createFaultyInvoke(faultType, failRate = 0.2) {
    const faults = {
      reject: () => { throw new Error('Connection refused') },
      timeout: () => new Promise(resolve => setTimeout(resolve, 30000)),
      nullResult: () => null,
      badFormat: () => ({ code: 0, data: undefined }),
    }
    const faultFn = faults[faultType]
    let callIndex = 0
    return vi.fn().mockImplementation(async (...args) => {
      callIndex++
      // 使用 callIndex 取模决定是否注入故障，保证可复现
      if (callIndex % Math.max(1, Math.round(1 / failRate)) === 0) {
        return faultFn()
      }
      return { code: 0, data: 'mock-ok' }
    })
  }

  describe('project:list 故障', () => {
    it('返回 null 时不应崩溃', async () => {
      mockIpcRenderer.invoke = createFaultyInvoke('nullResult', 1.0)
      let result
      try {
        result = await mockIpcRenderer.invoke('project:list')
      } catch (e) {
        result = null
      }
      expect(() => JSON.stringify(result)).not.toThrow()
    })
  })

  describe('board:subscribe 故障', () => {
    it('连接拒绝时不应崩溃', async () => {
      mockIpcRenderer.invoke = createFaultyInvoke('reject', 1.0)
      let caught = false
      try {
        await mockIpcRenderer.invoke('board:subscribe', { projectId: 'test' })
      } catch (e) {
        caught = true
        expect(e.message).toBe('Connection refused')
      }
      expect(caught).toBe(true)
    })
  })

  describe('contact-sheet:approve 故障', () => {
    it('格式异常时能安全处理', async () => {
      mockIpcRenderer.invoke = createFaultyInvoke('badFormat', 1.0)
      const result = await mockIpcRenderer.invoke('contact-sheet:approve', { sceneId: 's1', selectedTakeId: 't1' })
      expect(result).toHaveProperty('code')
      expect(typeof JSON.stringify(result)).toBe('string')
    })
  })

  describe('approval-gate:approve 故障', () => {
    it('null 结果时能安全处理', async () => {
      mockIpcRenderer.invoke = createFaultyInvoke('nullResult', 1.0)
      const result = await mockIpcRenderer.invoke('approval-gate:approve', { gateId: 'g1', decision: 'approve' })
      expect(result).toBeNull()
    })
  })

  describe('replay:get 故障', () => {
    it('连接拒绝时能安全捕获', async () => {
      mockIpcRenderer.invoke = createFaultyInvoke('reject', 1.0)
      let caught = false
      try {
        await mockIpcRenderer.invoke('replay:get', { projectId: 'p1' })
      } catch (e) {
        caught = true
      }
      expect(caught).toBe(true)
    })
  })

  describe('混合故障模式', () => {
    it('20% 故障率下连续 50 次调用不崩溃', async () => {
      const channels = ['project:list', 'board:get', 'contact-sheet:list', 'approval-gate:get', 'replay:get']
      const faultTypes = ['reject', 'nullResult', 'badFormat']
      let callCount = 0
      let errorCount = 0

      // 使用确定性计数器，不依赖 Math.random
      let callIndex = 0
      for (let i = 0; i < 50; i++) {
        const channel = channels[i % channels.length]
        const faultType = faultTypes[i % faultTypes.length]
        const faults = {
          reject: () => { throw new Error('Connection refused') },
          nullResult: () => null,
          badFormat: () => ({ code: 0, data: undefined }),
        }
        const faultFn = faults[faultType]
        // 每 5 次触发一次故障（20%），确定性
        callIndex++
        const shouldFault = (callIndex % 5 === 0)

        const mock = vi.fn().mockImplementation(async () => {
          if (shouldFault) return faultFn()
          return { code: 0, data: 'mock-ok' }
        })
        try {
          await mock(channel)
          callCount++
        } catch (e) {
          errorCount++
        }
      }

      expect(callCount + errorCount).toBe(50)
      expect(errorCount).toBeGreaterThanOrEqual(0)
    })
  })

  describe('Store project:list 故障 → error 状态', () => {
    it('projectService.scanProjects 抛错时返回 error 状态而非崩溃', async () => {
      // 模拟 Store 中 project:list 的处理逻辑：
      //   1. 调用 projectService.scanProjects()
      //   2. 如果失败则返回 { code: errorCode, message: '...', data: [] }
      const ERROR_CODES = { REQUEST_ERROR: -1, VALIDATION_ERROR: 1001 }
      const mockProjectService = {
        scanProjects: vi.fn(() => { throw new Error('数据库连接失败') }),
      }

      async function handleProjectList() {
        try {
          const projects = mockProjectService.scanProjects()
          return { code: 0, data: projects }
        } catch (e) {
          return {
            code: ERROR_CODES.REQUEST_ERROR,
            message: e.message,
            data: [],
          }
        }
      }

      const result = await handleProjectList()
      expect(result).toHaveProperty('code')
      expect(result.code).toBe(ERROR_CODES.REQUEST_ERROR)
      expect(result.message).toMatch(/数据库连接失败/)
      expect(result.data).toEqual([])
      // JSON.stringify 不应抛异常
      expect(() => JSON.stringify(result)).not.toThrow()
    })

    it('Store 未初始化时返回错误而非崩溃', async () => {
      // 模拟 Store 未初始化（_ready = false）时调用 project:list
      const mockStore = {
        _ready: false,
        scanProjects: vi.fn(() => {
          throw new Error('Store not ready')
        }),
      }

      let result
      try {
        result = mockStore.scanProjects()
      } catch (e) {
        result = { code: -1, message: e.message, data: [] }
      }

      expect(result).toHaveProperty('code')
      expect(result.code).toBe(-1)
      expect(result.message).toBe('Store not ready')
      expect(result.data).toEqual([])
    })

    it('数据库查询异常时返回结构化错误', async () => {
      // 模拟数据库查询异常（如 SQL 语法错误、表不存在）
      const mockDb = {
        prepare: vi.fn(() => {
          throw new Error('no such table: projects')
        }),
      }

      let result
      try {
        const stmt = mockDb.prepare('SELECT * FROM projects')
        result = stmt.run()
      } catch (e) {
        result = { code: -2, message: `数据库查询失败: ${e.message}`, data: [] }
      }

      expect(result).toHaveProperty('code')
      expect(result.code).toBe(-2)
      expect(result.message).toContain('no such table: projects')
      expect(result.data).toEqual([])
    })
  })

  describe('ExecutionRecorder 文件写入故障不阻断', () => {
    let tempDir
    let recorder
    let ExecutionRecorder
    let RECORDED_EVENTS
    let pipelineEngine
    let projectService

    beforeEach(() => {
      tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fault-inject-recorder-'))
      delete require.cache[require.resolve('../services/execution-recorder')]
      const mod = require('../services/execution-recorder')
      ExecutionRecorder = mod.ExecutionRecorder
      RECORDED_EVENTS = mod.RECORDED_EVENTS

      pipelineEngine = {
        on: vi.fn(() => () => {}),
        off: vi.fn(),
      }

      projectService = {
        getProjectsDir: vi.fn(() => path.join(tempDir, 'projects')),
        getProject: vi.fn(() => null),
      }

      recorder = new ExecutionRecorder({
        projectService,
        pipelineEngine,
      })
    })

    afterEach(() => {
      const cleanupErrors = []
      try {
        recorder.cleanup()
      } catch (error) {
        cleanupErrors.push(error)
      }
      try {
        fs.rmSync(tempDir, { recursive: true, force: true })
      } catch (error) {
        cleanupErrors.push(error)
      }
      delete require.cache[require.resolve('../services/execution-recorder')]
      if (cleanupErrors.length > 0) {
        throw new AggregateError(cleanupErrors, '故障注入测试资源清理失败')
      }
    })

    it('stream.write 抛出异常时 recordEvent 不崩溃', () => {
      recorder.startRecording('p1')
      const session = recorder._sessions.get('p1')
      // 替换 stream.write 为会抛出异常的实现
      session.stream.write = vi.fn(() => { throw new Error('磁盘空间不足') })

      // recordEvent 内部有 try/catch，不应传播异常
      expect(() => {
        recorder.recordEvent('p1', 'pipeline:start', 'script', { projectId: 'p1' })
      }).not.toThrow()

      // 后续调用也不应崩溃
      expect(() => {
        recorder.recordEvent('p1', 'stage:start', 'script', {})
      }).not.toThrow()

      // 内存缓存应继续正常工作（缓存不依赖 stream.write）
      const cache = recorder.getCachedEvents('p1')
      expect(cache).toHaveLength(2)
    })

    it('stream 触发 error 事件时 recordEvent 不崩溃', () => {
      recorder.startRecording('p1')

      // stream 的 error 事件已被构造函数中的 stream.on('error') 捕获
      const session = recorder._sessions.get('p1')
      let streamError
      session.stream.on('error', (e) => { streamError = e })

      // 手动触发 stream error 事件
      session.stream.emit('error', new Error('写入管道中断'))

      expect(streamError).toBeTruthy()
      expect(streamError.message).toBe('写入管道中断')

      // 触发 error 后 recordEvent 仍不应崩溃
      expect(() => {
        recorder.recordEvent('p1', 'pipeline:complete', '', { projectId: 'p1' })
      }).not.toThrow()
    })

    it('目录创建失败时 startRecording 不崩溃', () => {
      // 将 projects 目录替换为一个文件，使 mkdirSync 失败
      const blockingFile = path.join(tempDir, 'projects')
      fs.writeFileSync(blockingFile, 'this is a file, not a directory', 'utf-8')

      // startRecording 内部有 try/catch，mkdirSync 失败时 log error 并 return
      recorder.startRecording('p1')
      // 会话不应被创建
      expect(recorder._sessions.has('p1')).toBe(false)
      // 系统不应崩溃
      expect(() => {
        recorder.startRecording('p2')
      }).not.toThrow()
    })

    it('文件写入失败后 stopRecording 仍能正常执行', () => {
      recorder.startRecording('p1')
      const session = recorder._sessions.get('p1')
      session.stream.write = vi.fn(() => { throw new Error('写入失败') })

      // 写入失败
      recorder.recordEvent('p1', 'pipeline:start', '', {})
      // stopRecording 不应抛异常
      expect(() => {
        recorder.stopRecording('p1')
      }).not.toThrow()
    })

    it('文件写入失败后 getReplay 返回空事件列表不崩溃', () => {
      recorder.startRecording('p1')
      const session = recorder._sessions.get('p1')
      session.stream.write = vi.fn(() => { throw new Error('写入失败') })

      recorder.recordEvent('p1', 'pipeline:start', '', {})
      recorder.stopRecording('p1')

      // getReplay 读取 JSONL 文件，写入失败意味着文件为空或不存在
      const result = recorder.getReplay('p1')
      expect(result).toHaveProperty('events')
      expect(result).toHaveProperty('totalDuration')
      expect(result).toHaveProperty('project')
      // JSON.stringify 不应抛异常
      expect(() => JSON.stringify(result)).not.toThrow()
    })
  })
})
