import { describe, it, expect, beforeEach } from 'vitest'
import { createRequire } from 'module'
import fs from 'fs'
import os from 'os'
import path from 'path'
const req = createRequire(import.meta.url)
const { AuditLogger, LEVELS } = req('../src/audit-logger')

function tmpDir () {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'audit-test-'))
}

describe('AuditLogger', () => {
  let dir, logger

  beforeEach(() => {
    dir = tmpDir()
    logger = new AuditLogger({ dir, flushMs: 100000 })
  })

  it('should log request entries and flush to file', () => {
    logger.request('wechat_mp', 'acc1', 'https://example.com', 200, 123)
    logger.stop()
    const files = fs.readdirSync(dir)
    expect(files.length).toBe(1)
    const content = fs.readFileSync(path.join(dir, files[0]), 'utf8')
    const record = JSON.parse(content.trim().split('\n')[0])
    expect(record.event).toBe('request')
    expect(record.platform).toBe('wechat_mp')
    expect(record.status).toBe(200)
  })

  it('should log blocked entries with reason', () => {
    logger.blocked('zhihu', 'acc1', 'circuit_open')
    logger.stop()
    const files = fs.readdirSync(dir)
    const content = fs.readFileSync(path.join(dir, files[0]), 'utf8')
    const record = JSON.parse(content.trim())
    expect(record.event).toBe('blocked')
    expect(record.reason).toBe('circuit_open')
  })

  it('should log error entries', () => {
    logger.error('douyin', 'acc1', new Error('网络超时'), { url: 'https://x.com' })
    logger.stop()
    const files = fs.readdirSync(dir)
    const content = fs.readFileSync(path.join(dir, files[0]), 'utf8')
    const record = JSON.parse(content.trim())
    expect(record.event).toBe('error')
    expect(record.error).toContain('网络超时')
    expect(record.url).toBe('https://x.com')
  })

  it('should not start flush timer when dir is null', () => {
    const noDirLogger = new AuditLogger({})
    expect(noDirLogger._flushTimer).toBeNull()
  })

  it('should not lose data when flush fails', () => {
    // dir 指向一个已存在的文件路径，mkdirSync 会抛错 → flush 失败
    const fileAsDir = path.join(dir, 'not-a-dir.txt')
    fs.writeFileSync(fileAsDir, 'x')
    const badLogger = new AuditLogger({ dir: fileAsDir, flushMs: 100000 })
    badLogger.request('test', 'acc', 'https://example.com', 200, 1)
    const origErr = console.error
    console.error = () => {}
    try {
      badLogger.stop()
    } finally {
      console.error = origErr
    }
    // 数据应被放回 buffer，不丢失
    expect(badLogger._buffer.length).toBeGreaterThan(0)
  })
})
