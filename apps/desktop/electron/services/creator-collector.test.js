/**
 * creator-collector.test.js — 博主采集适配器：频道解析契约
 *
 * 本文件的首要目的不是覆盖率，而是**锁死一处静默数据正确性缺陷**：
 *
 *   依赖包 content_aggregator 的 YouTubeCollector 在 `_fetch(channel_id=...)` 里，
 *   仅当入参 `startswith('http')` 时才进入 URL 解析分支；`@handle` 形态会被
 *   **降级成关键词搜索**（search_query=handle、channel_id=None），返回的是
 *   「标题/描述含该词的任意视频」，其 channel_id 是那些视频作者的频道。
 *
 *   P0 冒烟实测（2026-10-07，真实 API Key）：
 *     /channel/UC_x5… -> UC_x5XG1OV2P6uZZ5FSM9Ttw   ✅
 *     /c/GoogleDevelopers -> UC_x5XG1OV2P6uZZ5FSM9Twh ✅
 *     /user/GoogleDevelopers -> UC_x5XG1OV2P6uZZ5FSM9Twh ✅
 *     @GoogleDevelopers -> UC-BsRijgl1O-H-sD4-Zw3UA  ❌ 另一个频道
 *
 *   该缺陷**不报错**：返回值合法且有值、日志只有一行 warning、UI 无任何异常信号。
 *   后果是用户关注 A 博主却收到 B 博主的内容，且系统无法自证。
 *
 * 因此本文件的断言核心是：**任何用户输入都不得被原样当作 channelId 传给采集器**。
 * 见下方「绝不原样透传」系列用例。
 */
const { resolveChannelId, CREATOR_INPUT_ERRORS } = require('./creator-collector')

// 固定时间无关；本文件全部为纯函数/受控依赖，无网络
const API_KEY = 'test-key'
const UC_ID = 'UC_x5XG1OV2P6uZZ5FSM9Tww'

/**
 * 构造可控的 HTTP 替身：记录调用参数，按查询参数返回预置频道。
 * 这样测试能断言「走了哪条解析路径」，而不只是断言结果。
 */
function makeHttp (routes) {
  const calls = []
  const httpGet = async (url, params) => {
    calls.push({ url, params })
    const key = Object.keys(routes).find(k => (params || {})[k] !== undefined)
    if (!key) throw new Error(`unexpected route: ${JSON.stringify(params)}`)
    return routes[key](params)
  }
  return { httpGet, calls }
}

const okChannel = (id) => async () => ({ status: 200, json: () => ({ items: [{ id }] }) })
const emptyChannel = async () => ({ status: 200, json: () => ({ items: [] }) })

describe('creator-collector 频道解析 · UC 频道 ID 直取', () => {
  it('UC 形式不发任何 HTTP 请求', async () => {
    const { httpGet, calls } = makeHttp({})
    const cid = await resolveChannelId(UC_ID, { apiKey: API_KEY, httpGet })
    expect(cid).toBe(UC_ID)
    expect(calls).toHaveLength(0)
  })

  it('完整 URL 中的 UC 片段也被直取，不发请求', async () => {
    const { httpGet, calls } = makeHttp({})
    const cid = await resolveChannelId(`https://www.youtube.com/channel/${UC_ID}`, { apiKey: API_KEY, httpGet })
    expect(cid).toBe(UC_ID)
    expect(calls).toHaveLength(0)
  })

  it('识别到的 UC ID 不得被大小写化（YouTube ID 大小写敏感）', async () => {
    // 构造一个大小写混合的合法 UC ID，断言原样透传
    const mixed = 'UC_x5XG1OV2P6uZZ5FSM9Tww'
    const { httpGet, calls } = makeHttp({})
    const cid = await resolveChannelId(mixed, { apiKey: API_KEY, httpGet })
    expect(cid).toBe(mixed)          // 原样，未被 toLowerCase / toUpperCase
    expect(cid).not.toBe(mixed.toLowerCase())
    expect(cid).not.toBe(mixed.toUpperCase())
    expect(calls).toHaveLength(0)
  })

  it('非法的 UC 前缀（如小写 uc_）不被当作合法 ID 放行', async () => {
    // YouTube 频道 ID 恒以大写 UC 开头；小写形式无法证明是有效 ID，
    // 必须 fail-closed 而不是猜一个大小写去试。
    const { httpGet, calls } = makeHttp({})
    await expect(resolveChannelId(UC_ID.toLowerCase(), { apiKey: API_KEY, httpGet }))
      .rejects.toMatchObject({ code: CREATOR_INPUT_ERRORS.INVALID_INPUT })
    expect(calls).toHaveLength(0)
  })
})

