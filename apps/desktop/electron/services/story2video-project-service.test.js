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
    // 忠实模拟 settings-store：owner 未显式传入时按 _resolveOwnerSubject 二次解析（未登录→null→丢弃），
    // 显式传入时按 owner 分桶（__legacy__ → 原 key，其他 → user:<hash>: 键空间）。
    const buckets = new Map()
    const normalizeOwner = (value) => {
      if (typeof value !== 'string') return null
      const subject = value.trim()
      return subject ? subject : null
    }
    store = {
      _resolveOwnerSubject: vi.fn(() => 'user-a'),
      getUserSetting: vi.fn((key, fallback, ownerSubject) => {
        const owner = ownerSubject !== undefined ? normalizeOwner(ownerSubject) : normalizeOwner(store._resolveOwnerSubject())
        if (!owner) return fallback
        return buckets.get(owner) === undefined ? fallback : buckets.get(owner)
      }),
      setUserSetting: vi.fn((key, value, ownerSubject) => {
        const owner = ownerSubject !== undefined ? normalizeOwner(ownerSubject) : normalizeOwner(store._resolveOwnerSubject())
        if (!owner) return
        buckets.set(owner, value)
      }),
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
            subtitleBlocks: ['第一段字幕，', '继续显示。'],
            subtitleTimeline: [
              { index: 0, text: '第一段字幕，', startTime: 0, endTime: 1, duration: 1 },
              { index: 1, text: '继续显示。', startTime: 1, endTime: 2, duration: 1 },
            ],
            sceneSource: 'local-typescript-fallback',
            subtitleSource: 'local-typescript',
            degraded: true,
            fallbackReason: 'ECONNREFUSED',
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
      subtitleBlocks: ['第一段字幕，', '继续显示。'],
      subtitleTimeline: [
        { index: 0, text: '第一段字幕，', startTime: 0, endTime: 1, duration: 1 },
        { index: 1, text: '继续显示。', startTime: 1, endTime: 2, duration: 1 },
      ],
      sceneSource: 'local-typescript-fallback',
      subtitleSource: 'local-typescript',
      degraded: true,
      fallbackReason: 'ECONNREFUSED',
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

  it('缺失/不可读 BGM 不阻断项目保存（成片已成功时不得误判为失败，2026-08-11 E2E 修复）', () => {
    const source = path.join(root, 'missing-bgm-source')
    const missingBgm = path.join(source, 'bgm-does-not-exist.mp3')
    const output = writeFile(path.join(source, 'output.mp4'))
    const service = new Story2VideoProjectService({ store, projectsDir: path.join(root, 'projects') })

    const project = service.saveRun({
      id: 'run_missing_bgm',
      pipeline: 'story2video-compose',
      status: 'completed',
      params: {
        text: 'BGM 缺失的项目',
        bgmPath: missingBgm,
        story2videoTextConfig: {
          version: 1,
          mode: 'text',
          prompt: 'BGM 缺失的项目',
          size: '1920x1080',
          image: { provider: 'minimax-multimodal' },
          voice: { provider: 'minimax-multimodal' },
          bgm: { enabled: true, path: missingBgm, volume: 5 },
          publish: { enabled: false, platforms: [] },
        },
      },
      context: { compose: { videoPath: output, segments: [] } },
    })

    // 不得抛错：成片已产出，缺失 BGM 只应降级跳过持久化
    expect(project).not.toBeNull()
    expect(project.projectId).toBe('run_missing_bgm')
    expect(project.videoPath).toBeDefined()
    expect(project.story2videoTextConfig.config.bgm.path).toBe('')
    // 项目索引已落盘（project.json，owner 分桶目录）
    const crypto = require('crypto')
    const ownerDir = crypto.createHash('sha256').update('user-a', 'utf8').digest('hex')
    const projectJson = path.join(root, 'projects', ownerDir, 'run_missing_bgm', 'project.json')
    expect(fs.existsSync(projectJson)).toBe(true)
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
    // 图1 槽位回填项目原值（compose 回显副本仅用于渲染映射），旧图不再删除而是继续作为候选素材（审查 C1 语义）
    expect(updated.segments[0].imagePath).toBe(oldImage)
    expect(fs.existsSync(oldImage)).toBe(true)
    expect(fs.existsSync(removedImage)).toBe(false)
    expect(fs.existsSync(removedVideo)).toBe(false)
    // compose 回显的图片副本（segment_0000_image.png）回填后被清理，不残留孤儿文件
    expect(fs.existsSync(path.join(projectDir, 'segment_0000_image.png'))).toBe(false)
  })

  it('image2 选中态再次合成：图1/图2 槽保持原状，不被 compose 回显污染删除（审查 C1 回归）', async () => {
    const projectRoot = path.join(root, 'projects')
    const bootstrap = new Story2VideoProjectService({ store, projectsDir: projectRoot })
    const projectDir = bootstrap._projectDir('project-recompose-image2')
    const image1 = writeFile(path.join(projectDir, 'image1.png'), 'img1')
    const image2 = writeFile(path.join(projectDir, 'image2.png'), 'img2')
    const audio = writeFile(path.join(projectDir, 'voice.mp3'), 'voice')
    const newOutput = writeFile(path.join(root, 'new-output.mp4'), 'new-output')
    const newSegmentVideo = writeFile(path.join(root, 'new-segment.mp4'), 'new-segment')
    const service = new Story2VideoProjectService({
      store,
      projectsDir: projectRoot,
      composeEngine: {
        // 模拟引擎行为：compose 输出回显 _scenesForCompose 传入的 imagePath（image2 选中 → 图2 路径）
        compose: vi.fn(async () => ({
          code: 0,
          data: {
            videoPath: newOutput,
            segments: [{ id: 'segment-0', index: 0, imagePath: image2, audioPath: audio, videoPath: newSegmentVideo }],
          },
        })),
      },
    })
    service._writeProjects([{
      projectId: 'project-recompose-image2', status: 'completed', options: {},
      segments: [{
        id: 'segment-0', index: 0, text: 'A', prompt: 'PA',
        imagePath: image1, alternateImages: [{ path: image2 }], audioPath: audio,
        selectedMaterial: 'image2', status: 'completed',
      }],
    }])

    const updated = await service.recomposeProject('project-recompose-image2')

    expect(updated.segments[0].imagePath).toBe(image1)
    expect(updated.segments[0].alternateImages[0].path).toBe(image2)
    expect(updated.segments[0].selectedMaterial).toBe('image2')
    expect(updated.segments[0].videoPath).not.toBe(newSegmentVideo)
    expect(fs.existsSync(updated.segments[0].videoPath)).toBe(true)
    expect(fs.existsSync(image1)).toBe(true)
    expect(fs.existsSync(image2)).toBe(true)
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

  it('历史列表不会探测受控项目目录外的视频路径', () => {
    const externalVideoPath = writeFile(path.join(root, 'external', 'legacy.mp4'))
    store.getUserSetting.mockReturnValue([{ projectId: 'project-outside', videoPath: externalVideoPath, status: 'completed' }])
    const lstatSpy = vi.spyOn(fs, 'lstatSync')
    try {
      const [project] = new Story2VideoProjectService({ store, projectsDir: path.join(root, 'projects') }).listProjects()
      expect(project.recoverable).toBe(false)
      expect(lstatSpy).not.toHaveBeenCalledWith(externalVideoPath)
    } finally {
      lstatSpy.mockRestore()
    }
  })
  it('历史列表不会穿过受控项目目录内的链接探测外部视频', () => {
    const externalVideoPath = writeFile(path.join(root, 'external', 'legacy.mp4'))
    const service = new Story2VideoProjectService({ store, projectsDir: path.join(root, 'projects') })
    const projectDir = service._projectDir('project-junction')
    fs.mkdirSync(projectDir, { recursive: true })
    const linkedDir = path.join(projectDir, 'linked')
    fs.symlinkSync(path.dirname(externalVideoPath), linkedDir, process.platform === 'win32' ? 'junction' : 'dir')
    const linkedVideoPath = path.join(linkedDir, path.basename(externalVideoPath))
    store.getUserSetting.mockReturnValue([{ projectId: 'project-junction', videoPath: linkedVideoPath, status: 'completed' }])
    const lstatSpy = vi.spyOn(fs, 'lstatSync')
    try {
      const [project] = service.listProjects()
      expect(project.recoverable).toBe(false)
      expect(lstatSpy).not.toHaveBeenCalledWith(linkedVideoPath)
    } finally {
      lstatSpy.mockRestore()
    }
  })
  it('身份服务启用但未登录（无有效 sub）时回退设备级命名空间，本地历史可读写', () => {
    store._resolveOwnerSubject.mockReturnValue(null)
    const service = new Story2VideoProjectService({ store, projectsDir: path.join(root, 'projects') })
    // 未登录：listProjects 不抛错，返回本地（legacy）数据
    expect(() => service.listProjects()).not.toThrow()
    expect(service.listProjects()).toEqual([])
    // 未登录也能写入并在同一设备级命名空间读回（本地历史可用）
    service._writeProjects([{ projectId: 'local-1', status: 'completed', segments: [] }])
    expect(service.listProjects().map(item => item.projectId)).toEqual(['local-1'])
    expect(service._ownerSubject()).toBe('__legacy__')
  })

  it('store 缺失时仍 fail-closed（不静默降级）', () => {
    const service = new Story2VideoProjectService({ store: null, projectsDir: path.join(root, 'projects') })
    expect(() => service.listProjects()).toThrow(/项目存储不可用/)
  })

  it('登录用户与未登录 legacy 数据隔离，不串写', () => {
    const service = new Story2VideoProjectService({ store, projectsDir: path.join(root, 'projects') })
    // 未登录写入 legacy 空间
    store._resolveOwnerSubject.mockReturnValue(null)
    service._writeProjects([{ projectId: 'legacy-1', status: 'completed', segments: [] }])
    expect(service.listProjects().map(item => item.projectId)).toEqual(['legacy-1'])
    // 登录后写入 user-a 空间
    store._resolveOwnerSubject.mockReturnValue('user-a')
    service._writeProjects([{ projectId: 'user-1', status: 'completed', segments: [] }])
    expect(service.listProjects().map(item => item.projectId)).toEqual(['user-1'])
    // 切回未登录：legacy 数据仍在，且不含登录用户数据
    store._resolveOwnerSubject.mockReturnValue(null)
    expect(service.listProjects().map(item => item.projectId)).toEqual(['legacy-1'])
    // 登录态：不含 legacy 数据
    store._resolveOwnerSubject.mockReturnValue('user-a')
    expect(service.listProjects().map(item => item.projectId)).toEqual(['user-1'])
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

  it('animated-explainer 完成运行同样持久化项目（复用 compose 产物与 assets.scenes）', () => {
    const source = path.join(root, 'explainer-source')
    const image = writeFile(path.join(source, 'image.png'))
    const audio = writeFile(path.join(source, 'audio.mp3'))
    const segmentVideo = writeFile(path.join(source, 'segment.mp4'))
    const narration = writeFile(path.join(source, 'narration.m4a'))
    const output = writeFile(path.join(source, 'output.mp4'))
    const service = new Story2VideoProjectService({ store, projectsDir: path.join(root, 'projects') })

    const project = service.saveRun({
      id: 'run_explainer_1',
      pipeline: 'animated-explainer',
      status: 'completed',
      createdAt: '2026-08-06T00:00:00.000Z',
      endedAt: '2026-08-06T00:01:00.000Z',
      params: { text: '人工智能的起源' },
      context: {
        assets: {
          scenes: [{
            index: 0,
            text: '人工智能的起源',
            prompt: '关于起源的画面',
            imagePath: image,
            audioPath: audio,
            duration: 6,
          }],
        },
        compose: {
          videoPath: output,
          audioPath: narration,
          segments: [{
            index: 0,
            text: '人工智能的起源',
            prompt: '关于起源的画面',
            imagePath: image,
            audioPath: audio,
            videoPath: segmentVideo,
            duration: 6,
          }],
        },
      },
    })

    expect(project.projectId).toBe('run_explainer_1')
    expect(project.pipeline).toBe('animated-explainer')
    expect(fs.existsSync(project.videoPath)).toBe(true)
    expect(fs.existsSync(project.audioPath)).toBe(true)
    expect(project.segments).toHaveLength(1)
    expect(fs.existsSync(project.segments[0].videoPath)).toBe(true)
  })

  it('生成场景新图：只有图1 时补图2 槽且不改变选中态', async () => {
    const projectRoot = path.join(root, 'projects')
    const bootstrap = new Story2VideoProjectService({ store, projectsDir: projectRoot })
    const projectDir = bootstrap._projectDir('project-image-slot-1')
    const image1 = writeFile(path.join(projectDir, 'image1.png'), 'img1')
    const audio = writeFile(path.join(projectDir, 'voice.mp3'), 'voice')
    const generated = writeFile(path.join(root, 'generated.png'), 'generated')
    const service = new Story2VideoProjectService({
      store,
      projectsDir: projectRoot,
      assetGenerator: {
        generateImage: vi.fn(async () => ({ code: 0, data: { path: generated } })),
      },
    })
    service._writeProjects([{
      projectId: 'project-image-slot-1', status: 'completed', options: {},
      segments: [{ id: 'segment-0', index: 0, text: 'A', prompt: 'PA', imagePath: image1, audioPath: audio }],
    }])

    const updated = await service.generateSceneImage('project-image-slot-1', 'segment-0')

    expect(updated.segments[0].imagePath).toBe(image1)
    expect(updated.segments[0].alternateImages).toHaveLength(1)
    expect(fs.existsSync(updated.segments[0].alternateImages[0].path)).toBe(true)
    expect(updated.segments[0].alternateImages[0].path).not.toBe(image1)
    expect(updated.segments[0].selectedMaterial).toBeUndefined()
    expect(service.assetGenerator.generateImage).toHaveBeenCalledWith('PA', expect.objectContaining({ index: 0 }))
  })

  it('生成场景新图：图1 被选中时替换图2 槽', async () => {
    const projectRoot = path.join(root, 'projects')
    const bootstrap = new Story2VideoProjectService({ store, projectsDir: projectRoot })
    const projectDir = bootstrap._projectDir('project-image-slot-2')
    const image1 = writeFile(path.join(projectDir, 'image1.png'), 'img1')
    const image2 = writeFile(path.join(projectDir, 'image2.png'), 'img2')
    const generated = writeFile(path.join(root, 'generated.png'), 'generated')
    const service = new Story2VideoProjectService({
      store,
      projectsDir: projectRoot,
      assetGenerator: {
        generateImage: vi.fn(async () => ({ code: 0, data: { path: generated } })),
      },
    })
    service._writeProjects([{
      projectId: 'project-image-slot-2', status: 'completed', options: {},
      segments: [{
        id: 'segment-0', index: 0, text: 'A', prompt: 'PA',
        imagePath: image1, alternateImages: [{ path: image2 }], selectedMaterial: 'image1',
      }],
    }])

    const updated = await service.generateSceneImage('project-image-slot-2', 'segment-0')

    expect(updated.segments[0].imagePath).toBe(image1)
    expect(fs.existsSync(updated.segments[0].alternateImages[0].path)).toBe(true)
    expect(updated.segments[0].alternateImages[0].path).not.toBe(image2)
    expect(updated.segments[0].selectedMaterial).toBe('image1')
    expect(fs.existsSync(image2)).toBe(false)
  })

  it('生成场景新图：图2 被选中时替换图1', async () => {
    const projectRoot = path.join(root, 'projects')
    const bootstrap = new Story2VideoProjectService({ store, projectsDir: projectRoot })
    const projectDir = bootstrap._projectDir('project-image-slot-3')
    const image1 = writeFile(path.join(projectDir, 'image1.png'), 'img1')
    const image2 = writeFile(path.join(projectDir, 'image2.png'), 'img2')
    const generated = writeFile(path.join(root, 'generated.png'), 'generated')
    const service = new Story2VideoProjectService({
      store,
      projectsDir: projectRoot,
      assetGenerator: {
        generateImage: vi.fn(async () => ({ code: 0, data: { path: generated } })),
      },
    })
    service._writeProjects([{
      projectId: 'project-image-slot-3', status: 'completed', options: {},
      segments: [{
        id: 'segment-0', index: 0, text: 'A', prompt: 'PA',
        imagePath: image1, alternateImages: [{ path: image2 }], selectedMaterial: 'image2',
      }],
    }])

    const updated = await service.generateSceneImage('project-image-slot-3', 'segment-0')

    expect(fs.existsSync(updated.segments[0].imagePath)).toBe(true)
    expect(updated.segments[0].imagePath).not.toBe(image1)
    expect(updated.segments[0].alternateImages[0].path).toBe(image2)
    expect(fs.existsSync(image1)).toBe(false)
  })

  it('生成场景新图失败时回滚旧素材并清理本次产物', async () => {
    const projectRoot = path.join(root, 'projects')
    const bootstrap = new Story2VideoProjectService({ store, projectsDir: projectRoot })
    const projectDir = bootstrap._projectDir('project-image-slot-fail')
    const image1 = writeFile(path.join(projectDir, 'image1.png'), 'old-image')
    const service = new Story2VideoProjectService({
      store,
      projectsDir: projectRoot,
      assetGenerator: {
        generateImage: vi.fn(async () => { throw new Error('图片生成失败') }),
      },
    })
    service._writeProjects([{
      projectId: 'project-image-slot-fail', status: 'completed', options: {},
      segments: [{ id: 'segment-0', index: 0, text: 'A', prompt: 'PA', imagePath: image1 }],
    }])

    await expect(service.generateSceneImage('project-image-slot-fail', 'segment-0')).rejects.toThrow('图片生成失败')

    const failed = service.getProject('project-image-slot-fail')
    expect(failed.segments[0]).toMatchObject({ imagePath: image1, status: 'failed', error: '图片生成失败' })
    expect(failed.segments[0].alternateImages).toBeUndefined()
    expect(fs.existsSync(image1)).toBe(true)
    expect(fs.readdirSync(projectDir).some(name => name.includes('_image_gen_'))).toBe(false)
  })

  it('生成场景视频：用当前选中图片渲染并替换视频槽', async () => {
    const projectRoot = path.join(root, 'projects')
    const bootstrap = new Story2VideoProjectService({ store, projectsDir: projectRoot })
    const projectDir = bootstrap._projectDir('project-video-render')
    const image1 = writeFile(path.join(projectDir, 'image1.png'), 'img1')
    const image2 = writeFile(path.join(projectDir, 'image2.png'), 'img2')
    const audio = writeFile(path.join(projectDir, 'voice.mp3'), 'voice')
    let renderedScene
    const service = new Story2VideoProjectService({
      store,
      projectsDir: projectRoot,
      composeEngine: {
        renderSegment: vi.fn(async (scene, _options, destination) => {
          renderedScene = scene
          writeFile(destination, 'video')
          return { code: 0, data: { videoPath: destination, duration: 3 } }
        }),
      },
    })
    service._writeProjects([{
      projectId: 'project-video-render', status: 'completed', options: {},
      segments: [{
        id: 'segment-0', index: 0, text: 'A', prompt: 'PA',
        imagePath: image1, alternateImages: [{ path: image2 }], audioPath: audio, selectedMaterial: 'image2',
      }],
    }])

    const updated = await service.generateSceneVideo('project-video-render', 'segment-0')

    expect(updated.segments[0].videoPath).toBeTruthy()
    expect(fs.existsSync(updated.segments[0].videoPath)).toBe(true)
    expect(updated.segments[0].duration).toBe(3)
    expect(renderedScene.imagePath).toBe(image2)
    expect(renderedScene.videoPath).toBeNull()
    expect(service.composeEngine.renderSegment).toHaveBeenCalledTimes(1)
  })

  it('生成场景视频缺少旁白音频时报错且不写失败状态', async () => {
    const projectRoot = path.join(root, 'projects')
    const service = new Story2VideoProjectService({ store, projectsDir: projectRoot })
    service._writeProjects([{
      projectId: 'project-video-no-audio', status: 'completed', options: {},
      segments: [{ id: 'segment-0', index: 0, text: 'A', imagePath: path.join(root, 'image1.png'), status: 'completed' }],
    }])

    await expect(service.generateSceneVideo('project-video-no-audio', 'segment-0')).rejects.toThrow('该场景没有旁白音频')

    const unchanged = service.getProject('project-video-no-audio')
    expect(unchanged.segments[0].status).toBe('completed')
  })

  it('生成场景视频失败时保留旧视频并回写失败状态', async () => {
    const projectRoot = path.join(root, 'projects')
    const bootstrap = new Story2VideoProjectService({ store, projectsDir: projectRoot })
    const projectDir = bootstrap._projectDir('project-video-fail')
    const image1 = writeFile(path.join(projectDir, 'image1.png'), 'img1')
    const audio = writeFile(path.join(projectDir, 'voice.mp3'), 'voice')
    const oldVideo = writeFile(path.join(projectDir, 'old.mp4'), 'old-video')
    let failedDestination
    const service = new Story2VideoProjectService({
      store,
      projectsDir: projectRoot,
      composeEngine: {
        renderSegment: vi.fn(async (_scene, _options, destination) => {
          failedDestination = destination
          writeFile(destination, 'partial')
          return { code: 1, message: '渲染失败' }
        }),
      },
    })
    service._writeProjects([{
      projectId: 'project-video-fail', status: 'completed', options: {},
      segments: [{ id: 'segment-0', index: 0, text: 'A', imagePath: image1, audioPath: audio, videoPath: oldVideo }],
    }])

    await expect(service.generateSceneVideo('project-video-fail', 'segment-0')).rejects.toThrow('渲染失败')

    const failed = service.getProject('project-video-fail')
    expect(failed.segments[0]).toMatchObject({ videoPath: oldVideo, status: 'failed', error: '渲染失败' })
    expect(fs.existsSync(oldVideo)).toBe(true)
    expect(fs.existsSync(failedDestination)).toBe(false)
    expect(fs.readdirSync(projectDir).some(name => name.includes('_video_render_'))).toBe(false)
  })

  it('选择场景素材校验非法类型与空槽，成功后持久化选中态', () => {
    const projectRoot = path.join(root, 'projects')
    const service = new Story2VideoProjectService({ store, projectsDir: projectRoot })
    service._writeProjects([{
      projectId: 'project-select', status: 'completed', options: {},
      segments: [
        { id: 'segment-0', index: 0, imagePath: path.join(projectRoot, 'image1.png') },
        { id: 'segment-1', index: 1, imagePath: path.join(projectRoot, 'image1.png'), videoPath: path.join(projectRoot, 'v.mp4') },
      ],
    }])

    expect(() => service.selectSceneMaterial('project-select', 'segment-0', 'unsupported')).toThrow('素材类型无效')
    expect(() => service.selectSceneMaterial('project-select', 'segment-0', 'image2')).toThrow('该素材槽位暂无素材')
    expect(() => service.selectSceneMaterial('project-select', 'segment-0', 'video')).toThrow('该素材槽位暂无素材')
    expect(() => service.selectSceneMaterial('project-select', 'missing', 'image1')).toThrow('分段不存在')

    const saved = service.selectSceneMaterial('project-select', 'segment-1', 'video')
    expect(saved.segments[1].selectedMaterial).toBe('video')
    expect(saved.dirty).toBe(true)
    expect(service.getProject('project-select').segments[1].selectedMaterial).toBe('video')
  })

  it('按选中态映射 compose 输入（video/image1/image2/缺失 四态）', () => {
    const service = new Story2VideoProjectService({ store, projectsDir: path.join(root, 'projects') })
    const segments = [
      { id: 's0', imagePath: 'img1.png', alternateImages: [{ path: 'img2.png' }], videoPath: 'v0.mp4', selectedMaterial: 'video' },
      { id: 's1', imagePath: 'img1.png', alternateImages: [{ path: 'img2.png' }], videoPath: 'v1.mp4', selectedMaterial: 'image1' },
      { id: 's2', imagePath: 'img1.png', alternateImages: [{ path: 'img2.png' }], videoPath: 'v2.mp4', selectedMaterial: 'image2' },
      { id: 's3', imagePath: 'img1.png', alternateImages: [{ path: 'img2.png' }], videoPath: 'v3.mp4' },
    ]

    const scenes = service._scenesForCompose(segments)

    expect(scenes[0]).toMatchObject({ imagePath: 'img1.png', videoPath: 'v0.mp4' })
    expect(scenes[1]).toMatchObject({ imagePath: 'img1.png', videoPath: null })
    expect(scenes[2]).toMatchObject({ imagePath: 'img2.png', videoPath: null })
    expect(scenes[3]).toMatchObject({ imagePath: 'img1.png', videoPath: 'v3.mp4' })
  })

  it('manual 完成运行持久化未选素材（图2 备选、未选视频、选中态）', () => {
    const source = path.join(root, 'manual-source')
    const imageA = writeFile(path.join(source, 'image-a.png'))
    const imageB = writeFile(path.join(source, 'image-b.png'))
    const video = writeFile(path.join(source, 'candidate.mp4'))
    const audio = writeFile(path.join(source, 'audio.mp3'))
    const output = writeFile(path.join(source, 'output.mp4'))
    const service = new Story2VideoProjectService({ store, projectsDir: path.join(root, 'projects') })

    const project = service.saveRun({
      id: 'run_manual_1',
      pipeline: 'story2video-compose',
      status: 'completed',
      createdAt: '2026-08-14T00:00:00.000Z',
      params: { text: '第一段', creationMode: 'manual' },
      context: {
        generate_assets: {
          materialMode: 'all-images',
          creationMode: 'manual',
          candidates: [{
            index: 0,
            text: '第一段',
            prompt: '画面',
            candidates: [
              { id: 'image-1', kind: 'image', path: imageA, meta: { source: 'model-provider' } },
              { id: 'image-2', kind: 'image', path: imageB, meta: { source: 'model-provider' } },
              { id: 'video-2', kind: 'video', path: video, meta: { source: 'video-provider' } },
            ],
          }],
          selection: { selections: [{ index: 0, candidateId: 'image-1' }] },
          scenes: [{
            index: 0, text: '第一段', prompt: '画面', imagePath: imageA, audioPath: audio,
          }],
        },
        compose: {
          videoPath: output,
          audioPath: audio,
          segments: [{
            index: 0, text: '第一段', prompt: '画面', imagePath: imageA, audioPath: audio,
            duration: 2,
          }],
        },
      },
    })

    expect(project.segments).toHaveLength(1)
    expect(project.segments[0].selectedMaterial).toBe('image1')
    expect(fs.existsSync(project.segments[0].alternateImages[0].path)).toBe(true)
    expect(project.segments[0].alternateImages[0].path).not.toBe(imageB)
    expect(fs.existsSync(project.segments[0].videoPath)).toBe(true)
  })

  it('备选图片纳入项目文件引用清理（不被误删）', () => {
    const projectRoot = path.join(root, 'projects')
    const service = new Story2VideoProjectService({ store, projectsDir: projectRoot })
    const projectDir = service._projectDir('project-alt-cleanup')
    const image1 = writeFile(path.join(projectDir, 'image1.png'), 'img1')
    const alt1 = writeFile(path.join(projectDir, 'alt1.png'), 'alt1')
    const alt2 = writeFile(path.join(projectDir, 'alt2.png'), 'alt2')

    const cleaned = service._cleanupUnreferencedProjectFiles(
      'project-alt-cleanup',
      { projectId: 'project-alt-cleanup', segments: [{ imagePath: image1, alternateImages: [{ path: alt1 }] }] },
      { projectId: 'project-alt-cleanup', segments: [{ imagePath: image1, alternateImages: [{ path: alt2 }] }] },
    )

    expect(cleaned).toBe(1)
    expect(fs.existsSync(image1)).toBe(true)
    expect(fs.existsSync(alt2)).toBe(true)
    expect(fs.existsSync(alt1)).toBe(false)
  })

  it('生成场景视频：图1 选中与未选（legacy）时都用图1 渲染', async () => {
    const projectRoot = path.join(root, 'projects')
    const service = new Story2VideoProjectService({
      store,
      projectsDir: projectRoot,
      composeEngine: {
        renderSegment: vi.fn(async (_scene, _options, destination) => {
          writeFile(destination, 'video')
          return { code: 0, data: { videoPath: destination, duration: 2 } }
        }),
      },
    })
    const projectDir = service._projectDir('project-video-legacy')
    const image1 = writeFile(path.join(projectDir, 'image1.png'), 'img1')
    const audio = writeFile(path.join(projectDir, 'voice.mp3'), 'voice')
    service._writeProjects([{
      projectId: 'project-video-legacy', status: 'completed', options: {},
      segments: [
        { id: 's0', index: 0, imagePath: image1, audioPath: audio, selectedMaterial: 'image1' },
        { id: 's1', index: 1, imagePath: image1, audioPath: audio },
      ],
    }])

    await service.generateSceneVideo('project-video-legacy', 's0')
    await service.generateSceneVideo('project-video-legacy', 's1')

    const scenes = service.composeEngine.renderSegment.mock.calls.map(call => call[0])
    expect(scenes[0].imagePath).toBe(image1)
    expect(scenes[1].imagePath).toBe(image1)
    expect(service.getProject('project-video-legacy').segments[0].videoPath).toBeTruthy()
    expect(service.getProject('project-video-legacy').segments[1].videoPath).toBeTruthy()
  })

  it('生成场景新图失败时保留已有备选图并清理本次产物', async () => {
    const projectRoot = path.join(root, 'projects')
    const bootstrap = new Story2VideoProjectService({ store, projectsDir: projectRoot })
    const projectDir = bootstrap._projectDir('project-image-fail-alt')
    const image1 = writeFile(path.join(projectDir, 'image1.png'), 'img1')
    const image2 = writeFile(path.join(projectDir, 'image2.png'), 'img2')
    const service = new Story2VideoProjectService({
      store,
      projectsDir: projectRoot,
      assetGenerator: {
        generateImage: vi.fn(async () => { throw new Error('生成服务超时') }),
      },
    })
    service._writeProjects([{
      projectId: 'project-image-fail-alt', status: 'completed', options: {},
      segments: [{
        id: 'segment-0', index: 0, text: 'A', prompt: 'PA',
        imagePath: image1, alternateImages: [{ path: image2 }], selectedMaterial: 'image1',
      }],
    }])

    await expect(service.generateSceneImage('project-image-fail-alt', 'segment-0')).rejects.toThrow('生成服务超时')

    const failed = service.getProject('project-image-fail-alt')
    expect(failed.segments[0]).toMatchObject({ imagePath: image1, status: 'failed' })
    expect(failed.segments[0].alternateImages[0].path).toBe(image2)
    expect(fs.existsSync(image1)).toBe(true)
    expect(fs.existsSync(image2)).toBe(true)
    expect(fs.readdirSync(projectDir).some(name => name.includes('_image_gen_'))).toBe(false)
  })

  it('manual 完成运行选视频时补图1/图2 槽并置 selectedMaterial=video', () => {
    const source = path.join(root, 'manual-video-source')
    const imageA = writeFile(path.join(source, 'image-a.png'))
    const imageB = writeFile(path.join(source, 'image-b.png'))
    const video = writeFile(path.join(source, 'candidate.mp4'))
    const audio = writeFile(path.join(source, 'audio.mp3'))
    const output = writeFile(path.join(source, 'output.mp4'))
    const service = new Story2VideoProjectService({ store, projectsDir: path.join(root, 'projects') })

    const project = service.saveRun({
      id: 'run_manual_video_1',
      pipeline: 'story2video-compose',
      status: 'completed',
      createdAt: '2026-08-14T00:00:00.000Z',
      params: { text: '第一段', creationMode: 'manual' },
      context: {
        generate_assets: {
          materialMode: 'all-images',
          creationMode: 'manual',
          candidates: [{
            index: 0,
            text: '第一段',
            prompt: '画面',
            candidates: [
              { id: 'image-1', kind: 'image', path: imageA, meta: { source: 'model-provider' } },
              { id: 'image-2', kind: 'image', path: imageB, meta: { source: 'model-provider' } },
              { id: 'video-2', kind: 'video', path: video, meta: { source: 'video-provider' } },
            ],
          }],
          selection: { selections: [{ index: 0, candidateId: 'video-2' }] },
          scenes: [{
            index: 0, text: '第一段', prompt: '画面', videoPath: video, audioPath: audio,
          }],
        },
        compose: {
          videoPath: output,
          audioPath: audio,
          segments: [{
            index: 0, text: '第一段', prompt: '画面', videoPath: video, audioPath: audio,
            duration: 2,
          }],
        },
      },
    })

    expect(project.segments).toHaveLength(1)
    expect(project.segments[0].selectedMaterial).toBe('video')
    expect(project.segments[0].imagePath).toBeTruthy()
    expect(fs.existsSync(project.segments[0].imagePath)).toBe(true)
    expect(project.segments[0].imagePath).not.toBe(imageA)
    expect(project.segments[0].alternateImages).toHaveLength(1)
    expect(fs.existsSync(project.segments[0].alternateImages[0].path)).toBe(true)
    expect(project.segments[0].videoPath).toBeTruthy()
    expect(fs.existsSync(project.segments[0].videoPath)).toBe(true)
  })
})
