/**
 * Test: cookie-store.js — Cookie 加密存储/解密/删除
 * 测试: AES-256-GCM 加密 → 解密 round-trip
 */

const path = require('path')
const fs = require('fs')
const os = require('os')
const { saveCookies, loadCookies, deleteCookies } = require('../src/cookie-store')

const TEMP_DIR = path.join(os.tmpdir(), `cookie-store-test-${Date.now()}`)
const TEST_COOKIE = [
  { name: 'session', value: 'abc123', domain: '.test.com', path: '/' },
  { name: 'token', value: 'xyz789', domain: '.test.com', path: '/' }
]

describe('CookieStore', () => {
  beforeEach(() => {
    // 每个测试前清空临时目录
    if (fs.existsSync(TEMP_DIR)) {
      const rimraf = require('rimraf')
      const rm = rimraf.rimrafSync || rimraf.sync
      rm(TEMP_DIR)
    }
  })

  test('保存并解密 cookie', () => {
    saveCookies('wechat_mp', TEST_COOKIE, TEMP_DIR)

    // 文件已创建
    const encFile = path.join(TEMP_DIR, 'cookies', 'wechat_mp.enc')
    expect(fs.existsSync(encFile)).toBe(true)

    // 解密后内容一致
    const loaded = loadCookies('wechat_mp', TEMP_DIR)
    expect(loaded).toBeDefined()
    expect(loaded).toHaveLength(2)
    expect(loaded[0].name).toBe('session')
    expect(loaded[0].value).toBe('abc123')
    expect(loaded[1].name).toBe('token')
    expect(loaded[1].value).toBe('xyz789')
  })

  test('不同平台 cookie 互相隔离', () => {
    saveCookies('wechat_mp', [{ name: 'a', value: '1' }], TEMP_DIR)
    saveCookies('zhihu', [{ name: 'b', value: '2' }], TEMP_DIR)

    const w = loadCookies('wechat_mp', TEMP_DIR)
    const z = loadCookies('zhihu', TEMP_DIR)

    expect(w[0].value).toBe('1')
    expect(z[0].value).toBe('2')
  })

  test('不存在平台返回 null', () => {
    expect(loadCookies('nonexistent', TEMP_DIR)).toBeNull()
  })

  test('删除 cookie', () => {
    saveCookies('test', TEST_COOKIE, TEMP_DIR)
    expect(deleteCookies('test', TEMP_DIR)).toBe(true)

    // 文件应被删除
    expect(loadCookies('test', TEMP_DIR)).toBeNull()
  })

  test('删除不存在的平台返回 false', () => {
    expect(deleteCookies('nonexistent', TEMP_DIR)).toBe(false)
  })

  test('加密文件不能被直接读取', () => {
    saveCookies('wechat_mp', TEST_COOKIE, TEMP_DIR)
    const encFile = path.join(TEMP_DIR, 'cookies', 'wechat_mp.enc')
    const raw = fs.readFileSync(encFile)
    // 随机盐+IV，内容应该是二进制的，不是原始 JSON
    expect(raw.toString('utf8').includes('session')).toBe(false)
    expect(raw.toString('utf8').includes('abc123')).toBe(false)
  })
})
