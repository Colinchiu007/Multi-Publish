/**
 * 反证用例：把锁提到 await 之前后，重入窗口应关闭。
 *
 * 这是 P0-1 修复方案的**变异测试** —— 若修复后本用例仍显示 2 次，
 * 说明方案无效，结论不可信。
 *
 * 手法：不改生产代码，而是用一个「已修复版」的 handlePublish 复刻体，
 *       验证「锁前置」这个改动确实能关闭窗口。若成立，方案即被证明有效。
 */
import { describe, it, expect } from 'vitest'
import { ref } from 'vue'

function makeHandlePublish(publishing, ensureLogin) {
  const trace = []
  async function handlePublish() {
    if (publishing.value) { trace.push('blocked'); return }
    // 【修复点】锁前置到第一个 await 之前
    publishing.value = true
    trace.push('locked')
    try {
      const ok = await ensureLogin()
      if (!ok) { trace.push('cancelled'); return }
      trace.push('enter-body')
    } finally {
      publishing.value = false
      trace.push('unlocked')
    }
  }
  return { handlePublish, trace }
}

describe('P0-1 反证：修复方案有效性变异测试', () => {
  it('锁前置后，窗口内第二次调用应被拦住', async () => {
    const publishing = ref(false)
    let resolvers = []
    const gate = () => new Promise((r) => resolvers.push(r))
    const { handlePublish, trace } = makeHandlePublish(publishing, gate)

    const p1 = handlePublish()
    await Promise.resolve()
    const p2 = handlePublish()
    await Promise.resolve()

    console.log(`[反证] 修复版时序 = ${JSON.stringify(trace)}`)

    resolvers.forEach((r) => r(true))
    await Promise.allSettled([p1, p2])

    const bodies = trace.filter((x) => x === 'enter-body').length
    const blocked = trace.filter((x) => x === 'blocked').length
    console.log(`[反证] 进入发布体 ${bodies} 次 | 被守卫拦截 ${blocked} 次`)

    expect(bodies).toBe(1)   // 只有第一次能进
    expect(blocked).toBe(1)  // 第二次被拦
  })

  it('对照组：不改动的原版（锁在 await 之后）必然失败 —— 证明本测试有鉴别力', async () => {
    const publishing = ref(false)
    let resolvers = []
    const gate = () => new Promise((r) => resolvers.push(r))
    const trace = []
    // 原版：守卫 → await → 置锁
    async function original() {
      if (publishing.value) { trace.push('blocked'); return }
      trace.push('passed')
      const ok = await gate()
      if (!ok) { trace.push('cancelled'); return }
      publishing.value = true
      trace.push('enter-body')
      publishing.value = false
    }

    const p1 = original(); await Promise.resolve()
    const p2 = original(); await Promise.resolve()
    resolvers.forEach((r) => r(true))
    await Promise.allSettled([p1, p2])

    const bodies = trace.filter((x) => x === 'enter-body').length
    console.log(`[反证-对照组] 原版进入发布体 ${bodies} 次 | 拦截 ${trace.filter(x=>x==='blocked').length} 次`)
    expect(bodies).toBe(2)  // 原版确实失败 —— 证明上面那个断言有鉴别力
  })
})
