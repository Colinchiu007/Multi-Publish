// @ts-check
/**
 * M-5 回归锁：useCopyLibrary 读-改-写串行化
 *
 * 缺陷（报告 M-5）：`upsertRewrite` / `removeRewrite` 都是
 *   读（:136 await readCurrent）→ 内存构造（:149）→ 写（:151 await storeSetSetting）
 * 中间**没有任何互斥**。两个调用各自的「读」如果重叠，就会读到同一份 current，
 * 各自算出一个 next，后写者**静默覆盖**先写者 —— 用户保存的两条文案丢一条，
 * 且界面毫无提示。
 *
 * 已实证（基线 770967c0，报告附录 C）：把两个调用的读阶段强制同步后，
 * 落库只剩 1 条。
 *
 * 触发条件（重要，比报告初版精确）：**只有两个调用的「读」阶段真正重叠才丢失**。
 * 若写入生效快于第二次读完成（即第二次读已看到第一次的写），则不会丢。
 * 真实场景中，手工操作间隔通常 > 一次 IPC 往返 ⇒ 不一定命中；
 * 但程序化 / 自动保存、或 IPC 较慢时会命中。
 *
 * 装置：真实 useCopyLibrary（无参工厂），只 mock 底层 settings IPC
 *       （真实来源是 @/api/publisher，不是 @/api/settings）。
 *       关键：用 `readGate` 让前两次「读」严格同步，制造真实竞态窗口。
 *
 * 本文件断言的是**修复后应然**。原复现型文件 p0-5-copy-library-race.test.js
 * 已在 M-1/M-3 修复时按同样做法移除（缺陷复现型测试的使命随缺陷修复而终结）。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

// 底层存储：真实语义是「读当前值 / 写新值」，写覆盖
let store = {}
let readDelayMs = 30
/**
 * 读延迟（毫秒）。串行化之后，两个调用**本来就不该**同时进入读阶段 ——
 * 所以这里不再用「等两个读都到齐」的闸门（那会与串行队列死锁），
 * 而是给每次读一个可区分的延迟，直接断言「两次读的起始时间不重叠」。
 */
let readLog = []

const { storeGetSettingMock, storeSetSettingMock } = vi.hoisted(() => ({
  storeGetSettingMock: vi.fn(),
  storeSetSettingMock: vi.fn(),
}))

// 读起始时刻注入点（测试可读）
let readStartLog = null

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
const keysOf = () => JSON.parse(store[COPY_REWRITES_KEY] || '[]').map((r) => r.fromKey)

