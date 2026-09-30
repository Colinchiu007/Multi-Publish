/**
 * 账号资料刷新 — 特征测试 + 接线/成环锁
 *
 * 被测行为：把采集到的账号资料回填进唯一真源（GET → buildProfilePatch → 昵称保护 → PATCH），
 * 以及采集转发的单一来源。
 *
 * 为什么单独存在：openspec change `split-account-profile-refresh` 把这 4 个函数从已挂账的
 * account-manager.js 平移到独立模块。纯平移最容易翻车的地方是「移动后测试仍绿，但绿的是一组
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

// account-manager 侧的私有校验：搬家后由**调用点注入**，这里给一个与真实现同语义的桩
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
  })

  it('实现不得被抄回 account-manager：采集调用与真源 PATCH 都只许住在新模块', () => {
    expect(am).not.toContain('profileUtils.collectWithPlaywright(page')
    expect(am).not.toContain('profileUtils.collectWithWebContents(webContents')
    // 反向锁的判据用「组合」而不是单词本身：GET 之后紧跟 PATCH /api/accounts/ 的那段流程只在模块里
    expect(am).not.toMatch(/buildProfilePatch\(info, current\.data\)[\s\S]{0,200}requestBackend\('PATCH', '\/api\/accounts\//)
    expect(self).toContain('profileUtils.collectWithPlaywright(page')
  })
})
