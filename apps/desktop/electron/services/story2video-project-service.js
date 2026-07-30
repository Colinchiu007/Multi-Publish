// @ts-check
'use strict'

const crypto = require('crypto')
const fs = require('fs')
const os = require('os')
const path = require('path')
const {
  IMPORTED_MEDIA_DIR,
  MAX_AUDIO_FILE_BYTES,
  MAX_IMAGE_FILE_BYTES,
  getAllowedMediaRoots,
  isPathWithin,
  resolveReadableFile,
  resolveReadableMediaFile,
} = require('./story2video-paths')
const {
  STORY2VIDEO_TEXT_CONFIG_VERSION,
  normalizeStory2VideoTextParams,
} = require('./story2video-text-config')

const SETTING_KEY = 'story2video_projects_v1'
const MAX_PROJECTS = 100
const MAX_VIDEO_BYTES = 512 * 1024 * 1024
const SAFE_ID = /^[a-zA-Z0-9_-]{1,100}$/

function getUserDataDir () {
  if (!process.versions.electron) return os.tmpdir()
  try {
    const { app } = require('electron')
    if (app && typeof app.getPath === 'function') return app.getPath('userData')
  } catch (_) { /* 纯 Node 环境 */ }
  return os.tmpdir()
}

function safeText (value, maxLength) {
  return typeof value === 'string' ? value.slice(0, maxLength) : ''
}

function safeAssetMeta (value) {
  if (!value || typeof value !== 'object') return null
  const meta = {
    source: safeText(value.source, 80),
    provider: safeText(value.provider, 80),
    model: safeText(value.model, 160),
    format: safeText(value.format, 20),
    degraded: value.degraded === true,
  }
  return Object.values(meta).some(Boolean) ? meta : null
}

function safeSubtitleBlocks (value) {
  if (!Array.isArray(value)) return []
  return value.slice(0, 200)
    .map(item => safeText(typeof item === 'string' ? item : item?.text, 500))
    .filter(Boolean)
}

function safeSubtitleTimeline (value) {
  if (!Array.isArray(value)) return []
  return value.slice(0, 200).map((item, position) => {
    if (!item || typeof item !== 'object') return null
    const text = safeText(item.text, 500)
    const startTime = Number(item.startTime)
    const endTime = Number(item.endTime)
    if (!text || !Number.isFinite(startTime) || !Number.isFinite(endTime) ||
        startTime < 0 || endTime <= startTime || endTime > 3600) {
      return null
    }
    return {
      index: Number.isInteger(item.index) && item.index >= 0 ? item.index : position,
      text,
      startTime,
      endTime,
      duration: endTime - startTime,
    }
  }).filter(Boolean)
}

function sourceExtension (filePath, fallback) {
  const extension = path.extname(String(filePath || '')).toLowerCase()
  return /^\.[a-z0-9]{2,5}$/.test(extension) ? extension : fallback
}

function providerBaseUrl (provider) {
  const nestedConfig = provider?.config && typeof provider.config === 'object' ? provider.config : {}
  const value = provider?.base_url || nestedConfig.baseUrl || nestedConfig.base_url
  return typeof value === 'string' ? value.trim() : ''
}

function resolveComposeOutput (context) {
  const raw = context && (context.compose?.data || context.compose)
  return raw && typeof raw === 'object' ? raw : null
}

function copyFileAtomic (source, destination) {
  fs.mkdirSync(path.dirname(destination), { recursive: true })
  const temporary = destination + '.tmp-' + process.pid + '-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8)
  try {
    fs.copyFileSync(source, temporary, fs.constants.COPYFILE_EXCL)
    const stat = fs.statSync(temporary)
    if (!stat.isFile() || stat.size <= 0) throw new Error('复制后的文件为空')
    if (fs.existsSync(destination)) fs.unlinkSync(destination)
    fs.renameSync(temporary, destination)
  } catch (error) {
    try { fs.unlinkSync(temporary) } catch (_) { /* ignore */ }
    throw error
  }
  return destination
}