describe('M-5 回归锁：读-改-写已串行化', () => {
  beforeEach(() => {
    store = {}
    readDelayMs = 30
    readLog = []
    readStartLog = null
    // 先清调用记录，再装实现 —— clearAllMocks 会一并清掉 mockImplementation
    vi.clearAllMocks()
    storeGetSettingMock.mockImplementation(async (key) => {
      const id = readLog.length
      const startedAt = Date.now()
      if (readStartLog) readStartLog.push({ id, at: startedAt, endedAt: startedAt })
      await new Promise((r) => setTimeout(r, readDelayMs))
      if (readStartLog) readStartLog[readStartLog.length - 1].endedAt = Date.now()
      return store[key] ?? null
    })
    storeSetSettingMock.mockImplementation(async (key, value) => {
      store[key] = value
      return { code: 0 }
    })
  })

  it('基线：顺序两次 upsert 应落库 2 条', async () => {
    const lib = useCopyLibrary()
    await lib.upsertRewrite({ fromKey: 'k1', title: '标题一', content: '内容一'.repeat(10) })
    await tick()
    await lib.upsertRewrite({ fromKey: 'k2', title: '标题二', content: '内容二'.repeat(10) })
    await tick()
    expect(keysOf()).toEqual(['k2', 'k1'])
  })

  it('并发 upsert：两次「读」不得重叠，且数据一条不丢', async () => {
    // 先在窗口外写一条，让 store 非空（更贴近真实：库里已有数据）
    const warm = useCopyLibrary()
    await warm.upsertRewrite({ fromKey: 'seed', title: '种子', content: '种子内容'.repeat(10) })
    await tick()

    const reads = []
    readStartLog = reads
    const libA = useCopyLibrary()
    const libB = useCopyLibrary()
    const pA = libA.upsertRewrite({ fromKey: 'k1', title: '标题一', content: '内容一'.repeat(10) })
    const pB = libB.upsertRewrite({ fromKey: 'k2', title: '标题二', content: '内容二'.repeat(10) })
    await Promise.all([pA, pB])
    await tick()

    // 断言 1：数据一条不丢
    const keys = keysOf()
    expect(keys).toContain('k1')
    expect(keys).toContain('k2')
    expect(keys).toContain('seed')
    expect(keys).toHaveLength(3)

    // 断言 2：两次「读」必须**完全串行**——前一次读完，后一次才开始。
    // 这才是串行队列的直接证据，且不依赖「能否碰巧丢数据」。
    //
    // 为什么不用「数据丢了」当判据：JS 单线程下第一个调用会在
    // await readCurrent() 处让出，第二个调用才开始读；只要第一个的
    // 写在第二次读之前完成，就**不会丢**。也就是说「丢数据」取决于
    // 两个 await 的实际交错时序，不是必然 —— 报告里把它说成
    // 「并发即丢」偏宽，实测确实存在不丢的时序。
    // 「读区间不重叠」才是串行化的稳定可判据。
    expect(reads.length).toBeGreaterThanOrEqual(2)
    const [r0, r1] = reads
    expect(r1.at).toBeGreaterThanOrEqual(r0.endedAt)
  })

  it('并发 upsert + remove：remove 不得抹掉同时写入的条目', async () => {
    const lib = useCopyLibrary()
    const base = await lib.upsertRewrite({ fromKey: 'base', title: '基线', content: '基线内容'.repeat(10) })
    await tick()

    const libA = useCopyLibrary()
    const libB = useCopyLibrary()
    const pWrite = libA.upsertRewrite({ fromKey: 'new', title: '新条目', content: '新内容'.repeat(10) })
    const pRemove = libB.removeRewrite(base.id)
    await Promise.all([pWrite, pRemove])
    await tick()

    const keys = keysOf()
    // new 必须活下来；base 被删是预期
    expect(keys).toContain('new')
    expect(keys).not.toContain('base')
  })

  it('链中毒防护：一次写入失败后，后续写入仍须正常落库', async () => {
    const lib = useCopyLibrary()
    // 让第一次写失败（模拟磁盘/设置写入抛错）
    storeSetSettingMock.mockImplementationOnce(async () => { throw new Error('storage boom') })
    const r1 = await lib.upsertRewrite({ fromKey: 'bad', title: '会失败', content: 'x'.repeat(10) })
    await tick()
    // 失败被吞：返回 null 而不是 reject（调用方 useCopyDetailMode 靠这个不阻塞主流程）
    expect(r1).toBeNull()

    // 关键：后续写入必须正常 —— 链没有进入 rejected 态
    const r2 = await lib.upsertRewrite({ fromKey: 'good', title: '会成功', content: 'y'.repeat(10) })
    await tick()
    expect(r2).not.toBeNull()
    expect(keysOf()).toContain('good')
  })

  it('源码锚点：写路径必须走串行队列（防止本文件与实现漂移）', async () => {
    const { readFileSync } = await import('node:fs')
    const { resolve } = await import('node:path')
    const src = readFileSync(
      resolve(process.cwd(), 'src/composables/useCopyLibrary.js'),
      'utf8',
    )
    // 模块级写队列
    expect(src).toMatch(/let\s+\w*writeChain\w*\s*=\s*Promise\.resolve\(\)/)
    // upsertRewrite 必须把整段 read-modify-write 挂进队列
    const upsertIdx = src.indexOf('async function upsertRewrite')
    expect(upsertIdx).toBeGreaterThan(-1)
    const removeIdx = src.indexOf('async function removeRewrite')
    expect(removeIdx).toBeGreaterThan(upsertIdx)
    const upsertBody = src.slice(upsertIdx, removeIdx)
    expect(upsertBody).toMatch(/writeChain\s*=/)
    const removeTail = src.slice(removeIdx)
    expect(removeTail).toMatch(/writeChain\s*=/)
    // 防链中毒：链节内部必须有 catch（失败不阻断后续写入）
    expect(src).toMatch(/catch\s*\(/)
  })

  it('串行队列对容量上限 MAX_COPY_REWRITES 无影响', async () => {
    const lib = useCopyLibrary()
    // 顺序写满 3 条（MAX 是 200，这里只验证路径没被破坏）
    for (const k of ['a', 'b', 'c']) {
      await lib.upsertRewrite({ fromKey: k, title: k, content: k.repeat(10) })
    }
    await tick()
    expect(keysOf()).toEqual(['c', 'b', 'a'])
    expect(MAX_COPY_REWRITES).toBe(200)
  })
})
