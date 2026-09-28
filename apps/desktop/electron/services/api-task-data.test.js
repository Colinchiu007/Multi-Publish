'use strict'
/**
 * buildApiTaskData 契约测试（article → API taskData 形状翻译，单一实现）
 *
 * 根因（2026-09-28 活体）：RpaView 的 API-first 分支曾把裸 article 直接传给
 * publishViaApi——适配器要求 taskData.video.path（嵌套）而 article 是扁平
 * video_path，kuaishou/bilibili 等视频平台 API 轨全部 fail-closed
 * （taskData.video.path required）。本模块是 publisher-router 与
 * rpa-view-manager 共用的单一翻译实现。
 */
const { buildApiTaskData } = require('./api-task-data')

describe('buildApiTaskData — 视频模式', () => {
  it('article.video_path 翻译为 taskData.video.path（适配器契约形状）', () => {
    const td = buildApiTaskData({ title: 't', content: 'c', video_path: 'D:\\v\\01.mp4' })
    expect(td.video).toBeTruthy()
    expect(td.video.path).toBe('D:\\v\\01.mp4')
    expect(td.title).toBe('t')
    expect(td.content).toBe('c')
  })

  it('videoInfo 可选：提供时填充 duration/width/height，缺省为 0（快手/B站链只消费 path）', () => {
    const withInfo = buildApiTaskData({ video_path: 'a.mp4' }, { duration: 12.5, width: 1920, height: 1080 })
    expect(withInfo.video).toEqual({ path: 'a.mp4', duration: 12.5, width: 1920, height: 1080 })
    const noInfo = buildApiTaskData({ video_path: 'a.mp4' })
    expect(noInfo.video).toEqual({ path: 'a.mp4', duration: 0, width: 0, height: 0 })
  })

  it('cover_path 透传为 taskData.cover（仅视频模式）', () => {
    expect(buildApiTaskData({ video_path: 'a.mp4', cover_path: 'c.png' }).cover).toBe('c.png')
    expect(buildApiTaskData({ cover_path: 'c.png' }).cover).toBeUndefined()
  })
})

describe('buildApiTaskData — 图文模式', () => {
  it('无 video_path 时 images/author 透传（百家号/头条图文链消费）', () => {
    const td = buildApiTaskData({ title: 't', images: ['u1', 'u2'], author: '作者' })
    expect(td.video).toBeUndefined()
    expect(td.images).toEqual(['u1', 'u2'])
    expect(td.author).toBe('作者')
  })
})

describe('buildApiTaskData — 通用与平台字段', () => {
  it('draft 默认 false、仅显式 true 才为 true；aiGenerated 默认 true、仅显式 false 才为 false', () => {
    expect(buildApiTaskData({}).draft).toBe(false)
    expect(buildApiTaskData({ draft: true }).draft).toBe(true)
    expect(buildApiTaskData({}).aiGenerated).toBe(true)
    expect(buildApiTaskData({ aiGenerated: false }).aiGenerated).toBe(false)
  })

  it('平台特有字段透传（与 publisher-router 既有清单一致）', () => {
    const td = buildApiTaskData({
      category: 1, copyright: 2, categoryId: 'x', privacy: 'private',
      privacyLevel: 'SELF', original: true, location: '北京',
      collectionId: 'c1', playlistId: 'p1', collection: { a: 1 },
      goods: { id: 2 }, taskId: 't1',
    })
    expect(td.category).toBe(1)
    expect(td.copyright).toBe(2)
    expect(td.categoryId).toBe('x')
    expect(td.privacy).toBe('private')
    expect(td.privacyLevel).toBe('SELF')
    expect(td.original).toBe(true)
    expect(td.location).toBe('北京')
    expect(td.collectionId).toBe('c1')
    expect(td.playlistId).toBe('p1')
    expect(td.collection).toEqual({ a: 1 })
    expect(td.goods).toEqual({ id: 2 })
    expect(td.taskId).toBe('t1')
  })

  it('未声明的字段不透传（防 article 杂字段泄漏进 taskData）', () => {
    const td = buildApiTaskData({ video_path: 'a.mp4', video_path_extra: 'x', randomField: 1 })
    expect(td.randomField).toBeUndefined()
    expect(td.video_path_extra).toBeUndefined()
  })

  it('空入参安全（返回可用的空 taskData）', () => {
    const td = buildApiTaskData(null)
    expect(td.title).toBeUndefined()
    expect(td.video).toBeUndefined()
    expect(td.draft).toBe(false)
  })
})
