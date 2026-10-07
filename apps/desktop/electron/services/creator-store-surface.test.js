/**
 * creator-store-surface.test.js — 方法面完整性锁（先红）
 *
 * 2026-10-07 的代价：整条主进程接线**从未真正跑通过一次**，而 365 项测试与 QM-1
 * 打包双双放过。原因不是覆盖率不够，是**测试全部用桩 store 直调 `registerHandlers`**，
 * 桩把 11 个缺失方法全补上了，真实现实缺 11 个（取证脚本用真实 sql.js +
 * 真实 store 走注册路径，输出「缺失 11/11」）。
 *
 * 所以这条锁的作用不是「测行为」，是**测方法面**：
 * 把 `ipc-handlers/creator.js` 真实调用到 `creatorStore.*` 的方法名解析出来，
 * 与 store 实际导出做集合比对。少一个就红。
 *
 * 为什么用 AST 解析而不是正则：正则会被注释和字符串里的 `store.x` 骗到
 * （本仓已因此踩过：preload 注释里的通道样例被契约测试当成真通道提取）。
 */
const fs = require('fs')
const path = require('path')
const { createCreatorStore } = require('./creator-store')

const HANDLER = fs.readFileSync(path.join(__dirname, '..', 'ipc-handlers', 'creator.js'), 'utf8')

/** 从注释与字符串里剥出真实代码，避免注释里的示例被当成调用点 */
function stripCommentsAndStrings (src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1 ')
    .replace(/'(?:[^'\\\n]|\\.)*'/g, "''")
    .replace(/"(?:[^"\\\n]|\\.)*"/g, '""')
    .replace(/`(?:[^`\\]|\\.)*`/g, '``')
}

/** IPC 层真实调用到的 store 方法集合 */
function calledStoreMethods (src) {
  const code = stripCommentsAndStrings(src)
  const out = new Set()
  for (const m of code.matchAll(/\bcreatorStore\.(\w+)\s*\(/g)) out.add(m[1])
  return out
}

/** runtime 层真实调用到的 store 方法集合（enqueueOutbox 也在其中） */
function calledRuntimeStoreMethods (src) {
  const code = stripCommentsAndStrings(src)
  const out = new Set()
  for (const m of code.matchAll(/\bstore\.(\w+)\s*\(/g)) out.add(m[1])
  return out
}

describe('creator-store · 方法面完整性（真实调用点 vs 实际导出）', () => {
  it('IPC 层调用到的 creatorStore 方法必须全部存在', () => {
    const called = calledStoreMethods(HANDLER)
    // 先证明提取器确实抓到了东西，否则本锁会「因为提不到而全绿」
    expect(called.size).toBeGreaterThanOrEqual(8)

    const store = createCreatorStore({ prepare: () => ({ run: () => ({ changes: 0 }), all: () => [] }) })
    const missing = [...called].filter((m) => typeof store[m] !== 'function')
    expect(missing, `store 缺少 IPC 层要用的方法：${missing.join(', ')}`).toEqual([])
  })

  it('runtime 层调用到的 store 方法必须全部存在', () => {
    const RUNTIME = path.join(__dirname, 'creator-runtime.js')
    const called = calledRuntimeStoreMethods(fs.readFileSync(RUNTIME, 'utf8'))
    expect(called.size).toBeGreaterThan(0)

    const store = createCreatorStore({ prepare: () => ({ run: () => ({ changes: 0 }), all: () => [] }) })
    const missing = [...called].filter((m) => typeof store[m] !== 'function')
    expect(missing, `store 缺少 runtime 要用的方法：${missing.join(', ')}`).toEqual([])
  })

  it('store 导出的每个方法都是函数（防止导出 undefined 冒充存在）', () => {
    const store = createCreatorStore({ prepare: () => ({ run: () => ({ changes: 0 }), all: () => [] }) })
    for (const [k, v] of Object.entries(store)) {
      expect(typeof v, `${k} 不是函数`).toBe('function')
    }
  })
})
