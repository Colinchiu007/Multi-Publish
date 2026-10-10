// @ts-check
/**
 * note 步页内整发（pageInpage）契约测试（TDD 红灯先行）。
 *
 * 背景（xhs-xys-signer 执行记录遗留）：签名关已过（页内 XYS_ + 头可接受），
 * 但 X-S-Common 页内生成入口未逆向——本地短模板与页内真头混用仍 406。
 * 方案：note 提交步在**签名页上下文内整发**——cookie 经 bindSignerCookie 注入
 * 页 session，页内 fetch credentials:'include' 自动带登录态与全套头。
 *
 * 契约（XiaohongshuDraftChain 新增）：
 *   1. publishToDraft(opts.pageInpage = { sendNote: async ({url, headers, body}) => {status, data} })
 *      存在时：note 步不再走 this.http.request，改为调用 sendNote（页内发送）
 *   2. sendNote 收到的 headers 已含页内签名产物（由调用方经 bridge 注入 _webmsxyw）
 *   3. sendNote 返回 {status, data}：status>=400 或 code!==0 → 抛 XiaohongshuDraftError（语义与 http 路径一致）
 *   4. pageInpage 缺失时走原 http 路径（零回归）
 *   5. noteOrigin 选项在页内路径同样生效（creator/edith 双路由）
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

const { XiaohongshuDraftChain, XiaohongshuDraftError } = require('../src/publish/platforms/xiaohongshu-draft')

function makeChain (noteResponse) {
  return new XiaohongshuDraftChain({
    http: {
      request: vi.fn(async (cfg) => {
        if (cfg.url.includes('/upload/web/permit')) {
          return { data: { code: 0, data: { file_id: 'F1', token: 'TK1', cos_key: 'k1' } } }
        }
        if (cfg.url.includes('ros-upload')) {
          return { status: 200, data: Buffer.from('ok') }
        }
        // note 步走 http（无 pageInpage 时的回归路径）
        return { data: { code: 0, data: { note_id: 'N-HTTP', draft_id: 'D-HTTP' } } }
      }),
    },
    sign: vi.fn(async () => ({ 'x-s': 'XYW_test', 'x-t': '1700000000000' })),
    userAgent: 'UA/1.0',
  })
}

describe('xiaohongshu note 页内整发（pageInpage）', () => {
  let chain
  beforeEach(() => { chain = makeChain() })

  it('pageInpage 存在时 note 步走 sendNote，不走 http.request', async () => {
    const sendNote = vi.fn(async () => ({ status: 200, data: { code: 0, data: { note_id: 'N-PAGE', draft_id: 'D-PAGE' } } }))
    const out = await chain.publishToDraft({
      title: '测试',
      content: '内容',
      images: [{ path: 'C:/tmp/x.png' }],
      draft: true,
      cookie: 'a1=A; web_session=B',
      authorization: 'AT t',
      readFile: async () => Buffer.from('img'),
      pageInpage: { sendNote },
    })
    expect(sendNote).toHaveBeenCalledTimes(1)
    const arg = sendNote.mock.calls[0][0]
    expect(arg.url).toContain('/web_api/sns/v2/note')
    expect(typeof arg.body).toBe('string') // 序列化后的 JSON 字符串
    expect(out.noteId).toBe('N-PAGE')
    // http.request 只被 permit + ros-upload 调用（2 次），note 没走
    expect(chain.http.request.mock.calls.filter((c) => c[0].url.includes('/note'))).toHaveLength(0)
  })

  it('pageInpage 路径同样先经 this.sign 拿页内签名头', async () => {
    const sendNote = vi.fn(async () => ({ status: 200, data: { code: 0, data: {} } }))
    await chain.publishToDraft({
      title: 't', content: 'c', images: [{ path: 'C:/tmp/x.png' }], draft: true,
      cookie: 'a1=A; web_session=B', authorization: 'AT t', readFile: async () => Buffer.from('i'),
      pageInpage: { sendNote },
    })
    expect(chain.sign).toHaveBeenCalled()
    const arg = sendNote.mock.calls[0][0]
    expect(arg.headers['x-s']).toBe('XYW_test')
  })

  it('sendNote 返回 HTTP 401 时抛 XiaohongshuDraftError（携带 httpStatus）', async () => {
    const sendNote = vi.fn(async () => ({ status: 401, data: { code: -100, msg: '无登录信息' } }))
    await expect(chain.publishToDraft({
      title: 't', content: 'c', images: [{ path: 'C:/tmp/x.png' }], draft: true,
      cookie: 'a1=A; web_session=B', authorization: 'AT t', readFile: async () => Buffer.from('i'),
      pageInpage: { sendNote },
    })).rejects.toThrow(XiaohongshuDraftError)
  })

  it('sendNote 返回业务 code!==0 时同样抛业务错误', async () => {
    const sendNote = vi.fn(async () => ({ status: 200, data: { code: -1, msg: '业务拒绝' } }))
    await expect(chain.publishToDraft({
      title: 't', content: 'c', images: [{ path: 'C:/tmp/x.png' }], draft: true,
      cookie: 'a1=A; web_session=B', authorization: 'AT t', readFile: async () => Buffer.from('i'),
      pageInpage: { sendNote },
    })).rejects.toThrow(XiaohongshuDraftError)
  })

  it('pageInpage 缺失时零回归（note 走原 http 路径）', async () => {
    const out = await chain.publishToDraft({
      title: 't', content: 'c', images: [{ path: 'C:/tmp/x.png' }], draft: true,
      cookie: 'a1=A; web_session=B', authorization: 'AT t', readFile: async () => Buffer.from('i'),
    })
    expect(out.noteId).toBe('N-HTTP')
  })

  it('noteOrigin 选项在页内路径同样生效（creator 路由）', async () => {
    const sendNote = vi.fn(async () => ({ status: 200, data: { code: 0, data: {} } }))
    await chain.publishToDraft({
      title: 't', content: 'c', images: [{ path: 'C:/tmp/x.png' }], draft: true,
      cookie: 'a1=A; web_session=B', authorization: 'AT t', readFile: async () => Buffer.from('i'),
      noteOrigin: 'https://creator.xiaohongshu.com',
      pageInpage: { sendNote },
    })
    expect(sendNote.mock.calls[0][0].url).toContain('https://creator.xiaohongshu.com/web_api/sns/v2/note')
  })
})
