import { describe, it, expect } from 'vitest'

__enableElectronMock()

const { isProvablyNotSubmitted, markDefinitelyNotSent, listSignatures } = require('./publish-not-submitted')

describe('publish-not-submitted（P0-1 细粒度打标）', () => {
  describe('命中词表：可确证发生在平台写之前', () => {
    const hits = [
      'douyin not logged in',
      'zhihu not logged in',
      'wechat_mp not logged in',
      'youtube not logged in',
      'bilibili not logged in',
      '平台 Cookie 缺失（账号 acc_1 未登录或凭证不可用）',
      '凭证不可用',
      '凭证缺失',
      '风控挂起：douyin',
      'RiskSuspendedError',
    ]
    for (const text of hits) {
      it(`命中：${text}`, () => {
        expect(isProvablyNotSubmitted(text)).toBe(true)
      })
    }
  })

  describe('不命中：一律按已提交处理（保守侧，宁可多等一个窗口）', () => {
    const misses = [
      '',
      undefined,
      null,
      'API 发布失败',
      'RPA 发布失败',
      '请求超时',
      'net::ERR_CONNECTION_REFUSED',
      '标题不能为空',
      '视频信息探测失败（ffprobe 不可用或文件损坏）',
      '发布结果缺少平台作品 ID',
      '风控命中：发布过于频繁',
      // ── 评审 i2 收窄后**必须不命中**的中文登录短语 ──
      // rpa-view-platforms.js 的失败检测正则含 `登录失效|请登录`，那是**动作之后**从页面文本
      // 判出来的，此时内容可能已被平台接收 ⇒ 判成「未送出」会误回滚已提交窗口（危险侧）
      '登录失效，请重新登录',
      '登录超时',
      '未登录',
      '请先登录',
    ]
    for (const text of misses) {
      it(`不命中：${JSON.stringify(text)}`, () => {
        expect(isProvablyNotSubmitted(text)).toBe(false)
      })
    }
  })

  it('markDefinitelyNotSent 只打标、不改 message、不吞错误', () => {
    const err = new Error('douyin not logged in')
    const ok = markDefinitelyNotSent(err)
    expect(ok).toBe(true)
    expect(err.definitelyNotSent).toBe(true)
    expect(err.message).toBe('douyin not logged in')
    expect(err).toBeInstanceOf(Error)
  })

  it('未命中时不打标（不得留下 definitelyNotSent: false 这种「看起来判过」的残迹）', () => {
    const err = new Error('API 发布失败')
    expect(markDefinitelyNotSent(err)).toBe(false)
    expect('definitelyNotSent' in err).toBe(false)
  })

  it('可用第二个参数覆盖判定文本（result.error 与 err.message 不同源时）', () => {
    const err = new Error('包装后的错误')
    expect(markDefinitelyNotSent(err, 'douyin not logged in')).toBe(true)
    expect(err.message).toBe('包装后的错误')
  })

  it('传入非对象不抛（调用方在 catch 边界可能拿到字符串）', () => {
    expect(() => markDefinitelyNotSent('douyin not logged in')).not.toThrow()
    expect(markDefinitelyNotSent('douyin not logged in')).toBe(true)
    expect(markDefinitelyNotSent(undefined)).toBe(false)
  })

  it('词表每条都带「为什么在平台写之前」的理由（新增条目必须解释机制，防随手加泛化错误）', () => {
    const sigs = listSignatures()
    // 评审 i2 收窄后剩 3 条：RPA 登录态早退 / 发出请求前的凭证缺失 / 派发前拦截的风控挂起
    expect(sigs.length).toBe(3)
    for (const s of sigs) {
      expect(typeof s.source).toBe('string')
      expect(s.source.length).toBeGreaterThan(0)
      expect(typeof s.why).toBe('string')
      expect(s.why.length).toBeGreaterThan(10)
    }
  })

  it('词表刻意不含泛化错误（用**行为断言**而非字符串包含：「登录超时」是合法的登录态信号）', () => {
    const generics = [
      'API 发布失败', '发布失败', 'RPA 发布失败', '上传失败', '提交失败',
      '请求超时', 'TIMEOUT', 'network error', 'net::ERR_TIMED_OUT',
      '风控命中：发布过于频繁', '内容审核不通过',
    ]
    for (const g of generics) {
      expect(isProvablyNotSubmitted(g), g).toBe(false)
    }
  })
})
