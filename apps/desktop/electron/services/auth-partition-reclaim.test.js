import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

__enableElectronMock()

let reclaim
let planReclaim
let groupKeyOf
let isThrowawayPartitionName
let wipeSessionStorage
let scheduleReclaim

beforeEach(async () => {
  vi.resetModules()
  const mod = await import('./auth-partition-reclaim.js')
  reclaim = mod.reclaimStaleAuthPartitions
  planReclaim = mod.planReclaim
  groupKeyOf = mod.groupKeyOf
  isThrowawayPartitionName = mod.isThrowawayPartitionName
  wipeSessionStorage = mod.wipeSessionStorage
  scheduleReclaim = mod.scheduleReclaim
})

const REAL = {
  // 本机 debug profile 实测形态（21 个目录 / 436MB），保留真实时间戳位数
  'auth-auth-wechat_mp-1790343224833': true,
  'auth-auth-wechat_mp-1790418403514': true,
  'auth-auth-zhihu-1790343393950': true,
  'auth-auth-zhihu-1790352605579': true,
  'silent-auth-douyin-1790400000001': true,
  'account-18c23d34': true,
  'account-ef2ccaa2': true,
  'logto-identity': true,
  'auth-zhihu-1700000000000': true,
}

function mkTmp () {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), `mp-auth-reclaim-${process.pid}-`))
  return base
}

/** 在 userData 下按真实形态铺目录，返回 base */
function mkProfile (names, sub = path.join('session', 'Partitions')) {
  const base = mkTmp()
  const root = path.join(base, sub)
  fs.mkdirSync(root, { recursive: true })
  for (const n of names) fs.mkdirSync(path.join(root, n), { recursive: true })
  return base
}

function rmrf (p) {
  try { fs.rmSync(p, { recursive: true, force: true }) } catch (_e) { /* 临时目录清不掉不影响结论 */ }
}

const cleanups = []
afterEach(() => {
  while (cleanups.length) rmrf(cleanups.pop())
})

function track (base) { cleanups.push(base); return base }

describe('auth-partition-reclaim：形态识别', () => {
  it('只认每次新建的临时分区前缀', () => {
    expect(isThrowawayPartitionName('auth-auth-wechat_mp-1790418403514')).toBe(true)
    expect(isThrowawayPartitionName('auth-auth-saved-kuaishou-1790418403999')).toBe(true)
    expect(isThrowawayPartitionName('silent-auth-douyin-1790400000001')).toBe(true)
  })

  it('绝不认领账号分区/身份分区/legacy 单前缀', () => {
    // account-* 是标签页长期分区，里面是在用凭证；误判即抹号
    expect(isThrowawayPartitionName('account-18c23d34')).toBe(false)
    expect(isThrowawayPartitionName('logto-identity')).toBe(false)
    expect(isThrowawayPartitionName('rpa-kuaishou-acct1')).toBe(false)
    // legacy 形态与 auth-<真实 accountId> 同形，无法安全区分 ⇒ 一律不碰
    expect(isThrowawayPartitionName('auth-zhihu-1700000000000')).toBe(false)
    expect(isThrowawayPartitionName('auth-18c23d34')).toBe(false)
  })

  it('同组键剥掉尾部时间戳，非时间戳后缀自成一组', () => {
    expect(groupKeyOf('auth-auth-wechat_mp-1790418403514')).toBe('auth-auth-wechat_mp')
    expect(groupKeyOf('auth-auth-wechat_mp-1790343224833')).toBe('auth-auth-wechat_mp')
    // 结尾不是 -<数字> 时不得与人合批（否则会被当成同组而误删）
    expect(groupKeyOf('auth-auth-wechat_mp-manual')).toBe('auth-auth-wechat_mp-manual')
    expect(groupKeyOf('auth-auth-zhihu-1')).not.toBe(groupKeyOf('auth-auth-zhihu-manual'))
  })
})

