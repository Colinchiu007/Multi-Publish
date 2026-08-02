// @ts-check
/**
 * sqlite-wrapper.test.js — sql.js 包装层持久化与 BLOB 契约
 *
 * 回归：
 * - prepare().run() 的写入必须标记 dirty，否则 auto-persist 不落盘（API Key 重启即丢）。
 * - BLOB 列读回是 Uint8Array，必须保持二进制原样，供 crypto.decrypt 正确还原密文。
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import fs from 'fs'
import os from 'os'
import path from 'path'

let Database
let tmpDir

beforeAll(async () => {
  const wrapper = require('./sqlite-wrapper')
  await wrapper.ready
  Database = wrapper
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sqlite-wrapper-test-'))
})

afterAll(() => {
  try { fs.rmSync(tmpDir, { recursive: true, force: true }) } catch (_) { /* ignore */ }
})

describe('sqlite-wrapper 持久化契约', () => {
  it('prepare().run() 写入后置 dirty 并可持久化到磁盘', () => {
    const dbPath = path.join(tmpDir, 'persist.db')
    const db = new Database(dbPath)
    db.execOrThrow('CREATE TABLE t (id TEXT PRIMARY KEY, value BLOB)')
    expect(db._dirty).toBe(true)
    db.persist()
    expect(db._dirty).toBe(false)

    // 新一轮写入：直接 prepare().run()，此前 _dirty 不会置位导致永不落盘
    db.prepare('INSERT INTO t (id, value) VALUES (?, ?)').run('row-1', Buffer.from([1, 2, 3]))
    expect(db._dirty).toBe(true)
    expect(db.persist()).toBe(true)
    expect(db._dirty).toBe(false)
    db.close()

    const reloaded = new Database(dbPath)
    const rows = reloaded.prepare('SELECT id FROM t').all()
    expect(rows).toEqual([{ id: 'row-1' }])
    reloaded.close()
  })

  it('BLOB 列读回为 Uint8Array 且保持原始字节（crypto 密文可还原）', () => {
    const dbPath = path.join(tmpDir, 'blob.db')
    const db = new Database(dbPath)
    db.execOrThrow('CREATE TABLE t (id TEXT PRIMARY KEY, blob BLOB)')
    const ciphertext = Buffer.from([0, 1, 2, 3, 255, 254, 128, 127])
    db.prepare('INSERT INTO t (id, blob) VALUES (?, ?)').run('b1', ciphertext)

    const row = db.prepare('SELECT blob FROM t WHERE id = ?').get('b1')
    expect(row.blob).toBeInstanceOf(Uint8Array)
    expect(Array.from(row.blob)).toEqual(Array.from(ciphertext))
    db.close()
  })
})
