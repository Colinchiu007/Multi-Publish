/**
 * PublishPoller — Unit Tests
 *
 * Tests the orchestrator polling service:
 * - Polls GET /api/jobs/publish/pending every 2 seconds
 * - Downloads video when task found
 * - Delegates to publisherRouter for RPA publish
 * - Updates task status via PUT
 *
 * Mock strategy: Mock axios for HTTP, fs for download, publisherRouter for publish.
 */

jest.mock('axios')
jest.mock('fs')
jest.mock('path')
jest.mock('crypto')
jest.mock('../electron/logger', () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn() }))

const axios = require('axios')
const fs = require('fs')
const path = require('path')
const crypto = require('crypto')

const PublishPoller = require('../electron/publish-poller')

// Helpers
const FAKE_TASK = {
  id: 'task-001',
  input_data: {
    video_url: 'https://storage.example.com/videos/test.mp4',
    title: 'test title',
    platform: 'bilibili',
    desc: 'test desc',
    tags: ['test', 'bilibili'],
    cover_url: 'https://storage.example.com/covers/test.jpg',
  },
}

const ORCHESTRATOR_URL = 'https://39.105.42.85'

function createPoller (overrides) {
  const router = { createPublisher: jest.fn() }
  const rpaViewManager = {}
  const store = {}
  const opts = Object.assign({
    orchestratorUrl: ORCHESTRATOR_URL,
    publisherRouter: router,
    rpaViewManager,
    store,
    pollInterval: 100,
  }, overrides)
  return new PublishPoller(opts)
}

function mockAxiosGet (tasks) {
  axios.get.mockResolvedValue({ data: { items: tasks || [] } })
}

function mockAxiosPut () {
  axios.put.mockResolvedValue({ data: { status: 'ok' } })
}

function mockFsTemp () {
  crypto.randomBytes.mockReturnValue(Buffer.from('abcdef123456'))
  fs.mkdtempSync.mockReturnValue('/tmp/publish_abcdef123456')
  fs.existsSync.mockReturnValue(true)
  fs.statSync.mockReturnValue({ size: 1048576 })
}

function mockFsDownload (tasks) {
  tasks = tasks || []
  const mockStream = {
    on: jest.fn((event, handler) => {
      if (event === 'finish') setTimeout(handler, 0)
      return mockStream
    }),
    once: jest.fn((event, handler) => {
      if (event === 'close') setTimeout(handler, 0)
      return mockStream
    }),
  }
  fs.createWriteStream.mockReturnValue(mockStream)
  axios.get.mockImplementation((url, opts) => {
    if (opts && opts.responseType === 'stream') {
      const mockReadStream = {
        on: jest.fn((event, handler) => {
          if (event === 'end' || event === 'close') setTimeout(handler, 0)
          return mockReadStream
        }),
        pipe: jest.fn().mockReturnValue(mockStream),
      }
      return Promise.resolve({ data: mockReadStream })
    }
    return Promise.resolve({ data: { items: tasks } })
  })
}

