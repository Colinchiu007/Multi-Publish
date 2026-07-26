// @ts-check
'use strict'

const fs = require('fs')
const os = require('os')
const path = require('path')
const { Story2VideoProjectService } = require('./story2video-project-service')
const { cleanupImportedMediaPaths, importUserSelectedMedia } = require('./story2video-paths')

vi.mock('electron', () => {
  throw new Error('纯 Node 服务测试不应加载 Electron 运行时')
})

function writeFile (filePath, content = 'media') {
  fs.mkdirSync(path.dirname(filePath), { recursive: true })
  fs.writeFileSync(filePath, content)
  return filePath
}

describe('Story2VideoProjectService', () => {
  let root
  let store

  beforeEach(() => {
    const controlledTempRoot = path.join(os.tmpdir(), 'story2video')
    fs.mkdirSync(controlledTempRoot, { recursive: true })
    root = fs.mkdtempSync(path.join(controlledTempRoot, 'project-service-'))
    let saved = []
    store = {
      _resolveOwnerSubject: vi.fn(() => 'user-a'),
      getUserSetting: vi.fn((_key, fallback) => saved || fallback),
      setUserSetting: vi.fn((_key, value) => { saved = value }),
    }
  })

  afterEach(() => fs.rmSync(root, { recursive: true, force: true }))

  it('把完成运行的成片、完整旁白和每个分段持久化到受控目录', () => {
    const source = path.join(root, 'source')
    const image = writeFile(path.join(source, 'image.png'))
    const audio = writeFile(path.join(source, 'audio.mp3'))
    const segmentVideo = writeFile(path.join(source, 'segment.mp4'))
    const narration = writeFile(path.join(source, 'narration.m4a'))
    const output = writeFile(path.join(source, 'output.mp4'))
    const service = new Story2VideoProjectService({ store, projectsDir: path.join(root, 'projects') })

    const project = service.saveRun({
      id: 'run_123',
      pipeline: 'story2video-compose',
      status: 'completed',
      createdAt: '2026-07-22T00:00:00.000Z',
      endedAt: '2026-07-22T00:01:00.000Z',
      params: { text: '第一段', transition: 'fade', contentType: 'history' },
      context: {
        compose: {
          videoPath: output,
          audioPath: narration,
          segments: [{
            index: 0,
            text: '第一段',
            prompt: '画面',
            imagePath: image,
            audioPath: audio,
            videoPath: segmentVideo,
            duration: 2,
            imageMeta: { source: 'model-provider', provider: 'local-diffusion', degraded: false },
            audioMeta: { source: 'ffmpeg-silence', degraded: true, format: 'mp3' },
          }],
        },
      },
    })

    expect(project.projectId).toBe('run_123')
    expect(fs.existsSync(project.videoPath)).toBe(true)
    expect(fs.existsSync(project.audioPath)).toBe(true)
    expect(project.segments).toHaveLength(1)
    expect(fs.existsSync(project.segments[0].imagePath)).toBe(true)
    expect(fs.existsSync(project.segments[0].audioPath)).toBe(true)
    expect(fs.existsSync(project.segments[0].videoPath)).toBe(true)
    expect(project.segments[0]).toMatchObject({
      imageMeta: { source: 'model-provider', provider: 'local-diffusion', degraded: false },
      audioMeta: { source: 'ffmpeg-silence', degraded: true, format: 'mp3' },
    })
    expect(project.options).toMatchObject({ transition: 'fade', contentType: 'history' })
    expect(store.setUserSetting).toHaveBeenCalled()
  })

  it('重复的源分段索引不会覆盖彼此持久化后的媒体', () => {
    const source = path.join(root, 'duplicate-source')
    const imageA = writeFile(path.join(source, 'first.png'), 'first-image')
    const imageB = writeFile(path.join(source, 'second.png'), 'second-image')
    const output = writeFile(path.join(source, 'output.mp4'), 'output-video')
    const service = new Story2VideoProjectService({ store, projectsDir: path.join(root, 'projects') })

    const project = service.saveRun({
      id: 'run_duplicate_index',
      pipeline: 'story2video-compose',
      status: 'completed',
      context: {
        compose: {
          videoPath: output,
          segments: [
            { id: 'segment-first', index: 0, imagePath: imageA },
            { id: 'segment-second', index: 0, imagePath: imageB },
          ],
        },
      },
    })

    expect(project.segments).toHaveLength(2)
    expect(project.segments.map(segment => segment.sourceIndex)).toEqual([0, 0])
    expect(project.segments.map(segment => segment.index)).toEqual([0, 1])
    expect(project.segments[0].imagePath).not.toBe(project.segments[1].imagePath)
    expect(fs.readFileSync(project.segments[0].imagePath, 'utf8')).toBe('first-image')
    expect(fs.readFileSync(project.segments[1].imagePath, 'utf8')).toBe('second-image')
  })

  it('在流水线清理导入文件前把 BGM 复制到项目目录', () => {
    const source = path.join(root, 'source')
    const bgm = writeFile(path.join(source, 'bgm.mp3'), 'background-music')
    const output = writeFile(path.join(source, 'output.mp4'))
    const service = new Story2VideoProjectService({ store, projectsDir: path.join(root, 'projects') })

    const project = service.saveRun({
      id: 'run_bgm',
      pipeline: 'story2video-compose',
      status: 'completed',
      params: { text: '有背景音乐的项目', bgmPath: bgm, bgmVolume: 0.4 },
      context: { compose: { videoPath: output, segments: [] } },
    })
    fs.rmSync(bgm, { force: true })

    expect(project.options.bgmPath).not.toBe(bgm)
    expect(fs.existsSync(project.options.bgmPath)).toBe(true)
    expect(fs.readFileSync(project.options.bgmPath, 'utf8')).toBe('background-music')
  })

  it('保存版本化 text 配置并丢弃 Provider Secret', () => {
    const source = path.join(root, 'versioned-config-source')
    const bgm = writeFile(path.join(source, 'bgm.mp3'), 'background-music')
    const output = writeFile(path.join(source, 'output.mp4'))
    const service = new Story2VideoProjectService({ store, projectsDir: path.join(root, 'projects') })

    const project = service.saveRun({
      id: 'run_versioned_config',
      pipeline: 'story2video-compose',
      status: 'completed',
      params: {
        text: '版本化项目',
        apiKey: 'top-level-secret',
        token: 'top-level-token',
        story2videoTextConfig: {
          version: 1,
          mode: 'text',
          prompt: '版本化项目',
          size: '1080x1920',
          image: { provider: 'local-diffusion', apiKey: 'nested-secret' },
          voice: { provider: 'piper', token: 'nested-token' },
          bgm: { enabled: true, path: bgm, volume: 7 },
          publish: { enabled: false, platforms: [] },
          unknown: 'drop-me',
        },
      },
      context: { compose: { videoPath: output, segments: [] } },
    })

    expect(project.manifestVersion).toBe(2)
    expect(project.story2videoTextConfig).toMatchObject({
      version: 1,
      config: {
        version: 1,
        mode: 'text',
        prompt: '版本化项目',
        size: '1080x1920',
        image: { provider: 'local-diffusion' },
        voice: { provider: 'piper' },
        bgm: { enabled: true, volume: 7 },
      },
    })
    expect(project.story2videoTextConfig.config.bgm.path).not.toBe(bgm)
    expect(fs.readFileSync(project.story2videoTextConfig.config.bgm.path, 'utf8')).toBe('background-music')
    expect(JSON.stringify(project)).not.toMatch(/top-level-secret|top-level-token|nested-secret|nested-token|drop-me/)
    expect(service.getProject(project.projectId).story2videoTextConfig).toEqual(project.story2videoTextConfig)
    expect(JSON.parse(fs.readFileSync(path.join(service._projectDir(project.projectId), 'project.json'), 'utf8')))
      .toMatchObject({ story2videoTextConfig: { version: 1 } })
  })

  it('仅有版本化配置时仍可保存项目并恢复源文案', () => {
    const output = writeFile(path.join(root, 'config-only-source', 'output.mp4'))
    const service = new Story2VideoProjectService({ store, projectsDir: path.join(root, 'projects') })

    const project = service.saveRun({
      id: 'run_config_only',
      pipeline: 'story2video-compose',
      status: 'completed',
      params: {
        story2videoTextConfig: {
          version: 1,
          mode: 'text',
          prompt: '仅保存在版本化配置中的文案',
        },
      },
      context: { compose: { videoPath: output, segments: [] } },
    })

    expect(project).toMatchObject({
      sourceText: '仅保存在版本化配置中的文案',
      story2videoTextConfig: {
        version: 1,
        config: {
          version: 1,
          mode: 'text',
          prompt: '仅保存在版本化配置中的文案',
        },
      },
    })
  })

  it('旧项目没有版本化 text 配置时仍可读取', () => {
    const service = new Story2VideoProjectService({ store, projectsDir: path.join(root, 'projects') })
    service._writeProjects([{ manifestVersion: 1, projectId: 'legacy-project', status: 'completed', segments: [] }])

    expect(service.getProject('legacy-project')).toMatchObject({
      manifestVersion: 1,
      projectId: 'legacy-project',
      segments: [],
    })
  })

  it('编辑和排序只接受可编辑字段，不信任 renderer 传入的媒体路径', () => {
    const imageA = writeFile(path.join(root, 'a.png'))
    const imageB = writeFile(path.join(root, 'b.png'))
    const service = new Story2VideoProjectService({ store, projectsDir: path.join(root, 'projects') })
    service._writeProjects([{
      projectId: 'project-1',
      status: 'completed',
      segments: [
        { id: 'segment-0', index: 0, text: 'A', prompt: 'PA', imagePath: imageA },
        { id: 'segment-1', index: 1, text: 'B', prompt: 'PB', imagePath: imageB },
      ],
    }])

    const updated = service.updateSegments('project-1', [
      { id: 'segment-1', text: 'B2', prompt: 'PB2', imagePath: 'C:/evil.png' },
      { id: 'segment-0', text: 'A2', prompt: 'PA2', imagePath: 'C:/evil-2.png' },
    ])

    expect(updated.segments.map(item => item.id)).toEqual(['segment-1', 'segment-0'])
    expect(updated.segments.map(item => item.index)).toEqual([0, 1])
    expect(updated.segments[0]).toMatchObject({ text: 'B2', prompt: 'PB2', imagePath: imageB })
    expect(updated.segments[1]).toMatchObject({ text: 'A2', prompt: 'PA2', imagePath: imageA })
    expect(updated.dirty).toBe(true)
  })

  it('删除分段后只清理项目目录内不再引用的普通文件', () => {
    const service = new Story2VideoProjectService({ store, projectsDir: path.join(root, 'projects') })
    const projectDir = service._projectDir('project-cleanup')
    const removedImage = writeFile(path.join(projectDir, 'removed.png'))
    const removedVideo = writeFile(path.join(projectDir, 'removed.mp4'))
    const sharedAudio = writeFile(path.join(projectDir, 'shared.mp3'))
    const outsideFile = writeFile(path.join(root, 'outside.mp4'))
    service._writeProjects([{
      projectId: 'project-cleanup', status: 'completed', videoPath: outsideFile,
      segments: [
        { id: 'segment-0', index: 0, imagePath: removedImage, audioPath: sharedAudio, videoPath: removedVideo },
        { id: 'segment-1', index: 1, audioPath: sharedAudio },
      ],
    }])

    const updated = service.updateSegments('project-cleanup', [
      { id: 'segment-1', text: '保留段', prompt: '保留画面' },
    ])

    expect(updated.segments.map(segment => segment.id)).toEqual(['segment-1'])
    expect(fs.existsSync(removedImage)).toBe(false)
    expect(fs.existsSync(removedVideo)).toBe(false)
    expect(fs.existsSync(sharedAudio)).toBe(true)
    expect(fs.existsSync(outsideFile)).toBe(true)
  })

  it('单段图片重试只替换目标段，并重新渲染该段视频', async () => {
    const projectRoot = path.join(root, 'projects')
    const serviceOptions = { store, projectsDir: projectRoot }
    const bootstrap = new Story2VideoProjectService(serviceOptions)
    const projectDir = bootstrap._projectDir('project-1')
    const oldImage = writeFile(path.join(projectDir, 'old.png'))
    const oldVideo = writeFile(path.join(projectDir, 'old.mp4'))
    const otherImage = writeFile(path.join(root, 'other.png'))
    const audio = writeFile(path.join(root, 'voice.mp3'))
    const generated = writeFile(path.join(root, 'generated.png'))
    const service = new Story2VideoProjectService({
      store,
      projectsDir: projectRoot,
      assetGenerator: {
        generateImage: vi.fn(async () => ({ code: 0, data: { path: generated } })),
      },
      composeEngine: {
        renderSegment: vi.fn(async (_scene, _options, destination) => {
          writeFile(destination, 'video')
          return { code: 0, data: { videoPath: destination, duration: 2 } }
        }),
      },
    })
    service._writeProjects([{
      projectId: 'project-1', status: 'completed', options: {},
      segments: [
        { id: 'segment-0', index: 0, text: 'A', prompt: 'PA', imagePath: oldImage, audioPath: audio, videoPath: oldVideo },
        { id: 'segment-1', index: 1, text: 'B', prompt: 'PB', imagePath: otherImage, audioPath: audio },
      ],
    }])

    const updated = await service.retrySegment('project-1', 'segment-0', 'image')

    expect(updated.segments[0].imagePath).not.toBe(oldImage)
    expect(fs.existsSync(updated.segments[0].imagePath)).toBe(true)
    expect(fs.existsSync(oldImage)).toBe(false)
    expect(fs.existsSync(oldVideo)).toBe(false)
    expect(updated.segments[1].imagePath).toBe(otherImage)
    expect(service.composeEngine.renderSegment).toHaveBeenCalledTimes(1)
  })

  it('单段图片重试渲染失败时回滚旧媒体并清理本次产物', async () => {
    const projectRoot = path.join(root, 'projects')
    const bootstrap = new Story2VideoProjectService({ store, projectsDir: projectRoot })
    const projectDir = bootstrap._projectDir('project-retry-failure')
    const oldImage = writeFile(path.join(projectDir, 'old.png'), 'old-image')
    const oldVideo = writeFile(path.join(projectDir, 'old.mp4'), 'old-video')
    const generated = writeFile(path.join(root, 'generated.png'), 'generated-image')
    let failedDestination
    const service = new Story2VideoProjectService({
      store,
      projectsDir: projectRoot,
      assetGenerator: {
        generateImage: vi.fn(async () => ({ code: 0, data: { path: generated } })),
      },
      composeEngine: {
        renderSegment: vi.fn(async (_scene, _options, destination) => {
          failedDestination = destination
          writeFile(destination, 'partial-video')
          return { code: 1, message: '渲染失败' }
        }),
      },
    })
    service._writeProjects([{
      projectId: 'project-retry-failure', status: 'completed', options: {},
      segments: [{ id: 'segment-0', index: 0, text: 'A', prompt: 'PA', imagePath: oldImage, videoPath: oldVideo }],
    }])

    await expect(service.retrySegment('project-retry-failure', 'segment-0', 'image')).rejects.toThrow('渲染失败')

    const failed = service.getProject('project-retry-failure')
    expect(failed.segments[0]).toMatchObject({
      imagePath: oldImage,
      videoPath: oldVideo,
      status: 'failed',
      error: '渲染失败',
    })
    expect(fs.existsSync(oldImage)).toBe(true)
    expect(fs.existsSync(oldVideo)).toBe(true)
    expect(fs.existsSync(generated)).toBe(true)
    expect(fs.existsSync(failedDestination)).toBe(false)
    expect(fs.readdirSync(projectDir).some(name => name.includes('_image_retry_'))).toBe(false)
  })

  it('重新合成成功后清理不再引用的旧项目媒体', async () => {
    const projectRoot = path.join(root, 'projects')
    const bootstrap = new Story2VideoProjectService({ store, projectsDir: projectRoot })
    const projectDir = bootstrap._projectDir('project-recompose')
    const oldOutput = writeFile(path.join(projectDir, 'old-output.webm'), 'old-output')
    const oldImage = writeFile(path.join(projectDir, 'old-image.png'), 'old-image')
    const removedImage = writeFile(path.join(projectDir, 'removed-image.png'), 'removed-image')
    const removedVideo = writeFile(path.join(projectDir, 'removed-video.mp4'), 'removed-video')
    const newOutput = writeFile(path.join(root, 'new-output.mp4'), 'new-output')
    const newImage = writeFile(path.join(root, 'new-image.png'), 'new-image')
    const newSegmentVideo = writeFile(path.join(root, 'new-segment.mp4'), 'new-segment')
    const service = new Story2VideoProjectService({
      store,
      projectsDir: projectRoot,
      composeEngine: {
        compose: vi.fn(async () => ({
          code: 0,
          data: {
            videoPath: newOutput,
            segments: [{ id: 'segment-0', index: 0, imagePath: newImage, videoPath: newSegmentVideo }],
          },
        })),
      },
    })
    service._writeProjects([{
      projectId: 'project-recompose', status: 'completed', videoPath: oldOutput, options: {},
      segments: [
        { id: 'segment-0', index: 0, imagePath: oldImage },
        { id: 'segment-1', index: 1, imagePath: removedImage, videoPath: removedVideo },
      ],
    }])

    const updated = await service.recomposeProject('project-recompose')

    expect(fs.existsSync(updated.videoPath)).toBe(true)
    expect(updated.segments).toHaveLength(1)
    expect(fs.existsSync(updated.segments[0].imagePath)).toBe(true)
    expect(fs.existsSync(updated.segments[0].videoPath)).toBe(true)
    expect(fs.existsSync(oldOutput)).toBe(false)
    expect(fs.existsSync(oldImage)).toBe(false)
    expect(fs.existsSync(removedImage)).toBe(false)
    expect(fs.existsSync(removedVideo)).toBe(false)
  })

  it('清理项目媒体时不会跟随目录连接删除目录外文件', () => {
    const service = new Story2VideoProjectService({ store, projectsDir: path.join(root, 'projects') })
    const projectDir = service._projectDir('project-link-cleanup')
    const outsideDir = path.join(root, 'outside-media')
    const outsideFile = writeFile(path.join(outsideDir, 'keep.mp4'), 'outside-video')
    const link = path.join(projectDir, 'linked-directory')
    try {
      fs.symlinkSync(outsideDir, link, process.platform === 'win32' ? 'junction' : 'dir')
    } catch {
      return
    }
    const linkedFile = path.join(link, 'keep.mp4')

    const cleaned = service._cleanupUnreferencedProjectFiles(
      'project-link-cleanup',
      { projectId: 'project-link-cleanup', segments: [{ videoPath: linkedFile }] },
      { projectId: 'project-link-cleanup', segments: [] },
    )

    expect(cleaned).toBe(0)
    expect(fs.existsSync(outsideFile)).toBe(true)
  })

  it('替换分段音频时复制到项目目录并保留仍被其他分段引用的旧音频', () => {
    const service = new Story2VideoProjectService({ store, projectsDir: path.join(root, 'projects') })
    const projectDir = service._projectDir('project-audio')
    const sharedAudio = writeFile(path.join(projectDir, 'shared.mp3'), 'old-audio')
    const replacement = writeFile(path.join(root, 'replacement.wav'), 'new-audio')
    service._writeProjects([{
      projectId: 'project-audio', status: 'completed', segments: [
        { id: 'segment-0', index: 0, audioPath: sharedAudio },
        { id: 'segment-1', index: 1, audioPath: sharedAudio },
      ],
    }])

    const first = service.replaceSegmentAudio('project-audio', 'segment-0', replacement)

    expect(first.segments[0].audioPath).not.toBe(replacement)
    expect(fs.readFileSync(first.segments[0].audioPath, 'utf8')).toBe('new-audio')
    expect(first.segments[1].audioPath).toBe(sharedAudio)
    expect(fs.existsSync(sharedAudio)).toBe(true)
    expect(first.dirty).toBe(true)

    const replacement2 = writeFile(path.join(root, 'replacement-2.mp3'), 'new-audio-2')
    const second = service.replaceSegmentAudio('project-audio', 'segment-1', replacement2)
    expect(fs.existsSync(sharedAudio)).toBe(false)
    expect(fs.readFileSync(second.segments[1].audioPath, 'utf8')).toBe('new-audio-2')
  })

  it('使用默认语音识别供应商识别受控音频', async () => {
    const audio = writeFile(path.join(root, 'voice.mp3'), 'voice')
    const aiGenerator = { generate: vi.fn(async () => ({ text: '识别后的文字', language: 'zh' })) }
    const modelProviderManager = {
      getDefault: vi.fn(() => ({ id: 'whisper', models: ['whisper-1'] })),
      getProvider: vi.fn(() => ({ id: 'whisper', models: ['whisper-1'], config: {} })),
    }
    const service = new Story2VideoProjectService({
      store, projectsDir: path.join(root, 'projects'), aiGenerator, modelProviderManager,
    })

    await expect(service.transcribeFile(audio)).rejects.toThrow(/未导入|不允许/)
    const imported = importUserSelectedMedia(audio, 'audio')
    try {
      const result = await service.transcribeFile(imported.path)

      expect(result.text).toBe('识别后的文字')
      expect(aiGenerator.generate).toHaveBeenCalledWith(
        'speech_recognition',
        'whisper',
        expect.objectContaining({ file: expect.any(Blob), model: 'whisper-1' }),
      )
    } finally {
      cleanupImportedMediaPaths({ audio: [{ path: imported.path }] })
    }
  })

  it('禁用的默认供应商不会被误报为可用', () => {
    const modelProviderManager = {
      getDefault: vi.fn(() => ({ id: 'whisper', enabled: false })),
      getProvider: vi.fn(() => ({ id: 'whisper', category: 'speech_recognition', enabled: false })),
      listProviders: vi.fn(() => []),
    }
    const service = new Story2VideoProjectService({
      store, projectsDir: path.join(root, 'projects'), modelProviderManager,
    })

    expect(service.getCapabilities().transcription).toEqual({
      available: false,
      provider: null,
      reason: '未配置已启用的语音识别供应商',
    })
  })

  it('本地 Whisper 从嵌套配置读取地址，远程供应商要求执行器', () => {
    const localWhisper = {
      id: 'local-whisper',
      category: 'speech_recognition',
      enabled: true,
      config: { baseUrl: 'http://127.0.0.1:8080' },
    }
    const localService = new Story2VideoProjectService({
      store,
      projectsDir: path.join(root, 'projects'),
      modelProviderManager: {
        getDefault: vi.fn(() => null),
        getProvider: vi.fn(() => localWhisper),
        listProviders: vi.fn(() => [localWhisper]),
      },
    })
    const remoteService = new Story2VideoProjectService({
      store,
      projectsDir: path.join(root, 'projects'),
      modelProviderManager: {
        getDefault: vi.fn(() => ({ id: 'whisper', enabled: true })),
        getProvider: vi.fn(() => ({ id: 'whisper', category: 'speech_recognition', enabled: true })),
        listProviders: vi.fn(() => []),
      },
    })

    expect(localService.getCapabilities().transcription).toMatchObject({
      available: true,
      provider: 'local-whisper',
    })
    expect(remoteService.getCapabilities().transcription).toEqual({
      available: false,
      provider: 'whisper',
      reason: '语音识别执行器不可用',
    })
  })

  it('身份服务存在但无法解析用户时拒绝读取历史', () => {
    store._resolveOwnerSubject.mockReturnValue(null)
    const service = new Story2VideoProjectService({ store, projectsDir: path.join(root, 'projects') })
    expect(() => service.listProjects()).toThrow(/当前用户/)
  })

  it('删除项目时同步移除用户索引和受控产物目录', () => {
    const projectDir = path.join(root, 'projects')
    const service = new Story2VideoProjectService({ store, projectsDir: projectDir })
    service._writeProjects([{ projectId: 'project-delete', status: 'completed', segments: [] }])
    writeFile(path.join(service._projectDir('project-delete'), 'video.mp4'))

    const result = service.deleteProject('project-delete')

    expect(result).toEqual({ projectId: 'project-delete', deleted: true })
    expect(service.listProjects()).toEqual([])
    expect(fs.existsSync(path.join(service._ownerDir(), 'project-delete'))).toBe(false)
  })
})