function referencedProjectFiles (project) {
  const files = new Set()
  const add = (candidate) => {
    if (typeof candidate === 'string' && candidate.trim()) files.add(path.resolve(candidate))
  }
  add(project?.videoPath)
  add(project?.audioPath)
  add(project?.options?.bgmPath)
  for (const segment of Array.isArray(project?.segments) ? project.segments : []) {
    add(segment?.imagePath)
    add(segment?.audioPath)
    add(segment?.videoPath)
  }
  return files
}

class Story2VideoProjectService {
  constructor (options = {}) {
    this.store = options.store || null
    this.composeEngine = options.composeEngine || null
    this.assetGenerator = options.assetGenerator || null
    this.aiGenerator = options.aiGenerator || null
    this.modelProviderManager = options.modelProviderManager || null
    this.log = options.log || require('./logger')
    this.projectsDir = path.resolve(options.projectsDir || path.join(getUserDataDir(), 'story2video-projects'))
    this.maxProjects = Number.isInteger(options.maxProjects) && options.maxProjects > 0
      ? options.maxProjects
      : MAX_PROJECTS
  }

  _ownerSubject () {
    if (!this.store) throw new Error('Story2Video 项目存储不可用')
    const owner = typeof this.store._resolveOwnerSubject === 'function'
      ? this.store._resolveOwnerSubject()
      : '__legacy__'
    if (typeof owner !== 'string' || !owner.trim()) throw new Error('无法识别当前用户')
    return owner.trim()
  }

  _ownerDir () {
    const ownerHash = crypto.createHash('sha256').update(this._ownerSubject(), 'utf8').digest('hex')
    const directory = path.join(this.projectsDir, ownerHash)
    if (!isPathWithin(directory, [this.projectsDir])) throw new Error('Story2Video 用户目录无效')
    fs.mkdirSync(directory, { recursive: true })
    return directory
  }

  _assertId (value, label = 'projectId') {
    if (typeof value !== 'string' || !SAFE_ID.test(value)) throw new Error(label + ' 无效')
    return value
  }

  _projectDir (projectId) {
    const directory = path.join(this._ownerDir(), this._assertId(projectId))
    if (!isPathWithin(directory, [this.projectsDir])) throw new Error('Story2Video 项目目录无效')
    return directory
  }

  _readProjects () {
    this._ownerSubject()
    if (!this.store || typeof this.store.getUserSetting !== 'function') return []
    const value = this.store.getUserSetting(SETTING_KEY, [])
    if (Array.isArray(value)) return value.filter(item => item && typeof item === 'object')
    if (typeof value === 'string') {
      try {
        const parsed = JSON.parse(value)
        return Array.isArray(parsed) ? parsed.filter(item => item && typeof item === 'object') : []
      } catch { return [] }
    }
    return []
  }

  _writeProjects (projects) {
    this._ownerSubject()
    if (!this.store || typeof this.store.setUserSetting !== 'function') {
      throw new Error('Story2Video 项目存储不可写')
    }
    this.store.setUserSetting(SETTING_KEY, projects)
    return projects
  }

  _writeManifest (project) {
    const projectDir = this._projectDir(project.projectId)
    fs.mkdirSync(projectDir, { recursive: true })
    const destination = path.join(projectDir, 'project.json')
    const temporary = destination + '.tmp-' + process.pid + '-' + Date.now()
    try {
      fs.writeFileSync(temporary, JSON.stringify(project, null, 2), { encoding: 'utf8', flag: 'wx' })
      if (fs.existsSync(destination)) fs.unlinkSync(destination)
      fs.renameSync(temporary, destination)
    } catch (error) {
      try { fs.unlinkSync(temporary) } catch (_) { /* ignore */ }
      throw error
    }
  }

