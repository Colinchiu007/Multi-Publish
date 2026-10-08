// CCG 评审 i3 运行时验证：API Key 链路的脱壳必须真实发生（不是纸面声明）。
//
// 关键点：脱壳（toPlainIpcValue）发生在 **electron-bridge 内部**，
// mock 掉 electron-bridge 就等于把脱壳一起 mock 掉了（首版就犯了这个错：
// mock 后收到的仍是 reactive 原对象，"脱壳生效"的断言不可能成立）。
//
// 所以本文件走**真实桥接层**：只 mock window.electronAPI（preload 暴露面），
// 断言暴露面上收到的参数是 plain object —— 这是脱壳之后的形态。
//
//   pnpm exec vitest run src/api/apikey-plain-ipc.test.js

import { describe, it, expect, vi, beforeEach } from 'vitest'

const seenArgs = []
const fakeApi = {
  modelProviderCreate: vi.fn(async (...args) => {
    seenArgs.push(args)
    return { code: 0, data: { id: 1 } }
  }),
}

describe('CCG i3：API Key 链路脱壳的运行时验证（走真实桥接层）', () => {
  beforeEach(() => {
    seenArgs.length = 0
    vi.resetModules()
    // 模拟 preload 注入后的暴露面
    vi.stubGlobal('window', { electronAPI: fakeApi })
  })

  it('reactive 表单传给 modelProviderCreate，preload 收到的必须是 plain object', async () => {
    // 动态 import：确保在 stub window 之后才加载被测模块
    const { modelProviderCreate } = await import('./model-providers')
    const { reactive } = await import('vue')
    const form = reactive({ name: 'p1', apiKey: 'sk-secret', settings: { baseUrl: 'https://x' } })

    await modelProviderCreate(form)

    expect(fakeApi.modelProviderCreate).toHaveBeenCalledTimes(1)
    const [passedData] = seenArgs[0]
    // 关键断言 1：preload 收到的不是 reactive Proxy 引用（脱壳真的发生了）
    expect(passedData).not.toBe(form)
    // 关键断言 2：内容完整（脱壳不丢字段）
    expect(passedData).toEqual({ name: 'p1', apiKey: 'sk-secret', settings: { baseUrl: 'https://x' } })
  })
})