describe('creator-collector 频道解析 · @handle 走 forHandle', () => {
  it('完整 URL 的 @handle 调用 channels.list?forHandle=', async () => {
    const { httpGet, calls } = makeHttp({ forHandle: okChannel(UC_ID) })
    const cid = await resolveChannelId('https://www.youtube.com/@GoogleDevelopers', { apiKey: API_KEY, httpGet })
    expect(cid).toBe(UC_ID)
    expect(calls).toHaveLength(1)
    expect(calls[0].params.forHandle).toBe('GoogleDevelopers')
    expect(calls[0].params.forUsername).toBeUndefined()
  })

  it('裸串 @handle 先补全 scheme 再解析（依赖库裸串会 400）', async () => {
    const { httpGet, calls } = makeHttp({ forHandle: okChannel(UC_ID) })
    const cid = await resolveChannelId('@GoogleDevelopers', { apiKey: API_KEY, httpGet })
    expect(cid).toBe(UC_ID)
    expect(calls[0].params.forHandle).toBe('GoogleDevelopers')
  })

  it('裸串 youtube.com/@handle 同样先补全 scheme', async () => {
    const { httpGet, calls } = makeHttp({ forHandle: okChannel(UC_ID) })
    const cid = await resolveChannelId('youtube.com/@GoogleDevelopers', { apiKey: API_KEY, httpGet })
    expect(cid).toBe(UC_ID)
    expect(calls[0].params.forHandle).toBe('GoogleDevelopers')
  })

  it('forHandle 返回空 items 时 fail-closed 抛 ChannelNotFound，不得回退', async () => {
    const { httpGet } = makeHttp({ forHandle: emptyChannel })
    await expect(resolveChannelId('@nope', { apiKey: API_KEY, httpGet }))
      .rejects.toMatchObject({ code: CREATOR_INPUT_ERRORS.CHANNEL_NOT_FOUND })
  })
})

describe('creator-collector 频道解析 · 旧式 /c/ 与 /user/ 走 forUsername', () => {
  it('/c/Name 走 forUsername', async () => {
    const { httpGet, calls } = makeHttp({ forUsername: okChannel(UC_ID) })
    const cid = await resolveChannelId('https://www.youtube.com/c/GoogleDevelopers', { apiKey: API_KEY, httpGet })
    expect(cid).toBe(UC_ID)
    expect(calls[0].params.forUsername).toBe('GoogleDevelopers')
  })

  it('/user/Name 走 forUsername', async () => {
    const { httpGet, calls } = makeHttp({ forUsername: okChannel(UC_ID) })
    const cid = await resolveChannelId('https://www.youtube.com/user/GoogleDevelopers', { apiKey: API_KEY, httpGet })
    expect(cid).toBe(UC_ID)
    expect(calls[0].params.forUsername).toBe('GoogleDevelopers')
  })

  it('裸串 youtube.com/c/Name 先补全 scheme', async () => {
    const { httpGet, calls } = makeHttp({ forUsername: okChannel(UC_ID) })
    const cid = await resolveChannelId('youtube.com/c/GoogleDevelopers', { apiKey: API_KEY, httpGet })
    expect(cid).toBe(UC_ID)
    expect(calls[0].params.forUsername).toBe('GoogleDevelopers')
  })
})