  _upsertProject (project) {
    const projects = this._readProjects().filter(item => item.projectId !== project.projectId)
    projects.unshift(project)
    const kept = projects.slice(0, this.maxProjects)
    this._writeProjects(kept)
    this._writeManifest(project)
    for (const evicted of projects.slice(this.maxProjects)) {
      try {
        const evictedDir = this._projectDir(evicted.projectId)
        if (isPathWithin(evictedDir, [this._ownerDir()])) fs.rmSync(evictedDir, { recursive: true, force: true })
      } catch (_) { /* 历史清理失败不影响新项目 */ }
    }
    return project
  }

  _cleanupUnreferencedProjectFiles (projectId, previousProject, nextProject) {
    const projectDir = this._projectDir(projectId)
    const previous = referencedProjectFiles(previousProject)
    const retained = referencedProjectFiles(nextProject)
    return this._cleanupProjectFiles(projectDir, [...previous].filter(candidate => !retained.has(candidate)))
  }

  _cleanupProjectFiles (projectDir, candidates) {
    let cleaned = 0
    for (const candidate of new Set(candidates)) {
      if (!isPathWithin(candidate, [projectDir])) continue
      try {
        const stat = fs.lstatSync(candidate)
        if (!stat.isFile() || stat.isSymbolicLink()) continue
        fs.unlinkSync(candidate)
        cleaned++
      } catch (_) { /* 文件已不存在或正在被其他进程使用 */ }
    }
    return cleaned
  }

  listProjects () {
    return this._readProjects().map(project => ({
      ...project,
      recoverable: typeof project.videoPath === 'string' && fs.existsSync(project.videoPath),
    }))
  }

  getProject (projectId) {
    this._assertId(projectId)
    const project = this._readProjects().find(item => item.projectId === projectId)
    if (!project) throw new Error('Story2Video 项目不存在')
    return { ...project, segments: Array.isArray(project.segments) ? project.segments.map(item => ({ ...item })) : [] }
  }

  _resolveSource (candidate, kind) {
    const allowedRoots = getAllowedMediaRoots([this.projectsDir])
    if (kind === 'image' || kind === 'audio' || kind === 'bgm') {
      return resolveReadableMediaFile(candidate, {
        kind,
        allowedRoots,
        maxBytes: kind === 'image' ? MAX_IMAGE_FILE_BYTES : MAX_AUDIO_FILE_BYTES,
      })
    }
    return resolveReadableFile(candidate, { allowedRoots, maxBytes: MAX_VIDEO_BYTES })
  }

  _resolveTranscriptionSource (candidate) {
    // 转录会把音频发送给 provider，只允许已导入或项目自有的受控副本。
    return resolveReadableMediaFile(candidate, {
      kind: 'audio',
      allowedRoots: [IMPORTED_MEDIA_DIR, this.projectsDir],
      maxBytes: MAX_AUDIO_FILE_BYTES,
    })
  }

  _copyRequired (candidate, destination, kind) {
    const source = this._resolveSource(candidate, kind)
    if (!source) throw new Error('Story2Video 产物不存在、不可读或超出限制')
    if (path.resolve(source) === path.resolve(destination)) return destination
    return copyFileAtomic(source, destination)
  }

