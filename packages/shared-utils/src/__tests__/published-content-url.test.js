import { describe, it, expect } from 'vitest'
import * as cjsUrl from '../published-content-url.js'
import * as esmUrl from '../published-content-url.browser.js'
import { safeHttpUrl } from '../safe-http-url.js'

/**
 * published-content-url 解析矩阵 + CJS/ESM 孪生 parity
 *
 * 存在理由（PRD-PUBLISH-HISTORY-PUBLIC-LINK-2026-10-07）：
 * 发布链路落库的 `result.url` 是 RPA webview 的**当前页面地址**（创作者后台页），
 * 而渲染端此前只用 `safeHttpUrl` 判**协议**，把「协议合法的登录墙 URL」当成
 * 「作品链接」呈现并打开 —— 用户点进去看到的是平台登录页，而不是作品内容页。
 * 本模块在协议判据**之前**补一层「目的地语义」判据：
 *   ① recorded 命中该平台公开内容页白名单 → 原样采用（source=recorded）
 *   ② 否则用合法的平台作品 ID 派生公开内容页（source=derived）
 *   ③ 都不成立 → 不给链接（source=none），绝不用后台页兜底
 *
 * 「不给链接」优于「给错链接」——给错链接就是本 Bug 本身。
 */

/** 规则表覆盖的全部平台（config/platforms.yaml 的 15 个发布平台） */
const ALL_PLATFORMS = [
  'wechat_mp', 'zhihu', 'weibo', 'douyin', 'xiaohongshu', 'tencent_video',
  'kuaishou', 'toutiao', 'youtube', 'tiktok', 'bilibili', 'baijiahao',
  'twitter', 'instagram', 'facebook',
]

/** 可从单一作品 ID 唯一确定公开内容页的平台（其余结构性不可派生） */
const DERIVABLE_PLATFORMS = [
  'zhihu', 'baijiahao', 'bilibili', 'kuaishou', 'xiaohongshu', 'douyin', 'toutiao', 'youtube',
]

/** 结构性不可派生的平台 + 原因（防止后来者误以为「漏做了」） */
const NON_DERIVABLE = {
  wechat_mp: '永久链接需 __biz+mid+idx+sn 四元组，发布结果只拿得到 mid',
  tencent_video: '内容仅在微信客户端内可达，Web 端无公开永久链接',
  weibo: '需 uid/mid 两个成分，只有 mid 无法定位',
  tiktok: '需 @user + aweme_id',
  twitter: '需 handle + status id',
  instagram: '需 username + shortcode',
  facebook: '需 page/username 上下文',
}