describe('PublishPoller', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  describe('start/stop', () => {
    test('start() sets interval and sets running flag', () => {
      jest.useFakeTimers()
      const poller = createPoller()
      poller.start()
      expect(poller._running).toBe(true)
      expect(poller._timer).not.toBeNull()
      jest.useRealTimers()
    })

    test('stop() clears interval and unsets running flag', () => {
      jest.useFakeTimers()
      const poller = createPoller()
      poller.start()
      poller.stop()
      expect(poller._running).toBe(false)
      expect(poller._timer).toBeNull()
      jest.useRealTimers()
    })

    test('start() does not set duplicate interval if already running', () => {
      jest.useFakeTimers()
      const poller = createPoller()
      poller.start()
      const timer1 = poller._timer
      poller.start()
      expect(poller._timer).toBe(timer1)
      jest.useRealTimers()
    })
  })

  describe('polling behavior (no pending tasks)', () => {
    test('does nothing when no pending tasks', async () => {
      mockAxiosGet([])
      const poller = createPoller()
      await poller._poll()
      expect(axios.get).toHaveBeenCalledWith(ORCHESTRATOR_URL + '/api/jobs/publish/pending')
      expect(axios.put).not.toHaveBeenCalled()
    })
  })

  describe('polling behavior (with pending tasks)', () => {
    test('downloads video then delegates to publisherRouter', async () => {
      mockAxiosPut()
      mockFsTemp()
      mockFsDownload([FAKE_TASK])

      const mockPublisher = { publish: jest.fn().mockResolvedValue({ success: true, url: 'https://bilibili.com/video/BV1xxx', postId: 'task-001', platform: 'bilibili' }) }
      const router = { createPublisher: jest.fn().mockReturnValue(mockPublisher) }

      const poller = createPoller({ publisherRouter: router })
      await poller._poll()

      expect(axios.get).toHaveBeenCalledWith(ORCHESTRATOR_URL + '/api/jobs/publish/pending')
      expect(axios.put).toHaveBeenCalledWith(
        ORCHESTRATOR_URL + '/api/jobs/publish/' + FAKE_TASK.id + '/status',
        { status: 'downloading', output: { phase: 'download', percent: 10, message: 'Downloading video...' } }
      )
      expect(fs.mkdtempSync).toHaveBeenCalled()
      expect(router.createPublisher).toHaveBeenCalledWith('bilibili', expect.any(Object))
      expect(mockPublisher.publish).toHaveBeenCalledWith(expect.objectContaining({
        article: expect.objectContaining({
          title: FAKE_TASK.input_data.title,
          tags: FAKE_TASK.input_data.tags,
        }),
      }))
      expect(axios.put).toHaveBeenCalledWith(
        ORCHESTRATOR_URL + '/api/jobs/publish/' + FAKE_TASK.id + '/status',
        expect.objectContaining({ status: 'success' })
      )
    })

    test('updates status to failed when publisher throws', async () => {
      mockAxiosPut()
      mockFsTemp()
      mockFsDownload([FAKE_TASK])

      const mockPublisher = { publish: jest.fn().mockRejectedValue(new Error('RPA failed: timeout')) }
      const router = { createPublisher: jest.fn().mockReturnValue(mockPublisher) }

      const poller = createPoller({ publisherRouter: router })
      await poller._poll()

      expect(axios.put).toHaveBeenCalledWith(
        ORCHESTRATOR_URL + '/api/jobs/publish/' + FAKE_TASK.id + '/status',
        expect.objectContaining({ status: 'failed', error: 'RPA failed: timeout' })
      )
    })

    test('handles download failure gracefully', async () => {
      mockAxiosGet([FAKE_TASK])
      mockAxiosPut()
      mockFsTemp()

      axios.get.mockImplementation((url, opts) => {
        if (opts && opts.responseType === 'stream') {
          return Promise.reject(new Error('download failed: connection refused'))
        }
        return Promise.resolve({ data: { items: [FAKE_TASK] } })
      })

      const router = { createPublisher: jest.fn() }
      const poller = createPoller({ publisherRouter: router })
      await poller._poll()

      expect(axios.put).toHaveBeenCalledWith(
        ORCHESTRATOR_URL + '/api/jobs/publish/' + FAKE_TASK.id + '/status',
        expect.objectContaining({ status: 'failed', error: expect.stringContaining('download failed') })
      )
      expect(router.createPublisher).not.toHaveBeenCalled()
    })
  })

  describe('rpa routing', () => {
    test('skips task when rpaCheck returns false', async () => {
      mockAxiosGet([FAKE_TASK])
      mockAxiosPut()

      const router = { createPublisher: jest.fn() }
      const poller = createPoller({ publisherRouter: router, rpaCheck: function () { return false } })
      await poller._poll()

      expect(router.createPublisher).not.toHaveBeenCalled()
      expect(axios.put).not.toHaveBeenCalled()
    })

    test('processes task when rpaCheck returns true', async () => {
      mockAxiosPut()
      mockFsTemp()
      mockFsDownload([FAKE_TASK])

      const mockPublisher = { publish: jest.fn().mockResolvedValue({ success: true, url: 'https://bilibili.com/video/BV1xxx', postId: 'task-001', platform: 'bilibili' }) }
      const router = { createPublisher: jest.fn().mockReturnValue(mockPublisher) }

      const poller = createPoller({ publisherRouter: router, rpaCheck: function () { return true } })
      await poller._poll()

      expect(router.createPublisher).toHaveBeenCalled()
      expect(axios.put).toHaveBeenCalled()
    })

    test('defaults to processing when no rpaCheck provided', async () => {
      mockAxiosPut()
      mockFsTemp()
      mockFsDownload([FAKE_TASK])

      const mockPublisher = { publish: jest.fn().mockResolvedValue({ success: true, platform: 'bilibili' }) }
      const router = { createPublisher: jest.fn().mockReturnValue(mockPublisher) }

      const poller = createPoller({ publisherRouter: router })
      await poller._poll()

      expect(router.createPublisher).toHaveBeenCalled()
      expect(axios.put).toHaveBeenCalled()
    })
  })

  describe('mode routing', () => {
    test('skips task when input_data.mode is cloud', async () => {
      const cloudTask = {
        id: 'task-cloud-001',
        input_data: Object.assign({}, FAKE_TASK.input_data, { mode: 'cloud' }),
      }
      mockAxiosGet([cloudTask])
      mockAxiosPut()

      const router = { createPublisher: jest.fn() }
      const poller = createPoller({ publisherRouter: router })
      await poller._poll()

      expect(router.createPublisher).not.toHaveBeenCalled()
      expect(axios.put).not.toHaveBeenCalled()
    })

    test('processes task when no mode field (defaults to rpa)', async () => {
      mockAxiosPut()
      mockFsTemp()
      mockFsDownload([FAKE_TASK])

      const mockPublisher = { publish: jest.fn().mockResolvedValue({ success: true, platform: 'bilibili' }) }
      const router = { createPublisher: jest.fn().mockReturnValue(mockPublisher) }

      const poller = createPoller({ publisherRouter: router })
      await poller._poll()

      expect(router.createPublisher).toHaveBeenCalled()
      expect(axios.put).toHaveBeenCalled()
    })
  })

  describe('integration: start/stop cycle with polling', () => {
    test('polling loop calls _poll on interval', async () => {
      jest.useFakeTimers()
      mockAxiosGet([])
      mockAxiosPut()

      const poller = createPoller()
      poller._poll = jest.fn().mockResolvedValue()
      poller.start()

      jest.advanceTimersByTime(500)
      expect(poller._poll).toHaveBeenCalledTimes(5)

      poller.stop()
      jest.useRealTimers()
    })
  })
})
