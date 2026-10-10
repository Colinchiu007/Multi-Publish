import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'fs'
import os from 'os'
import path from 'path'

__enableElectronMock()

const { createPublishEmergencyReleaseService, localDayKey } = require('./publish-emergency-release')

const ENV_KEY = 'MP_PUBLISH_EMERGENCY_MAX_PER_DAY'
const POLICY_KEY = 'publishFrequencyPolicy'

/** settings 的最小可用假实现（只需 getSettingObject / setSetting 两个方法） */
function makeStore (initial = {}) {
  const data = { ...initial }
  return {
    _data: data,
    getSettingObject (key, dflt) {
      const v = data[key]
      if (v === undefined) return dflt
      return typeof v === 'string' ? JSON.parse(v) : v
    },
    setSetting (key, value) {
      data[key] = value
    },
  }
}

describe('publish-emergency-release', () => {
  let tmpFile
  let savedEnv

  beforeEach(() => {
    savedEnv = process.env[ENV_KEY]
    delete process.env[ENV_KEY]
    tmpFile = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'mp-emg-')), 'audit.jsonl')
  })

  afterEach(() => {
    if (savedEnv === undefined) delete process.env[ENV_KEY]
    else process.env[ENV_KEY] = savedEnv
  })

  function makeService (opts = {}) {
    const store = opts.store || makeStore()
    let t = opts.now ? opts.now() : new Date('2026-10-10T10:00:00').getTime()
    return {
      store,
      service: createPublishEmergencyReleaseService({
        store,
        log: { warn: () => {} },
        identityService: opts.identityService,
        auditPath: opts.auditPath === undefined ? tmpFile : opts.auditPath,
        now: () => (opts.now ? opts.now() : t),
        cooldownMs: opts.cooldownMs,
      }),
      setNow: (v) => { t = v },
    }
  }

  it('默认上限 1：首次放行，用完即 exhausted（不是错误，是如实状态）', () => {
    const { service } = makeService()
    expect(service.check('douyin', 'acc_1')).toMatchObject({ allowed: true, code: null, used: 0, max: 1 })

    service.record('douyin', 'acc_1', { result: 'ok' })

    const after = service.check('douyin', 'acc_1')
    expect(after.allowed).toBe(false)
    expect(after.code).toBe('exhausted')
    expect(after.used).toBe(1)
  })

  it('冷却跨账号生效（与「每账号每日 1 次」正交）：防用多个账号把出口当常规通道刷', () => {
    const { service } = makeService({ cooldownMs: 10 * 60 * 1000 })
    service.record('douyin', 'acc_1', { result: 'ok' })

    const other = service.check('douyin', 'acc_2')
    expect(other.allowed).toBe(false)
    expect(other.code).toBe('cooldown')
    expect(other.retryAfterMs).toBeGreaterThan(0)
  })

  it('冷却只影响时间窗，不影响别的账号自身的每日额度', () => {
    let nowMs = new Date('2026-10-10T10:00:00').getTime()
    const store = makeStore()
    const service = createPublishEmergencyReleaseService({
      store, log: { warn: () => {} }, auditPath: tmpFile, now: () => nowMs, cooldownMs: 60000,
    })
    service.record('douyin', 'acc_1', { result: 'ok' })
    nowMs += 61000 // 冷却已过
    expect(service.check('douyin', 'acc_2')).toMatchObject({ allowed: true, used: 0, max: 1 })
    // acc_1 自己的当日额度仍已用尽
    expect(service.check('douyin', 'acc_1')).toMatchObject({ allowed: false, code: 'exhausted' })
  })

  it('跨日自动重置（dayKey 变化即视为新的一天，含冷却被清）', () => {
    let nowMs = new Date('2026-10-10T23:59:00').getTime()
    const store = makeStore()
    const service = createPublishEmergencyReleaseService({
      store, log: { warn: () => {} }, auditPath: tmpFile, now: () => nowMs,
    })
    service.record('douyin', 'acc_1', { result: 'ok' })
    expect(service.check('douyin', 'acc_1').allowed).toBe(false)

    nowMs = new Date('2026-10-11T00:01:00').getTime()
    const next = service.check('douyin', 'acc_1')
    expect(next.allowed).toBe(true)
    expect(next.used).toBe(0)
    expect(next.dayKey).toBe('2026-10-11')
  })

  it('上限 0 = 关闭该出口（disabled，与「已用尽」可区分）', () => {
    process.env[ENV_KEY] = '0'
    const { service } = makeService()
    const v = service.check('douyin', 'acc_1')
    expect(v.allowed).toBe(false)
    expect(v.code).toBe('disabled')
    expect(v.max).toBe(0)
  })

  it('设置页覆盖优先于环境变量', () => {
    process.env[ENV_KEY] = '5'
    const store = makeStore({ [POLICY_KEY]: { emergencyMaxPerDay: 2 } })
    const { service } = makeService({ store })
    expect(service.check('douyin', 'acc_1').max).toBe(2)
    // 覆盖非法时整体作废并回落 env（不得部分生效）
    const badStore = makeStore({ [POLICY_KEY]: { emergencyMaxPerDay: 99 } })
    const bad = makeService({ store: badStore })
    expect(bad.service.check('douyin', 'acc_1').max).toBe(5)
  })

  it('record 落追加式审计（每行一条 JSON，含操作者与原因）', () => {
    const { service } = makeService({
      identityService: { getOwnerSubject: () => 'user-abc' },
    })
    const r = service.record('douyin', 'acc_1', { result: 'ok', reason: '客户催稿' })
    expect(r.audited).toBe(true)

    const lines = fs.readFileSync(tmpFile, 'utf8').trim().split('\n')
    expect(lines).toHaveLength(1)
    const row = JSON.parse(lines[0])
    expect(row).toMatchObject({ platform: 'douyin', accountId: 'acc_1', operator: 'user-abc', reason: '客户催稿', result: 'ok' })
    expect(typeof row.ts).toBe('string')
  })

  it('评审 i5：审计必须记下被清掉的键（含连带释放的 platform:*），否则事后无法解释', () => {
    const { service } = makeService()
    const r = service.record('douyin', 'acc_1', { result: 'ok', clearedKeys: ['douyin:acc_1', 'douyin:*'] })
    expect(r.clearedKeys).toEqual(['douyin:acc_1', 'douyin:*'])
    const row = JSON.parse(fs.readFileSync(tmpFile, 'utf8').trim())
    expect(row.clearedKeys).toEqual(['douyin:acc_1', 'douyin:*'])
    // 缺省为空数组而不是 undefined（下游按数组消费）
    service.record('douyin', 'acc_2', { result: 'ok' })
    const rows = fs.readFileSync(tmpFile, 'utf8').trim().split('\n').map((l) => JSON.parse(l))
    expect(rows[1].clearedKeys).toEqual([])
  })

  it('操作者取不到时如实写 unknown（不假装是某人）', () => {
    const { service } = makeService()
    const r = service.record('douyin', 'acc_1', { result: 'ok' })
    expect(r.operator).toBe('unknown')
  })

  it('原因超长被截断（审计不落长文本）', () => {
    const { service } = makeService()
    service.record('douyin', 'acc_1', { result: 'ok', reason: 'x'.repeat(500) })
    const row = JSON.parse(fs.readFileSync(tmpFile, 'utf8').trim())
    expect(row.reason.length).toBe(200)
  })

  it('审计落盘失败 ⇒ audited=false 且不抛（放行本身仍执行，审计缺失如实上报）', () => {
    const { service } = makeService({ auditPath: path.join('Z:', 'nope', 'audit.jsonl') })
    let r
    expect(() => { r = service.record('douyin', 'acc_1', { result: 'ok' }) }).not.toThrow()
    expect(r.audited).toBe(false)
  })

  it('无审计路径时同样如实回报未落盘', () => {
    const store = makeStore()
    const service = createPublishEmergencyReleaseService({ store, log: { warn: () => {} }, auditPath: null, app: null })
    expect(service.record('douyin', 'acc_1', { result: 'ok' }).audited).toBe(false)
  })

  it('store 抛错时不把放行流程带崩（状态读失败按全新状态处理）', () => {
    const broken = {
      getSettingObject () { throw new Error('db down') },
      setSetting () { throw new Error('db down') },
    }
    const service = createPublishEmergencyReleaseService({
      store: broken, log: { warn: () => {} }, auditPath: tmpFile,
    })
    expect(service.check('douyin', 'acc_1').allowed).toBe(true)
    expect(() => service.record('douyin', 'acc_1', { result: 'ok' })).not.toThrow()
  })

  it('accountId 缺席与非缺席分别计数（键用哨兵 * 区分，不互相顶掉）', () => {
    const store = makeStore()
    const service = createPublishEmergencyReleaseService({
      store, log: { warn: () => {} }, auditPath: tmpFile,
      now: () => new Date('2026-10-10T10:00:00').getTime(), cooldownMs: 0,
    })
    service.record('douyin', null, { result: 'ok' })
    expect(service.check('douyin', null).used).toBe(1)
    expect(service.check('douyin', 'acc_1').used).toBe(0)
  })

  it('getStatus 不含副作用，且回报当日用量与冷却剩余', () => {
    const store = makeStore()
    let nowMs = new Date('2026-10-10T10:00:00').getTime()
    const service = createPublishEmergencyReleaseService({
      store, log: { warn: () => {} }, auditPath: tmpFile, now: () => nowMs, cooldownMs: 60000,
    })
    const before = service.getStatus()
    expect(before).toMatchObject({ dayKey: '2026-10-10', max: 1, retryAfterMs: 0 })
    service.record('douyin', 'acc_1', { result: 'ok' })
    nowMs += 20000
    const after = service.getStatus()
    expect(after.perAccount['douyin:acc_1']).toBe(1)
    expect(after.retryAfterMs).toBe(40000)
  })

  it('localDayKey 用本地时区（与守卫 today() 同口径）', () => {
    const t = new Date('2026-01-02T10:00:00').getTime()
    expect(localDayKey(t)).toBe('2026-01-02')
  })
})
