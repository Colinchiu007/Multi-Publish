// @ts-check
/**
 * run-state-store.test.js — RunStateStore owner 隔离单测（W1 技术债务闭环）
 *
 * 覆盖：owner-scoped 保存/读取、跨账号隔离（A 读不到 B 的快照）、
 * legacy 平铺快照读取自动迁移、remove 清理两处路径、owner provider 校验。
 * 全部使用 os.tmpdir() 独立目录。
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import os from 'os'
import path from 'path'
import fs from 'fs'
import crypto from 'crypto'

const { RunStateStore } = require('./run-state-store')

function tempDir (label) {
  return path.join(os.tmpdir(), `run-state-test-${label}-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2)}`)
}

function hash (subject) {
  return crypto.createHash('sha256').update(subject, 'utf8').digest('hex')
}

function makeRun (id) {
  return {
    id,
    pipeline: 'story2video-compose',
    status: 'failed',
    currentStage: 2,
    stages: [{ name: 'a', status: 'completed' }, { name: 'b', status: 'completed' }, { name: 'c', status: 'failed' }],
    context: { prompt: '私密文案' },
    params: {},
    error: 'network timeout',
    orchestrationMode: 'orchestrator',
  }
}

describe('RunStateStore owner 隔离', () => {
  let dir
  let currentOwner

  beforeEach(() => {
    dir = tempDir('case')
    currentOwner = null
  })

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true })
  })

  function makeStore () {
    const store = new RunStateStore({ dir, log: { warn() {}, info() {} } })
    if (currentOwner) store.setOwnerProvider(() => currentOwner)
    return store
  }

  it('已登录时快照保存到 owners/{hash} 目录并可读取', () => {
    currentOwner = 'user-a'
    const store = makeStore()
    expect(store.saveFailed(makeRun('run-1'))).toBe(true)

    const ownerPath = path.join(dir, 'owners', hash('user-a'), 'run-1.json')
    expect(fs.existsSync(ownerPath)).toBe(true)
    expect(fs.existsSync(path.join(dir, 'run-1.json'))).toBe(false)

    const loaded = store.load('run-1')
    expect(loaded).not.toBeNull()
    expect(loaded.runId).toBe('run-1')
    expect(loaded.owner).toBe('user-a')
    expect(loaded.error).toBe('network timeout')
  })

  it('跨账号隔离：A 保存的快照 B 无法读取', () => {
    currentOwner = 'user-a'
    const storeA = makeStore()
    expect(storeA.saveFailed(makeRun('run-secret'))).toBe(true)

    currentOwner = 'user-b'
    const storeB = makeStore()
    expect(storeB.load('run-secret')).toBeNull()
    expect(fs.existsSync(path.join(dir, 'owners', hash('user-b'), 'run-secret.json'))).toBe(false)
  })

  it('未登录（无 owner provider）时回退 legacy 平铺路径并兼容读取', () => {
    const store = makeStore()
    expect(store.saveFailed(makeRun('run-legacy'))).toBe(true)
    expect(fs.existsSync(path.join(dir, 'run-legacy.json'))).toBe(true)
    expect(store.load('run-legacy').runId).toBe('run-legacy')
  })

  it('legacy 平铺快照在已登录后首次读取时迁移到 owner 目录', () => {
    // 先按 legacy 落盘
    const legacyStore = makeStore()
    expect(legacyStore.saveFailed(makeRun('run-migrate'))).toBe(true)
    expect(fs.existsSync(path.join(dir, 'run-migrate.json'))).toBe(true)

    // 登录后读取 → 自动迁移
    currentOwner = 'user-a'
    const migrated = makeStore()
    const loaded = migrated.load('run-migrate')
    expect(loaded.runId).toBe('run-migrate')
    expect(fs.existsSync(path.join(dir, 'owners', hash('user-a'), 'run-migrate.json'))).toBe(true)
    expect(fs.existsSync(path.join(dir, 'run-migrate.json'))).toBe(false)
  })

  it('remove 同时清理 owner 与 legacy 两处路径', () => {
    currentOwner = 'user-a'
    const store = makeStore()
    store.saveFailed(makeRun('run-1'))
    // 额外造一个 legacy 残留
    fs.mkdirSync(path.join(dir, 'owners', hash('user-a')), { recursive: true })
    fs.copyFileSync(path.join(dir, 'owners', hash('user-a'), 'run-1.json'), path.join(dir, 'run-1.json'))

    store.remove('run-1')
    expect(fs.existsSync(path.join(dir, 'owners', hash('user-a'), 'run-1.json'))).toBe(false)
    expect(fs.existsSync(path.join(dir, 'run-1.json'))).toBe(false)
  })

  it('setOwnerProvider 拒绝非函数参数', () => {
    const store = makeStore()
    expect(() => store.setOwnerProvider('not-a-function')).toThrow(TypeError)
  })

  it('owner provider 抛错时安全回退 legacy（不中断保存）', () => {
    const store = new RunStateStore({ dir, log: { warn() {}, info() {} } })
    store.setOwnerProvider(() => { throw new Error('boom') })
    expect(store.saveFailed(makeRun('run-safe'))).toBe(true)
    expect(fs.existsSync(path.join(dir, 'run-safe.json'))).toBe(true)
  })
})