describe('auth-partition-reclaim：分组保留判据', () => {
  it('每组只留字典序末位，其余进 victims', () => {
    const plan = planReclaim(Object.keys(REAL))
    expect(plan.victims).toEqual([
      'auth-auth-wechat_mp-1790343224833',
      'auth-auth-zhihu-1790343393950',
    ])
    expect(plan.kept).toEqual([
      'auth-auth-wechat_mp-1790418403514',
      'auth-auth-zhihu-1790352605579',
      'silent-auth-douyin-1790400000001',
    ])
    expect(plan.skippedActive).toEqual([])
  })

  it('正在使用的分区一律不列为删除对象', () => {
    const plan = planReclaim(Object.keys(REAL), ['auth-auth-wechat_mp-1790343224833'])
    expect(plan.victims).toEqual(['auth-auth-zhihu-1790343393950'])
    expect(plan.skippedActive).toEqual(['auth-auth-wechat_mp-1790343224833'])
  })

  it('最新那份若在使用中，仍然保留且不删同组其余（字典序末位不变）', () => {
    const plan = planReclaim(Object.keys(REAL), ['auth-auth-wechat_mp-1790418403514'])
    expect(plan.kept).toContain('auth-auth-wechat_mp-1790418403514')
    expect(plan.victims).toContain('auth-auth-wechat_mp-1790343224833')
  })

  it('空输入与非临时分区的组合不产出任何删除项', () => {
    expect(planReclaim([]).victims).toEqual([])
    expect(planReclaim(['account-1', 'logto-identity']).victims).toEqual([])
  })
})

describe('auth-partition-reclaim：与定位端的读取中性关系（本模块存在理由）', () => {
  // findAuthPartitionDir 每组只读字典序末位 ⇒ 删除非末位不可能改变它的返回。
  // 这条必须注入真实现来验，不是把结论抄成注释。
  it('回收前后 findAuthPartitionDir 返回同一个分区名', async () => {
    const base = track(mkProfile(Object.keys(REAL)))
    const { findAuthPartitionDir } = await import('./auth-partition.js')
    const before = findAuthPartitionDir('wechat_mp', null, base)
    const beforeZhihu = findAuthPartitionDir('zhihu', null, base)
    expect(before).toBe('auth-auth-wechat_mp-1790418403514')
    expect(beforeZhihu).toBe('auth-auth-zhihu-1790352605579')

    const summary = reclaim({ userDataPath: base })
    expect(summary.removed).toEqual([
      'auth-auth-wechat_mp-1790343224833',
      'auth-auth-zhihu-1790343393950',
    ])

    expect(findAuthPartitionDir('wechat_mp', null, base)).toBe(before)
    expect(findAuthPartitionDir('zhihu', null, base)).toBe(beforeZhihu)
  })

  it('未声明标记的平台也不得被顺带删掉（回收域按前缀闭合）', () => {
    const base = track(mkProfile(['account-aaa', 'auth-zhihu-1700000000000', 'logto-identity']))
    const summary = reclaim({ userDataPath: base })
    expect(summary.removed).toEqual([])
    expect(fs.readdirSync(path.join(base, 'session', 'Partitions')).sort()).toEqual([
      'account-aaa', 'auth-zhihu-1700000000000', 'logto-identity',
    ])
  })
})

