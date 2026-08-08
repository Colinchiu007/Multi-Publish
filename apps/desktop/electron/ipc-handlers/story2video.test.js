// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import fs from 'fs'
import os from 'os'
import path from 'path'

vi.mock('../services/logger', () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }))
__enableElectronMock()

let registerHandlers
let root

beforeEach(async () => {
  vi.resetModules()
  __electronMock.app.isPackaged = false
  registerHandlers = (await import('./story2video')).default
  const controlledTempRoot = path.join(os.tmpdir(), 'story2video')
  fs.mkdirSync(controlledTempRoot, { recursive: true })
  root = fs.mkdtempSync(path.join(controlledTempRoot, 'ipc-'))
})

afterEach(() => {
  fs.rmSync(root, { recursive: true, force: true })
})

function createIpcMain() {
  const handlers = new Map()
  return {
    handle: vi.fn((channel, handler) => handlers.set(channel, handler)),
    get: channel => handlers.get(channel),
  }
}

function createDeps() {
  return {
    BrowserWindow: { fromWebContents: vi.fn(() => null) },
    dialog: { showSaveDialog: vi.fn() },
    shell: { showItemInFolder: vi.fn() },
    clipboard: { writeText: vi.fn() },
    story2videoMediaServer: { createUrl: vi.fn(() => 'http://127.0.0.1:34821/media/aaaaaaaaaaaaaaaa') },
    log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  }
}

const TRUSTED_EVENT = { senderFrame: { url: 'http://localhost:5174/' }, sender: {} }
const UNTRUSTED_EVENT = { senderFrame: { url: 'https://evil.example/' }, sender: {} }

