// @ts-check
/**
 * useCollectionBatchPublish.test.js — 采集页批量动作 composable（TDD）
 *
 * PRD-ZHIHU-FAV-BATCH-2026-10-03 §3.4/§3.5/§3.6：
 *  - 多选状态（selectedIds/toggleSelect/selectMany）
 *  - 平台预筛：图文/视频两形态按 contentCategory 过滤（D8）
 *  - 批量发布图文：校验 → 确认框（条数×平台×账号 + 原文回退计数）→ batchCreate/Execute → registerSession
 *  - 批量生成视频：≤10、视频型跳过、story2videoBatchCreate
 *  - 批量发布视频：仅本批已完成产物（video_path），无产物禁用
 *  - 本批视频池：refreshBatchVideos 单次解析（status → run context → videoPath）
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

const mocks = vi.hoisted(() => ({
  batchCreate: vi.fn(),
  batchExecute: vi.fn(),
  story2videoBatchCreate: vi.fn(),
  story2videoBatchStatus: vi.fn(),
  pipelineGetRunContext: vi.fn(),
  registerSession: vi.fn(),
  ensureLogin: vi.fn(async () => true),
  notify: {
    confirm: vi.fn(async () => true),
    success: vi.fn(),
    warning: vi.fn(),
    error: vi.fn(),
  },
}))

vi.mock('@/api/publisher', () => ({
  batchCreate: mocks.batchCreate,
  batchExecute: mocks.batchExecute,
  story2videoBatchCreate: mocks.story2videoBatchCreate,
  story2videoBatchStatus: mocks.story2videoBatchStatus,
  pipelineGetRunContext: mocks.pipelineGetRunContext,
}))
vi.mock('@/stores/publishProgress', () => ({
  usePublishProgressStore: () => ({ registerSession: mocks.registerSession }),
}))
vi.mock('@/composables/useLoginGate', () => ({
  useLoginGate: () => ({ ensureLogin: mocks.ensureLogin }),
}))

import { useCollectionBatchPublish } from './useCollectionBatchPublish'

/** platformStore 桩：platforms + getContentCategory（对齐 stores/platforms.js 形状与生产 yaml 分类） */
function makePlatformStore () {
  return {
    platforms: [
      { id: 'xiaohongshu', label: '小红书' },
      { id: 'zhihu', label: '知乎' },
      { id: 'baijiahao', label: '百家号' },
      { id: 'douyin', label: '抖音' },
      { id: 'bilibili', label: 'B站' },
    ],
    getContentCategory (id) {
      // 与 config/platforms.yaml 一致：xiaohongshu=IMAGE_TEXT（QM-6 m1/m10：夹具禁止与生产漂移）
      const map = {
        xiaohongshu: 'IMAGE_TEXT', zhihu: 'IMAGE_TEXT', baijiahao: 'MIXED',
        douyin: 'VIDEO', bilibili: 'VIDEO',
      }
      return map[id] || 'IMAGE_TEXT'
    },
  }
}

const ACCOUNT_STORE = {
  byPlatform: {
    xiaohongshu: [{ id: 'xhs-1', platform: 'xiaohongshu' }, { id: 'xhs-2', platform: 'xiaohongshu' }],
    douyin: [{ id: 'dy-1', platform: 'douyin' }],
  },
}

const IMG_ITEM = (id, over = {}) => ({
  id, title: `标题${id}`, content: `正文${id}`, sourceUrl: `https://e.com/${id}`,
  kind: 'article', images: [], ...over,
})

function setup () {
  return useCollectionBatchPublish({
    platformStore: makePlatformStore(),
    accountStore: ACCOUNT_STORE,
    notify: mocks.notify,
  })
}

describe('useCollectionBatchPublish — 多选状态', () => {
  it('toggleSelect 选中/取消 + selectedCount', () => {
    const b = setup()
    b.toggleSelect(IMG_ITEM('a'))
    expect(b.selectedCount.value).toBe(1)
    expect(b.isSelected('a')).toBe(true)
    b.toggleSelect(IMG_ITEM('a'))
    expect(b.isSelected('a')).toBe(false)
    expect(b.selectedCount.value).toBe(0)
  })

  it('selectMany 全选/全不选 + clearSelection', () => {
    const b = setup()
    const items = [IMG_ITEM('a'), IMG_ITEM('b'), IMG_ITEM('c')]
    b.selectMany(items, true)
    expect(b.selectedCount.value).toBe(3)
    b.selectMany(items, false)
    expect(b.selectedCount.value).toBe(0)
    b.selectMany(items, true)
    b.clearSelection()
    expect(b.selectedCount.value).toBe(0)
  })

  it('selectedFrom(items)：按选中 id 过滤', () => {
    const b = setup()
    b.toggleSelect(IMG_ITEM('a'))
    b.toggleSelect(IMG_ITEM('c'))
    const picked = b.selectedFrom([IMG_ITEM('a'), IMG_ITEM('b'), IMG_ITEM('c')])
    expect(picked.map((i) => i.id)).toEqual(['a', 'c'])
  })
})