describe('auth-partition-reclaim：真实文件系统回收', () => {
  it('删目录、保留其余，并如实汇总', () => {
    const base = track(mkProfile(Object.keys(REAL)))
    const summary = reclaim({ userDataPath: base })
    const left = fs.readdirSync(path.join(base, 'session', 'Partitions')).sort()
    expect(left).toEqual([
      'account-18c23d34',
      'account-ef2ccaa2',
      'auth-auth-wechat_mp-1790418403514',
      'auth-auth-zhihu-1790352605579',
      'auth-zhihu-1700000000000',
      'logto-identity',
      'silent-auth-douyin-1790400000001',
    ])
    expect(summary.scanned).toBe(Object.keys(REAL).length)
    expect(summary.errors).toBe(0)
  })

  it('两种历史根目录（session/Partitions 与 Partitions）都覆盖', () => {
    const rootBase = mkTmp()
    track(rootBase)
    const second = path.join(rootBase, 'Partitions')
    fs.mkdirSync(second, { recursive: true })
    fs.mkdirSync(path.join(second, 'auth-auth-douyin-1'), { recursive: true })
    fs.mkdirSync(path.join(second, 'auth-auth-douyin-2'), { recursive: true })
    const summary = reclaim({ userDataPath: rootBase })
    expect(summary.removed).toEqual(['auth-auth-douyin-1'])
    expect(fs.existsSync(path.join(second, 'auth-auth-douyin-1'))).toBe(false)
    expect(fs.existsSync(path.join(second, 'auth-auth-douyin-2'))).toBe(true)
  })

  it('目录不存在时静默返回，不抛不报错', () => {
    const base = track(mkTmp())
    expect(reclaim({ userDataPath: base })).toMatchObject({ scanned: 0, removed: [], errors: 0 })
  })

  it('userDataPath 缺失时不猜路径（fail closed，绝不删当前 profile）', () => {
    const log = { warn: vi.fn(), info: vi.fn() }
    const summary = reclaim({ app: { getPath: () => '' }, log })
    expect(summary.removed).toEqual([])
    expect(summary.errors).toBe(0)
    expect(log.warn).not.toHaveBeenCalled()
  })

  it('删除失败只计错并继续处理其余对象，函数不抛', () => {
    const base = track(mkProfile(Object.keys(REAL)))
    const log = { warn: vi.fn(), info: vi.fn() }
    const boom = new Error('EBUSY: resource busy')
    const fsImpl = Object.assign(Object.create(Object.getPrototypeOf(fs)), fs, {
      rmSync (p, o) {
        if (String(p).endsWith('auth-auth-zhihu-1790343393950')) throw boom
        return fs.rmSync(p, o)
      },
    })
    const summary = reclaim({ userDataPath: base, fsImpl, log })
    expect(summary.removed).toEqual(['auth-auth-wechat_mp-1790343224833'])
    expect(summary.errors).toBe(1)
    expect(log.warn).toHaveBeenCalledWith('AuthReclaim', expect.stringContaining('auth-auth-zhihu-1790343393950'))
  })

  it('realpath 逃出分区根的目标拒绝删除（禁止碰父目录之外的路径）', () => {
    const base = track(mkProfile(Object.keys(REAL)))
    const log = { warn: vi.fn(), info: vi.fn() }
    const escaped = path.join(base, 'session', 'Partitions', 'auth-auth-wechat_mp-1790343224833')
    const fsImpl = Object.assign(Object.create(Object.getPrototypeOf(fs)), fs, {
      realpathSync (p) {
        if (String(p) === escaped) return path.join(base, 'secret-data')
        return fs.realpathSync(p)
      },
    })
    const summary = reclaim({ userDataPath: base, fsImpl, log })
    expect(summary.removed).toEqual(['auth-auth-zhihu-1790343393950'])
    expect(summary.errors).toBe(1)
    expect(fs.existsSync(escaped)).toBe(true)
    expect(log.warn).toHaveBeenCalledWith('AuthReclaim', expect.stringContaining('outside partition root'))
  })

  it('有产出时留痕一行（静默回收等于没修）', () => {
    const base = track(mkProfile(['auth-auth-xiaohongshu-1', 'auth-auth-xiaohongshu-2']))
    const log = { warn: vi.fn(), info: vi.fn() }
    reclaim({ userDataPath: base, log })
    expect(log.info).toHaveBeenCalledWith('AuthReclaim', expect.stringContaining('removed=1'))
  })
})

