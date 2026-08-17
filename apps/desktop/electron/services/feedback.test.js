import { describe, expect, it, afterEach, vi } from 'vitest'
import fs from 'fs'
import os from 'os'
import path from 'path'

const { collectLogArchive, makeZip, normalizeOpsUrl, submitFeedback } = require('./feedback')

function tempDir () {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'feedback-test-'))
  return dir
}

describe('feedback service', () => {
  const dirs = []

  afterEach(() => {
    while (dirs.length) fs.rmSync(dirs.pop(), { recursive: true, force: true })
    vi.restoreAllMocks()
  })

  it('accepts only secure Ops Center URLs', () => {
    expect(normalizeOpsUrl('https://ops.example.com/')).toBe('https://ops.example.com')
    expect(normalizeOpsUrl('http://127.0.0.1:8010/')).toBe('http://127.0.0.1:8010')
    expect(normalizeOpsUrl('http://ops.example.com')).toBe('')
    expect(normalizeOpsUrl('https://user:pass@ops.example.com')).toBe('')
  })

  it('collects only regular app log files and redacts historical content', () => {
    const dir = tempDir(); dirs.push(dir)
    fs.writeFileSync(path.join(dir, 'app-2026-08-17.log'), 'Bearer token apiKey=secret')
    fs.writeFileSync(path.join(dir, 'notes.txt'), 'do not include')
    fs.symlinkSync(path.join(dir, 'app-2026-08-17.log'), path.join(dir, 'app-2026-08-16.log'))
    const logger = {
      getLogsInfo: () => ({ dir, files: [
        { name: 'app-2026-08-17.log', size: 32 },
        { name: 'notes.txt', size: 14 },
        { name: 'app-2026-08-16.log', size: 32 },
      ] }),
      redactText: (value) => value.replace('Bearer token', 'Bearer ***').replace('apiKey=secret', 'apiKey=***'),
    }
    const archive = collectLogArchive({ loggerModule: logger, tempDir: dir })
    expect(archive.fileCount).toBe(1)
    expect(fs.existsSync(archive.filePath)).toBe(true)
    const zip = require('zlib')
    const bytes = fs.readFileSync(archive.filePath)
    expect(bytes.subarray(0, 4).toString('hex')).toBe('504b0304')
    expect(bytes.toString('utf8')).toContain('app-2026-08-17.log')
    expect(bytes.toString('utf8')).not.toContain('notes.txt')
    expect(zip).toBeTruthy()
    fs.rmSync(archive.filePath, { force: true })
  })

  it('does not read logs when the user leaves attachment disabled', async () => {
    const fetchMock = vi.fn(async () => ({ ok: true, status: 200, arrayBuffer: async () => Buffer.from('{"id":"f1"}') }))
    vi.stubGlobal('fetch', fetchMock)
    const log = { getLogsInfo: vi.fn(() => { throw new Error('must not read') }), warn: vi.fn() }
    const result = await submitFeedback({
      opsCenterSync: { getConfig: () => ({ url: 'https://ops.example.com', apiKeyConfigured: true }), getCatalogApiKey: () => 'key' },
      log,
      loggerModule: log,
      message: 'hello',
      includeLogs: false,
    })
    expect(result.code).toBe(0)
    expect(log.getLogsInfo).not.toHaveBeenCalled()
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('cleans temporary archive after upload', async () => {
    const dir = tempDir(); dirs.push(dir)
    fs.writeFileSync(path.join(dir, 'app-2026-08-17.log'), 'hello')
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, status: 200, arrayBuffer: async () => Buffer.from('{"id":"f1"}') })))
    const log = {
      getLogsInfo: () => ({ dir, files: [{ name: 'app-2026-08-17.log', size: 5 }] }),
      redactText: (value) => value,
      warn: vi.fn(),
    }
    const result = await submitFeedback({
      opsCenterSync: { getConfig: () => ({ url: 'https://ops.example.com', apiKeyConfigured: true }), getCatalogApiKey: () => 'key' },
      log,
      loggerModule: log,
      message: 'hello',
      includeLogs: true,
      tempDir: dir,
    })
    expect(result.code).toBe(0)
    expect(fs.readdirSync(dir)).toEqual(['app-2026-08-17.log'])
  })

  it('fails closed when feedback is blank or Ops Center is not configured', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    expect((await submitFeedback({ message: '  ' })).code).toBe(-1)
    expect((await submitFeedback({
      message: 'hello',
      opsCenterSync: { getConfig: () => ({ url: '', apiKeyConfigured: false }), getCatalogApiKey: () => '' },
    })).code).toBe(-1)
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