/** 每个平台的公开内容页 / 创作者后台页 / 合法作品 ID */
const PLATFORM_FIXTURES = {
  zhihu: {
    publicUrl: 'https://zhuanlan.zhihu.com/p/123456789',
    consoleUrl: 'https://zhuanlan.zhihu.com/write',
    postId: '123456789',
    derived: 'https://zhihu.com/p/123456789',
  },
  baijiahao: {
    publicUrl: 'https://baijiahao.baidu.com/s?id=1765432109876',
    consoleUrl: 'https://baijiahao.baidu.com/builder/rc/edit?type=videoV2',
    postId: '1765432109876',
    derived: 'https://baijiahao.baidu.com/s?id=1765432109876',
  },
  bilibili: {
    publicUrl: 'https://www.bilibili.com/video/BV1xx411c7mD',
    consoleUrl: 'https://member.bilibili.com/platform/upload/video/frame',
    postId: 'BV1xx411c7mD',
    derived: 'https://www.bilibili.com/video/BV1xx411c7mD',
  },
  kuaishou: {
    publicUrl: 'https://www.kuaishou.com/short-video/123456789',
    consoleUrl: 'https://cp.kuaishou.com/article/publish/video?tabType=1',
    postId: '123456789',
    derived: 'https://m.gifshow.com/fw/photo/123456789',
  },
  xiaohongshu: {
    publicUrl: 'https://www.xiaohongshu.com/explore/6530a1b2c3d4e5f600112233',
    consoleUrl: 'https://creator.xiaohongshu.com/publish/publish',
    postId: '6530a1b2c3d4e5f600112233',
    derived: 'https://www.xiaohongshu.com/explore/6530a1b2c3d4e5f600112233',
  },
  douyin: {
    publicUrl: 'https://www.douyin.com/video/7300000000000000000',
    consoleUrl: 'https://creator.douyin.com/creator-micro/content/manage',
    postId: '7300000000000000000',
    derived: 'https://www.douyin.com/video/7300000000000000000',
  },
  toutiao: {
    publicUrl: 'https://www.toutiao.com/article/7300000000000000000/',
    consoleUrl: 'https://mp.toutiao.com/profile_v4/graphic/publish',
    postId: '7300000000000000000',
    derived: 'https://www.toutiao.com/article/7300000000000000000/',
  },
  youtube: {
    publicUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
    consoleUrl: 'https://studio.youtube.com/',
    postId: 'dQw4w9WgXcQ',
    derived: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
  },
  wechat_mp: {
    publicUrl: 'https://mp.weixin.qq.com/s?__biz=MzA5&mid=1000000001&idx=1&sn=abc',
    consoleUrl: 'https://mp.weixin.qq.com/cgi-bin/message?idx=1&token=123456',
    postId: '1000000001',
    derived: '',
  },
  tencent_video: {
    publicUrl: '',
    consoleUrl: 'https://channels.weixin.qq.com/platform/post/create',
    postId: '1000000001',
    derived: '',
  },
  weibo: {
    publicUrl: 'https://weibo.com/1234567/Pabc1234',
    consoleUrl: 'https://weibo.com/compose/main',
    postId: 'Pabc1234',
    derived: '',
  },
  tiktok: {
    publicUrl: 'https://www.tiktok.com/@user/video/7300000000000000000',
    consoleUrl: 'https://www.tiktok.com/upload',
    postId: '7300000000000000000',
    derived: '',
  },
  twitter: {
    publicUrl: 'https://twitter.com/user/status/1750000000000000000',
    consoleUrl: 'https://x.com/compose/post',
    postId: '1750000000000000000',
    derived: '',
  },
  instagram: {
    publicUrl: 'https://www.instagram.com/p/C123abcDEF/',
    consoleUrl: 'https://www.instagram.com/',
    postId: 'C123abcDEF',
    derived: '',
  },
  facebook: {
    publicUrl: 'https://www.facebook.com/user/posts/1234567890',
    consoleUrl: 'https://www.facebook.com/',
    postId: '1234567890',
    derived: '',
  },
}

describe('published-content-url — recorded 命中公开内容页（R1）', () => {
  it.each(DERIVABLE_PLATFORMS)('%s：recorded 本身是公开内容页时原样采用，不改写', (platform) => {
    const fx = PLATFORM_FIXTURES[platform]
    expect(esmUrl.resolvePublishedContentUrl({ platform, recordedUrl: fx.publicUrl }))
      .toEqual({ url: fx.publicUrl, source: 'recorded' })
  })

  it('R1-尾：B 站专栏（read/cv）也是公开内容页', () => {
    const u = 'https://www.bilibili.com/read/cv1234567'
    expect(esmUrl.resolvePublishedContentUrl({ platform: 'bilibili', recordedUrl: u }))
      .toEqual({ url: u, source: 'recorded' })
  })
})

describe('published-content-url — recorded 是后台页时改用作品 ID 派生（R2）', () => {
  it.each(DERIVABLE_PLATFORMS)('%s：后台页 + 合法 postId → 派生公开内容页', (platform) => {
    const fx = PLATFORM_FIXTURES[platform]
    const got = esmUrl.resolvePublishedContentUrl({ platform, postId: fx.postId, recordedUrl: fx.consoleUrl })
    expect(got).toEqual({ url: fx.derived, source: 'derived' })
    // 核心反证：绝不能把创作者后台页当成作品链接返回
    expect(got.url).not.toBe(fx.consoleUrl)
  })
})

describe('published-content-url — 无法确定公开内容页时诚实不给链接（R3）', () => {
  it.each(ALL_PLATFORMS)('%s：只有后台页、无合法 postId → none', (platform) => {
    const fx = PLATFORM_FIXTURES[platform]
    const got = esmUrl.resolvePublishedContentUrl({ platform, recordedUrl: fx.consoleUrl })
    expect(got).toEqual({ url: '', source: 'none' })
  })

  it.each(Object.entries(NON_DERIVABLE))('%s：即使有 postId 也不派生（%s）', (platform, reason) => {
    expect(reason).toBeTruthy()
    const fx = PLATFORM_FIXTURES[platform]
    const got = esmUrl.resolvePublishedContentUrl({ platform, postId: fx.postId, recordedUrl: fx.consoleUrl })
    expect(got).toEqual({ url: '', source: 'none' })
  })
})