describe('useCollectionBatchPublish — 平台预筛（D8）', () => {
  it('imageText 形态：排除纯视频平台', () => {
    const b = setup()
    const ids = b.usablePlatforms('imageText').map((p) => p.id)
    expect(ids).toEqual(['xiaohongshu', 'zhihu', 'baijiahao'])
  })
  it('video 形态：仅 VIDEO+MIXED（纯图文平台如知乎/小红书不可发视频）', () => {
    const b = setup()
    // xiaohongshu/zhihu = IMAGE_TEXT（视频不可用），baijiahao = MIXED（可用），douyin/bilibili = VIDEO
    const ids = b.usablePlatforms('video').map((p) => p.id)
    expect(ids).toEqual(['baijiahao', 'douyin', 'bilibili'])
  })
})

describe('useCollectionBatchPublish — 批量发布图文', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.notify.confirm.mockResolvedValue(true)
  })

  it('无勾选 → 警告且不调 batchCreate', async () => {
    const b = setup()
    await b.confirmAndPublishImages([])
    expect(mocks.notify.warning).toHaveBeenCalled()
    expect(mocks.batchCreate).not.toHaveBeenCalled()
  })

  it('确认取消 → 不发布', async () => {
    mocks.notify.confirm.mockResolvedValueOnce(false)
    const b = setup()
    // 必须先配好目标：composable 在确认框之前做 needAccount 快速失败，
    // 否则 Once mock 未被消费会泄漏到下一个用例（QM-5 逃逸链教训的同型）
    b.batchSelection.value.imageText.platforms = ['xiaohongshu']
    b.toggleBatchAccount('imageText', 'xiaohongshu', 'xhs-1')
    await b.confirmAndPublishImages([IMG_ITEM('a')])
    expect(mocks.batchCreate).not.toHaveBeenCalled()
  })

  it('成功路径：改写稿优先 + 确认框含原文回退计数 + batchCreate/batchExecute/registerSession', async () => {
    mocks.batchCreate.mockResolvedValue({ code: 0, data: { id: 'batch-1' } })
    mocks.batchExecute.mockResolvedValue({ code: 0 })
    const b = setup() // 每用例独立实例：批次选择状态不跨用例泄漏
    b.batchSelection.value.imageText.platforms = ['xiaohongshu']
    b.toggleBatchAccount('imageText', 'xiaohongshu', 'xhs-1')
    const items = [
      IMG_ITEM('a', { rewrittenContent: '改写稿A' }),
      IMG_ITEM('b', { rewriteFailed: true }),
    ]
    await b.confirmAndPublishImages(items)
    // 确认框消息含条数/平台数/账号数与原文回退计数
    const msg = mocks.notify.confirm.mock.calls[0][1].message
    expect(msg).toContain('2')
    expect(msg).toContain('1')
    expect(msg).toContain('原文')
    // 载荷：改写稿优先
    const payload = mocks.batchCreate.mock.calls[0][0]
    expect(payload.articles).toHaveLength(2)
    expect(payload.articles[0].content).toBe('改写稿A')
    expect(payload.articles[1].content).toBe('正文b')
    // 封面映射修复：cover_url 必须有值
    const withCover = IMG_ITEM('c', { coverImage: 'https://picx.zhimg.com/c.jpg', rewrittenContent: '改' })
    mocks.batchCreate.mockClear()
    await b.confirmAndPublishImages([withCover])
    expect(mocks.batchCreate.mock.calls[0][0].articles[0].cover_url).toBe('https://picx.zhimg.com/c.jpg')
    // 会话登记
    expect(mocks.registerSession).toHaveBeenCalledWith(expect.objectContaining({ batchId: 'batch-1' }))
  })

  it('batchCreate 失败 → 错误通知', async () => {
    mocks.batchCreate.mockResolvedValue({ code: -1, message: 'boom' })
    const b = setup()
    b.batchSelection.value.imageText.platforms = ['xiaohongshu']
    b.toggleBatchAccount('imageText', 'xiaohongshu', 'xhs-1')
    await b.confirmAndPublishImages([IMG_ITEM('a')])
    expect(mocks.notify.error).toHaveBeenCalled()
    expect(mocks.batchExecute).not.toHaveBeenCalled()
  })
})

