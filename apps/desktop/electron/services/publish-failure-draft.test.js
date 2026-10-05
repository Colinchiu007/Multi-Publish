// @vitest-environment node
/**
 * publish-failure-draft — 发布失败自动回存草稿（publish-fail-draft-guard）
 *
 * 契约（PRD §4.3 / §5.1）：
 * - 媒体门槛：video_path 非空或 images 非空数组才回存（纯文字不回存）
 * - Logto 模式（identityService 存在）无 owner_subject → fail-closed 跳过
 * - 任何失败只 log.warn，不冒泡
 * - 快照透传 article 内容字段，publishTime 固定 ''，source='auto_failure'
 */
const { saveFailureDraft, FAILURE_DRAFT_SOURCE } = require('./publish-failure-draft')

function makeLogger () {
  return { info: vi.fn(), warn: vi.fn(), error: vi.fn(), notify: vi.fn() }
}

function makeStoreDeps ({ storeResult } = {}) {
  // 有状态内存存储：模拟 store 的读写闭环（跨多次 saveFailureDraft 保留草稿）
  let scopedDrafts = []
  let legacyDrafts = []
  return {
    store: {
      getUserSetting: vi.fn(() => JSON.stringify(scopedDrafts)),
      setUserSetting: vi.fn((_key, value) => { scopedDrafts = JSON.parse(value) }),
      getSetting: vi.fn(() => JSON.stringify(legacyDrafts)),
      setSetting: vi.fn((_key, value) => { legacyDrafts = JSON.parse(value) }),
    },
    identityService: null,
    log: makeLogger(),
    save: storeResult,
  }
}