  _persistComposeArtifacts (projectId, compose, fallbackSegments = []) {
    const projectDir = this._projectDir(projectId)
    const videoPath = this._copyRequired(
      compose.videoPath || compose.path,
      path.join(projectDir, 'video' + sourceExtension(compose.videoPath || compose.path, '.mp4')),
      'video',
    )
    const audioPath = compose.audioPath
      ? this._copyRequired(compose.audioPath, path.join(projectDir, 'narration.m4a'), 'audio')
      : null
    const sourceSegments = Array.isArray(compose.segments) && compose.segments.length > 0
      ? compose.segments
      : fallbackSegments
    const segments = sourceSegments.map((segment, position) => {
      const index = Number.isInteger(segment.index) && segment.index >= 0 ? segment.index : position
      const id = SAFE_ID.test(String(segment.id || '')) ? String(segment.id) : 'segment-' + index
      const prefix = 'segment_' + String(position).padStart(4, '0')
      return {
        id,
        index: position,
        sourceIndex: index,
        text: safeText(segment.text || segment.content, 10000),
        prompt: safeText(segment.prompt, 20000),
        imagePath: segment.imagePath
          ? this._copyRequired(segment.imagePath, path.join(projectDir, prefix + '_image' + sourceExtension(segment.imagePath, '.png')), 'image')
          : null,
        audioPath: segment.audioPath
          ? this._copyRequired(segment.audioPath, path.join(projectDir, prefix + '_audio' + sourceExtension(segment.audioPath, '.mp3')), 'audio')
          : null,
        videoPath: segment.videoPath
          ? this._copyRequired(segment.videoPath, path.join(projectDir, prefix + '_video.mp4'), 'video')
          : null,
        duration: Number.isFinite(Number(segment.duration)) ? Number(segment.duration) : null,
        imageMeta: safeAssetMeta(segment.imageMeta),
        audioMeta: safeAssetMeta(segment.audioMeta),
        subtitleBlocks: safeSubtitleBlocks(segment.subtitleBlocks),
        subtitleTimeline: safeSubtitleTimeline(segment.subtitleTimeline),
        sceneSource: safeText(segment.sceneSource, 80) || null,
        subtitleSource: safeText(segment.subtitleSource, 80) || null,
        degraded: segment.degraded === true,
        fallbackReason: safeText(segment.fallbackReason, 300) || null,
        status: segment.status || 'completed',
      }
    })
    return { videoPath, audioPath, segments }
  }

  saveRun (run) {
    if (!run || run.pipeline !== 'story2video-compose') return null
    const compose = resolveComposeOutput(run.context)
    if (!compose || !(compose.videoPath || compose.path)) return null
    const projectId = this._assertId(String(run.id || ''))
    const artifacts = this._persistComposeArtifacts(projectId, compose, run.context?.generate_assets?.scenes || [])
    const options = this._safeOptions(run.params, projectId)
    const story2videoTextConfig = this._persistTextConfig(run.params, projectId, options)
    const sourceText = safeText(run.params?.text || story2videoTextConfig?.config?.prompt, 100000)
    const now = new Date().toISOString()
    const project = {
      manifestVersion: 2,
      projectId,
      pipeline: 'story2video-compose',
      status: run.status || 'completed',
      title: safeText(run.params?.title || story2videoTextConfig?.config?.publish?.title || sourceText, 160),
      sourceText,
      createdAt: run.createdAt || now,
      updatedAt: now,
      endedAt: run.endedAt || now,
      duration: Number.isFinite(Number(compose.duration)) ? Number(compose.duration) : null,
      format: compose.format || sourceExtension(artifacts.videoPath, '.mp4').slice(1),
      videoPath: artifacts.videoPath,
      audioPath: artifacts.audioPath,
      segments: artifacts.segments,
      dirty: false,
      options,
      ...(story2videoTextConfig ? { story2videoTextConfig } : {}),
    }
    return this._upsertProject(project)
  }

  _persistTextConfig (params, projectId, options) {
    if (!params || typeof params !== 'object' || Array.isArray(params)) return null
    const hasPrompt = typeof params.text === 'string' && params.text.trim()
    const hasVersionedConfig = params.story2videoTextConfig &&
      typeof params.story2videoTextConfig === 'object' &&
      !Array.isArray(params.story2videoTextConfig)
    if (!hasPrompt && !hasVersionedConfig) return null

    const normalized = normalizeStory2VideoTextParams(params)
    const config = JSON.parse(JSON.stringify(normalized.story2videoTextConfig))
    if (normalized.bgmPath) {
      const persistedBgm = options.bgmPath || this._copyRequired(
        normalized.bgmPath,
        path.join(this._projectDir(projectId), 'bgm' + sourceExtension(normalized.bgmPath, '.mp3')),
        'bgm',
      )
      options.bgmPath = persistedBgm
      config.bgm.path = persistedBgm
    }
    return { version: STORY2VIDEO_TEXT_CONFIG_VERSION, config }
  }

