// @ts-check
/**
 * note 请求对齐蚁小二形态的契约测试（TDD 红灯先行）。
 *
 * 依据：
 *  - 蚁小二逆向报告 .agent_context/yxe-xhs-publish-research.md（publish$k/buildPostData$J）
 *  - 网络调研：xhshow 系列确认 XYS_ 是现役格式；x-rap-param 是发布类接口的风控头（可后补）
 *
 * 契约变更（XiaohongshuDraftChain.submitNote / publishToDraft）：
 *  C1 头集合：Authorization 不再发送（置空删除）；cookie 轮换（a1 → a1old + 新 a1 追加）
 *  C2 body：common.images 完整对象数组（ic/url/web_uri/uri/srcType/mime_type/id/with_系列/file_size）
 *           + common.source / business_binds(bizType:0) / privacy_info{op_type:1,type} / ats/hash_tag
 *           + 去掉顶层 draft 字段（草稿语义 = privacy_info.type:1）
 *  C3 privacy_info：publishToDraft({ visibilityType: 1 }) → private；缺省 0 = public
 *  C4 sign 回调收到的 payload 增加 fullUri 路径口径不变
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

const { XiaohongshuDraftChain } = require('../src/publish/platforms/xiaohongshu-draft')

function makeChain (noteBodyCapture) {
  return new XiaohongshuDraftChain({
    http: {
      request: vi.fn(async (cfg) => {
        if (cfg.url.includes('/upload/web/permit')) {
          return { data: { code: 0, data: { file_id: 'F1', token: 'TK1', cos_key: 'k1' } } }
        }
        if (cfg.url.includes('ros-upload')) {
          return { status: 200, data: Buffer.from('ok') }
        }
        if (cfg.url.includes('/web_api/sns/v2/note')) {
          noteBodyCapture(cfg)
          return { data: { code: 0, data: { note_id: 'N1', draft_id: 'D1' } } }
        }
        throw new Error('unexpected url ' + cfg.url)
      }),
    },
    sign: vi.fn(async () => ({
      'x-s': 'XYW_test',
      'x-t': '1700000000000',
      'X-S-Common': 'PAGE_TRUTH',
      a1: 'NEW_A1_VALUE', // 模拟签名服务返回的 a1 轮换
    })),
    userAgent: 'UA/1.0',
  })
}

const BASE = {
  title: '测试标题',
  content: '测试内容',
  images: [{ path: 'C:/tmp/x.png' }],
  cookie: 'a1=OLD_A1; web_session=SESS',
  authorization: 'AT should-not-be-sent',
  readFile: async () => Buffer.from('img'),
}

describe('note 对齐蚁小二形态（visibilityType 草稿语义）', () => {
  let captured
  let chain
  beforeEach(() => {
    captured = null
    chain = makeChain((cfg) => { captured = cfg })
  })

  it('C1a Authorization 头不再发送', async () => {
    await chain.publishToDraft({ ...BASE })
    expect(captured.headers.Authorization).toBeUndefined()
  })

  it('C1b cookie 轮换：a1→a1old 且追加签名返回的新 a1', async () => {
    await chain.publishToDraft({ ...BASE })
    expect(captured.headers.Cookie).toContain('a1old=OLD_A1')
    expect(captured.headers.Cookie).toContain('a1=NEW_A1_VALUE')
    expect(captured.headers.Cookie).toContain('web_session=SESS')
  })

  it('C2a 图文用 image_list 完整对象数组（蚁小二 publish$j 形态）', async () => {
    await chain.publishToDraft({ ...BASE })
    const body = JSON.parse(captured.data)
    expect(Array.isArray(body.image_info.images)).toBe(true)
    const img = body.image_info.images[0]
    expect(img.file_id).toBe('F1')
    expect(img.height).toBeGreaterThan(0)
    expect(img.width).toBeGreaterThan(0)
    expect(img.extra_info_json).toBeDefined()
    expect(img.metadata).toBeDefined()
    expect(img.stickers).toEqual({ floating: [], version: 2 })
  })

  it('C2b common 含 source/business_binds(bizType:0)/ats/hash_tag 契约结构', async () => {
    await chain.publishToDraft({ ...BASE })
    const body = JSON.parse(captured.data)
    expect(body.common.type).toBe('normal')
    expect(body.common.note_id).toBe('')
    expect(JSON.parse(body.common.source)).toEqual({ type: 'web', ids: '', extraInfo: '{"systemId":"web"}' })
    const binds = JSON.parse(body.common.business_binds)
    expect(binds.version).toBe(1)
    expect(binds.bizType).toBe(0)
    expect(binds.noteId).toBe(0)
    expect(body.video_info).toBeNull()
  })

  it('C3 visibilityType:1（private）时 privacy_info.type=1；缺省为 0（public）', async () => {
    await chain.publishToDraft({ ...BASE, visibilityType: 1 })
    let body = JSON.parse(captured.data)
    expect(body.common.privacy_info).toEqual({ op_type: 1, type: 1 })
    // 缺省 public
    captured = null
    await chain.publishToDraft({ ...BASE, cookie: 'a1=OLD_A1; web_session=SESS' })
    body = JSON.parse(captured.data)
    expect(body.common.privacy_info).toEqual({ op_type: 1, type: 0 })
  })

  it('C4 顶层不再有 draft 字段（平台不认，草稿语义由 privacy_info 承担）', async () => {
    await chain.publishToDraft({ ...BASE, visibilityType: 1 })
    const body = JSON.parse(captured.data)
    expect(body.common.draft).toBeUndefined()
    expect(body.draft).toBeUndefined()
  })
})
