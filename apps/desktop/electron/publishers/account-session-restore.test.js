/**
 * 会话凭证恢复 — 特征测试（characterization tests）
 *
 * 被测行为：把已保存凭证注入 session/webContents、读取账号分区 Cookie、合并两组 Cookie。
 *
 * 为什么单独存在：openspec change `split-account-manager-session-restore` 要把这 6 个函数
 * 从已挂账的 account-manager.js 平移到独立模块。纯平移最容易翻车的地方是「移动后测试仍绿，
 * 但绿的是一组从没真正跑到这些分支的测试」，因此先钉住**当前真实行为**（含失败分支与降级分支），
 * 再动代码。
 *
 * T1 阶段（基线）：SOURCE 指向 './account-manager'，本文件必须**全绿**——这是移动的前提。
 * T2 阶段（平移后）：只把 SOURCE 改成 './account-session-restore'，下面所有断言一字不改，
 * 仍然全绿才算「行为不变」。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

const SOURCE = './account-session-restore'
const {
  restoreCookies,
  restoreLocalStorage,
  getAccountPartitionCookies,
  mergeCookies,
  seedAccountPartitionCookies,
} = require(SOURCE)

function spyLog (method) {
  // 必须在 require 之后取模块对象再 spy：被测实现用的是 `log.warn(...)`（模块对象上的方法），
  // 若实现改成 require 期解构成本地函数引用，这个 spy 会静默失效。
  const log = require('../services/logger')
  return vi.spyOn(log, method).mockImplementation(function () {})
}

describe('restoreCookies', () => {
  beforeEach(() => {
    global.__enableElectronMock()
    global.__resetElectronMock()
  })
  afterEach(() => { vi.restoreAllMocks() })

  it('逐条写入，并对缺省字段补齐既有默认值', async () => {
    const set = vi.fn(async () => undefined)
    await restoreCookies({ cookies: { set } }, [{ name: 'sid', value: 'v1', domain: '.kuaishou.com' }])

    expect(set).toHaveBeenCalledTimes(1)
    expect(set.mock.calls[0][0]).toEqual({
      url: 'https://.kuaishou.com',
      name: 'sid',
      value: 'v1',
      domain: '.kuaishou.com',
      path: '/',
      secure: true,
      httpOnly: false,
      expirationDate: undefined,
      sameSite: 'Unspecified',
    })
  })

  it('baseUrl 优先于 domain 拼出的 url；secure:false 与已有 path/sameSite/expirationDate 一律保留', async () => {
    const set = vi.fn(async () => undefined)
    const cookie = {
      name: 'sid',
      value: 'v',
      domain: '.kuaishou.com',
      path: '/rest',
      secure: false,
      httpOnly: true,
      expirationDate: 123,
      sameSite: 'NoQuestionMark',
    }

    await restoreCookies({ cookies: { set } }, [cookie], 'https://cp.kuaishou.com')

    expect(set.mock.calls[0][0]).toEqual({
      url: 'https://cp.kuaishou.com',
      name: 'sid',
      value: 'v',
      domain: '.kuaishou.com',
      path: '/rest',
      secure: false,
      httpOnly: true,
      expirationDate: 123,
      sameSite: 'NoQuestionMark',
    })
  })

  it('无 domain 时回落 localhost；name/value 缺席补空串而不是 undefined', async () => {
    const set = vi.fn(async () => undefined)
    await restoreCookies({ cookies: { set } }, [{}])

    expect(set.mock.calls[0][0].url).toBe('https://localhost')
    expect(set.mock.calls[0][0].name).toBe('')
    expect(set.mock.calls[0][0].value).toBe('')
    expect(set.mock.calls[0][0].domain).toBeUndefined()
  })

  it('单条失败只记 warn、不中断其余 Cookie，并汇总失败比例', async () => {
    const warn = spyLog('warn')
    const set = vi.fn(cookie => (cookie.name === 'bad'
      ? Promise.reject(new Error('boom'))
      : Promise.resolve()))

    await expect(restoreCookies({ cookies: { set } }, [
      { name: 'bad', value: 'x', domain: '.kuaishou.com' },
      { name: 'good', value: 'y', domain: '.kuaishou.com' },
    ])).resolves.toHaveLength(2)

    const messages = warn.mock.calls.map(c => String(c[1]))
    expect(messages).toContain('restoreCookies: cookie set failed name=bad err=boom')
    expect(messages).toContain('restoreCookies: 1/2 cookies failed to restore')
    expect(set).toHaveBeenCalledTimes(2)
  })

  it('set 同步抛错（非 reject）时按已处理计入结果，不向外抛', async () => {
    const set = vi.fn(() => { throw new Error('sync boom') })
    await expect(restoreCookies({ cookies: { set } }, [{ name: 'a', domain: '.x.com' }])).resolves.toHaveLength(1)
  })
})

describe('restoreLocalStorage / buildLocalStorageRestoreScript', () => {
  beforeEach(() => {
    global.__enableElectronMock()
    global.__resetElectronMock()
  })
  afterEach(() => { vi.restoreAllMocks() })

  it('非对象与空对象一律短路，不注入脚本', async () => {
    const executeJavaScript = vi.fn(async () => undefined)

    await restoreLocalStorage({ executeJavaScript }, null)
    await restoreLocalStorage({ executeJavaScript }, 'not-an-object')
    await restoreLocalStorage({ executeJavaScript }, {})

    expect(executeJavaScript).not.toHaveBeenCalled()
  })

  it('注入脚本逐字保持既有形态', async () => {
    const executeJavaScript = vi.fn(async () => undefined)

    await restoreLocalStorage({ executeJavaScript }, { finder_username: 'u1' })

    expect(executeJavaScript).toHaveBeenCalledWith(
      '(function(){var d={"finder_username":"u1"};Object.keys(d).forEach(function(k){try{localStorage.setItem(k,d[k])}catch(e){}})})()',
    )
  })

  it('含引号/换行/分号的值必须整体 JSON 序列化（安全修复：禁止字符串拼接式转义）', async () => {
    const executeJavaScript = vi.fn(async () => undefined)
    const evil = { "a'\":;": "x'};alert(1);//\n" }

    await restoreLocalStorage({ executeJavaScript }, evil)

    const script = executeJavaScript.mock.calls[0][0]
    const payload = /^\(function\(\)\{var d=(.*);Object\.keys\(d\)\.forEach/.exec(script)[1]
    // 能被 JSON.parse 还原 == 没有被拼出可执行片段
    expect(JSON.parse(payload)).toEqual(evil)
    expect(script).not.toContain("''")
  })

  it('数组入参按既有行为放行（typeof [] === \'object\'），产出数字键——钉住现状，不顺手改语义', async () => {
    const executeJavaScript = vi.fn(async () => undefined)

    await restoreLocalStorage({ executeJavaScript }, ['a', 'b'])

    const script = executeJavaScript.mock.calls[0][0]
    const payload = /^\(function\(\)\{var d=(.*);Object\.keys\(d\)\.forEach/.exec(script)[1]
    expect(JSON.parse(payload)).toEqual({ 0: 'a', 1: 'b' })
    // 平移前后这条必须同结果：它锁的是「移动没改变行为」，而不是「这个行为好不好」
    expect(script).toContain('localStorage.setItem')
  })
})

describe('getAccountPartitionCookies', () => {
  beforeEach(() => {
    global.__enableElectronMock()
    global.__resetElectronMock()
  })
  afterEach(() => { vi.restoreAllMocks() })

  // deps 传法在两个阶段都成立：T1（实现还在 account-manager 里，校验是内部私有函数，第三参数被忽略）
  // 与 T2（平移到新模块后，校验改为注入）。断言本身一字不改，才能证明「行为没变」。
  // 这里的规则镜像 account-manager.js 的 isSafePathSegment，刻意不复用它：测试要钉的是
  // 「非法 accountId 必须 fail-closed」这个语义，而不是某个具体实现。
  const DEPS = { isSafePathSegment: v => typeof v === 'string' && /^[a-zA-Z0-9_-]+$/.test(v) }

  function mockPartitionSession (impl) {
    const fromPartition = vi.fn(impl)
    global.__electronMock.session.fromPartition = fromPartition
    return fromPartition
  }

  it('accountId 不是安全路径段时 fail-closed 返回空，且不碰任何分区', async () => {
    const fromPartition = mockPartitionSession(() => ({ cookies: { get: async () => [{ name: 'a' }] } }))

    await expect(getAccountPartitionCookies('kuaishou', '../../etc/passwd', DEPS)).resolves.toEqual([])
    await expect(getAccountPartitionCookies('kuaishou', 'a/b', DEPS)).resolves.toEqual([])
    await expect(getAccountPartitionCookies('kuaishou', 123, DEPS)).resolves.toEqual([])
    await expect(getAccountPartitionCookies('kuaishou', undefined, DEPS)).resolves.toEqual([])

    expect(fromPartition).not.toHaveBeenCalled()
  })

  it('按 persist:account-{id} 取分区，并按平台 Cookie 根域过滤', async () => {
    const fromPartition = mockPartitionSession(() => ({
      cookies: {
        get: async () => [
          { name: 'sid', domain: '.kuaishou.com' },
          { name: 'passport', domain: 'passport.kuaishou.com' },
          // 根域的子域按既有语义属于该平台（不是越界）
          { name: 'sub', domain: '.cp.kuaishou.com' },
          // 跨平台与「后缀伪装」必须滤掉
          { name: 'weibo', domain: '.weibo.com' },
          { name: 'lookalike', domain: '.kuaishou.com.evil.example' },
        ],
      },
    }))

    const cookies = await getAccountPartitionCookies('kuaishou', 'abc123', DEPS)

    expect(fromPartition).toHaveBeenCalledWith('persist:account-abc123')
    expect(cookies.map(c => c.name)).toEqual(['sid', 'passport', 'sub'])
  })

  it('未给 platform 时不过滤，原样返回（分区仍是唯一登录态证据来源）', async () => {
    mockPartitionSession(() => ({ cookies: { get: async () => [{ name: 'a', domain: '.x.com' }] } }))
    await expect(getAccountPartitionCookies('', 'abc123', DEPS)).resolves.toEqual([{ name: 'a', domain: '.x.com' }])
  })

  it('分区 session 形状不符（无 cookies.get）时返回空数组', async () => {
    mockPartitionSession(() => ({}))
    await expect(getAccountPartitionCookies('kuaishou', 'abc123', DEPS)).resolves.toEqual([])

    mockPartitionSession(() => ({ cookies: {} }))
    await expect(getAccountPartitionCookies('kuaishou', 'abc123', DEPS)).resolves.toEqual([])
  })

  it('读取抛错时记 warn 并返回空数组（不得臆断成「已登录」或「未登录」）', async () => {
    const warn = spyLog('warn')
    mockPartitionSession(() => ({ cookies: { get: () => Promise.reject(new Error('disk gone')) } }))

    await expect(getAccountPartitionCookies('kuaishou', 'abc123', DEPS)).resolves.toEqual([])
    expect(warn.mock.calls.map(c => String(c[1])).some(m =>
      m.includes('getAccountPartitionCookies failed kuaishou:abc123') && m.includes('disk gone'))).toBe(true)
  })

  it('cookies.get 返回非数组时返回空数组', async () => {
    mockPartitionSession(() => ({ cookies: { get: async () => ({}) } }))
    await expect(getAccountPartitionCookies('kuaishou', 'abc123', DEPS)).resolves.toEqual([])
  })

  it('宿主没有可用 session 模块时降级为空数组（_electronSession 的静默兜底）', async () => {
    global.__electronMock.session = {}
    await expect(getAccountPartitionCookies('kuaishou', 'abc123', DEPS)).resolves.toEqual([])

    global.__electronMock.session = { fromPartition: 'not-a-function' }
    await expect(getAccountPartitionCookies('kuaishou', 'abc123', DEPS)).resolves.toEqual([])
  })
})

describe('模块边界合同（openspec: split-account-manager-session-restore）', () => {
  beforeEach(() => {
    global.__enableElectronMock()
    global.__resetElectronMock()
  })
  afterEach(() => { vi.restoreAllMocks() })

  // 只扫代码行：本模块文件头的「禁止 require('./account-manager')」说明文字本身含该串，
  // 拿整份源码做 toContain 会被自己的注释打红（实测踩过）。
  function codeLines (file) {
    return fs.readFileSync(path.join(__dirname, file), 'utf8')
      .split(/\r?\n/)
      .filter(l => !/^\s*(\/\/|\*|\/\*)/.test(l))
      .join('\n')
  }

  it('新模块不得反向 require account-manager（CJS 循环会给出半初始化导出）', () => {
    const src = codeLines('account-session-restore.js')
    expect(src).not.toMatch(/require\(\s*['"]\.\/account-manager['"]\s*\)/)
    expect(src).not.toMatch(/require\(\s*['"]\.\.\/publishers\/account-manager['"]\s*\)/)
  })

  it('account-manager 不再自带这 5 个被移走的实现（getAccountPartitionCookies 是本地 2 参包装，不在其列），且公开导出名保持不变', () => {
    const src = fs.readFileSync(path.join(__dirname, 'account-manager.js'), 'utf8')
    for (const name of ['restoreCookies', 'restoreLocalStorage', 'buildLocalStorageRestoreScript', '_electronSession', 'mergeCookies']) {
      expect(src, name).not.toMatch(new RegExp('^function ' + name + ' \\(', 'm'))
      expect(src, name).not.toMatch(new RegExp('^async function ' + name + ' \\(', 'm'))
    }
    const accountManager = require('./account-manager')
    for (const name of ['restoreCookies', 'restoreLocalStorage', 'getAccountPartitionCookies', 'mergeCookies']) {
      expect(typeof accountManager[name], name).toBe('function')
    }
    // 消费面仍是唯一实现：从 account-manager 拿到的就是新模块那几个函数本体
    expect(accountManager.mergeCookies).toBe(mergeCookies)
    expect(accountManager.restoreCookies).toBe(restoreCookies)
  })

  it('未注入路径段校验时 fail-closed（不因为「忘了注入」就放过任意 accountId）', async () => {
    const fromPartition = vi.fn(() => ({ cookies: { get: async () => [{ name: 'a' }] } }))
    global.__electronMock.session.fromPartition = fromPartition

    await expect(getAccountPartitionCookies('kuaishou', 'abc123')).resolves.toEqual([])
    await expect(getAccountPartitionCookies('kuaishou', 'abc123', {})).resolves.toEqual([])
    expect(fromPartition).not.toHaveBeenCalled()
  })
})
describe('mergeCookies', () => {

  beforeEach(() => {
    global.__enableElectronMock()
    global.__resetElectronMock()
  })
  afterEach(() => { vi.restoreAllMocks() })

  it('按 name+domain 去重，且前一个列表优先（加密凭证更贴近保存时点）', () => {
    const merged = mergeCookies(
      [{ name: 'sid', domain: '.kuaishou.com', value: 'from-store' }],
      [{ name: 'sid', domain: '.kuaishou.com', value: 'from-partition' }],
    )

    expect(merged).toEqual([{ name: 'sid', domain: '.kuaishou.com', value: 'from-store' }])
  })

  it('同名不同域算两条；domain 缺失按空串参与键计算', () => {
    const merged = mergeCookies(
      [{ name: 'sid', value: 'a' }, { name: 'sid', domain: '.x.com', value: 'b' }],
      [{ name: 'sid', value: 'c' }],
    )

    expect(merged.map(c => c.value)).toEqual(['a', 'b'])
  })

  it('无 name 的条目与非法入参一律不产出、不抛错', () => {
    expect(mergeCookies([{ value: 'no-name' }, null], undefined)).toEqual([])
    expect(mergeCookies(null, [{ name: 'ok', domain: '.x.com' }])).toEqual([{ name: 'ok', domain: '.x.com' }])
    expect(mergeCookies(undefined, undefined)).toEqual([])
  })
})

// 2026-10-09 快手开卡跳登录页修复的第二把锁：开卡恢复改成「分区优先、快照仅补缺」后，
// 重新登录（走独立 persist:auth-* 分区）拿到的新快照会被账号分区里「未过期但已吊销」的
// 同键旧 Cookie 挡掉 → 重登后开卡仍停在登录页。逐 Cookie 比新鲜度在文档 API 上不成立
// （electron.d.ts 的 Cookie 没有 creationTime/lastAccessTime），只能在落盘时刻对齐分区。
describe('seedAccountPartitionCookies（凭证落盘后把账号分区对齐到新快照）', () => {
  const DEPS = { isSafePathSegment: v => typeof v === 'string' && /^[a-zA-Z0-9_-]+$/.test(v) }

  beforeEach(() => {
    global.__enableElectronMock()
    global.__resetElectronMock()
  })
  afterEach(() => { vi.restoreAllMocks() })

  function mockPartition (setImpl) {
    const setCalls = []
    const set = setImpl || function (cookie) { setCalls.push(cookie); return Promise.resolve() }
    const fromPartition = vi.fn(partition => ({ partition, cookies: { set, setCalls } }))
    global.__electronMock.session.fromPartition = fromPartition
    return { fromPartition, setCalls }
  }

  it('只把本平台域的可用 Cookie 写进 persist:account-{id}，url 由 domain 推出', async () => {
    const { fromPartition, setCalls } = mockPartition()
    const snapshot = [
      { name: 'kuaishou_sid', value: 'fresh', domain: '.kuaishou.com', path: '/', secure: true, httpOnly: true, expirationDate: 1800000000, sameSite: 'no_restriction' },
      { name: 'weibo_sid', value: 'other', domain: '.weibo.com' },
      { name: 'lookalike', value: 'x', domain: '.kuaishou.com.evil.example' },
      { name: '', value: 'no-name', domain: '.kuaishou.com' },
      { name: 'no_domain', value: 'x' },
    ]

    await expect(seedAccountPartitionCookies('kuaishou', 'abc123', snapshot, DEPS))
      .resolves.toEqual({ seeded: 1, skipped: 4 })

    expect(fromPartition).toHaveBeenCalledWith('persist:account-abc123')
    expect(setCalls).toEqual([{
      url: 'https://kuaishou.com/',
      name: 'kuaishou_sid',
      value: 'fresh',
      domain: '.kuaishou.com',
      path: '/',
      secure: true,
      httpOnly: true,
      expirationDate: 1800000000,
      sameSite: 'no_restriction',
    }])
  })

  it('非法 accountId / 空快照 / 未注入路径校验时不碰任何分区', async () => {
    const { fromPartition, setCalls } = mockPartition()
    const cookies = [{ name: 'a', value: 'b', domain: '.kuaishou.com' }]

    await expect(seedAccountPartitionCookies('kuaishou', '../etc/passwd', cookies, DEPS)).resolves.toEqual({ seeded: 0, skipped: 0 })
    await expect(seedAccountPartitionCookies('kuaishou', 'abc123', [], DEPS)).resolves.toEqual({ seeded: 0, skipped: 0 })
    await expect(seedAccountPartitionCookies('kuaishou', 'abc123', cookies)).resolves.toEqual({ seeded: 0, skipped: 0 })

    expect(fromPartition).not.toHaveBeenCalled()
    expect(setCalls).toEqual([])
  })

  it('set 失败只出声并如实计数，绝不 reject（旁路不得影响登录结果）', async () => {
    const warn = spyLog('warn')
    mockPartition(() => Promise.reject(new Error('set-boom')))

    await expect(seedAccountPartitionCookies('kuaishou', 'abc123', [{ name: 'a', value: 'b', domain: '.kuaishou.com' }], DEPS))
      .resolves.toEqual({ seeded: 0, skipped: 0 })

    expect(warn.mock.calls.map(c => String(c[1] || '')).some(m =>
      m.includes('seed partition cookie failed name=a') && m.includes('set-boom'))).toBe(true)
  })

  it('分区形状不符（无 cookies.set）时记 warn 降级，不抛错', async () => {
    const warn = spyLog('warn')
    global.__electronMock.session.fromPartition = vi.fn(() => ({ cookies: {} }))

    await expect(seedAccountPartitionCookies('kuaishou', 'abc123', [{ name: 'a', value: 'b', domain: '.kuaishou.com' }], DEPS))
      .resolves.toEqual({ seeded: 0, skipped: 0 })
    expect(warn.mock.calls.map(c => String(c[1] || '')).some(m => m.includes('cookies.set unavailable kuaishou:abc123'))).toBe(true)
  })

  it('Playwright 形态 sameSite 归一，secure=false 走 http url', async () => {
    const { setCalls } = mockPartition()

    await seedAccountPartitionCookies('kuaishou', 'abc123', [
      { name: 'a', value: '1', domain: '.kuaishou.com', sameSite: 'None' },
      { name: 'b', value: '2', domain: '.kuaishou.com', sameSite: 'weird' },
      { name: 'c', value: '3', domain: '.kuaishou.com', secure: false },
    ], DEPS)

    expect(setCalls.map(c => c.sameSite)).toEqual(['no_restriction', 'unspecified', 'unspecified'])
    expect(setCalls[2].url).toBe('http://kuaishou.com/')
  })

  it('日志只记计数与平台账号，禁止出现 Cookie 值', async () => {
    const info = spyLog('info')
    mockPartition()

    await seedAccountPartitionCookies('kuaishou', 'abc123', [{ name: 'session_secret', value: 'super-secret-value', domain: '.kuaishou.com' }], DEPS)

    const lines = info.mock.calls.map(c => String(c[1] || '')).join('\n')
    expect(lines).toContain('seeded account partition kuaishou:abc123 seeded=1 failed=0 skipped=0')
    expect(lines).not.toContain('super-secret-value')
  })
})