describe('published-content-url — 协议判据仍生效（R4）', () => {
  it.each([
    ['javascript:alert(1)', 'zhihu'],
    ['data:text/html,<script>', 'zhihu'],
    ['//evil.example.com/x', 'zhihu'],
    ['example.com/p/123456', 'zhihu'],
    ['  ', 'zhihu'],
  ])('非法协议 recordedUrl %s 视为无 recorded', (recordedUrl, platform) => {
    const got = esmUrl.resolvePublishedContentUrl({ platform, recordedUrl })
    expect(got).toEqual({ url: '', source: 'none' })
  })

  it('非字符串 recordedUrl（数字/对象/数组/null）视为无 recorded', () => {
    for (const bad of [12345, { url: 'https://zhihu.com/p/1' }, ['https://zhihu.com/p/1'], null, undefined, true]) {
      expect(esmUrl.resolvePublishedContentUrl({ platform: 'zhihu', recordedUrl: bad }))
        .toEqual({ url: '', source: 'none' })
    }
  })
})

describe('published-content-url — 合成/占位作品 ID 不得用于派生（R5）', () => {
  it.each([
    ['published-lz3k9x', '快手 from=publish 兜底派生值'],
    ['task_abc123', '内部任务号'],
    ['tmp-123', '临时占位'],
    ['true', '布尔字面量'],
    ['false', '布尔字面量'],
    ['null', '空值字面量'],
    ['undefined', '空值字面量'],
    ['NaN', '数值字面量'],
    ['x'.repeat(129), '超长值'],
    ['', '空串'],
    ['   ', '纯空白'],
  ])('%s（%s）视为无 ID → 不派生', (postId) => {
    const got = esmUrl.resolvePublishedContentUrl({ platform: 'zhihu', postId, recordedUrl: 'https://zhuanlan.zhihu.com/write' })
    expect(got).toEqual({ url: '', source: 'none' })
  })

  it('平台导航词不是作品 ID（与 rpa-publish-id-extract 的 NAV_WORDS 同族）', () => {
    for (const nav of ['home', 'index', 'publish', 'manage', 'new', 'draft', 'detail', 'list', 'edit']) {
      expect(esmUrl.resolvePublishedContentUrl({ platform: 'zhihu', postId: nav, recordedUrl: 'https://zhuanlan.zhihu.com/write' }))
        .toEqual({ url: '', source: 'none' })
    }
  })

  it('非字符串/非数字 postId 视为无 ID', () => {
    for (const bad of [{}, [], true, null, undefined]) {
      expect(esmUrl.resolvePublishedContentUrl({ platform: 'zhihu', postId: bad, recordedUrl: 'https://zhuanlan.zhihu.com/write' }))
        .toEqual({ url: '', source: 'none' })
    }
  })
})

describe('published-content-url — 作品 ID 必须匹配平台专属形态（R6）', () => {
  it('知乎不接受 B 站 BV 号', () => {
    expect(esmUrl.resolvePublishedContentUrl({ platform: 'zhihu', postId: 'BV1xx411c7mD' })).toEqual({ url: '', source: 'none' })
  })

  it('B 站不接受纯数字（BV/av 才是视频作品 ID）', () => {
    expect(esmUrl.resolvePublishedContentUrl({ platform: 'bilibili', postId: '12345678' })).toEqual({ url: '', source: 'none' })
  })

  it('小红书不接受非 hex 串（笔记 ID 是 hex）', () => {
    // 注意：十进制数字**本身就是合法 hex**，`^[0-9a-f]{16,32}$` 无法也不该区分二者
    // （真实笔记 ID 恒为 24 位 hex；此处锁的是「含非 hex 字符 ⇒ 拒绝」这一可判定的不变量）。
    expect(esmUrl.resolvePublishedContentUrl({ platform: 'xiaohongshu', postId: 'BV1xx411c7mD' })).toEqual({ url: '', source: 'none' })
    expect(esmUrl.resolvePublishedContentUrl({ platform: 'xiaohongshu', postId: 'zz-not-hex-at-all' })).toEqual({ url: '', source: 'none' })
    expect(esmUrl.resolvePublishedContentUrl({ platform: 'xiaohongshu', postId: 'abc' })).toEqual({ url: '', source: 'none' })
  })

  it('数字 postId 允许（各平台 article id 形态）', () => {
    expect(esmUrl.buildPublicContentUrl('zhihu', 123456789)).toBe('https://zhihu.com/p/123456789')
  })

  it('B 站 av 号与 BV 号都可派生', () => {
    expect(esmUrl.buildPublicContentUrl('bilibili', 'av12345')).toBe('https://www.bilibili.com/video/av12345')
    expect(esmUrl.buildPublicContentUrl('bilibili', 'BV1xx411c7mD')).toBe('https://www.bilibili.com/video/BV1xx411c7mD')
  })
})