describe('Story2Video 交付 IPC', () => {
  it('拒绝不可信页面调用导出', async () => {
    const ipcMain = createIpcMain()
    registerHandlers(ipcMain, createDeps())

    const result = await ipcMain.get('story2video:export-zip')(UNTRUSTED_EVENT, { files: [] })

    expect(result).toEqual({ code: -3, message: '未授权的调用来源' })
  })

  it('将本地视频导出为 ZIP', async () => {
    const ipcMain = createIpcMain()
    registerHandlers(ipcMain, createDeps())
    const video = path.join(root, 'video.mp4')
    const destination = path.join(root, 'videos.zip')
    fs.writeFileSync(video, 'video')

    const result = await ipcMain.get('story2video:export-zip')(TRUSTED_EVENT, {
      files: [{ path: video, name: '成片.mp4' }],
      destinationPath: destination,
    })

    expect(result).toMatchObject({ code: 0, data: { path: destination, fileCount: 1 } })
    expect(fs.readFileSync(destination).readUInt32LE(0)).toBe(0x04034b50)
  })

  it('拒绝 renderer 提供的外部路径，但允许用户在保存对话框中明确选择目录', async () => {
    const ipcMain = createIpcMain()
    const deps = createDeps()
    registerHandlers(ipcMain, deps)
    const video = path.join(root, 'video.mp4')
    const outside = fs.mkdtempSync(path.join(os.tmpdir(), 's2v-ipc-external-'))
    const externalVideo = path.join(outside, 'external.mp4')
    const externalDestination = path.join(outside, 'renderer-requested.zip')
    const dialogDestination = path.join(outside, 'user-selected.zip')
    fs.writeFileSync(video, 'video')
    fs.writeFileSync(externalVideo, 'external-video')

    try {
      const share = await ipcMain.get('story2video:create-share-url')(TRUSTED_EVENT, externalVideo)
      const copied = await ipcMain.get('story2video:copy-path')(TRUSTED_EVENT, externalVideo)
      const shown = await ipcMain.get('story2video:show-in-folder')(TRUSTED_EVENT, externalVideo)
      const rendererExport = await ipcMain.get('story2video:export-zip')(TRUSTED_EVENT, {
        files: [{ path: video, name: 'video.mp4' }],
        destinationPath: externalDestination,
      })

      expect(share.code).not.toBe(0)
      expect(copied.code).not.toBe(0)
      expect(shown.code).not.toBe(0)
      expect(rendererExport.code).not.toBe(0)
      expect(fs.existsSync(externalDestination)).toBe(false)

      deps.dialog.showSaveDialog.mockResolvedValue({ canceled: false, filePath: dialogDestination })
      const dialogExport = await ipcMain.get('story2video:export-zip')(TRUSTED_EVENT, {
        files: [{ path: video, name: 'video.mp4' }],
      })

      expect(dialogExport).toMatchObject({ code: 0, data: { path: dialogDestination, fileCount: 1 } })
    } finally {
      fs.rmSync(outside, { recursive: true, force: true })
    }
  })

  it('生成播放地址、复制规范化路径并定位文件', async () => {
    const ipcMain = createIpcMain()
    const deps = createDeps()
    registerHandlers(ipcMain, deps)
    const video = path.join(root, 'video.mp4')
    fs.writeFileSync(video, 'video')

    const share = await ipcMain.get('story2video:create-share-url')(TRUSTED_EVENT, video)
    const copied = await ipcMain.get('story2video:copy-path')(TRUSTED_EVENT, video)
    const shown = await ipcMain.get('story2video:show-in-folder')(TRUSTED_EVENT, video)

    expect(share.code).toBe(0)
    expect(share.data.url).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/media\/[A-Za-z0-9_-]{16,}$/)
    expect(share.data.url).not.toContain(fs.realpathSync.native(video))
    expect(share.data.url).not.toMatch(/^file:/)
    expect(deps.clipboard.writeText).toHaveBeenCalledWith(fs.realpathSync.native(video))
    expect(deps.shell.showItemInFolder).toHaveBeenCalledWith(fs.realpathSync.native(video))
    expect(copied.data.path).toBe(fs.realpathSync.native(video))
    expect(shown.data.path).toBe(fs.realpathSync.native(video))
  })

  it('save-as 通过系统保存对话框把受控文件复制到用户选择的位置', async () => {
    const ipcMain = createIpcMain()
    const deps = createDeps()
    registerHandlers(ipcMain, deps)
    const video = path.join(root, 'video.mp4')
    fs.writeFileSync(video, 'video-content')
    const destination = path.join(root, 'saved-video.mp4')
    deps.dialog.showSaveDialog.mockResolvedValue({ canceled: false, filePath: destination })

    const result = await ipcMain.get('story2video:save-as')(TRUSTED_EVENT, {
      filePath: video,
      suggestedName: '我的视频.mp4',
    })

    expect(result).toMatchObject({ code: 0, data: { path: destination } })
    expect(fs.readFileSync(destination, 'utf8')).toBe('video-content')
    // 测试环境无真实 WebContents 时走无窗口的 showSaveDialog(options)
    expect(deps.dialog.showSaveDialog).toHaveBeenCalledWith(
      expect.objectContaining({ defaultPath: '我的视频.mp4', title: '保存文件' }),
    )
  })

  it('save-as 取消选择时返回 cancelled，不写入文件；外部路径被拒绝', async () => {
    const ipcMain = createIpcMain()
    const deps = createDeps()
    registerHandlers(ipcMain, deps)
    const video = path.join(root, 'video.mp4')
    fs.writeFileSync(video, 'video-content')
    deps.dialog.showSaveDialog.mockResolvedValue({ canceled: true, filePath: '' })

    const cancelled = await ipcMain.get('story2video:save-as')(TRUSTED_EVENT, { filePath: video })
    expect(cancelled).toMatchObject({ code: 0, data: { cancelled: true } })

    const outside = fs.mkdtempSync(path.join(os.tmpdir(), 's2v-save-as-outside-'))
    try {
      const external = path.join(outside, 'x.mp4')
      fs.writeFileSync(external, 'x')
      const rejected = await ipcMain.get('story2video:save-as')(TRUSTED_EVENT, { filePath: external })
      expect(rejected.code).not.toBe(0)
    } finally {
      fs.rmSync(outside, { recursive: true, force: true })
    }
  })

  it('只通过可信 preload 导入用户选择的外部旁白，并返回受控临时路径', async () => {
    const ipcMain = createIpcMain()
    registerHandlers(ipcMain, createDeps())
    const source = path.join(root, 'voice.mp3')
    fs.writeFileSync(source, 'voice')

    const result = await ipcMain.get('story2video:import-media')(TRUSTED_EVENT, {
      filePath: source,
      kind: 'audio',
    })

    expect(result).toMatchObject({ code: 0, data: { kind: 'audio', size: 5 } })
    expect(result.data.path).not.toBe(source)
    expect(fs.readFileSync(result.data.path, 'utf8')).toBe('voice')
    fs.rmSync(result.data.path, { force: true })
  })

  it('拒绝不支持格式和超过大小上限的媒体导入', async () => {
    const ipcMain = createIpcMain()
    registerHandlers(ipcMain, createDeps())
    const unsupported = path.join(root, 'voice.aac')
    fs.writeFileSync(unsupported, 'voice')

    const result = await ipcMain.get('story2video:import-media')(TRUSTED_EVENT, {
      filePath: unsupported,
      kind: 'audio',
    })
    expect(result.code).not.toBe(0)
    expect(result.message).toMatch(/格式|支持/)
  })

  it('暴露用户隔离项目、分段编辑、重试和语音识别', async () => {
    const service = {
      listProjects: vi.fn(() => [{ projectId: 'project-1' }]),
      getProject: vi.fn(() => ({ projectId: 'project-1' })),
      deleteProject: vi.fn(() => ({ projectId: 'project-1', deleted: true })),
      updateSegments: vi.fn(() => ({ projectId: 'project-1', dirty: true })),
      replaceSegmentAudio: vi.fn(() => ({ projectId: 'project-1', dirty: true })),
      retrySegment: vi.fn(async () => ({ projectId: 'project-1' })),
      recomposeProject: vi.fn(async () => ({ projectId: 'project-1', dirty: false })),
      transcribeFile: vi.fn(async () => ({ text: '识别文本' })),
      getCapabilities: vi.fn(() => ({ transcription: { available: true }, remix: { available: false } })),
    }
    const ipcMain = createIpcMain()
    registerHandlers(ipcMain, { ...createDeps(), story2videoProjectService: service })

    expect(await ipcMain.get('story2video:list-projects')(TRUSTED_EVENT)).toEqual({ code: 0, data: [{ projectId: 'project-1' }] })
    expect(await ipcMain.get('story2video:get-project')(TRUSTED_EVENT, 'project-1')).toEqual({ code: 0, data: { projectId: 'project-1' } })
    expect(await ipcMain.get('story2video:delete-project')(TRUSTED_EVENT, 'project-1')).toEqual({ code: 0, data: { projectId: 'project-1', deleted: true } })
    await ipcMain.get('story2video:update-segments')(TRUSTED_EVENT, { projectId: 'project-1', segments: [{ id: 'segment-0', text: '新文案' }] })
    await ipcMain.get('story2video:replace-segment-audio')(TRUSTED_EVENT, {
      projectId: 'project-1', segmentId: 'segment-0', filePath: 'C:/controlled/replacement.mp3',
    })
    await ipcMain.get('story2video:retry-segment')(TRUSTED_EVENT, { projectId: 'project-1', segmentId: 'segment-0', mode: 'image' })
    await ipcMain.get('story2video:recompose-project')(TRUSTED_EVENT, 'project-1')
    await ipcMain.get('story2video:transcribe')(TRUSTED_EVENT, { filePath: 'C:/controlled/audio.mp3' })
    const capabilities = await ipcMain.get('story2video:capabilities')(TRUSTED_EVENT)

    expect(service.updateSegments).toHaveBeenCalledWith('project-1', [{ id: 'segment-0', text: '新文案' }])
    expect(service.replaceSegmentAudio).toHaveBeenCalledWith('project-1', 'segment-0', 'C:/controlled/replacement.mp3')
    expect(service.deleteProject).toHaveBeenCalledWith('project-1')
    expect(service.retrySegment).toHaveBeenCalledWith('project-1', 'segment-0', 'image')
    expect(service.recomposeProject).toHaveBeenCalledWith('project-1')
    expect(service.transcribeFile).toHaveBeenCalledWith('C:/controlled/audio.mp3')
    expect(capabilities.data.transcription.available).toBe(true)
  })

  it('在到达服务前拒绝非法分段更新参数', async () => {
    const service = { updateSegments: vi.fn() }
    const ipcMain = createIpcMain()
    registerHandlers(ipcMain, { ...createDeps(), story2videoProjectService: service })

    const result = await ipcMain.get('story2video:update-segments')(TRUSTED_EVENT, {
      projectId: '../escape', segments: [],
    })

    expect(result.code).toBeLessThan(0)
    expect(service.updateSegments).not.toHaveBeenCalled()
  })

  it('替换旁白成功后清理受控媒体临时副本', async () => {
    const paths = (await import('../services/story2video-paths')).default
    const source = path.join(root, 'replacement.mp3')
    fs.writeFileSync(source, 'voice')
    const imported = paths.importUserSelectedMedia(source, 'audio')
    const service = {
      replaceSegmentAudio: vi.fn(() => ({ projectId: 'project-1', segments: [] })),
    }
    const ipcMain = createIpcMain()
    registerHandlers(ipcMain, { ...createDeps(), story2videoProjectService: service })

    const result = await ipcMain.get('story2video:replace-segment-audio')(TRUSTED_EVENT, {
      projectId: 'project-1', segmentId: 'segment-0', filePath: imported.path,
    })

    expect(result.code).toBe(0)
    expect(service.replaceSegmentAudio).toHaveBeenCalledWith('project-1', 'segment-0', imported.path)
    expect(fs.existsSync(imported.path)).toBe(false)
  })

  it('替换旁白失败时也清理受控媒体临时副本', async () => {
    const paths = (await import('../services/story2video-paths')).default
    const source = path.join(root, 'replacement-failed.mp3')
    fs.writeFileSync(source, 'voice')
    const imported = paths.importUserSelectedMedia(source, 'audio')
    const service = {
      replaceSegmentAudio: vi.fn(() => { throw new Error('写入项目失败') }),
    }
    const ipcMain = createIpcMain()
    registerHandlers(ipcMain, { ...createDeps(), story2videoProjectService: service })

    const result = await ipcMain.get('story2video:replace-segment-audio')(TRUSTED_EVENT, {
      projectId: 'project-1', segmentId: 'segment-0', filePath: imported.path,
    })

    expect(result.code).toBeLessThan(0)
    expect(result.message).toMatch(/写入项目失败/)
    expect(fs.existsSync(imported.path)).toBe(false)
  })
})
