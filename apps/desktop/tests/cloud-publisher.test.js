/**
 * CloudPublisher — Unit Tests
 *
 * Tests the orchestrator HTTP communication layer:
 * - Submits cloud publish tasks via POST /api/jobs/publish-video
 * - Lists tasks via GET /api/jobs/publish
 * - Gets single task via GET /api/jobs/publish/{taskId}
 * - Returns supported platforms
 * - Registers IPC handlers
 *
 * Mock strategy: Mock axios for HTTP, electron for ipcMain.
 *
 * 注意：用 __registerMock 替代 vi.mock，因为 vitest 4 下 vi.mock 的 factory
 * 对 CJS require 不生效。__registerMock 拦截 Module.prototype.require，与 CJS 完全兼容。
 */
__enableElectronMock()

__registerMock('axios', { get: vi.fn(), post: vi.fn() })
__registerMock('./logger', { info: vi.fn(), warn: vi.fn(), error: vi.fn() })

const axios = require('axios')
const CloudPublisher = require('../electron/services/cloud-publisher')

// Helpers
const ORCHESTRATOR_URL = 'https://39.105.42.85'

function createPublisher (overrides) {
  const store = { _ready: true }
  const opts = Object.assign({ orchestratorUrl: ORCHESTRATOR_URL, store }, overrides)
  return new CloudPublisher(opts)
}

const SAMPLE_TASK = {
  id: 'task-cloud-001',
  status: 'pending',
  platform: 'bilibili',
  input_data: {
    video_url: 'https://storage.example.com/videos/test.mp4',
    title: 'test title',
    desc: 'test desc',
    tags: ['test'],
    cover_url: 'https://storage.example.com/covers/test.jpg',
    mode: 'cloud',
  },
  created_at: '2026-06-29T10:00:00Z',
}

// Tests
describe('CloudPublisher', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('constructor', () => {
    test('stores orchestratorUrl from options', () => {
      const pub = createPublisher()
      expect(pub._orchestratorUrl).toBe(ORCHESTRATOR_URL)
    })

    test('stores store reference', () => {
      const pub = createPublisher()
      expect(pub._store).toBeDefined()
      expect(pub._store._ready).toBe(true)
    })
  })

  describe('submitTask', () => {
    test('POSTs to /api/jobs/publish-video with mode=cloud', async () => {
      const pub = createPublisher()
      axios.post.mockResolvedValue({
        data: { task_id: 'task-cloud-001', status: 'pending', platform: 'bilibili' },
      })

      const result = await pub.submitTask({
        videoUrl: 'https://storage.example.com/videos/test.mp4',
        platform: 'bilibili',
        title: 'test title',
        desc: 'test desc',
        tags: ['test'],
        coverUrl: 'https://storage.example.com/covers/test.jpg',
      })

      expect(axios.post).toHaveBeenCalledWith(
        ORCHESTRATOR_URL + '/api/jobs/publish-video',
        expect.objectContaining({
          video_url: 'https://storage.example.com/videos/test.mp4',
          platform: 'bilibili',
          title: 'test title',
          mode: 'cloud',
        })
      )
      expect(result).toEqual({ task_id: 'task-cloud-001', status: 'pending', platform: 'bilibili' })
    })

    test('rejects with error message on HTTP failure', async () => {
      const pub = createPublisher()
      axios.post.mockRejectedValue(new Error('ECONNREFUSED'))
      await expect(pub.submitTask({
        videoUrl: 'https://example.com/video.mp4',
        platform: 'bilibili',
        title: 'test',
      })).rejects.toThrow('ECONNREFUSED')
    })

    test('为请求注入 Bearer Token，且不发送 user_id', async () => {
      const authService = { getAccessToken: vi.fn().mockResolvedValue('access-1') }
      const pub = createPublisher({ authService })
      axios.post.mockResolvedValue({ data: { task_id: 'task-auth-001' } })

      await pub.submitTask({ videoUrl: 'https://example.com/video.mp4', platform: 'bilibili', title: 'test', user_id: 'victim' })

      const [, body, config] = axios.post.mock.calls.at(-1)
      expect(body).not.toHaveProperty('user_id')
      expect(config.headers.Authorization).toBe('Bearer access-1')
    })
  })

  describe('listTasks', () => {
    test('GETs /api/jobs/publish and returns items', async () => {
      const pub = createPublisher()
      axios.get.mockResolvedValue({ data: { items: [SAMPLE_TASK] } })

      const result = await pub.listTasks()

      expect(axios.get).toHaveBeenCalledWith(ORCHESTRATOR_URL + '/api/jobs/publish')
      expect(result).toEqual({ items: [SAMPLE_TASK] })
    })
  })

  describe('getTask', () => {
    test('GETs /api/jobs/publish/{taskId} and returns task', async () => {
      const pub = createPublisher()
      axios.get.mockResolvedValue({ data: SAMPLE_TASK })

      const result = await pub.getTask('task-cloud-001')

      expect(axios.get).toHaveBeenCalledWith(ORCHESTRATOR_URL + '/api/jobs/publish/task-cloud-001')
      expect(result).toEqual(SAMPLE_TASK)
    })
  })

  describe('getSupportedPlatforms', () => {
    test('returns array of platform objects', () => {
      const pub = createPublisher()
      const platforms = pub.getSupportedPlatforms()
      expect(Array.isArray(platforms)).toBe(true)
      expect(platforms.length).toBeGreaterThan(0)
      const ids = platforms.map(function (p) { return p.id })
      expect(ids).toContain('bilibili')
      expect(ids).toContain('douyin')
    })

    test('each platform has id and name properties', () => {
      const pub = createPublisher()
      const platforms = pub.getSupportedPlatforms()
      platforms.forEach(function (p) {
        expect(p).toHaveProperty('id')
        expect(p).toHaveProperty('name')
      })
    })
  })

  describe('registerIpcHandlers', () => {
    beforeEach(function () {
      const electron = require('electron')
      electron.ipcMain.handle = vi.fn()
    })

    test('registers 4 IPC handlers on ipcMain', () => {
      const electron = require('electron')
      const pub = createPublisher()
      pub.registerIpcHandlers()
      expect(electron.ipcMain.handle).toHaveBeenCalledTimes(4)
      expect(electron.ipcMain.handle).toHaveBeenCalledWith('cloud-publisher:submit', expect.any(Function))
      expect(electron.ipcMain.handle).toHaveBeenCalledWith('cloud-publisher:list-tasks', expect.any(Function))
      expect(electron.ipcMain.handle).toHaveBeenCalledWith('cloud-publisher:get-task', expect.any(Function))
      expect(electron.ipcMain.handle).toHaveBeenCalledWith('cloud-publisher:platforms', expect.any(Function))
    })
  })
})
