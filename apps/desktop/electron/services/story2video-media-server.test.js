// @vitest-environment node
'use strict'

const fs = require('fs')
const os = require('os')
const path = require('path')
const {
  STORY2VIDEO_MEDIA_PATH,
  Story2VideoMediaServer,
} = require('./story2video-media-server')

describe('Story2Video 本机媒体流服务', () => {
  let root
  let mediaPath
  let server

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 's2v-media-server-'))
    mediaPath = path.join(root, 'result.mp4')
    fs.writeFileSync(mediaPath, '0123456789')
    server = new Story2VideoMediaServer()
  })

  afterEach(async () => {
    await server.stop()
    fs.rmSync(root, { recursive: true, force: true })
  })

  it('生成不泄露本地路径的回环 URL，并支持媒体 Range 请求', async () => {
    await server.start()
    const url = server.createUrl(mediaPath)
    const response = await fetch(url, { headers: { Range: 'bytes=2-5' } })

    expect(url).toMatch(new RegExp('^http://127\\.0\\.0\\.1:\\d+' + STORY2VIDEO_MEDIA_PATH + '[A-Za-z0-9_-]{16,}$'))
    expect(url).not.toContain(mediaPath)
    expect(url).not.toContain(path.basename(root))
    expect(response.status).toBe(206)
    expect(response.headers.get('content-range')).toBe('bytes 2-5/10')
    expect(response.headers.get('content-type')).toBe('video/mp4')
    expect(await response.text()).toBe('2345')
  })

  it('图片文件返回正确的 image/* Content-Type（分段编辑区图片可显示）', async () => {
    await server.start()
    const imagePath = path.join(root, 'segment.png')
    fs.writeFileSync(imagePath, 'fake-png-bytes')
    const url = server.createUrl(imagePath)
    const response = await fetch(url)

    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toBe('image/png')
    expect(response.headers.get('x-content-type-options')).toBe('nosniff')
  })

  it('jpg/jpeg/webp 均映射为 image/* Content-Type', async () => {
    await server.start()
    for (const [name, expected] of [['a.jpg', 'image/jpeg'], ['b.jpeg', 'image/jpeg'], ['c.webp', 'image/webp']]) {
      const filePath = path.join(root, name)
      fs.writeFileSync(filePath, 'fake')
      const response = await fetch(server.createUrl(filePath))
      expect(response.headers.get('content-type')).toBe(expected)
    }
  })

  it('拒绝未知、过期和含额外参数的令牌请求', async () => {
    let now = 100
    await server.stop()
    server = new Story2VideoMediaServer({ now: () => now, tokenTtlMs: 10 })
    await server.start()
    const url = server.createUrl(mediaPath)
    const origin = new URL(url).origin

    expect((await fetch(origin + STORY2VIDEO_MEDIA_PATH + 'aaaaaaaaaaaaaaaa')).status).toBe(404)
    expect((await fetch(url + '?path=' + encodeURIComponent(mediaPath))).status).toBe(404)
    now += 10
    expect((await fetch(url)).status).toBe(404)
  })

  it('在服务停止后撤销令牌且不再监听端口', async () => {
    await server.start()
    const url = server.createUrl(mediaPath)

    await server.stop()

    expect(server.size).toBe(0)
    await expect(fetch(url)).rejects.toThrow()
  })

  it('拒绝未启动服务、相对路径和无效 Range', async () => {
    expect(() => server.createUrl(mediaPath)).toThrow(/未启动/)
    await server.start()
    expect(() => server.createUrl('relative.mp4')).toThrow(/绝对路径/)
    const url = server.createUrl(mediaPath)
    const response = await fetch(url, { headers: { Range: 'bytes=100-200' } })

    expect(response.status).toBe(416)
    expect(response.headers.get('content-range')).toBe('bytes */10')
  })

  it('在容量达到上限时淘汰最早令牌', async () => {
    const tokens = [
      'aaaaaaaaaaaaaaaaaaaa',
      'bbbbbbbbbbbbbbbbbbbb',
      'cccccccccccccccccccc',
    ]
    await server.stop()
    server = new Story2VideoMediaServer({
      maxEntries: 2,
      tokenFactory: () => tokens.shift(),
    })
    await server.start()
    const first = server.createUrl(mediaPath)
    const second = server.createUrl(mediaPath)
    const third = server.createUrl(mediaPath)

    expect(server.size).toBe(2)
    expect((await fetch(first)).status).toBe(404)
    expect((await fetch(second)).status).toBe(200)
    expect(server.revoke(third)).toBe(true)
    expect(server.size).toBe(1)
  })
})
