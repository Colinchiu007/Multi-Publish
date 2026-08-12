// @ts-check
// @vitest-environment node
const fs = require('fs')
const os = require('os')
const path = require('path')
const { createPromptEvalStore } = require('./store')

function makeRoot () {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'prompt-eval-store-' + process.pid + '-'))
}

describe('prompt-eval store', () => {
  let root
  let store
  beforeEach(() => {
    root = makeRoot()
    store = createPromptEvalStore({ userDataDir: root, log: { info: () => {}, warn: () => {}, error: () => {} } })
  })
  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true })
  })

  it('save 写入 records/<id>.json、reports/<id>.md 与 index.json', () => {
    const record = { id: 'eval-20260811-000000-abc12345', mediaType: 'image', overallScore: 82, grade: 'good', dimensions: [], problems: [], promptOptimizationPoints: [] }
    store.save({ record, markdown: '# 报告' })
    expect(fs.existsSync(path.join(root, 'prompt-eval', 'records', record.id + '.json'))).toBe(true)
    expect(fs.existsSync(path.join(root, 'prompt-eval', 'reports', record.id + '.md'))).toBe(true)
    const index = JSON.parse(fs.readFileSync(path.join(root, 'prompt-eval', 'index.json'), 'utf8'))
    expect(index.records).toHaveLength(1)
    expect(index.records[0].id).toBe(record.id)
  })

  it('listRecords 返回索引记录；索引缺失时自愈扫描 records/', () => {
    const record = { id: 'eval-20260811-000001-a1b2c3d4', mediaType: 'image', overallScore: 70, grade: 'good' }
    store.save({ record, markdown: '# r' })
    fs.rmSync(path.join(root, 'prompt-eval', 'index.json'))
    const list = store.listRecords()
    expect(list).toHaveLength(1)
    expect(list[0].id).toBe(record.id)
    expect(fs.existsSync(path.join(root, 'prompt-eval', 'index.json'))).toBe(true)
  })

  it('getRecord 读取完整记录；不存在返回 null', () => {
    const record = { id: 'eval-20260811-000002-9999abcd', mediaType: 'image', overallScore: 88, grade: 'excellent', dimensions: [] }
    store.save({ record, markdown: '# r' })
    const got = store.getRecord(record.id)
    expect(got).not.toBeNull()
    expect(got.id).toBe(record.id)
    expect(store.getRecord('nope')).toBeNull()
  })

  it('deleteRecord 删除文件并更新索引；不存在抛 EVAL_RECORD_NOT_FOUND', () => {
    const record = { id: 'eval-20260811-000003-11112222', mediaType: 'image', overallScore: 60, grade: 'fair' }
    store.save({ record, markdown: '# r' })
    expect(store.deleteRecord(record.id)).toBe(true)
    expect(fs.existsSync(path.join(root, 'prompt-eval', 'records', record.id + '.json'))).toBe(false)
    expect(store.listRecords()).toHaveLength(0)
    expect(() => store.deleteRecord('nope')).toThrow(/EVAL_RECORD_NOT_FOUND/)
  })

  it('writeFileAtomic 对 Windows 瞬时锁错误做有界重试（≤3 次）后成功', () => {
    let attempts = 0
    const flakyFs = {
      renameSync: (from, to) => {
        attempts += 1
        if (attempts <= 2) {
          const e = new Error('EBUSY')
          e.code = 'EBUSY'
          throw e
        }
        fs.renameSync(from, to)
      },
    }
    const store2 = createPromptEvalStore({ userDataDir: root, log: noopLog, fsImpl: flakyFs })
    store2.writeFileAtomic(path.join(root, 'atomic.txt'), 'x')
    expect(fs.readFileSync(path.join(root, 'atomic.txt'), 'utf8')).toBe('x')
    expect(attempts).toBe(3)
  })

  it('非法记录 id（路径穿越）→ EVAL_RECORD_NOT_FOUND，不触碰外部文件', () => {
    const record = { id: 'eval-20260811-000004-33334444', mediaType: 'image', overallScore: 90, grade: 'excellent' }
    store.save({ record, markdown: '# r' })
    const outside = path.join(root, 'outside.json')
    fs.writeFileSync(outside, '{"secret":true}')
    for (const bad of ['../outside', '..%2Foutside', 'a/b', 'a\\b', 'x'.repeat(200)]) {
      expect(() => store.getRecord(bad)).toThrow(/EVAL_RECORD_NOT_FOUND/)
      expect(() => store.deleteRecord(bad)).toThrow(/EVAL_RECORD_NOT_FOUND/)
    }
    expect(fs.readFileSync(outside, 'utf8')).toContain('secret')
  })

  it('writeFileAtomic 超过重试预算后原样抛出', () => {
    const flakyFs = {
      renameSync: () => { const e = new Error('EBUSY'); e.code = 'EBUSY'; throw e },
    }
    const store2 = createPromptEvalStore({ userDataDir: root, log: noopLog, fsImpl: flakyFs })
    expect(() => store2.writeFileAtomic(path.join(root, 'atomic2.txt'), 'x')).toThrow(/EBUSY/)
  })
})

const noopLog = { info: () => {}, warn: () => {}, error: () => {} }

