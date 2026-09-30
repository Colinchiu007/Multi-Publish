/**
 * 账号资料刷新 — 特征测试 + 接线/成环锁
 *
 * 被测行为：把采集到的账号资料回填进唯一真源（GET → buildProfilePatch → 昵称保护 → PATCH），
 * 以及采集转发的单一来源。
 *
 * 为什么单独存在：openspec change `split-account-profile-refresh` 把这 4 个函数从已挂账的
 * account-manager.js 平移到独立模块，**除一处经 QM-6 后端评审确认的行为修正（C1：真源 GET 失败时
 * 不再降级为 null 继续 PATCH，改为一行不写）外，行为逐字不变**。纯平移最容易翻车的地方是「移动后测试仍绿，但绿的是一组
 * 从没真正跑到这些分支的测试」，所以这里直接对新模块下断言，并额外钉三条只有**搬家后**才成立的锁：
 *  1) 依赖注入缺失必须**响亮失败**（不得被本模块自己的 catch 吞成 return false）；
 *  2) 依赖必须按**调用点取属性**（否则测试里的 vi.spyOn 拦不到，见 account-manager.js:13 的历史坑）；
 *  3) 实现不得被抄回 account-manager（反向接线锁）。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

const mod = require('./account-profile-refresh')
const pythonBridge = require('../services/python-bridge')
const profileUtils = require('@multi-publish/shared-utils/src/account-profile')
const httpLoginChecker = require('./http-login-checker')
const accountNameWrite = require('./account-name-write')
const log = require('../services/logger')

// account-manager 侧的私有校验：搬家后由**调用点注入**，这里给一个与真实现同语义的桩。
// ⚠ 该正则是 account-manager 里 isSafePathSegment 的手工副本，真实现收紧/放宽时这里不会自动跟着变——
//   它只用于「路径非法 ⇒ 不碰后端」的分支形状；真实现的语义由 account-manager 自己的用例覆盖。
//   下面「manual 命名不得被抓取结果覆盖」那条用的是**真 guard**（account-name-write），不是这种副本。
const DEPS = { isSafePathSegment: (v) => typeof v === 'string' && /^[a-zA-Z_0-9-]+$/.test(v) }

let events
let requestBackend
let collect
let buildPatch

beforeEach(() => {
  events = []
  requestBackend = vi.spyOn(pythonBridge, 'requestBackend').mockImplementation(async (method, url, body) => {
    events.push(method + ' ' + url)
    if (method === 'GET') return { code: 0, data: { account_name: '老昵称', name_source: 'auto', avatar: '' } }
    return { code: 0 }
  })
  collect = vi.spyOn(profileUtils, 'collectWithPlaywright').mockImplementation(async () => ({ nickName: '新昵称' }))
  buildPatch = vi.spyOn(profileUtils, 'buildProfilePatch').mockImplementation(() => ({ account_name: '新昵称' }))
  vi.spyOn(accountNameWrite, 'guardProfilePatchBySource').mockImplementation(() => {})
  vi.spyOn(log, 'warn').mockImplementation(function () {})
  vi.spyOn(log, 'info').mockImplementation(function () {})
})

afterEach(() => { vi.restoreAllMocks() })

describe('采集转发：单一来源不得被复制', () => {
  it('extractAccountInfo 转给 shared-utils 的 Playwright 采集器', async () => {
    const page = { url: () => 'https://example.com' }
    await mod.extractAccountInfo(page, 'toutiao')
    expect(collect).toHaveBeenCalledWith(page, 'toutiao')
  })

  it('extractAccountInfoFromWebContents 转给同一个采集器（不另写一份 DOM 采集）', async () => {
    const spy = vi.spyOn(profileUtils, 'collectWithWebContents').mockResolvedValue({ nickName: 'x' })
    const wc = { executeJavaScript: async () => ({}) }
    await mod.extractAccountInfoFromWebContents(wc, 'zhihu')
    expect(spy).toHaveBeenCalledWith(wc, 'zhihu')
  })
})

describe('注入合同：缺失必须响亮失败，不得静默降级', () => {
  it('refreshProfileFromPage 未注入 isSafePathSegment 时抛 TypeError（不是返回 false）', async () => {
    // 留在 try 里的话，'undefined is not a function' 会被本模块的 catch 吞成 false，
    // 表现成「资料永远不回填」这种无声缺陷 —— 那正是本模块要避免的失败形态。
    await expect(mod.refreshProfileFromPage({}, 'toutiao', 'acc-1'))
      .rejects.toThrow(/缺少调用点注入的 isSafePathSegment/)
    expect(requestBackend).not.toHaveBeenCalled()
  })

  it('refreshProfileFromHttpApi 同样必须响亮失败', async () => {
    await expect(mod.refreshProfileFromHttpApi('toutiao', 'acc-1', []))
      .rejects.toThrow(/缺少调用点注入的 isSafePathSegment/)
    expect(requestBackend).not.toHaveBeenCalled()
  })

  it('deps 给了但缺字段（空对象）也算未注入', async () => {
    await expect(mod.refreshProfileFromPage({}, 'toutiao', 'acc-1', {}))
      .rejects.toThrow(TypeError)
  })
})

describe('refreshProfileFromPage：四条纪律逐条钉住', () => {
  it('id 非法 → 一个后端请求都不发', async () => {
    const r = await mod.refreshProfileFromPage({}, 'toutiao', '../etc', DEPS)
    expect(r).toBe(false)
    expect(requestBackend).not.toHaveBeenCalled()
    expect(collect).not.toHaveBeenCalled()
  })

  it('采集无结果 → 不 GET、不 PATCH（键缺席 = 不修改）', async () => {
    collect.mockResolvedValue({})
    expect(await mod.refreshProfileFromPage({}, 'toutiao', 'acc-1', DEPS)).toBe(false)
    expect(requestBackend).not.toHaveBeenCalled()
  })

  it('真源查不到 → 不发 PATCH', async () => {
    // 只换返回值、不接管实现：events 由 beforeEach 的实现负责记录，这里改成断言真实调用序列
    requestBackend.mockImplementation(async (m) => (m === 'GET' ? { code: 404 } : { code: 0 }))
    expect(await mod.refreshProfileFromPage({}, 'toutiao', 'acc-1', DEPS)).toBe(false)
    expect(requestBackend.mock.calls.map(c => c[0])).toEqual(['GET'])
  })

  it('差异为空 → 不发 PATCH', async () => {
    buildPatch.mockReturnValue({})
    expect(await mod.refreshProfileFromPage({}, 'toutiao', 'acc-1', DEPS)).toBe(false)
    expect(requestBackend.mock.calls.map(c => c[0])).toEqual(['GET'])
  })

  it('昵称保护必须发生在 PATCH 之前（顺序错了就等于覆盖用户命名）', async () => {
    const guard = accountNameWrite.guardProfilePatchBySource
    guard.mockImplementation(() => { events.push('GUARD') })
    requestBackend.mockImplementation(async (m) => { events.push(m); return m === 'GET' ? { code: 0, data: { account_name: '老' } } : { code: 0 } })
    expect(await mod.refreshProfileFromPage({}, 'toutiao', 'acc-1', DEPS)).toBe(true)
    expect(events).toEqual(['GET', 'GUARD', 'PATCH'])
  })

  it('PATCH 失败 → 返回 false 并留 warn，绝不抛断检测链路', async () => {
    requestBackend.mockImplementation(async (m) => (m === 'GET' ? { code: 0, data: {} } : { code: 500 }))
    expect(await mod.refreshProfileFromPage({}, 'toutiao', 'acc-1', DEPS)).toBe(false)
    const warned = log.warn.mock.calls.map(c => String(c[1])).filter(s => s.includes('资料回填写入失败'))
    expect(warned.length).toBe(1)
  })

  it('采集抛错 → false + warn（资料是增强信息，不得成为登录有效性证据）', async () => {
    collect.mockRejectedValue(new Error('dom-boom'))
    expect(await mod.refreshProfileFromPage({}, 'toutiao', 'acc-1', DEPS)).toBe(false)
    expect(log.warn).toHaveBeenCalled()
  })
})

describe('refreshProfileFromHttpApi：走模块对象，spy 必须拦得到', () => {
  it('fetchAccountInfoViaHttpApi 必须经模块对象调用（require 期解构会让本断言失效）', async () => {
    const fetch = vi.spyOn(httpLoginChecker, 'fetchAccountInfoViaHttpApi').mockResolvedValue({
      supported: true, nickname: '新昵称', followers: 10, platformAccountId: 'u-1',
    })
    const r = await mod.refreshProfileFromHttpApi('toutiao', 'acc-1', [{ name: 'sid', value: 'v' }], DEPS)
    expect(r).toBe(true)
    expect(fetch).toHaveBeenCalledWith('toutiao', [{ name: 'sid', value: 'v' }])
  })

  // C1 回归（QM-6 后端评审抓到、本机独立探针复现）：读不到真源就无从判断 name_source，
  // 此时写入等于用「没有证据」去覆盖用户显式命名 —— 必须一行都不写。
  it('真源 GET 失败 → 绝不发 PATCH（与 DOM 路径同一口径）', async () => {
    vi.spyOn(httpLoginChecker, 'fetchAccountInfoViaHttpApi').mockResolvedValue({
      supported: true, nickname: '平台昵称', followers: 9, platformAccountId: 'u-1',
    })
    requestBackend.mockImplementation(async (m) => (m === 'GET' ? { code: 500 } : { code: 0 }))
    expect(await mod.refreshProfileFromHttpApi('toutiao', 'acc-1', [], DEPS)).toBe(false)
    expect(requestBackend.mock.calls.map(c => c[0])).toEqual(['GET'])
  })

  it('manual 命名不得被抓取结果覆盖（走真 guard，不用替身）', async () => {
    accountNameWrite.guardProfilePatchBySource.mockRestore()
    vi.spyOn(httpLoginChecker, 'fetchAccountInfoViaHttpApi').mockResolvedValue({
      supported: true, nickname: '平台昵称', followers: 9, platformAccountId: 'u-1',
    })
    // 真实 buildProfilePatch 的产物只有 account_name；name_source 是 guard 在「可覆盖」分支上才补的
    buildPatch.mockImplementation(() => ({ account_name: '平台昵称' }))
    requestBackend.mockImplementation(async (m) => (m === 'GET'
      ? { code: 0, data: { account_name: '我自己起的名字', name_source: 'manual' } }
      : { code: 0 }))
    expect(await mod.refreshProfileFromHttpApi('toutiao', 'acc-1', [], DEPS)).toBe(false)
    expect(requestBackend.mock.calls.map(c => c[0])).toEqual(['GET'])
  })
  it('平台不支持资料接口 → false，且完全不碰后端', async () => {
    vi.spyOn(httpLoginChecker, 'fetchAccountInfoViaHttpApi').mockResolvedValue({ supported: false })
    expect(await mod.refreshProfileFromHttpApi('toutiao', 'acc-1', [], DEPS)).toBe(false)
    expect(requestBackend).not.toHaveBeenCalled()
  })
})

describe('接线与成环锁（搬家后才成立，防实现被抄回）', () => {
  // 结构锁必须先剥注释：本模块头部就用字面量写着「禁止 require('./account-manager')」，
  // 不剥的话锁会被**自己的说明文字**触发（注释里的字样不算捕获点，见 AGENTS.md 显式声明锁先例）。
  const codeOnly = s => s
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n').filter(l => !/^\s*(\/\/|\*|\/\*)/.test(l)).join('\n')
  const read = rel => fs.readFileSync(path.join(__dirname, rel), 'utf8')
  const self = codeOnly(read('account-profile-refresh.js'))
  const am = read('account-manager.js')
  const amCode = codeOnly(am)

  it('新模块不得 require account-manager（CJS 循环会给出半初始化导出）', () => {
    expect(self).not.toMatch(/require\(['"]\.\/account-manager['"]\)/)
  })

  it('account-manager 必须经该模块消费，且 4 个导出名与签名保持不变', () => {
    expect(am).toMatch(/require\(['"]\.\/account-profile-refresh['"]\)/)
    for (const n of ['extractAccountInfo', 'extractAccountInfoFromWebContents', 'refreshProfileFromPage', 'refreshProfileFromHttpApi']) {
      expect(amCode, n + ' 必须仍是 account-manager 的导出名').toContain('  ' + n + ',')
    }
    expect(am).toContain('profileRefresh.refreshProfileFromPage(page, platform, accountId, { isSafePathSegment })')
    // HTTP 快速路径同样要有委托结构锁：只锁 DOM 那条时，把 HTTP 正文整段抄回 account-manager 不会变红
    expect(amCode).toContain('profileRefresh.refreshProfileFromHttpApi(platform, accountId, cookies, { isSafePathSegment })')
  })

  it('实现不得被抄回 account-manager：采集调用与真源 PATCH 都只许住在新模块', () => {
    expect(am).not.toContain('profileUtils.collectWithPlaywright(page')
    expect(am).not.toContain('profileUtils.collectWithWebContents(webContents')
    expect(self).toContain('profileUtils.collectWithPlaywright(page')
  })

  // 委托体必须是「纯转调」。这条取代了原先的 `[\s\S]{0,200}` 窗口锁：窗口按**字符数**量排版，
  // 抄回的那段被拉开排版就超出窗口 ⇒ 反向锁**静默变绿**（比误报红更危险，失效是无声的）。
  // 实测两形对照（D:/tmp/t44-lock-compare.js，同一把判据喂两种抄回）：两句相距 74 字符时旧锁与新锁各红；
  // 相距 325 字符（中间插局部变量与折行）时旧锁放过、只有新锁红。改判「函数体内不得出现采集/后端调用」
  // 后，判据与排版无关。反证（把正文抄回委托体）：新锁名出现在红因里，2 红 18 通过。
  it('4 个委托的函数体只许转调新模块，不得含采集或后端调用', () => {
    for (const n of ['extractAccountInfo', 'extractAccountInfoFromWebContents', 'refreshProfileFromPage', 'refreshProfileFromHttpApi']) {
      const start = amCode.indexOf('async function ' + n + ' (')
      expect(start, n + ' 必须仍是 account-manager 里的 async 函数').toBeGreaterThanOrEqual(0)
      const nl = amCode.indexOf('\n', start)
      const close = /\n\}/.exec(amCode.slice(nl))
      expect(close, n + ' 的函数体必须能在行首 } 处收口').not.toBeNull()
      const body = amCode.slice(nl, nl + close.index).replace(/\s+/g, ' ')
      expect(body, n + ' 的委托体只应转调 profileRefresh').toMatch(/return profileRefresh\.[A-Za-z]+\(/)
      for (const bad of ['requestBackend', 'collectWith', 'buildProfilePatch', 'fetchAccountInfoViaHttpApi', 'guardProfilePatchBySource']) {
        expect(body, n + ' 的委托体不得出现 ' + bad).not.toContain(bad)
      }
    }
  })
})