describe('published-content-url — 安全默认（R7/R8/R9）', () => {
  it('R7：未登记平台一律 none（漏加规则的后果是「不给链接」而非「给错链接」）', () => {
    for (const p of ['threads', 'zhihu-like', '', '   ', null, undefined, 123]) {
      expect(esmUrl.resolvePublishedContentUrl({ platform: p, postId: '123456789', recordedUrl: 'https://zhihu.com/p/1' }))
        .toEqual({ url: '', source: 'none' })
    }
  })

  it('R8：全部 15 平台无任何输入 → none', () => {
    for (const p of ALL_PLATFORMS) {
      expect(esmUrl.resolvePublishedContentUrl({ platform: p })).toEqual({ url: '', source: 'none' })
    }
  })

  it('R9：仅可派生的 8 个平台在有合法 postId 时返回非空', () => {
    for (const p of ALL_PLATFORMS) {
      const got = esmUrl.buildPublicContentUrl(p, PLATFORM_FIXTURES[p].postId)
      if (DERIVABLE_PLATFORMS.includes(p)) expect(got, p).toBe(PLATFORM_FIXTURES[p].derived)
      else expect(got, p).toBe('')
    }
  })

  it('platform 大小写与空白归一', () => {
    expect(esmUrl.buildPublicContentUrl('  ZHIHU ', '123456789')).toBe('https://zhihu.com/p/123456789')
  })
})

describe('published-content-url — 输出不变式（R11）', () => {
  it('none ⟺ url 为空串；非 none ⟹ safeHttpUrl 通过', () => {
    for (const p of ALL_PLATFORMS) {
      const fx = PLATFORM_FIXTURES[p]
      const cases = [
        { platform: p, recordedUrl: fx.publicUrl, postId: fx.postId },
        { platform: p, recordedUrl: fx.consoleUrl, postId: fx.postId },
        { platform: p, recordedUrl: fx.consoleUrl },
        { platform: p },
      ]
      for (const input of cases) {
        const got = esmUrl.resolvePublishedContentUrl(input)
        if (got.source === 'none') expect(got.url).toBe('')
        else expect(safeHttpUrl(got.url), `${p} ${JSON.stringify(input)}`).not.toBeNull()
      }
    }
  })

  it('返回值只含 url 与 source 两个键（UI 不得依赖未定义字段）', () => {
    expect(Object.keys(esmUrl.resolvePublishedContentUrl({ platform: 'zhihu', postId: '123456789' })).sort())
      .toEqual(['source', 'url'])
  })

  it('R12：纯函数——同入参多次调用结果一致（不读时间/随机/网络）', () => {
    const input = { platform: 'kuaishou', postId: '123456789', recordedUrl: 'https://cp.kuaishou.com/article/publish/video' }
    const a = esmUrl.resolvePublishedContentUrl(input)
    const b = esmUrl.resolvePublishedContentUrl(input)
    const c = esmUrl.resolvePublishedContentUrl(input)
    expect(a.url).toBe(b.url); expect(a.url).toBe(c.url)
    expect(a.source).toBe(b.source); expect(a.source).toBe(c.source)
  })
})

