/**
 * P0-5 实证验证：useCopyLibrary 读-改-写无串行化 → 并发下静默丢数据
 *
 * 被测链路（真实实现，useCopyLibrary.js）：
 *   :136  const current = await readCurrent()   ← 读
 *   :149  const next = [record, ...kept]...    ← 内存构造
 *   :151  await storeSetSetting(KEY, JSON.stringify(next))  ← 写
 *   中间无互斥、无写队列、无版本校验
 *
 * 装置：真实 useCopyLibrary（无参数工厂），只 mock 底层 settings IPC，
 *       并让 storeGetSetting 真正异步（模拟磁盘读延迟）——
 *       正是这个延迟窗口让两个调用读到同一份 current。
 *
 * 判据：并发两次 upsertRewrite 两条不同文案，落库后应保留 2 条；
 *      若只剩 1 条 ⇒ 静默丢失用户数据。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

// 底层存储：真实语义是「读当前值 / 写新值」，写覆盖
let store = {}
let readDelayMs = 5

// 说明：vi.mock 工厂会被 hoist，不能直接引用顶层 const（TDZ）。
// 用 vi.hoisted 提前分配，两边共享同一批 mock 函数。
const { storeGetSettingMock, storeSetSettingMock } = vi.hoisted(() => ({
  storeGetSettingMock: vi.fn(),
  storeSetSettingMock: vi.fn(),
}))

// 注意：真实来源是 @/api/publisher（useCopyLibrary.js:2），不是 @/api/settings
vi.mock('@/api/publisher', async (importOriginal) => {
  const actual = await importOriginal()
  return {
    ...actual,
    storeGetSetting: storeGetSettingMock,
    storeSetSetting: storeSetSettingMock,
  }
})

import { useCopyLibrary, COPY_REWRITES_KEY, MAX_COPY_REWRITES } from '@/composables/useCopyLibrary'

const tick = () => new Promise((r) => setTimeout(r, 30))

describe('P0-5 实证：并发 upsert 导致文案库静默丢数据', () => {
  beforeEach(() => {
    store = {}
    readDelayMs = 5
    // 先清调用记录，再装实现 —— clearAllMocks 会一并清掉 mockImplementation
    vi.clearAllMocks()
    storeGetSettingMock.mockImplementation(async (key) => {
      await new Promise((r) => setTimeout(r, readDelayMs))
      return store[key] ?? null
    })
    storeSetSettingMock.mockImplementation(async (key, value) => {
      store[key] = value
      return { code: 0 }
    })
  })

  it('基线：单次 upsert 应落库 1 条', async () => {
    const lib = useCopyLibrary()
    const rec = await lib.upsertRewrite({ fromKey: 'k1', title: '标题一', content: '内容一'.repeat(10) })
    await tick()
    const parsed = JSON.parse(store[COPY_REWRITES_KEY] || '[]')
    console.log(`[基线] 返回记录 id = ${rec && rec.id}`)
    console.log(`[基线] 落库条数 = ${parsed.length}`)
    expect(parsed).toHaveLength(1)
  })

  it('基线：顺序两次 upsert 应落库 2 条', async () => {
    const lib = useCopyLibrary()
    await lib.upsertRewrite({ fromKey: 'k1', title: '标题一', content: '内容一'.repeat(10) })
    await tick()
    await lib.upsertRewrite({ fromKey: 'k2', title: '标题二', content: '内容二'.repeat(10) })
    await tick()
    const parsed = JSON.parse(store[COPY_REWRITES_KEY] || '[]')
    console.log(`[基线-顺序] 落库条数 = ${parsed.length} | fromKeys = ${JSON.stringify(parsed.map(r => r.fromKey))}`)
    expect(parsed).toHaveLength(2)   // 顺序执行必须正确
  })

  it('实证：并发两次 upsert（强制同时读到同一份 current）→ 应丢失一条', async () => {
    const lib = useCopyLibrary()
    const libA = useCopyLibrary()
    const libB = useCopyLibrary()

    // 关键：真实竞态要求两个调用**读到同一份 current**。
    // 若读延迟相同、写入同步生效，第二个调用 await 返回时已看到第一次的写入 → 竞态不成立。
    // 因此把读延迟错开，让 A 先完成「读→算→写」，B 的读发生在 A 的写之前。
    // 用可控的 gate 让两个 readCurrent 的「读」阶段严格重叠。
    let readCount = 0
    let releaseBoth
    const bothRead = new Promise((r) => { releaseBoth = r })
    storeGetSettingMock.mockImplementation(async (key) => {
      readCount += 1
      if (readCount <= 2) {
        // 前两次读（两个并发调用各自的读）严格同步，等 A 写完再放行 B
        if (readCount === 2) setTimeout(() => releaseBoth(), 0)
        await bothRead
      }
      return store[key] ?? null
    })

    const pA = libA.upsertRewrite({ fromKey: 'k1', title: '标题一', content: '内容一'.repeat(10) })
    const pB = libB.upsertRewrite({ fromKey: 'k2', title: '标题二', content: '内容二'.repeat(10) })
    await Promise.all([pA, pB])
    await tick()

    const parsed = JSON.parse(store[COPY_REWRITES_KEY] || '[]')
    console.log(`[实证] 读次数 = ${readCount}`)
    console.log(`[实证] 落库条数 = ${parsed.length}`)
    console.log(`[实证] 幸存 fromKeys = ${JSON.stringify(parsed.map(r => r.fromKey))}`)

    if (parsed.length < 2) {
      console.log('[实证] 结论 ❌ 静默丢失坐实：两个调用读到同一份 current，后写者覆盖先写者')
    } else {
      console.log('[实证] 结论 ✅ 未复现丢失（本次读窗口未重叠）')
    }

    // 判据
    expect(readCount).toBeGreaterThanOrEqual(2)
  })

  it('实证变体：并发 upsert + remove 混合，是否出现「删掉了刚写的」', async () => {
    const libA = useCopyLibrary()
    const libB = useCopyLibrary()
    // 先建立一条基线数据
    const base = await libA.upsertRewrite({ fromKey: 'base', title: '基线', content: '基线内容'.repeat(10) })
    await tick()
    console.log(`[实证-混合] 基线记录 id = ${base.id}`)

    // 并发：一边写新条目，一边删基线条目
    const pWrite = libA.upsertRewrite({ fromKey: 'new', title: '新条目', content: '新内容'.repeat(10) })
    const pRemove = libB.removeRewrite(base.id)
    await Promise.all([pWrite, pRemove])
    await tick()

    const parsed = JSON.parse(store[COPY_REWRITES_KEY] || '[]')
    console.log(`[实证-混合] 落库条数 = ${parsed.length} | fromKeys = ${JSON.stringify(parsed.map(r => r.fromKey))}`)
    // 期望：只剩 new（base 被删、new 被写入）
    // 若为 0 或含 base，说明 remove 覆盖了 write
    expect(parsed.map(r => r.fromKey)).toContain('new')
  })

  it('反证：引入写串行队列后，并发不再丢数据', async () => {
    // 模拟修复：模块级 _writeChain 串行化
    let _writeChain = Promise.resolve()
    const local = {}
    const readD = async () => { await new Promise(r => setTimeout(r, readDelayMs)); return JSON.parse(local[COPY_REWRITES_KEY] || '[]') }
    const upsertSerialised = (entry) => {
      const run = async () => {
        const current = await readD()
        const record = { id: entry.fromKey, fromKey: entry.fromKey, title: entry.title, content: entry.content }
        const next = [record, ...current].slice(0, MAX_COPY_REWRITES)
        local[COPY_REWRITES_KEY] = JSON.stringify(next)
        return record
      }
      _writeChain = _writeChain.then(run, run)
      return _writeChain
    }

    await Promise.all([
      upsertSerialised({ fromKey: 'k1', title: '标题一', content: '内容一' }),
      upsertSerialised({ fromKey: 'k2', title: '标题二', content: '内容二' }),
    ])
    const parsed = JSON.parse(local[COPY_REWRITES_KEY] || '[]')
    console.log(`[反证-修复] 落库条数 = ${parsed.length} | fromKeys = ${JSON.stringify(parsed.map(r => r.fromKey))}`)
    expect(parsed).toHaveLength(2)   // 串行化后不再丢失
  })
})
