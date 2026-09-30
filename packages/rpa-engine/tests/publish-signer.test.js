// @ts-check
/**
 * publish-signer 单测（TDD：先声明契约，再验证实现）
 *
 * 契约来源：`01-docs/ANALYSIS-SIGN-SERVICE-DEEP-2026-09-30.md` §4.1 的四条借鉴点
 * （解耦统一入口 / 多适配器 / 确定性 / 软失败）+ 前置规范化（§4.1 sortQueryString）。
 */
const {
  sortQueryString,
  registerAdapter,
  hasAdapter,
  registeredCommands,
  sign,
  PAGE_SUBMIT_COMMANDS,
} = require('../src/publish-signer')

describe('sortQueryString（签名前置规范化）', () => {
  it('按 key 升序排列（与签名侧顺序一致才可能匹配）', () => {
    expect(sortQueryString('type=article&aid=1231&source=mp')).toBe('aid=1231&source=mp&type=article')
  })

  it('接受对象与键值对数组', () => {
    expect(sortQueryString({ b: '2', a: '1' })).toBe('a=1&b=2')
    expect(sortQueryString([['b', '2'], ['a', '1']])).toBe('a=1&b=2')
  })

  it('容忍无值参数与空输入', () => {
    expect(sortQueryString('flag&a=1')).toBe('a=1&flag=')
    expect(sortQueryString('')).toBe('')
    expect(sortQueryString(null)).toBe('')
  })
})

describe('适配器注册与分派（多平台，对应参考服务的 per-command handler）', () => {
  it('已确证的页面内提交平台默认注册', () => {
    for (const cmd of PAGE_SUBMIT_COMMANDS) expect(hasAdapter(cmd)).toBe(true)
  })

  it('未注册平台返回 NO_ADAPTER（软失败，不抛错）', async () => {
    const r = await sign('not-a-platform', {})
    expect(r.ok).toBe(false)
    expect(r.signature).toBe(null)
    expect(r.reason).toContain('NO_ADAPTER')
  })

  it('空 command 直接拒绝', async () => {
    const r = await sign('', {})
    expect(r.ok).toBe(false)
    expect(r.reason).toBe('EMPTY_COMMAND')
  })

  it('注册的自定义适配器可被分派，且输出被原样返回', async () => {
    registerAdapter('unit-test-platform', async (payload) => 'SIG-' + payload.n)
    expect(hasAdapter('unit-test-platform')).toBe(true)
    const r = await sign('unit-test-platform', { n: 1 })
    expect(r.ok).toBe(true)
    expect(r.signature).toBe('SIG-1')
    expect(r.via).toBe('adapter')
  })

  it('registeredCommands 可列出已注册平台（便于诊断）', () => {
    expect(registeredCommands()).toContain('unit-test-platform')
    expect(registeredCommands()).toContain('toutiao')
  })
})

describe('软失败语义（对应参考服务返回 "null" 的行为）', () => {
  it('适配器抛错 ⇒ 不冒泡，返回 ok:false 与原因', async () => {
    registerAdapter('throws-platform', async () => { throw new Error('boom') })
    const r = await sign('throws-platform', {})
    expect(r.ok).toBe(false)
    expect(r.signature).toBe(null)
    expect(r.reason).toContain('ADAPTER_THREW')
  })

  it('适配器返回 "null" 字符串 ⇒ 视作"无本地签名"，引导走页面内提交', async () => {
    registerAdapter('null-platform', async () => 'null')
    const r = await sign('null-platform', {})
    expect(r.ok).toBe(true)
    expect(r.signature).toBe(null)
    expect(r.via).toBe('page')
  })

  it('确定性：同一输入两次调用签名一致（服务端可校验的前提）', async () => {
    registerAdapter('det-platform', async (p) => 'D-' + JSON.stringify(p))
    const a = await sign('det-platform', { qr: 'a=1' })
    const b = await sign('det-platform', { qr: 'a=1' })
    expect(a.signature).toBe(b.signature)
  })

  it('页面内提交平台走 page 通道（signature 为 null，由页面自身签名）', async () => {
    const r = await sign('toutiao', { qr: 'a=1', body: '', ua: 'U' })
    expect(r.ok).toBe(true)
    expect(r.signature).toBe(null)
    expect(r.via).toBe('page')
  })
})
