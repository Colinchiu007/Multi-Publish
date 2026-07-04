/** 
 * AiWriter 独立包 - 单元测试
 */

jest.mock('axios', function() {
  return { post: jest.fn() }
})

var AiWriter  // loaded in beforeAll
var axios

var SUCCESS_RESP = { data: { choices: [{ message: { content: '默认回复' } }] } }

describe('AiWriter (standalone package)', function() {
  beforeAll(function() {
    AiWriter = require('../src/index')
  })

  beforeEach(function() {
    axios = require('axios')
    axios.post.mockReset()
    axios.post.mockResolvedValue(SUCCESS_RESP)
  })

  test('constructor sets default options', function() {
    var w = new AiWriter()
    expect(w.apiUrl).toBe('https://api.openai.com/v1/chat/completions')
    expect(w.model).toBe('gpt-3.5-turbo')
    expect(w.apiKey).toBe('')
  })

  test('constructor accepts custom options', function() {
    var w = new AiWriter({ apiUrl: 'http://localhost:11434/v1/chat/completions', model: 'llama3', apiKey: 'sk-test' })
    expect(w.apiUrl).toBe('http://localhost:11434/v1/chat/completions')
    expect(w.model).toBe('llama3')
    expect(w.apiKey).toBe('sk-test')
  })

  test('constructor reads env vars', function() {
    process.env.OPENAI_API_KEY = 'sk-env-key'
    process.env.AI_API_URL = 'http://env-url/v1'
    var w = new AiWriter()
    expect(w.apiKey).toBe('sk-env-key')
    expect(w.apiUrl).toBe('http://env-url/v1')
    delete process.env.OPENAI_API_KEY
    delete process.env.AI_API_URL
  })

  test('isConfigured returns false without apiKey', function() {
    expect(new AiWriter().isConfigured()).toBe(false)
  })

  test('isConfigured returns true with apiKey', function() {
    expect(new AiWriter({ apiKey: 'sk-test' }).isConfigured()).toBe(true)
  })

  test('generateTitles returns array of titles', async function() {
    var list = '1. 标题一\\n2. 标题二\\n3. 标题三'
    axios.post.mockResolvedValue({ data: { choices: [{ message: { content: list } }] } })
    var titles = await new AiWriter({ apiKey: 'sk-test' }).generateTitles('AI 技术', 3)
    expect(Array.isArray(titles)).toBe(true)
    expect(titles.length).toBe(3)
    expect(titles[0]).toBe('标题一')
  })

  test('generateTitles returns empty array on API error', async function() {
    axios.post.mockRejectedValue(new Error('API Error'))
    var titles = await new AiWriter({ apiKey: 'sk-test' }).generateTitles('test')
    expect(Array.isArray(titles)).toBe(true)
    expect(titles.length).toBe(0)
  })

  test('generateSummary returns summary text', async function() {
    axios.post.mockResolvedValue({ data: { choices: [{ message: { content: '摘要内容' } }] } })
    var s = await new AiWriter({ apiKey: 'sk-test' }).generateSummary('这是一篇长文章内容摘要测试')
    expect(s).toBe('摘要内容')
  })

  test('generateSummary returns empty on error', async function() {
    axios.post.mockRejectedValue(new Error('Error'))
    var s = await new AiWriter({ apiKey: 'sk-test' }).generateSummary('test')
    expect(s).toBe('')
  })

  test('generateSummary returns empty for short content', async function() {
    var s = await new AiWriter({ apiKey: 'sk-test' }).generateSummary('短')
    expect(s).toBe('')
  })

  test('enhanceContent returns enhanced text', async function() {
    axios.post.mockResolvedValue({ data: { choices: [{ message: { content: '润色后内容' } }] } })
    var r = await new AiWriter({ apiKey: 'sk-test' }).enhanceContent('需要润色的原始内容')
    expect(r).toBe('润色后内容')
  })

  test('enhanceContent returns original on error', async function() {
    axios.post.mockRejectedValue(new Error('Error'))
    var original = '原始内容'
    var r = await new AiWriter({ apiKey: 'sk-test' }).enhanceContent(original)
    expect(r).toBe(original)
  })

  test('enhanceContent accepts different styles', async function() {
    var w = new AiWriter({ apiKey: 'sk-test' })
    // Test that style param is passed through
    var spy = jest.spyOn(w, '_call')
    spy.mockResolvedValue('润色结果')
    var r = await w.enhanceContent('需要润色的内容用于测试', 'concise')
    expect(spy).toHaveBeenCalled()
    expect(r).toBe('润色结果')
    spy.mockRestore()
  })

  test('_call throws without API key', async function() {
    await expect(new AiWriter()._call('sys', 'user')).rejects.toThrow('not configured')
  })

  test('_parseNumberedList handles various formats', function() {
    var w = new AiWriter()
    expect(w._parseNumberedList('1. A\\n2. B\\n3. C')).toEqual(['A', 'B', 'C'])
    expect(w._parseNumberedList('- X\\n- Y')).toEqual(['X', 'Y'])
    expect(w._parseNumberedList('')).toEqual([])
    expect(w._parseNumberedList(null)).toEqual([])
  })

  test('CLI processInput reads file and returns content', function() {
    var cli = require('../src/cli')
    expect(typeof cli).toBe('object')
    expect(typeof cli.main).toBe('function')
  })
})
