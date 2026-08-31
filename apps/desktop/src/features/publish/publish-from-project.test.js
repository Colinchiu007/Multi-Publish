import { describe, expect, it } from 'vitest'
import { buildPublishFromProject, publishDataToQuery } from './publish-from-project'

function makeProject (overrides = {}) {
  return {
    projectId: 'run_1787747765446_xge6',
    status: 'completed',
    title: '外婆的灶台总飘着豆瓣香的雾气。那年我离家求学，她往行李塞了一罐自制辣酱。',
    sourceText: '外婆的灶台总飘着豆瓣香的雾气。那年我离家求学，她往行李塞了一罐自制辣酱。',
    videoPath: 'D:\\tmp\\debug\\video.mp4',
    segments: [
      { id: 'segment-0', text: '外婆的灶台总飘着豆瓣香的雾气。' },
      { id: 'segment-1', text: '十年后我回乡，罐子还在，人已不在。' },
    ],
    story2videoTextConfig: {
      config: {
        publish: {
          enabled: false,
          platforms: [],
          title: '',
          content: '外婆的灶台总飘着豆瓣香的雾气。那年我离家求学。',
          tags: ['美食', '亲情'],
          coverUrl: '',
        },
      },
    },
    ...overrides,
  }
}

describe('publish-from-project', () => {
  it('从项目提取视频路径/标题/正文/标签', () => {
    const data = buildPublishFromProject(makeProject())
    expect(data.type).toBe('video')
    expect(data.video_path).toBe('D:\\tmp\\debug\\video.mp4')
    expect(data.title).toBe('外婆的灶台总飘着豆瓣香的雾气。那年我离家求学，她往行李塞了一罐自制辣酱。')
    expect(data.content).toBe('外婆的灶台总飘着豆瓣香的雾气。那年我离家求学。')
    expect(data.tags).toEqual(['美食', '亲情'])
  })

  it('publish 缺省时回退 sourceText / 拼接 segments.text', () => {
    const project = makeProject()
    project.story2videoTextConfig.config.publish = { enabled: false, platforms: [], title: '', content: '', tags: [], coverUrl: '' }
    const data = buildPublishFromProject(project)
    expect(data.content).toBe(project.sourceText)
    expect(data.title).toBe(project.title)

    const bare = makeProject({ sourceText: '', title: '' })
    bare.story2videoTextConfig = null
    const bareData = buildPublishFromProject(bare)
    expect(bareData.content).toBe('外婆的灶台总飘着豆瓣香的雾气。十年后我回乡，罐子还在，人已不在。')
  })

  it('标题超过百家号上限（100 字）时截断', () => {
    const longTitle = '字'.repeat(120)
    const data = buildPublishFromProject(makeProject({ title: longTitle, sourceText: longTitle }))
    expect(data.title.length).toBe(100)
    expect(data.title).toBe(longTitle.slice(0, 100))
  })

  it('标签归一化（去重/去空/逗号分隔字符串）', () => {
    const project = makeProject()
    project.story2videoTextConfig.config.publish.tags = '美食, 美食，AI'
    const data = buildPublishFromProject(project)
    expect(data.tags).toEqual(['美食', 'AI'])
  })

  it('publishDataToQuery 对路径与文案做 URI 编码', () => {
    const data = buildPublishFromProject(makeProject())
    const query = publishDataToQuery(data)
    expect(query.type).toBe('video')
    expect(query.video_path).toBe(encodeURIComponent(data.video_path))
    expect(query.title).toBe(encodeURIComponent(data.title))
    expect(query.content).toBe(encodeURIComponent(data.content))
    expect(query.tags).toBe(encodeURIComponent('美食,亲情'))
  })

  it('空项目返回空数据且不抛错', () => {
    const data = buildPublishFromProject(null)
    expect(data).toEqual({ type: 'video', video_path: '', title: '', content: '', tags: [] })
  })
})
