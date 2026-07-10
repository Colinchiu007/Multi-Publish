/**
 * 跨包集成测试：Electron 主进程 → python-backend FastAPI 通信链路
 *
 * 测 python-bridge.js 的 spawn 子进程管理 + http 健康检查 + requestBackend 转发。
 * 不真实 spawn Python（CI 无 Python/依赖），改用 vi.spyOn 拦截 child_process.spawn
 * 与 http.get/http.request。
 *
 * 放在 electron/services/ 下以被 apps/desktop/vitest.config.js 的 include 命中。
 */
import { vi, test, expect, beforeEach, afterEach } from 'vitest'
import { EventEmitter } from 'events'

// 构造伪 ChildProcess：带 stdout/stderr/exit/on/kill/pid
function createFakeProc (pid) {
  const proc = new EventEmitter()
  proc.stdout = new EventEmitter()
  proc.stderr = new EventEmitter()
  proc.pid = pid || 12345
  proc.kill = vi.fn((sig) => {
    // kill 后异步触发 exit
    setImmediate(() => proc.emit('exit', 0, null))
  })
  // spawn 事件：真实 child_process 在进程启动后触发 'spawn'
  // python-bridge.js 监听此事件来 resolve Promise（修复竞态后）
  setImmediate(() => proc.emit('spawn'))
  return proc
}

let spawnSpy
let httpGetSpy
let httpRequestSpy
let spawnSyncSpy
let bridge

beforeEach(async () => {
  // vi.resetModules 清模块缓存以重置 bridge 的模块级状态（isRunning 等）。
  // 关键：resetModules 后先 require('child_process') / require('http') 拿到
  // 新实例并 spy，再 require('./python-bridge')——bridge 内部 require 这些
  // 模块时命中缓存，拿到被 spy 的同一实例。
  vi.resetModules()
  const child_process = require('child_process')
  const http = require('http')
  spawnSpy = vi.spyOn(child_process, 'spawn').mockImplementation(() => createFakeProc())
  spawnSyncSpy = vi.spyOn(child_process, 'spawnSync').mockImplementation(() => ({ status: 0 }))
  httpGetSpy = vi.spyOn(http, 'get')
  httpRequestSpy = vi.spyOn(http, 'request')
  bridge = require('./python-bridge')
})

afterEach(async () => {
  // 清理：停止后端 + 恢复 spy
  try { await bridge.stopPythonBackend() } catch { /* noop */ }
  vi.restoreAllMocks()
})

// 辅助：让 http.get 的下一次调用返回 {status:'ok'}
function mockHealthGet (healthy) {
  httpGetSpy.mockImplementationOnce((url, opts, cb) => {
    const res = new EventEmitter()
    res.statusCode = 200
    setImmediate(() => {
      if (cb) cb(res)
      res.emit('data', JSON.stringify({ status: healthy ? 'ok' : 'bad' }))
      res.emit('end')
    })
    const req = new EventEmitter()
    req.destroy = vi.fn()
    return req
  })
}

// 辅助：让 http.get 持续返回错误（连接拒绝）
function mockHealthGetError () {
  httpGetSpy.mockImplementationOnce(() => {
    const req = new EventEmitter()
    setImmediate(() => req.emit('error', new Error('connect ECONNREFUSED')))
    return req
  })
}

test('startPythonBackend 成功路径：spawn 正确参数 + 健康检查通过 + isRunning=true', async () => {
  mockHealthGet(true)
  await bridge.startPythonBackend()
  expect(spawnSpy).toHaveBeenCalledTimes(1)
  const [cmd, args, opts] = spawnSpy.mock.calls[0]
  expect(cmd).toMatch(/python3?/)
  expect(args).toEqual(['server.py'])
  expect(opts.env.BACKEND_PORT).toBe('8299')
  expect(opts.env.PYTHONUNBUFFERED).toBe('1')
  expect(bridge.isRunning()).toBe(true)
  expect(bridge.currentPort()).toBe(8299)
})

test('startPythonBackend 健康检查轮询：前 2 次失败第 3 次成功', async () => {
  mockHealthGetError()
  mockHealthGetError()
  mockHealthGet(true)
  await bridge.startPythonBackend()
  expect(httpGetSpy).toHaveBeenCalledTimes(3)
  expect(bridge.isRunning()).toBe(true)
})

test('startPythonBackend 健康检查超时抛错（fake timers）', async () => {
  vi.useFakeTimers()
  // 持续返回 error，永不健康
  httpGetSpy.mockImplementation(() => {
    const req = new EventEmitter()
    setImmediate(() => req.emit('error', new Error('ECONNREFUSED')))
    return req
  })
  const p = bridge.startPythonBackend()
  // 预先附 handler，避免 reject 在 advanceTimersByTimeAsync 期间触发时
  // 被判为 unhandled rejection（Vitest 会把 Node 的 unhandledRejection 事件
  // 当作测试错误）
  p.catch(() => {})
  // 推进 fake timers 超过 HEALTH_CHECK_TIMEOUT=10000ms
  await vi.advanceTimersByTimeAsync(11000)
  await expect(p).rejects.toThrow('health check timed out')
  expect(bridge.isRunning()).toBe(false)
  vi.useRealTimers()
})

test('requestBackend 转发：调用 http.request 时参数正确，返回解析 JSON', async () => {
  mockHealthGet(true)
  await bridge.startPythonBackend()
  httpGetSpy.mockClear()

  httpRequestSpy.mockImplementationOnce((opts, cb) => {
    const res = new EventEmitter()
    res.statusCode = 200
    setImmediate(() => {
      if (cb) cb(res)
      res.emit('data', JSON.stringify({ platforms: ['douyin'] }))
      res.emit('end')
    })
    const req = new EventEmitter()
    req.write = vi.fn()
    req.end = vi.fn()
    return req
  })

  const result = await bridge.requestBackend('POST', '/api/accounts', { name: 'test' })
  expect(httpRequestSpy).toHaveBeenCalledTimes(1)
  const [opts] = httpRequestSpy.mock.calls[0]
  expect(opts.hostname).toBe('127.0.0.1')
  expect(opts.port).toBe(8299)
  expect(opts.path).toBe('/api/accounts')
  expect(opts.method).toBe('POST')
  expect(result).toEqual({ platforms: ['douyin'] })
})

test('requestBackend 未运行时立即拒绝，不发起 http 请求', async () => {
  await expect(bridge.requestBackend('GET', '/api/health')).rejects.toThrow('not running')
  expect(httpRequestSpy).not.toHaveBeenCalled()
})

test('stopPythonBackend 在未运行时直接返回不抛错', async () => {
  // 不 startPythonBackend，直接 stop，验证不抛错且 isRunning 保持 false
  await expect(bridge.stopPythonBackend()).resolves.toBeUndefined()
  expect(bridge.isRunning()).toBe(false)
})
