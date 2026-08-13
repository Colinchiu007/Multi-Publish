import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import os from 'os'
import path from 'path'
import fs from 'fs'

const logger = require('../logger')

function tmpFile () {
  return path.join(os.tmpdir(), `shared-logger-test-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2)}.log`)
}

describe('shared-utils logger', () => {
  let file

  beforeEach(() => { file = tmpFile() })
  afterEach(() => {
    try { fs.rmSync(file, { force: true }) } catch (e) { /* ignore */ }
    try { fs.rmSync(file + '.1', { force: true }) } catch (e) { /* ignore */ }
    // 还原模块级可变状态，避免用例间顺序耦合
    logger.setLogOptions({ level: 'debug', maxSize: 5 * 1024 * 1024 })
  })

  it('写入注入路径并包含级别/标签/消息', () => {
    logger.setLogOptions({ file, level: 'debug' })
    logger.info('Tag', 'hello world')
    const content = fs.readFileSync(file, 'utf8')
    expect(content).toContain('[INFO] [Tag] hello world')
    expect(logger.getLogPath()).toBe(file)
  })

  it('敏感信息脱敏：文件与控制台同源，Bearer/sk-/access_token/Cookie/JWT 不泄露原文', () => {
    logger.setLogOptions({ file, level: 'debug' })
    const captured = []
    const origLog = console.log
    const origError = console.error
    console.log = (...a) => { captured.push(['log', ...a]) }
    console.error = (...a) => { captured.push(['error', ...a]) }
    try {
      logger.warn('Tag', 'Bearer sk-abcdef1234567890 access_token=token123 "cookie":"sid=abc" eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjMifQ.sig12345')
      logger.error('Tag', 'sk-standalone-xyz')
    } finally {
      console.log = origLog
      console.error = origError
    }
    const consoleText = captured.map((entry) => entry.join(' ')).join('\n')
    expect(consoleText).toContain('Bearer ***')
    expect(consoleText).not.toContain('sk-abcdef1234567890')
    expect(consoleText).not.toContain('token123')
    expect(consoleText).not.toContain('sid=abc')
    expect(consoleText).not.toContain('eyJhbGciOiJIUzI1NiJ9')
    const content = fs.readFileSync(file, 'utf8')
    expect(content).toContain('Bearer ***')
    expect(content).toContain('eyJ***')
    expect(content).not.toContain('sk-abcdef1234567890')
    expect(content).not.toContain('token123')
    expect(content).not.toContain('sid=abc')
    expect(content).not.toContain('sk-standalone-xyz')
    expect(content).not.toContain('eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjMifQ.sig12345')
  })

  it('超限轮转到 .1', () => {
    logger.setLogOptions({ file, maxSize: 1024, level: 'debug' })
    logger.info('Tag', 'x'.repeat(2048))
    logger.info('Tag', 'second line')
    expect(fs.existsSync(file + '.1')).toBe(true)
    expect(fs.readFileSync(file, 'utf8')).toContain('second line')
  })

  it('setLogOptions level 过滤生效', () => {
    logger.setLogOptions({ file, level: 'error' })
    logger.info('Tag', 'should not appear')
    logger.error('Tag', 'should appear')
    const content = fs.readFileSync(file, 'utf8')
    expect(content).not.toContain('should not appear')
    expect(content).toContain('should appear')
  })
})
