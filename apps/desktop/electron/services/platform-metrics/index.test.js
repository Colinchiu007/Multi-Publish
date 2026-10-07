import { describe, it, expect } from 'vitest'

/**
 * platform-metrics 解析器注册表测试（补齐该目录**完全缺失**的测试覆盖）
 *
 * 存在理由（PRD-PUBLISH-HISTORY-PUBLIC-LINK-2026-10-07 §1.4/§1.5）：
 * 该目录此前只有 `index.js`、**没有任何测试文件**，而它里面早已写好了
 * 「先认公开内容页、否则用作品 ID 构造」的判据（`resolveContentUrl`）——
 * 渲染端却另起炉灶直接用 `result.url`，正确的那份没被复用 ⇒ 真源分裂。
 * 本次把四个 parser 改为委托 shared-utils 的 `resolvePublishedContentUrl`，
 * 因此必须先锁死「对既有四平台是逐字 no-op」，否则重构会悄悄改掉回采目标地址。
 *
 * M1-M4 是 **no-op 锁**：字符串逐字断言，任何模板串漂移立刻转红。
 */

const registry = require('./index.js')

describe('platform-metrics — 注册表结构', () => {
  it('导出注册表读写三件套 + 共享工具', () => {
    expect(typeof registry.registerParser).toBe('function')
    expect(typeof registry.getParser).toBe('function')
    expect(typeof registry.supportedPlatforms).toBe('function')
    expect(typeof registry.httpGetJson).toBe('function')
    expect(typeof registry.fetchPageMetrics).toBe('function')
  })

  it('首批四平台仍全部注册', () => {
    for (const platform of ['zhihu', 'baijiahao', 'kuaishou', 'bilibili']) {
      expect(registry.getParser(platform), platform).toBeTruthy()
    }
  })

  it('平台键大小写不敏感；未注册平台返回 null（不抛错）', () => {
    expect(registry.getParser('ZHIHU')).toBeTruthy()
    expect(registry.getParser('threads')).toBeNull()
    expect(registry.getParser('')).toBeNull()
  })
})

describe('platform-metrics — resolveContentUrl 逐字 no-op 锁（M1-M4）', () => {
  it('M1 知乎：无 resultUrl 时按作品 ID 拼文章页', () => {
    expect(registry.getParser('zhihu').resolveContentUrl('123456', '')).toBe('https://zhihu.com/p/123456')
  })

  it('M1b 知乎：resultUrl 本身是公开文章页时原样采用', () => {
    expect(registry.getParser('zhihu').resolveContentUrl('123456', 'https://zhuanlan.zhihu.com/p/999888'))
      .toBe('https://zhuanlan.zhihu.com/p/999888')
  })

  it('M2 百家号：无 resultUrl 时按作品 ID 拼 /s?id=', () => {
    // 百家号文章 id 实际为 9-10 位数字，闸门要求 ≥4 位（PRD §4.2 第 6 条）
    expect(registry.getParser('baijiahao').resolveContentUrl('1765432109', ''))
      .toBe('https://baijiahao.baidu.com/s?id=1765432109')
  })

  it('M2b 百家号：过短的数字 id 判为无 ID，返回空串而非 /s?id=99 这种必然失败的地址', () => {
    expect(registry.getParser('baijiahao').resolveContentUrl('99', '')).toBe('')
  })

  it('M3 快手：无 resultUrl 时按作品 ID 拼 gifshow 地址', () => {
    expect(registry.getParser('kuaishou').resolveContentUrl('123456789', ''))
      .toBe('https://m.gifshow.com/fw/photo/123456789')
  })

  it('M4 B 站：BV 号拼视频页', () => {
    expect(registry.getParser('bilibili').resolveContentUrl('BV1xx411c7mD', ''))
      .toBe('https://www.bilibili.com/video/BV1xx411c7mD')
  })

  it('M4b B 站：resultUrl 是专栏（read/cv）时原样采用', () => {
    expect(registry.getParser('bilibili').resolveContentUrl('BV1xx411c7mD', 'https://www.bilibili.com/read/cv1234567'))
      .toBe('https://www.bilibili.com/read/cv1234567')
  })
})

describe('platform-metrics — 创作者后台页不得被当作内容页（M5）', () => {
  // 回采会真的去 fetch 这个地址；给一个登录墙 URL 会得到登录页 HTML，
  // 解析不出互动数，最终记成 failed —— 与「作品链接打开是登录页」同源。
  const CASES = [
    ['zhihu', '123456', 'https://zhuanlan.zhihu.com/write'],
    ['baijiahao', '99', 'https://baijiahao.baidu.com/builder/rc/edit?type=videoV2'],
    ['kuaishou', '123456789', 'https://cp.kuaishou.com/article/publish/video?tabType=1'],
    ['bilibili', 'BV1xx411c7mD', 'https://member.bilibili.com/platform/upload/video/frame'],
  ]

  it.each(CASES)('%s：resultUrl 是后台页时不返回该地址', (platform, postId, consoleUrl) => {
    const got = registry.getParser(platform).resolveContentUrl(postId, consoleUrl)
    expect(got).not.toBe(consoleUrl)
  })

  it.each(CASES)('%s：非法/协议相对 resultUrl 也不返回', (platform, postId) => {
    for (const bad of ['javascript:alert(1)', '//evil.example.com/x', 'example.com/x', '   ']) {
      const got = registry.getParser(platform).resolveContentUrl(postId, bad)
      expect(got, `${platform} ${bad}`).not.toBe(bad)
    }
  })
})

describe('platform-metrics — 快手行为修正（M6）', () => {
  // 旧实现把 resultUrl 整个忽略掉（恒按 postId 拼 gifshow 地址），
  // 委托到共享解析器后：resultUrl 本身就是公开内容页时优先采用它。
  // 两个地址都指向同一作品的公开页，这是修正而非回归（PRD §6.4）。
  it('resultUrl 是公开内容页时优先采用', () => {
    expect(registry.getParser('kuaishou').resolveContentUrl('123456789', 'https://www.kuaishou.com/short-video/123456789'))
      .toBe('https://www.kuaishou.com/short-video/123456789')
  })

  it('resultUrl 是公开内容页时不再回退到 gifshow 派生地址', () => {
    const got = registry.getParser('kuaishou').resolveContentUrl('123456789', 'https://www.kuaishou.com/short-video/123456789')
    expect(got).not.toBe('https://m.gifshow.com/fw/photo/123456789')
  })
})

describe('platform-metrics — 作品 ID 闸门透传', () => {
  it.each([
    ['zhihu', 'published-lz3k9x'],
    ['zhihu', 'task_abc123'],
    ['kuaishou', 'true'],
    ['baijiahao', ''],
  ])('%s：合成/占位/空作品 ID 派生不出 URL（返回空串而非必然 404 的地址）', (platform, postId) => {
    expect(registry.getParser(platform).resolveContentUrl(postId, '')).toBe('')
  })

  it.each([
    ['zhihu', 'BV1xx411c7mD'],
    ['bilibili', '12345678'],
  ])('%s：作品 ID 形态与平台不符时返回空串', (platform, postId) => {
    expect(registry.getParser(platform).resolveContentUrl(postId, '')).toBe('')
  })
})
