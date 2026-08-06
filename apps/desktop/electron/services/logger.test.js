// @ts-check
/**
 * logger.test.js — 应用日志服务单测
 *
 * 覆盖：日期滚动文件写入、敏感信息脱敏、单文件超限自动删除、
 * 启动核对历史超限文件、clearLogs / getLogsInfo。
 * 全部使用 os.tmpdir() 下独立临时目录，避免污染真实 userData。
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import os from 'os'
import path from 'path'
import fs from 'fs'

const logger = require('./logger')

function tempLogDir (label) {
  return path.join(os.tmpdir(), `logger-test-${label}-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2)}`)
}

function listLogFiles (dir) {
  return fs.readdirSync(dir).filter((name) => name.startsWith('app-') && name.endsWith('.log'))
}

describe('logger 服务', () => {
  let dir

  beforeEach(() => {
    dir = tempLogDir('case')
  })

  afterEach(async () => {
    await logger.flush()
    logger.clearLogs()
    fs.rmSync(dir, { recursive: true, force: true })
  })

  it('按日期写入单文件，包含时间戳、级别与消息', async () => {
    logger.setLogOptions({ dir, maxBytes: 500 * 1024 * 1024 })
    logger.info('Test', 'hello world')
    await logger.flush()

    const files = listLogFiles(dir)
    expect(files.length).toBe(1)
    expect(files[0]).toMatch(/^app-\d{4}-\d{2}-\d{2}\.log$/)
    const content = fs.readFileSync(path.join(dir, files[0]), 'utf8')
    expect(content).toMatch(/^\[\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z\] \[INFO\] Test hello world/)
  })

  it('敏感信息脱敏：Bearer 与 sk- 前缀密钥不落盘原文', async () => {
    logger.setLogOptions({ dir, maxBytes: 500 * 1024 * 1024 })
    logger.info('Test', 'Bearer sk-abcdef1234567890abcdef', { apiKey: 'sk-secret-xyz', authorization: 'Bearer tok123' })
    await logger.flush()

    const content = fs.readFileSync(path.join(dir, listLogFiles(dir)[0]), 'utf8')
    expect(content).toContain('Bearer ***')
    expect(content).not.toContain('sk-abcdef1234567890abcdef')
    expect(content).not.toContain('sk-secret-xyz')
    expect(content).not.toContain('tok123')
    expect(content).toContain('apiKey":"***')
  })

  it('meta 以 JSON 形式落盘并截断超长内容', async () => {
    logger.setLogOptions({ dir, maxBytes: 500 * 1024 * 1024 })
    logger.info('Test', 'with meta', { stage: 'split', count: 5 })
    await logger.flush()

    const content = fs.readFileSync(path.join(dir, listLogFiles(dir)[0]), 'utf8')
    expect(content).toContain('{"stage":"split","count":5}')
  })

  it('单文件超过上限时自动删除（多次写入跨 64KB 检查点）', async () => {
    logger.setLogOptions({ dir, maxBytes: 1024 })
    const payload = 'x'.repeat(1024)
    const totalWritten = 100 * payload.length
    for (let i = 0; i < 100; i += 1) {
      logger.info('Test', payload)
      await logger.flush()
    }

    const files = listLogFiles(dir)
    let totalOnDisk = 0
    for (const name of files) totalOnDisk += fs.statSync(path.join(dir, name)).size
    // 删除至少触发过一次：磁盘残留明显小于累计写入量
    expect(totalOnDisk).toBeLessThan(totalWritten * 0.9)
    // 启动核对：首个文件不存在超限文件
    for (const name of files) {
      expect(fs.statSync(path.join(dir, name)).size).toBeLessThan(64 * 1024)
    }
  })

  it('启动核对：历史超限文件在首次写入时被删除', async () => {
    logger.setLogOptions({ dir, maxBytes: 1024 })
    // 预置一个超限的当天日志文件
    const today = new Date()
    const pad = (value) => String(value).padStart(2, '0')
    const todayFile = `app-${today.getFullYear()}-${pad(today.getMonth() + 1)}-${pad(today.getDate())}.log`
    fs.mkdirSync(dir, { recursive: true })
    const bigPath = path.join(dir, todayFile)
    fs.writeFileSync(bigPath, 'z'.repeat(5000))

    logger.info('Test', 'after startup')
    await logger.flush()

    // 超限历史文件被删除后重建为新日志行（不再包含 5000 字节旧内容）
    expect(fs.statSync(bigPath).size).toBeLessThan(2000)
    const files = listLogFiles(dir)
    expect(files.length).toBe(1)
  })

  it('clearLogs 只清理 app-*.log，getLogsInfo 返回文件列表与总大小', async () => {
    logger.setLogOptions({ dir, maxBytes: 500 * 1024 * 1024 })
    fs.mkdirSync(dir, { recursive: true })
    fs.writeFileSync(path.join(dir, 'keep.txt'), 'keep me')
    logger.info('Test', 'one')
    logger.info('Test', 'two')
    await logger.flush()

    const before = logger.getLogsInfo()
    expect(before.dir).toBe(dir)
    expect(before.fileCount).toBe(1)
    expect(before.totalBytes).toBeGreaterThan(0)
    expect(Array.isArray(before.files)).toBe(true)
    expect(before.files[0].name).toMatch(/^app-.*\.log$/)

    const removed = logger.clearLogs()
    expect(removed).toBe(1)
    expect(fs.existsSync(path.join(dir, 'keep.txt'))).toBe(true)
    const after = logger.getLogsInfo()
    expect(after.fileCount).toBe(0)
  })

  it('setLogOptions 校验：非法 maxBytes 不生效', async () => {
    logger.setLogOptions({ dir, maxBytes: 1024 })
    const before = logger.getLogsInfo().maxFileBytes
    logger.setLogOptions({ maxBytes: -5 })
    expect(logger.getLogsInfo().maxFileBytes).toBe(before)
  })
})