describe('published-content-url — 目的地判据按 path 而非按域名（R13）', () => {
  it('知乎内容页与编辑页同域不同 path：只认 /p/<数字>', () => {
    expect(esmUrl.isPublicContentUrl('zhihu', 'https://zhuanlan.zhihu.com/p/123456789')).toBe(true)
    expect(esmUrl.isPublicContentUrl('zhihu', 'https://zhuanlan.zhihu.com/write')).toBe(false)
    expect(esmUrl.isPublicContentUrl('zhihu', 'https://zhuanlan.zhihu.com/')).toBe(false)
  })

  it('B 站：同域的创作中心（member 子域）不是内容页', () => {
    expect(esmUrl.isPublicContentUrl('bilibili', 'https://member.bilibili.com/platform/upload/video/frame')).toBe(false)
    expect(esmUrl.isPublicContentUrl('bilibili', 'https://www.bilibili.com/video/BV1xx411c7mD')).toBe(true)
  })

  it('跨平台串台：知乎的内容页不是 B 站的内容页', () => {
    expect(esmUrl.isPublicContentUrl('bilibili', 'https://zhuanlan.zhihu.com/p/123456789')).toBe(false)
  })

  it('未登记平台的 isPublicContentUrl 恒为 false', () => {
    expect(esmUrl.isPublicContentUrl('threads', 'https://www.threads.net/@a/post/X')).toBe(false)
    expect(esmUrl.isPublicContentUrl('', 'https://zhihu.com/p/1')).toBe(false)
  })
})

describe('published-content-url — CJS/ESM 孪生 parity（R14）', () => {
  // CJS 被 ESM 加载时命名空间会多出一个 `default`（其值为 module.exports 那个对象），
  // 比对导出键时按既有 safe-http-url.test.js 的口径剔除。
  const isInteropDefault = (ns, ref) => {
    try {
      return (typeof ns.default === 'object' && ns.default !== null) &&
        Object.keys(ns.default).length === Object.keys(ref).length
    } catch (_) { return false }
  }
  const apiKeys = (ns, ref) => Object.keys(ns).filter(k => !(k === 'default' && isInteropDefault(ns, ref))).sort()

  it('导出面一致且完整（缺一个 API 会让另一端静默漂移）', () => {
    expect(apiKeys(esmUrl, cjsUrl)).toEqual(apiKeys(cjsUrl, esmUrl))
    expect(apiKeys(esmUrl, cjsUrl)).toEqual([
      'PUBLIC_CONTENT_URL_RULES',
      'buildPublicContentUrl',
      'isPublicContentUrl',
      'resolvePublishedContentUrl',
    ])
  })

  it.each(ALL_PLATFORMS)('%s：四种输入组合下两端结果逐字段相等', (platform) => {
    const fx = PLATFORM_FIXTURES[platform]
    const inputs = [
      { platform, recordedUrl: fx.publicUrl },
      { platform, postId: fx.postId, recordedUrl: fx.consoleUrl },
      { platform, recordedUrl: fx.consoleUrl },
      { platform },
    ]
    for (const input of inputs) {
      const c = cjsUrl.resolvePublishedContentUrl(input)
      const e = esmUrl.resolvePublishedContentUrl(input)
      expect({ url: e.url, source: e.source }).toEqual({ url: c.url, source: c.source })
      expect(esmUrl.isPublicContentUrl(platform, fx.consoleUrl)).toBe(cjsUrl.isPublicContentUrl(platform, fx.consoleUrl))
      expect(esmUrl.buildPublicContentUrl(platform, fx.postId)).toBe(cjsUrl.buildPublicContentUrl(platform, fx.postId))
    }
  })

  it('两端规则表逐字同源（source + flags）', () => {
    for (const platform of ALL_PLATFORMS) {
      const c = cjsUrl.PUBLIC_CONTENT_URL_RULES[platform]
      const e = esmUrl.PUBLIC_CONTENT_URL_RULES[platform]
      expect(Object.keys(e).sort()).toEqual(Object.keys(c).sort())
      for (const key of Object.keys(c)) {
        if (c[key] instanceof RegExp) {
          expect(e[key].source, `${platform}.${key}`).toBe(c[key].source)
          expect(e[key].flags, `${platform}.${key}`).toBe(c[key].flags)
        } else {
          expect(e[key], `${platform}.${key}`).toEqual(c[key])
        }
      }
    }
  })
})
