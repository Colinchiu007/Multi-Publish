// @ts-check
/**
 * rpa-publish-id-extract.test.js — 发布作品标识提取的行为回归测试
 *
 * 立项动因（2026-10-06）：B 站投稿成功后 postId 恒取不到 ⇒ 发布被判失败，
 * 且 PR #2927 落地的审核回查（按 bvid/aid 精确比）永远拿不到匹配键。
 * 规格与实测现场见 docs/PRD-BILIBILI-PUBLISH-ID-EXTRACT-2026-10-06.md。
 *
 * 此前该模块**没有任何行为测试**——用例只寄生在 rpa-view-platforms.test.js 的
 * 源码结构锁里，而那些锁只喂图文平台形态，对 B 站形态结构性免疫。
 */
const {
  extractPublishIdFromUrl,
  extractPublishIdsFromResponseBody,
} = require('./rpa-publish-id-extract')

const BVID = 'BV1xx411c79D'

describe('B 站作品标识按值形态识别', () => {
  it('A1 公开作品页 /video/<bvid>/ 提取 bvid', () => {
    expect(extractPublishIdFromUrl('https://www.bilibili.com/video/' + BVID + '/')).toBe(BVID)
  })

  it('A2 旧式 av 号作品页同样提取', () => {
    expect(extractPublishIdFromUrl('https://www.bilibili.com/video/av170001/')).toBe('av170001')
  })

  it('A3 投稿页把标识放在 query 时提取（bvid 优先于 aid，与参数顺序无关）', () => {
    expect(extractPublishIdFromUrl('https://member.bilibili.com/platform/upload/video/frame?bvid=' + BVID + '&aid=170001')).toBe(BVID)
    // 反序必须得到同一个答案：判据按形态择优，不是按参数先后
    expect(extractPublishIdFromUrl('https://member.bilibili.com/platform/upload/video/frame?aid=170001&bvid=' + BVID)).toBe(BVID)
    expect(extractPublishIdFromUrl('https://member.bilibili.com/platform/upload/video/frame?aid=170001')).toBe('170001')
  })

  it('A3b 通用命名表优先于 B 站形态（通用判据落空后才走专属判据）', () => {
    // B 站 URL 上同时有通用 *id 键与 aid 时，采纳通用键——保持既有语义优先
    expect(extractPublishIdFromUrl('https://member.bilibili.com/x?aid=170001&video_id=55501')).toBe('55501')
  })

  it('A4 提交响应体里的 aid/bvid 键进入候选集（须带 B 站端点上下文）', () => {
    const body = JSON.stringify({ code: 0, data: { aid: 170001, bvid: BVID } })
    const ids = extractPublishIdsFromResponseBody(body, { endpoint: 'https://member.bilibili.com/x/video/add' })
    expect(ids).toContain(BVID)
    expect(ids).toContain('170001')
  })

  it('A4b 响应体链与 URL 链同形：无 B 站端点上下文时 aid/bvid 一律不采纳', () => {
    const body = JSON.stringify({ code: 0, data: { aid: 12345678, bvid: BVID } })
    // 无 endpoint（调用方没给上下文）
    expect(extractPublishIdsFromResponseBody(body)).toEqual([])
    // 非 B 站端点：字节系平台普遍有 aid 类字段，取了就是把失败判成成功
    expect(extractPublishIdsFromResponseBody(body, { endpoint: 'https://creator.douyin.com/api/submit' })).toEqual([])
    expect(extractPublishIdsFromResponseBody(body, { endpoint: 'https://cp.kuaishou.com/graphql' })).toEqual([])
    // 通用命名表的键不受该门影响（既有行为原样）
    expect(extractPublishIdsFromResponseBody('{"data":{"article_id":"99887766"}}', { endpoint: 'https://mp.toutiao.com/x/publish' })).toEqual(['99887766'])
  })

  it('A5 负例：投稿页自身路径 /upload/video/frame 不得把 frame 当成作品 id', () => {
    // 「顺手把 video 加进路径段关键词表」会在此处造出假 id ⇒ 把失败判成成功
    expect(extractPublishIdFromUrl('https://member.bilibili.com/platform/upload/video/frame')).toBeNull()
    expect(extractPublishIdFromUrl('https://member.bilibili.com/platform/upload/video/frame?tab=1')).toBeNull()
  })

  it('A6 负例：非 B 站主机的 /video/<任意段> 不因本规则产出 id', () => {
    expect(extractPublishIdFromUrl('https://example.com/video/' + BVID)).toBeNull()
    expect(extractPublishIdFromUrl('https://weibo.com/video/1234567890')).toBeNull()
  })

  it('A7 负例：aid/bvid 值不合形态即不采纳（不按键名盲取）', () => {
    expect(extractPublishIdFromUrl('https://member.bilibili.com/x?aid=abc')).toBeNull()
    expect(extractPublishIdFromUrl('https://member.bilibili.com/x?bvid=notabvid')).toBeNull()
    expect(extractPublishIdFromUrl('https://member.bilibili.com/x?bvid=BV1')).toBeNull()
    expect(extractPublishIdFromUrl('https://member.bilibili.com/x?aid=12')).toBeNull()
    expect(extractPublishIdsFromResponseBody('{"aid":"abc","bvid":"nope"}')).toEqual([])
  })

  it('边界：空串 / 缺协议 / 非法 URL / 超长段一律 null，不抛错', () => {
    expect(extractPublishIdFromUrl('')).toBeNull()
    expect(extractPublishIdFromUrl(null)).toBeNull()
    expect(extractPublishIdFromUrl('not a url')).toBeNull()
    expect(extractPublishIdFromUrl('//www.bilibili.com/video/' + BVID)).toBeNull()
    expect(extractPublishIdFromUrl('https://www.bilibili.com/video/BV1234567890123456789012')).toBeNull()
  })
})

describe('既有图文平台判据不得漂移（A8 回归基线）', () => {
  it('query 命名表与路径关键词表原样生效', () => {
    expect(extractPublishIdFromUrl('https://mp.toutiao.com/profile_v4/graphic/publishing?article_id=123456')).toBe('123456')
    expect(extractPublishIdFromUrl('https://example.com/post/98765')).toBe('98765')
    expect(extractPublishIdFromUrl('https://example.com/media/54321/detail')).toBe('54321')
  })

  it('响应体通用键名口径不变，且 nav 词/布尔值仍被拒', () => {
    expect(extractPublishIdsFromResponseBody('{"data":{"video_id":"71888"}}')).toEqual(['71888'])
    expect(extractPublishIdsFromResponseBody('{"post_id":null,"article_id":"list"}')).toEqual([])
  })
})