describe('publish-failure-draft / saveFailureDraft', () => {
  const videoTask = {
    id: 'task-v1',
    platform: 'douyin',
    owner_subject: 'user-a',
    article: {
      title: '视频标题',
      content: '视频正文',
      video_path: 'D:/media/clip.mp4',
      tags: ['v'],
      accountId: 'acc-9',
    },
  }

  it('视频任务失败 → 写入草稿（scoped setting，owner 隔离，source=auto_failure）', async () => {
    const deps = makeStoreDeps()
    const result = await saveFailureDraft(videoTask, deps)

    expect(result.saved).toBe(true)
    expect(deps.store.setUserSetting).toHaveBeenCalledTimes(1)
    const [key, raw, owner] = deps.store.setUserSetting.mock.calls[0]
    expect(key).toBe('drafts')
    expect(owner).toBe('user-a')
    const drafts = JSON.parse(raw)
    expect(drafts).toHaveLength(1)
    expect(drafts[0]).toMatchObject({
      title: '视频标题',
      content: '视频正文',
      video_path: 'D:/media/clip.mp4',
      platforms: ['douyin'],
      accounts: { douyin: 'acc-9' },
      source: FAILURE_DRAFT_SOURCE,
      publishTime: '',
      _fp: expect.any(String),
    })
    expect(typeof drafts[0].id).toBe('string')
  })

  it('图文任务失败（images 非空）→ 回存', async () => {
    const deps = makeStoreDeps()
    const task = {
      id: 'task-i1', platform: 'xiaohongshu', owner_subject: 'user-a',
      article: { title: '图文标题', images: ['D:/m/1.png', 'D:/m/2.png'] },
    }
    const result = await saveFailureDraft(task, deps)
    expect(result.saved).toBe(true)
    const drafts = JSON.parse(deps.store.setUserSetting.mock.calls[0][1])
    expect(drafts[0].images).toEqual(['D:/m/1.png', 'D:/m/2.png'])
  })

  it('纯文字任务失败 → 跳过（非媒体内容）', async () => {
    const deps = makeStoreDeps()
    const task = {
      id: 'task-t1', platform: 'zhihu', owner_subject: 'user-a',
      article: { title: '纯文字', content: '没有媒体' },
    }
    const result = await saveFailureDraft(task, deps)
    expect(result.saved).toBe(false)
    expect(result.reason).toBe('not_media')
    expect(deps.store.setUserSetting).not.toHaveBeenCalled()
  })

  it('article 缺失/非对象 → 跳过', async () => {
    const deps = makeStoreDeps()
    expect((await saveFailureDraft({ id: 't', platform: 'zhihu' }, deps)).saved).toBe(false)
    expect((await saveFailureDraft({ id: 't', platform: 'zhihu', article: 'bad' }, deps)).saved).toBe(false)
    expect(deps.store.setUserSetting).not.toHaveBeenCalled()
  })

  it('无 title 无 content 的纯媒体任务也回存（媒体路径即内容）', async () => {
    const deps = makeStoreDeps()
    const task = {
      id: 'task-m', platform: 'douyin', owner_subject: 'user-a',
      article: { video_path: 'D:/m/v.mp4' },
    }
    const result = await saveFailureDraft(task, deps)
    expect(result.saved).toBe(true)
  })

  it('Logto 模式（identityService 存在）缺 owner_subject → fail-closed 跳过，绝不写 legacy 命名空间', async () => {
    const deps = makeStoreDeps()
    deps.identityService = { getState: vi.fn(() => ({ status: 'authenticated', user: { sub: 'someone' } })) }
    const task = { id: 'task-x', platform: 'douyin', article: { title: 'T', video_path: 'D:/m/v.mp4' } }
    const result = await saveFailureDraft(task, deps)
    expect(result.saved).toBe(false)
    expect(result.reason).toBe('no_owner')
    expect(deps.store.setUserSetting).not.toHaveBeenCalled()
    expect(deps.store.setSetting).not.toHaveBeenCalled()
  })

  it('identityService 存在且 task 带 owner_subject → 写 scoped setting', async () => {
    const deps = makeStoreDeps()
    deps.identityService = { getState: vi.fn(() => ({ status: 'authenticated', user: { sub: 'user-a' } })) }
    const result = await saveFailureDraft(videoTask, deps)
    expect(result.saved).toBe(true)
    expect(deps.store.setUserSetting.mock.calls[0][2]).toBe('user-a')
  })

  it('无 identityService（legacy 模式）→ 写 legacy 全局 setting', async () => {
    const deps = makeStoreDeps()
    const result = await saveFailureDraft({ ...videoTask, owner_subject: undefined }, deps)
    expect(result.saved).toBe(true)
    expect(deps.store.setUserSetting).not.toHaveBeenCalled()
    expect(deps.store.setSetting).toHaveBeenCalledTimes(1)
    expect(deps.store.setSetting.mock.calls[0][0]).toBe('drafts')
  })

  it('同内容两次失败（不同 taskId）→ 指纹命中复用，草稿箱仍一条', async () => {
    const deps = makeStoreDeps()
    await saveFailureDraft(videoTask, deps)
    const first = JSON.parse(deps.store.setUserSetting.mock.calls[0][1])[0]

    const second = await saveFailureDraft({ ...videoTask, id: 'task-v2' }, deps)
    expect(second.saved).toBe(true)
    expect(second.reused).toBe(true)

    const drafts = JSON.parse(deps.store.setUserSetting.mock.calls[1][1])
    expect(drafts).toHaveLength(1)
    expect(drafts[0].id).toBe(first.id)
  })

  it('首次失败后用户改了定时再失败 → 指纹不受 publishTime 影响，仍复用', async () => {
    const deps = makeStoreDeps()
    await saveFailureDraft(videoTask, deps)
    const withSchedule = { ...videoTask, id: 'task-v3', article: { ...videoTask.article, publishTime: '2026-10-10T08:00:00Z' } }
    const second = await saveFailureDraft(withSchedule, deps)
    expect(second.reused).toBe(true)
    const drafts = JSON.parse(deps.store.setUserSetting.mock.calls[1][1])
    expect(drafts).toHaveLength(1)
  })

  it('既有草稿无 _fp（历史数据）→ 现算指纹参与比对并回填', async () => {
    const deps = makeStoreDeps()
    const legacyDraft = {
      id: 'draft-legacy',
      title: '视频标题',
      content: '视频正文',
      video_path: 'D:/media/clip.mp4',
      tags: ['v'],
      platforms: ['douyin'],
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    }
    deps.store.getUserSetting.mockReturnValue([legacyDraft])
    const result = await saveFailureDraft(videoTask, deps)
    expect(result.saved).toBe(true)
    expect(result.reused).toBe(true)
    const drafts = JSON.parse(deps.store.setUserSetting.mock.calls[0][1])
    expect(drafts).toHaveLength(1)
    expect(drafts[0].id).toBe('draft-legacy')
    expect(drafts[0]._fp).toBeTruthy()
  })

  it('scoped 读取返回 JSON 字符串 → 正常解析（对齐 store.js parseDrafts 行为）', async () => {
    const deps = makeStoreDeps()
    deps.store.getUserSetting.mockReturnValue(JSON.stringify([{ id: 'd1', title: '旧' }]))
    const result = await saveFailureDraft(videoTask, deps)
    expect(result.saved).toBe(true)
    const drafts = JSON.parse(deps.store.setUserSetting.mock.calls[0][1])
    expect(drafts).toHaveLength(2)
  })

  it('store 写入异常 → 返回 saved:false + warn，不抛出', async () => {
    const deps = makeStoreDeps()
    deps.store.setUserSetting.mockImplementation(() => { throw new Error('disk full') })
    const result = await saveFailureDraft(videoTask, deps)
    expect(result.saved).toBe(false)
    expect(result.reason).toBe('error')
    expect(deps.log.warn).toHaveBeenCalled()
  })

  it('读取异常 → 同样不抛出（warn + saved:false）', async () => {
    const deps = makeStoreDeps()
    deps.store.getUserSetting.mockImplementation(() => { throw new Error('read boom') })
    const result = await saveFailureDraft(videoTask, deps)
    expect(result.saved).toBe(false)
    expect(deps.log.warn).toHaveBeenCalled()
  })

  it('legacy setSetting 异常 → 不抛出', async () => {
    const deps = makeStoreDeps()
    deps.store.setSetting.mockImplementation(() => { throw new Error('boom') })
    const result = await saveFailureDraft({ ...videoTask, owner_subject: undefined }, deps)
    expect(result.saved).toBe(false)
    expect(deps.log.warn).toHaveBeenCalled()
  })

  it('store 缺失（deps.store 为空）→ 跳过不抛出', async () => {
    const deps = makeStoreDeps()
    deps.store = null
    const result = await saveFailureDraft(videoTask, deps)
    expect(result.saved).toBe(false)
  })
})