describe('auth-partition-reclaim：scheduleReclaim', () => {
  it('延迟到下一个 immediate，调用方同步期不做任何 fs 动作', async () => {
    const base = mkProfile(['auth-auth-x-1', 'auth-auth-x-2'])
    cleanups.push(base)
    const calls = []
    const fsImpl = {
      existsSync (p) { calls.push('existsSync'); return fs.existsSync(p) },
      readdirSync (p) { return fs.readdirSync(p) },
      statSync (p) { return fs.statSync(p) },
      realpathSync (p) { return fs.realpathSync(p) },
      rmSync (p, o) { calls.push('rmSync'); return fs.rmSync(p, o) },
    }
    scheduleReclaim({ userDataPath: base, fsImpl })
    expect(calls).toEqual([])
    await new Promise(function (resolve) { setImmediate(resolve) })
    expect(calls).toContain('rmSync')
    expect(fs.existsSync(path.join(base, 'session', 'Partitions', 'auth-auth-x-1'))).toBe(false)
  })

  it('底层抛错只 warn，不外泄给调用方（回收属旁路）', async () => {
    const log = { warn: vi.fn(), info: vi.fn() }
    const base = mkTmp()
    cleanups.push(base)
    const fsImpl = {
      existsSync: () => true,
      readdirSync: () => { throw new Error('EACCES: permission denied') },
      statSync: () => ({ isDirectory: () => true }),
      realpathSync: (p) => p,
      rmSync: () => { throw new Error('不该走到这里') },
    }
    let threw = false
    try { scheduleReclaim({ userDataPath: base, fsImpl, log }) } catch (_e) { threw = true }
    expect(threw).toBe(false)
    expect(log.warn).not.toHaveBeenCalled()
    await new Promise(function (resolve) { setImmediate(resolve) })
    expect(log.warn).toHaveBeenCalledWith('AuthReclaim', expect.stringContaining('permission denied'))
  })
})

describe('auth-partition-reclaim：wipeSessionStorage', () => {
  it('清存储与清缓存各调一次并返回 true', async () => {
    const clearStorageData = vi.fn().mockResolvedValue(undefined)
    const clearCache = vi.fn().mockResolvedValue(undefined)
    const ok = await wipeSessionStorage({ clearStorageData, clearCache }, { warn: vi.fn() })
    expect(ok).toBe(true)
    expect(clearStorageData).toHaveBeenCalledTimes(1)
    expect(clearCache).toHaveBeenCalledTimes(1)
  })

  it('宿主没有 clearCache 时仍能清存储', async () => {
    const clearStorageData = vi.fn().mockResolvedValue(undefined)
    expect(await wipeSessionStorage({ clearStorageData }, { warn: vi.fn() })).toBe(true)
    expect(clearStorageData).toHaveBeenCalledTimes(1)
  })

  it('清空失败只 warn 并返回 false，不抛', async () => {
    const log = { warn: vi.fn() }
    const session = { clearStorageData: vi.fn().mockRejectedValue(new Error('boom')) }
    expect(await wipeSessionStorage(session, log)).toBe(false)
    expect(log.warn).toHaveBeenCalledWith('AuthReclaim', expect.stringContaining('boom'))
  })

  it('session 缺失/无该 API 时如实留痕并返回 false', async () => {
    const log = { warn: vi.fn() }
    expect(await wipeSessionStorage(null, log)).toBe(false)
    expect(await wipeSessionStorage({}, log)).toBe(false)
    expect(log.warn).toHaveBeenCalledTimes(2)
  })

  it('clearStorageData/clearCache 归属核对：必须挂在 Session 而不是 WebContents', () => {
    // 逐级上溯找 electron.d.ts（与 auth-view-manager.test.js 的宿主归属锁同口径）：
    // 本仓 node-linker=hoisted，electron 装在 worktree 根，数 `..` 会指错并退化成静默跳过。
    const path_ = require('path')
    let dir = __dirname
    let dtsPath = null
    for (let i = 0; i < 8; i += 1) {
      const cand = path_.join(dir, 'node_modules', 'electron', 'electron.d.ts')
      if (fs.existsSync(cand)) { dtsPath = cand; break }
      const parent = path_.dirname(dir)
      if (parent === dir) break
      dir = parent
    }
    expect(dtsPath, 'electron.d.ts 未找到 —— 宿主 API 归属锁禁止静默跳过').not.toBeNull()
    const dts = fs.readFileSync(dtsPath, 'utf8')
    const start = dts.indexOf('class Session extends')
    expect(start).toBeGreaterThan(-1)
    const body = dts.slice(start, dts.indexOf('\n  }', start))
    expect(body).toContain('clearStorageData(options?: ClearStorageDataOptions): Promise<void>;')
    expect(body).toContain('clearCache(): Promise<void>;')
    // 反失明：解析退化不得静默通过
    expect(body.length).toBeGreaterThan(1000)
  })
})
