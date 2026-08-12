// @ts-check
import { describe, it, expect, vi } from 'vitest'
import { createVideoClonePublisher } from './publisher'

describe('createVideoClonePublisher', () => {
  it('无 router → skipped（不失败）', async () => {
    const pub = createVideoClonePublisher({ publisherRouter: null })
    const out = await pub({ media: { path: 'x.mp4' }, report: {} })
    expect(out.status).toBe('skipped')
    expect(out.reason).toBe('no-publisher-router')
  })

  it('有 router → publish 成功透传', async () => {
    const router = { publish: vi.fn(async () => ({ ok: true })) }
    const pub = createVideoClonePublisher({ publisherRouter: router })
    const out = await pub({ media: { path: 'x.mp4' }, report: { script: { fullText: '文案' }, narrative: { plot: '剧情' } } })
    expect(out.status).toBe('published')
    expect(router.publish).toHaveBeenCalledWith(expect.objectContaining({ source: 'video-clone', video_path: 'x.mp4' }))
  })

  it('router 抛错 → PUBLISH_FAILED', async () => {
    const router = { publish: vi.fn(async () => { throw new Error('pub boom') }) }
    const pub = createVideoClonePublisher({ publisherRouter: router })
    await expect(pub({ media: { path: 'x.mp4' }, report: {} })).rejects.toMatchObject({ code: 'VIDEOCLONE_PUBLISH_FAILED' })
  })
})