  _safeOptions (params = {}, projectId = null) {
    const keys = [
      'transition', 'transitionDuration', 'imageEffect', 'subtitleEnabled', 'subtitleStyle',
      'watermark', 'watermarkText', 'watermarkConfig', 'resolution', 'fps', 'format',
      'bgmVolume', 'contentType', 'imageStyle', 'imageProvider', 'imageModel', 'aspectRatio',
      'voiceId', 'voiceProvider', 'voiceModel', 'voiceSpeed', 'voicePitch', 'voiceEmotion', 'voiceVolume', 'templateId',
      'defaultSceneDuration',
    ]
    const result = {}
    for (const key of keys) {
      if (params[key] !== undefined) result[key] = JSON.parse(JSON.stringify(params[key]))
    }
    if (typeof params.bgmPath === 'string') {
      const source = this._resolveSource(params.bgmPath, 'bgm')
      if (source && projectId) {
        result.bgmPath = this._copyRequired(
          source,
          path.join(this._projectDir(projectId), 'bgm' + sourceExtension(source, '.mp3')),
          'bgm',
        )
      }
    }
    return result
  }

  updateSegments (projectId, updates) {
    const project = this.getProject(projectId)
    const previousProject = { ...project, segments: project.segments.map(segment => ({ ...segment })) }
    if (!Array.isArray(updates) || updates.length === 0) throw new Error('分段列表不能为空')
    const existing = new Map(project.segments.map(segment => [segment.id, segment]))
    const seen = new Set()
    const segments = updates.map((update, index) => {
      if (!update || typeof update !== 'object' || typeof update.id !== 'string' || seen.has(update.id)) {
        throw new Error('分段更新参数无效')
      }
      const original = existing.get(update.id)
      if (!original) throw new Error('分段不存在')
      seen.add(update.id)
      return {
        ...original,
        index,
        text: update.text === undefined ? original.text : safeText(update.text, 10000),
        prompt: update.prompt === undefined ? original.prompt : safeText(update.prompt, 20000),
      }
    })
    const updated = { ...project, segments, dirty: true, updatedAt: new Date().toISOString() }
    const saved = this._upsertProject(updated)
    this._cleanupUnreferencedProjectFiles(projectId, previousProject, saved)
    return saved
  }

  replaceSegmentAudio (projectId, segmentId, filePath) {
    const project = this.getProject(projectId)
    this._assertId(segmentId, 'segmentId')
    const index = project.segments.findIndex(segment => segment.id === segmentId)
    if (index < 0) throw new Error('分段不存在')
    const previousProject = { ...project, segments: project.segments.map(segment => ({ ...segment })) }
    const projectDir = this._projectDir(projectId)
    const destination = path.join(
      projectDir,
      segmentId + '_audio_replacement_' + Date.now() + sourceExtension(filePath, '.mp3'),
    )
    const copied = this._copyRequired(filePath, destination, 'audio')
    try {
      project.segments[index] = {
        ...project.segments[index],
        audioPath: copied,
        status: 'completed',
      }
      project.dirty = true
      project.updatedAt = new Date().toISOString()
      const saved = this._upsertProject(project)
      this._cleanupUnreferencedProjectFiles(projectId, previousProject, saved)
      return saved
    } catch (error) {
      try {
        if (isPathWithin(copied, [projectDir]) && fs.lstatSync(copied).isFile()) fs.unlinkSync(copied)
      } catch (_) { /* 回滚清理失败不覆盖原始错误 */ }
      throw error
    }
  }

  deleteProject (projectId) {
    this._assertId(projectId)
    const projects = this._readProjects()
    if (!projects.some(project => project.projectId === projectId)) {
      throw new Error('Story2Video 项目不存在')
    }
    this._writeProjects(projects.filter(project => project.projectId !== projectId))
    const projectDir = this._projectDir(projectId)
    if (isPathWithin(projectDir, [this._ownerDir()])) {
      fs.rmSync(projectDir, { recursive: true, force: true })
    }
    return { projectId, deleted: true }
  }

