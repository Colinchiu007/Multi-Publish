// @vitest-environment node
'use strict'

const fs = require('fs')
const os = require('os')
const path = require('path')
const {
  Story2VideoConfigProfiles,
  normalizeProfileName,
  isSafeProfileId,
  MAX_PROFILES_PER_PIPELINE,
} = require('./story2video-config-profiles')

describe('Story2Video 流水线配置库', () => {
  let root
  let profiles
  let seq

  beforeEach(() => {
    seq = 0
    root = fs.mkdtempSync(path.join(os.tmpdir(), 's2v-cfg-profiles-'))
    profiles = new Story2VideoConfigProfiles({
      profilesDir: path.join(root, 'profiles'),
      now: () => 1000,
      idFactory: () => 'profile-' + String(++seq).padStart(14, '0'),
    })
  })

  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true })
  })

  function makeSnapshot (overrides = {}) {
    return {
      schemaVersion: 1,
      capturedAt: '2026-08-28T00:00:00.000Z',
      kind: 'orchestrated',
      s2vConfig: { contentType: 'general', transition: 'fade' },
      s2vOutputConfig: { resolution: '720x1280', fps: 30, format: 'mp4' },
      ...overrides,
    }
  }

  it('空库返回空列表，缺失索引按空库降级', () => {
    expect(profiles.list()).toEqual([])
  })

  it('创建配置：写入索引并返回记录，无临时文件残留', () => {
    const profile = profiles.create({
      pipelineId: 'story2video-compose',
      name: '  口播竖屏  ',
      snapshot: makeSnapshot(),
    })
    expect(profile.id).toBe('profile-00000000000001')
    expect(profile.name).toBe('口播竖屏')
    expect(profile.pipelineId).toBe('story2video-compose')
    expect(profile.snapshot.s2vConfig.transition).toBe('fade')
    expect(profile.createdAt).toBe(1000)
    expect(JSON.parse(fs.readFileSync(path.join(root, 'profiles', 'config-profiles.json'), 'utf8')).profiles).toHaveLength(1)
    expect(fs.readdirSync(path.join(root, 'profiles')).some(name => name.endsWith('.tmp'))).toBe(false)
    expect(profiles.list()).toHaveLength(1)
  })

  it('索引写入失败后清理已创建的临时文件', () => {
    const originalWriteFileSync = fs.writeFileSync
    fs.writeFileSync = function writePartialTempFileThenFail (filePath) {
      originalWriteFileSync.call(fs, filePath, 'partial', 'utf8')
      const error = new Error('disk full')
      error.code = 'ENOSPC'
      throw error
    }
    try {
      expect(() => profiles.create({ pipelineId: 'p', name: 'Write failure', snapshot: makeSnapshot() })).toThrow('disk full')
    } finally {
      fs.writeFileSync = originalWriteFileSync
    }

    const profilesDir = path.join(root, 'profiles')
    expect(fs.readdirSync(profilesDir).some(name => name.endsWith('.tmp'))).toBe(false)
  })

  it('按 pipelineId 过滤列表', () => {
    profiles.create({ pipelineId: 'story2video-compose', name: 'A', snapshot: makeSnapshot() })
    profiles.create({ pipelineId: 'video-clone', name: 'B', snapshot: makeSnapshot({ kind: 'legacy' }) })
    const matches = profiles.list('story2video-compose')
    expect(matches).toHaveLength(1)
    expect(matches[0].name).toBe('A')
  })

  it('拒绝非法名称（空/超长）', () => {
    expect(() => profiles.create({ pipelineId: 'story2video-compose', name: '   ', snapshot: makeSnapshot() })).toThrow(/1-60/)
    expect(() => profiles.create({ pipelineId: 'story2video-compose', name: 'x'.repeat(61), snapshot: makeSnapshot() })).toThrow(/1-60/)
  })

  it('拒绝非法 pipelineId 与非法快照', () => {
    expect(() => profiles.create({ pipelineId: '', name: 'A', snapshot: makeSnapshot() })).toThrow(/流水线/)
    expect(() => profiles.create({ pipelineId: 'story2video-compose', name: 'A', snapshot: null })).toThrow(/快照/)
    expect(() => profiles.create({ pipelineId: 'story2video-compose', name: 'A', snapshot: [] })).toThrow(/快照/)
    expect(() => profiles.create({ pipelineId: 'bad id!', name: 'A', snapshot: makeSnapshot() })).toThrow(/流水线/)
    expect(() => profiles.create({ pipelineId: 'story2video-compose', name: 'A', snapshot: new Date() })).toThrow(/快照/)
  })

  it('拒绝超大快照（>64KB）', () => {
    const big = makeSnapshot({ s2vConfig: { pad: 'x'.repeat(70 * 1024) } })
    expect(() => profiles.create({ pipelineId: 'story2video-compose', name: 'A', snapshot: big })).toThrow(/快照过大/)
  })

  it('单流水线容量上限 50 个，超出拒绝', () => {
    for (let i = 1; i <= MAX_PROFILES_PER_PIPELINE; i++) {
      profiles.create({ pipelineId: 'p', name: 'cfg-' + i, snapshot: makeSnapshot() })
    }
    expect(() => profiles.create({ pipelineId: 'p', name: 'overflow', snapshot: makeSnapshot() })).toThrow(/50/)
  })

  it('同流水线重名默认拒绝；overwrite=true 时覆盖并更新时间', () => {
    profiles.create({ pipelineId: 'p', name: 'Same', snapshot: makeSnapshot({ capturedAt: 'a' }) })
    expect(() => profiles.create({ pipelineId: 'p', name: 'Same', snapshot: makeSnapshot() })).toThrow(/已存在同名配置/)
    profiles.now = () => 2000
    const updated = profiles.create({ pipelineId: 'p', name: 'Same', snapshot: makeSnapshot({ capturedAt: 'b' }), overwrite: true })
    expect(profiles.list('p')).toHaveLength(1)
    expect(updated.updatedAt).toBe(2000)
    expect(updated.snapshot.capturedAt).toBe('b')
  })

  it('重命名：trim、唯一性检查、防御 id', () => {
    const a = profiles.create({ pipelineId: 'p', name: 'A', snapshot: makeSnapshot() })
    const b = profiles.create({ pipelineId: 'p', name: 'B', snapshot: makeSnapshot() })
    expect(profiles.rename(a.id, '  new name ').name).toBe('new name')
    expect(() => profiles.rename(a.id, 'B')).toThrow(/已存在同名配置/)
    expect(() => profiles.rename('not-exist-id-123456', 'X')).toThrow(/不存在/)
    expect(() => profiles.rename('bad', 'X')).toThrow(/无效/)
    expect(() => profiles.rename(b.id, '')).toThrow(/1-60/)
  })

  it('删除：防御 id、不存在抛错、成功后列表移除', () => {
    const a = profiles.create({ pipelineId: 'p', name: 'A', snapshot: makeSnapshot() })
    expect(() => profiles.delete('bad')).toThrow(/无效/)
    expect(() => profiles.delete('not-exist-id-123456')).toThrow(/不存在/)
    expect(profiles.delete(a.id)).toEqual({ deleted: true, id: a.id })
    expect(profiles.list()).toHaveLength(0)
  })

  it('损坏索引按空库降级且不抛错', () => {
    fs.mkdirSync(path.join(root, 'profiles'), { recursive: true })
    fs.writeFileSync(path.join(root, 'profiles', 'config-profiles.json'), '{broken json')
    expect(profiles.list()).toEqual([])
    const created = profiles.create({ pipelineId: 'p', name: 'Recover', snapshot: makeSnapshot() })
    expect(created.name).toBe('Recover')
  })

  it('部分损坏索引拒绝覆盖写入，保留原始数据与合法条目', () => {
    const valid = profiles.create({ pipelineId: 'p', name: 'Keep', snapshot: makeSnapshot() })
    const indexPath = path.join(root, 'profiles', 'config-profiles.json')
    const index = JSON.parse(fs.readFileSync(indexPath, 'utf8'))
    index.profiles.push({ id: 'bad-entry-00000001', pipelineId: 'p', name: 'Broken' })
    fs.writeFileSync(indexPath, JSON.stringify(index), 'utf8')
    const original = fs.readFileSync(indexPath, 'utf8')

    expect(profiles.list()).toMatchObject([{ id: valid.id, name: 'Keep' }])
    expect(() => profiles.create({ pipelineId: 'p', name: 'Must not overwrite', snapshot: makeSnapshot() })).toThrow(/停止写入/)
    expect(fs.readFileSync(indexPath, 'utf8')).toBe(original)
    expect(profiles.list()).toMatchObject([{ id: valid.id, name: 'Keep' }])
  })

  it('合法 JSON 但索引根结构损坏时只读并拒绝覆盖原始字节', () => {
    const indexPath = path.join(root, 'profiles', 'config-profiles.json')
    fs.mkdirSync(path.dirname(indexPath), { recursive: true })
    const original = JSON.stringify({ version: 1, unexpected: true })
    fs.writeFileSync(indexPath, original, 'utf8')

    expect(profiles.list()).toEqual([])
    expect(() => profiles.create({ pipelineId: 'p', name: 'Must not overwrite', snapshot: makeSnapshot() })).toThrow(/停止写入/)
    expect(fs.readFileSync(indexPath, 'utf8')).toBe(original)
  })

  it('快照包含非 JSON 值（undefined/函数）时序列化后仍可读写', () => {
    const profile = profiles.create({
      pipelineId: 'p',
      name: 'Fn',
      snapshot: makeSnapshot({ s2vConfig: { weird: undefined, fn: function () {} } }),
    })
    expect(profile.snapshot.s2vConfig.weird).toBeUndefined()
  })
})

describe('Story2VideoConfigProfiles 工具函数', () => {
  it('normalizeProfileName：trim 且长度 1..60', () => {
    expect(normalizeProfileName('  abc  ')).toBe('abc')
    expect(normalizeProfileName('')).toBe('')
    expect(normalizeProfileName('x'.repeat(61))).toBe('')
  })

  it('isSafeProfileId：UUID 或测试注入 id 通过，非法拒绝', () => {
    expect(isSafeProfileId('profile-00000000000001')).toBe(true)
    expect(isSafeProfileId('bad')).toBe(false)
    expect(isSafeProfileId('')).toBe(false)
  })
})