describe('useCollectionBatchPublish — 批量生成视频', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('超 10 条 → 警告且不提交', async () => {
    const b = setup()
    const items = Array.from({ length: 11 }, (_, i) => IMG_ITEM('g' + i))
    await b.confirmAndGenerateVideos(items)
    expect(mocks.notify.warning).toHaveBeenCalled()
    expect(mocks.story2videoBatchCreate).not.toHaveBeenCalled()
  })

  it('视频型条目跳过；成功提交 texts 取改写稿优先', async () => {
    mocks.story2videoBatchCreate.mockResolvedValue({ code: 0, data: { batchId: 'sb1', items: [] } })
    const b = setup()
    const items = [
      IMG_ITEM('a', { rewrittenContent: '改写稿甲' }),
      IMG_ITEM('v', { kind: 'video' }),
      IMG_ITEM('c'),
    ]
    await b.confirmAndGenerateVideos(items)
    const payload = mocks.story2videoBatchCreate.mock.calls[0][0]
    expect(payload.mode).toBe('text')
    expect(payload.texts).toEqual(['改写稿甲', '正文c'])
    expect(payload.story2videoTextConfigTemplate).toBeTruthy()
    expect(payload.uiLocale).toBeTypeOf('string')
  })

  it('提交失败 → 错误通知', async () => {
    mocks.story2videoBatchCreate.mockResolvedValue({ code: -1, message: 'no model' })
    const b = setup()
    await b.confirmAndGenerateVideos([IMG_ITEM('a')])
    expect(mocks.notify.error).toHaveBeenCalled()
  })
})

describe('useCollectionBatchPublish — 批量发布视频（本批产物）', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('本批无产物 → 警告且不调 batchCreate', async () => {
    const b = setup()
    await b.confirmAndPublishVideos()
    expect(mocks.notify.warning).toHaveBeenCalled()
    expect(mocks.batchCreate).not.toHaveBeenCalled()
  })

  it('本批产物 → video_path 载荷 + 仅视频平台可选', async () => {
    mocks.batchCreate.mockResolvedValue({ code: 0, data: { id: 'bv1' } })
    mocks.batchExecute.mockResolvedValue({ code: 0 })
    const b = setup()
    b.batchVideoPool.value = [{ projectId: 'p1', videoPath: 'D:\\v\\a.mp4', title: '片A' }]
    b.batchSelection.value.video.platforms = ['douyin']
    b.toggleBatchAccount('video', 'douyin', 'dy-1')
    await b.confirmAndPublishVideos()
    const payload = mocks.batchCreate.mock.calls[0][0]
    expect(payload.articles[0].video_path).toBe('D:\\v\\a.mp4')
    expect(payload.articles[0].title).toBe('片A')
  })
})

describe('useCollectionBatchPublish — 本批视频池解析', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('refreshBatchVideos：completed 项经 run context 提取 videoPath', async () => {
    mocks.story2videoBatchStatus.mockResolvedValue({
      code: 0,
      data: [{ id: 'sb9', items: [
        { itemId: 'i1', label: '片一', status: 'completed', runId: 'run-1' },
        { itemId: 'i2', label: '片二', status: 'running', runId: 'run-2' },
      ] }],
    })
    mocks.pipelineGetRunContext.mockResolvedValue({
      code: 0,
      data: { context: { compose: { videoPath: 'D:\\v\\one.mp4' } } },
    })
    const b = setup()
    b.trackBatch('sb9')
    const pool = await b.refreshBatchVideos()
    expect(pool).toHaveLength(1)
    expect(b.batchVideoPool.value[0]).toMatchObject({ runId: 'run-1', videoPath: 'D:\\v\\one.mp4', title: '片一' })
  })

  it('未 track 批次 → 空池不请求', async () => {
    const b = setup()
    await b.refreshBatchVideos()
    expect(mocks.story2videoBatchStatus).not.toHaveBeenCalled()
  })
})