  async retrySegment (projectId, segmentId, mode) {
    const project = this.getProject(projectId)
    const previousProject = { ...project, segments: project.segments.map(segment => ({ ...segment })) }
    this._assertId(segmentId, 'segmentId')
    if (!['image', 'video'].includes(mode)) throw new Error('分段重试模式无效')
    const index = project.segments.findIndex(segment => segment.id === segmentId)
    if (index < 0) throw new Error('分段不存在')
    const segment = { ...project.segments[index], status: 'processing' }
    const projectDir = this._projectDir(projectId)
    const attemptFiles = new Set()
    try {
      if (mode === 'image') {
        if (!this.assetGenerator || typeof this.assetGenerator.generateImage !== 'function') throw new Error('图片生成服务不可用')
        const generated = await this.assetGenerator.generateImage(segment.prompt || segment.text, {
          index: segment.sourceIndex ?? index,
          style: project.options?.imageStyle,
          image_provider: project.options?.imageProvider,
          image_model: project.options?.imageModel,
          aspect_ratio: project.options?.aspectRatio,
          runId: 'retry_' + projectId,
        })
        const generatedPath = generated?.data?.path || generated?.data?.image_path || generated?.path
        const copiedImage = this._copyRequired(
          generatedPath,
          path.join(projectDir, segment.id + '_image_retry_' + Date.now() + sourceExtension(generatedPath, '.png')),
          'image',
        )
        attemptFiles.add(copiedImage)
        segment.imagePath = copiedImage
        segment.imageMeta = safeAssetMeta(generated?.data || generated)
      }
      if (!this.composeEngine || typeof this.composeEngine.renderSegment !== 'function') throw new Error('视频合成服务不可用')
      const destination = path.join(projectDir, segment.id + '_video_retry_' + Date.now() + '.mp4')
      attemptFiles.add(destination)
      const rendered = await this.composeEngine.renderSegment(segment, project.options || {}, destination)
      if (!rendered || rendered.code !== 0 || !rendered.data?.videoPath) {
        throw new Error(rendered?.message || '单段视频生成失败')
      }
      segment.videoPath = this._copyRequired(rendered.data.videoPath, destination, 'video')
      segment.duration = Number.isFinite(Number(rendered.data.duration)) ? Number(rendered.data.duration) : segment.duration
      segment.status = 'completed'
      project.segments[index] = segment
      project.dirty = true
      project.updatedAt = new Date().toISOString()
      const saved = this._upsertProject(project)
      this._cleanupUnreferencedProjectFiles(projectId, previousProject, saved)
      return saved
    } catch (error) {
      project.segments[index] = {
        ...previousProject.segments[index],
        status: 'failed',
        error: error.message,
      }
      project.updatedAt = new Date().toISOString()
      try {
        this._upsertProject(project)
      } catch (storageError) {
        if (this.log && typeof this.log.warn === 'function') {
          this.log.warn('[Story2Video] 保存分段失败状态失败', storageError)
        }
      }
      this._cleanupProjectFiles(projectDir, attemptFiles)
      throw error
    }
  }

  async recomposeProject (projectId) {
    const project = this.getProject(projectId)
    const previousProject = { ...project, segments: project.segments.map(segment => ({ ...segment })) }
    if (!this.composeEngine || typeof this.composeEngine.compose !== 'function') throw new Error('视频合成服务不可用')
    const result = await this.composeEngine.compose({ scenes: project.segments }, project.options || {})
    if (!result || result.code !== 0 || !result.data?.videoPath) throw new Error(result?.message || '重新合成失败')
    const artifacts = this._persistComposeArtifacts(projectId, result.data, project.segments)
    const updated = {
      ...project,
      ...artifacts,
      duration: Number.isFinite(Number(result.data.duration)) ? Number(result.data.duration) : project.duration,
      format: result.data.format || project.format,
      dirty: false,
      status: 'completed',
      updatedAt: new Date().toISOString(),
    }
    const saved = this._upsertProject(updated)
    this._cleanupUnreferencedProjectFiles(projectId, previousProject, saved)
    return saved
  }