describe('creator-collector 频道解析 · 绝不原样透传（P0 冒烟缺陷的防线）', () => {
  // 这组是本文件存在的核心理由。任何一条回归都意味着用户会静默收到别的频道的内容。

  const NEVER_LEAK = [
    ['@handle（完整 URL）', 'https://www.youtube.com/@GoogleDevelopers'],
    ['@handle（裸串）', '@GoogleDevelopers'],
    ['旧式 /c/', 'https://www.youtube.com/c/GoogleDevelopers'],
    ['旧式 /user/', 'https://www.youtube.com/user/GoogleDevelopers'],
    ['裸串域名路径', 'youtube.com/@GoogleDevelopers'],
  ]

  for (const [label, input] of NEVER_LEAK) {
    it(`${label} 绝不把用户输入原样作为 channelId 传给 API`, async () => {
      const { httpGet, calls } = makeHttp({
        forHandle: okChannel(UC_ID),
        forUsername: okChannel(UC_ID),
      })
      await resolveChannelId(input, { apiKey: API_KEY, httpGet })
      for (const c of calls) {
        expect(c.params.channelId).toBeUndefined()
      }
      // 解析结果必须是 API 返回的 canonical ID，而不是输入串
      expect(calls.length).toBeGreaterThan(0)
    })
  }

  it('解析产物必须等于 API 返回的 canonical ID，而非输入', async () => {
    const OTHER = 'UC-BsRijgl1O-H-sD4-Zw3UA'   // 冒烟实测中被错误返回的「另一个频道」
    const { httpGet } = makeHttp({ forHandle: okChannel(UC_ID) })
    const cid = await resolveChannelId('@GoogleDevelopers', { apiKey: API_KEY, httpGet })
    expect(cid).toBe(UC_ID)
    expect(cid).not.toBe('GoogleDevelopers')
    expect(cid).not.toBe(OTHER)
  })
})

describe('creator-collector 频道解析 · 非法输入 fail-closed', () => {
  it('作品链接（watch?v=）明确报「不是频道链接」', async () => {
    const { httpGet, calls } = makeHttp({})
    await expect(resolveChannelId('https://www.youtube.com/watch?v=abc123', { apiKey: API_KEY, httpGet }))
      .rejects.toMatchObject({ code: CREATOR_INPUT_ERRORS.NOT_A_CHANNEL })
    expect(calls).toHaveLength(0)   // 识别阶段不发请求
  })

  it('播放列表链接同样报「不是频道链接」', async () => {
    const { httpGet } = makeHttp({})
    await expect(resolveChannelId('https://www.youtube.com/playlist?list=PL123', { apiKey: API_KEY, httpGet }))
      .rejects.toMatchObject({ code: CREATOR_INPUT_ERRORS.NOT_A_CHANNEL })
  })

  it('非 YouTube 域名报 INVALID_INPUT，不发请求', async () => {
    const { httpGet, calls } = makeHttp({})
    await expect(resolveChannelId('https://v.douyin.com/abc/', { apiKey: API_KEY, httpGet }))
      .rejects.toMatchObject({ code: CREATOR_INPUT_ERRORS.INVALID_INPUT })
    expect(calls).toHaveLength(0)
  })

  it('空输入报 INVALID_INPUT', async () => {
    const { httpGet } = makeHttp({})
    for (const bad of ['', '   ', null, undefined]) {
      await expect(resolveChannelId(bad, { apiKey: API_KEY, httpGet }))
        .rejects.toMatchObject({ code: CREATOR_INPUT_ERRORS.INVALID_INPUT })
    }
  })

  it('无法识别的 YouTube 路径报 INVALID_INPUT，不发请求', async () => {
    const { httpGet, calls } = makeHttp({})
    await expect(resolveChannelId('https://www.youtube.com/feed/trending', { apiKey: API_KEY, httpGet }))
      .rejects.toMatchObject({ code: CREATOR_INPUT_ERRORS.INVALID_INPUT })
    expect(calls).toHaveLength(0)
  })
})

describe('creator-collector 频道解析 · 错误信息可区分', () => {
  it('「格式不对」与「频道不存在」是两种不同错误（排查方向不同）', async () => {
    const { httpGet } = makeHttp({})
    const formatErr = await resolveChannelId('https://www.youtube.com/feed/x', { apiKey: API_KEY, httpGet })
      .catch(e => e)
    const notFoundErr = await resolveChannelId('@ghost', {
      apiKey: API_KEY, httpGet: makeHttp({ forHandle: emptyChannel }).httpGet,
    }).catch(e => e)

    expect(formatErr.code).toBe(CREATOR_INPUT_ERRORS.INVALID_INPUT)
    expect(notFoundErr.code).toBe(CREATOR_INPUT_ERRORS.CHANNEL_NOT_FOUND)
    expect(formatErr.code).not.toBe(notFoundErr.code)
  })

  it('错误对象不含 API Key 明文', async () => {
    const secret = 'AIzaSySuperSecretKeyValue'
    const { httpGet } = makeHttp({ forHandle: async () => ({ status: 200, json: () => ({ items: [] }) }) })
    const err = await resolveChannelId('@ghost', { apiKey: secret, httpGet }).catch(e => e)
    expect(JSON.stringify(err)).not.toContain(secret)
  })
})