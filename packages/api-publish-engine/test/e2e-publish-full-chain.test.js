import { describe, it, expect, beforeEach, vi } from 'vitest'
import BaijiahaoAdapter from '../src/adapters/baijiahao.js'
import KuaishouAdapter from '../src/adapters/kuaishou.js'
import fs from 'fs'
import path from 'path'
import os from 'os'

function mockHttp(adapter, handlers) {
  const calls = []
  adapter.http.post = vi.fn(async (url, body, opts) => {
    calls.push({ method: 'post', url, body, opts })
    const h = handlers.post && handlers.post(url, body, opts)
    return h || { data: {} }
  })
  adapter.http.get = vi.fn(async (url, opts) => {
    calls.push({ method: 'get', url, opts })
    const h = handlers.get && handlers.get(url, opts)
    return h || { data: {} }
  })
  return calls
}

function createTempVideo(sizeBytes = 1024) {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'e2e-publish-'))
  const videoPath = path.join(tmpDir, 'test-video.mp4')
  fs.writeFileSync(videoPath, Buffer.alloc(sizeBytes, 0x00))
  return { videoPath, tmpDir }
}

const COOKIE = 'BAIDUID=ABC; BDUSS=XYZ; kuaishou.web.cp.api_ph=PH123'

vi.mock('../src/signer.js', () => ({
  getKuaishouSignature: vi.fn().mockResolvedValue({ signature: 'SIG_E2E' }),
}))

// 百家号 mock handlers（注意：compuploadVideo 必须在 uploadVideo 之前检查）
function bjSuccessHandlers() {
  return {
    get: (url) => {
      if (url.includes('source=inner')) return { data: 'var BJH__INIT__AUTH__ = "TOKEN_E2E";' }
      if (url.includes('appinfo')) return { data: { data: { user: { app_id: 'APP_E2E' } } } }
      return { data: {} }
    },
    post: (url) => {
      if (url.includes('preuploadVideo')) return { data: { upload_key: 'KEY_E2E' } }
      if (url.includes('compuploadVideo')) return { data: { mediaId: 'MEDIA_E2E', bos_url: 'https://bos.example.com/v.mp4' } }
      if (url.includes('uploadVideo')) return { data: { code: 0, uploadId: 'UP_E2E' } }
      if (url.includes('video/process')) return { data: { data: { editVideo: { coverImage: 'https://cover.example.com/cover.jpg' } } } }
      if (url.includes('article/publish')) return { data: { errno: 0, ret: { id: 'ARTICLE_E2E' } } }
      return { data: {} }
    },
  }
}

describe('E2E 百家号 API 发布全链路', () => {
  let adapter
  beforeEach(() => { adapter = new BaijiahaoAdapter() })

  it('完整发布链：token → appId → preupload → 分片 → complete → process → publish', async () => {
    const { videoPath, tmpDir } = createTempVideo(2097152 * 2)
    const calls = mockHttp(adapter, bjSuccessHandlers())

    const result = await adapter.execute({
      title: 'E2E 测试', content: 'E2E 内容', tags: ['测试'],
      video: { path: videoPath, duration: 30, width: 1920, height: 1080 },
    }, COOKIE, { timeout: 300000 })

    expect(result.success).toBe(true)
    expect(result.platform).toBe('baijiahao')
    expect(result.publishId).toBe('ARTICLE_E2E')

    const publishCall = calls.find(c => c.url.includes('article/publish'))
    expect(publishCall.body).toContain('activity_list%5B0%5D%5Bis_checked%5D=1')

    expect(calls.filter(c => c.url.includes('uploadVideo') && !c.url.includes('preupload') && !c.url.includes('compupload')).length).toBe(2)
    try { fs.rmSync(tmpDir, { recursive: true, force: true }) } catch (_) {}
  })

  it('AI 声明：aiGenerated=false 时不勾选', async () => {
    const { videoPath, tmpDir } = createTempVideo(1024)
    const calls = mockHttp(adapter, bjSuccessHandlers())

    await adapter.execute({
      title: '人工', aiGenerated: false,
      video: { path: videoPath, duration: 30, width: 1920, height: 1080 },
    }, COOKIE)

    const publishCall = calls.find(c => c.url.includes('article/publish'))
    expect(publishCall.body).toContain('activity_list%5B0%5D%5Bis_checked%5D=0')
    try { fs.rmSync(tmpDir, { recursive: true, force: true }) } catch (_) {}
  })

  it('标题超长按字节截断', () => {
    const postData = adapter.buildVideoPostData(
      { title: '这是一个非常长的标题'.repeat(5), content: '测试', tags: [] },
      { mediaId: 'M1', coverUrl: 'https://c.com/c.jpg' }
    )
    const titlePart = postData.match(/title=([^&]+)/)
    expect(Buffer.byteLength(decodeURIComponent(titlePart[1]), 'utf8')).toBeLessThanOrEqual(149)
  })

  it('风控弹码返回可操作提示', async () => {
    mockHttp(adapter, {
      post: (url) => {
        if (url.includes('article/publish')) {
          return { data: { errno: 10000015, errmsg: '网络环境异常', data: { hit_rule: 'new_account', pass_auth: [{ auth_scene: 'phone' }] } } }
        }
        return { data: {} }
      },
    })
    const result = await adapter.publishVideo(COOKIE, 'TOKEN', 'title=test')
    expect(result.success).toBe(false)
    expect(result.error).toContain('风控拦截')
    expect(result.code).toBe(10000015)
  })
})

describe('E2E 快手 API 发布全链路', () => {
  let adapter
  beforeEach(() => { adapter = new KuaishouAdapter() })

  it('buildPostData 默认 AI 生成 + 发布成功', async () => {
    mockHttp(adapter, {
      post: () => ({ data: { result: 1, code: 200, id: 'KS_VIDEO_E2E' } }),
    })
    const postData = adapter.buildPostData({ title: 'E2E 快手', content: 'AI 生成', tags: ['测试'] })
    expect(postData.ai_generated).toBe(1)
    const result = await adapter.publish(COOKIE, postData)
    expect(result.success).toBe(true)
    expect(result.publishId).toBe('KS_VIDEO_E2E')
  })

  it('aiGenerated=false → ai_generated=0', () => {
    expect(adapter.buildPostData({ title: '人工', aiGenerated: false }).ai_generated).toBe(0)
  })

  it('发布失败返回错误消息', async () => {
    mockHttp(adapter, { post: () => ({ data: { result: 0, error_msg: '内容违规' } }) })
    const result = await adapter.publish(COOKIE, adapter.buildPostData({ title: 'test' }))
    expect(result.success).toBe(false)
    expect(result.error).toContain('违规')
  })
})

describe('E2E 跨平台 AI 声明一致性', () => {
  it('百家号和快手默认都声明 AI 生成', () => {
    const bj = new BaijiahaoAdapter().buildVideoPostData(
      { title: 't', content: 'c', tags: [] }, { mediaId: 'M1', coverUrl: 'https://c.com/c.jpg' }
    )
    const ks = new KuaishouAdapter().buildPostData({ title: 't', content: 'c' })
    expect(bj).toContain('activity_list%5B0%5D%5Bis_checked%5D=1')
    expect(ks.ai_generated).toBe(1)
  })
})