  _transcriptionProvider () {
    const manager = this.modelProviderManager
    if (!manager) return null
    const selected = typeof manager.getDefault === 'function' ? manager.getDefault('speech_recognition') : null
    const providers = typeof manager.listProviders === 'function' ? manager.listProviders('speech_recognition') : []
    const candidates = [selected, ...(Array.isArray(providers) ? providers : [])]
    const seen = new Set()

    for (const candidate of candidates) {
      if (!candidate || typeof candidate.id !== 'string' || seen.has(candidate.id)) continue
      seen.add(candidate.id)
      const provider = typeof manager.getProvider === 'function'
        ? (manager.getProvider(candidate.id) || candidate)
        : candidate
      if (provider.category && provider.category !== 'speech_recognition') continue
      if (provider.enabled === false) continue
      if (provider.id === 'local-whisper' && !providerBaseUrl(provider)) continue
      return provider
    }
    return null
  }

  async transcribeFile (filePath) {
    const resolved = this._resolveTranscriptionSource(filePath)
    if (!resolved) throw new Error('旁白文件路径无效、未导入或不允许访问')
    const provider = this._transcriptionProvider()
    if (!provider) throw new Error('未配置语音识别服务，请先在模型设置中启用语音识别供应商')
    const buffer = fs.readFileSync(resolved)
    const extension = sourceExtension(resolved, '.wav').slice(1)
    let result
    if (provider.id === 'local-whisper') {
      const { LocalWhisperAdapter } = require('./adapters/local-whisper')
      const adapter = new LocalWhisperAdapter({
        id: provider.id,
        baseUrl: providerBaseUrl(provider),
        apiKey: provider.config?.apiKey,
      })
      result = await adapter.transcribe({
        audio: buffer,
        filename: path.basename(resolved),
        model: provider.models?.[0] || 'base',
        endpoint: provider.config?.endpoint || 'asr',
        language: provider.config?.language,
      })
    } else {
      if (!this.aiGenerator || typeof this.aiGenerator.generate !== 'function') throw new Error('语音识别服务不可用')
      const base64Providers = new Set(['google-stt', 'doubao-stt', 'baidu-stt'])
      const params = base64Providers.has(provider.id)
        ? { audio: buffer.toString('base64'), len: buffer.length, format: extension, model: provider.models?.[0] }
        : { file: new Blob([buffer]), filename: path.basename(resolved), model: provider.models?.[0] || 'whisper-1' }
      result = await this.aiGenerator.generate('speech_recognition', provider.id, params)
    }
    const text = safeText(result?.text, 100000).trim()
    if (!text) throw new Error('语音识别未返回文字')
    return { ...result, text, provider: provider.id }
  }

  getCapabilities () {
    const provider = this._transcriptionProvider()
    const requiresGenerator = provider && provider.id !== 'local-whisper'
    const generatorAvailable = !requiresGenerator || typeof this.aiGenerator?.generate === 'function'
    return {
      transcription: {
        available: Boolean(provider && generatorAvailable),
        provider: provider?.id || null,
        reason: !provider
          ? '未配置已启用的语音识别供应商'
          : (generatorAvailable ? null : '语音识别执行器不可用'),
      },
      remix: {
        available: false,
        reason: '当前没有已配置且可验证的 Sora Remix 供应商；旧项目同样依赖外部 Supabase/Sora 服务',
      },
      voiceClone: {
        available: false,
        reason: '当前 Story2Video 流水线没有已验证的音色克隆供应商',
      },
    }
  }
}

module.exports = {
  Story2VideoProjectService,
  SETTING_KEY,
  copyFileAtomic,
  resolveComposeOutput,
}
