'use strict'
/*
 * check-changelog-duplicate-entries.test.js — 用 node:test + 真实临时文件跑，不 mock 文件系统。
 * 夹具一律落在 os.tmpdir() 下带 PID/随机后缀的独立目录（并发会话会同时跑本文件）。
 * 每条"锁"都配了反向用例：只证"有重复会红"不够，还要证"没重复不会红"和"去重没吃掉唯一条目"。
 */
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const { splitEntries, analyze, dedupe, collect, main } = require('./check-changelog-duplicate-entries.js')

function tmpDir () {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `cde-${process.pid}-${Math.random().toString(16).slice(2)}-`))
  return dir
}

const E = (title, body) => `# [未发布] ${title}\n${body}\n\n`

test('splitEntries 按标题行切块并保留 preamble（三种行尾都不吃掉字节）', () => {
  const text = `preamble line\n${E('A', 'a1')}---\n${E('B', 'b1')}`
  const { preamble, blocks } = splitEntries(text)
  assert.equal(preamble, 'preamble line\n')
  assert.equal(blocks.length, 2)
  assert.ok(blocks[0].startsWith('# [未发布] A'))
  const headingLines = (b) => b.split('\n').filter((l) => l.replace(/\r+$/, '').startsWith('# [未发布]')).length
  assert.equal(headingLines(blocks[0]), 1, '每块只应含一个标题行')
  assert.equal(headingLines(blocks[1]), 1)
  // 块拼接回去必须与原文逐字节相同（判据：不重新生成，只搬运）
  assert.equal(preamble + blocks.join(''), text)
})

test('splitEntries 在 CRLF 文本上不改变任何字节（本仓 CHANGELOG 的实际形态）', () => {
  const crlf = `p\r\n${E('A', 'a1').replace(/\n/g, '\r\n')}---\r\n${E('B', 'b1').replace(/\n/g, '\r\n')}`
  const { preamble, blocks } = splitEntries(crlf)
  assert.equal(preamble + blocks.join(''), crlf)
  assert.equal(analyze(crlf).entries, 2)
})

test('analyze：无重复判 ok，不给出假阳性', () => {
  const text = `${E('A', 'x')}${E('B', 'yy')}${E('C', 'z')}`
  const a = analyze(text)
  assert.deepEqual(
    { entries: a.entries, distinct: a.distinct, redundant: a.redundant, ok: a.ok, worst: a.worst },
    { entries: 3, distinct: 3, redundant: 0, ok: true, worst: 1 },
  )
})

test('analyze：同题多份时按份数报出，并点名最坏的一条', () => {
  const text = `${E('A', 'x')}${E('B', 'y')}${E('A', 'x')}${E('A', 'longer body here')}${E('B', 'y')}`
  const a = analyze(text)
  assert.equal(a.entries, 5)
  assert.equal(a.distinct, 2)
  assert.equal(a.redundant, 3)
  assert.equal(a.ok, false)
  assert.equal(a.worst, 3, 'A 出现 3 次')
  assert.deepEqual(a.duplicateTitles.map((d) => [d.title, d.count]), [
    ['# [未发布] A', 3],
    ['# [未发布] B', 2],
  ])
})

test('dedupe：同题保留正文最长的那一份，顺序按标题首次出现', () => {
  const text = `PRE\n${E('A', 'short')}${E('B', 'b')}${E('A', 'much much longer body')}`
  const d = dedupe(text)
  assert.equal(d.removed, 1)
  assert.equal(d.entriesAfter, 2)
  const titles = analyze(d.text).entries
  assert.equal(titles, 2)
  assert.ok(d.text.includes('much much longer body'), '应保留最长正文')
  assert.equal(d.text.includes('short'), false, '短的那一份应被丢弃')
  assert.ok(d.text.indexOf('# [未发布] A') < d.text.indexOf('# [未发布] B'), '顺序按首次出现')
  assert.ok(d.text.startsWith('PRE\n'), 'preamble 原样在最前')
})

test('dedupe 是幂等的：跑第二遍一个字节都不动', () => {
  const text = `PRE\n${E('A', 'x')}${E('B', 'y')}${E('A', 'z longer')}${E('C', 'w')}`
  const once = dedupe(text).text
  const twice = dedupe(once)
  assert.equal(twice.removed, 0)
  assert.equal(twice.text, once)
  assert.equal(analyze(once).ok, true)
})

test('dedupe 不得吃掉唯一条目：去重后的标题集合必须与原文的标题集合相同', () => {
  const titles = ['A', 'B', 'C', 'D', 'E']
  const text = titles.map((t) => E(t, `body-${t}`)).join('') + E('B', 'dup-b-longer-body')
  const d = dedupe(text)
  const uniqBefore = [...new Set(titles)]
  const uniqAfter = splitEntries(d.text).blocks
    .map((b) => b.split('\n')[0].replace(/\r+$/, '').trim().replace('# [未发布] ', ''))
  assert.deepEqual(uniqAfter.slice().sort(), uniqBefore.slice().sort())
  assert.equal(uniqAfter.length, uniqBefore.length, '条目数必须等于不同标题数')
})

test('analyze 报的 kept 与 dedupe 实际保留的那一份必须是同一个索引（同一条规则只准一份实现）', () => {
  const text = `PRE\n${E('A', 'short')}${E('B', 'b')}${E('A', 'medium body')}${E('A', 'the longest body of all')}`
  const a = analyze(text)
  const groups = splitEntries(text).blocks
  const keptOfA = a.duplicateTitles.find((d) => d.title === '# [未发布] A').kept
  assert.equal(groups[keptOfA].includes('the longest body of all'), true, 'analyze 说要留最长那份')
  const d = dedupe(text)
  assert.equal(d.text.includes('the longest body of all'), true, 'dedupe 真留了同一份')
  assert.equal(d.text.includes('medium body'), false)
  assert.equal(d.text.includes('short'), false)
})

test('collect 对「文件缺失 / 空文件 / 没有任何条目」三种取数失败都抛错（不把失败读成干净）', () => {
  const dir = tmpDir()
  try {
    assert.throws(() => collect({ root: dir, path: 'nope.md' }), /找不到目标文件/)
    fs.writeFileSync(path.join(dir, 'empty.md'), '', 'utf8')
    assert.throws(() => collect({ root: dir, path: 'empty.md' }), /为空/)
    fs.writeFileSync(path.join(dir, 'noheading.md'), 'just text\n', 'utf8')
    assert.throws(() => collect({ root: dir, path: 'noheading.md' }), /一条/)
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})

test('main：有重复返回 1，干净返回 0，取不到文件返回 1（门禁的退出码契约）', () => {
  const dir = tmpDir()
  const log = []
  const origLog = console.log
  const origErr = console.error
  try {
    console.log = (...a) => log.push(a.join(' '))
    console.error = (...a) => log.push('ERR:' + a.join(' '))
    fs.writeFileSync(path.join(dir, 'CHANGELOG.md'), `P\n${E('A', 'x')}${E('A', 'y longer')}`, 'utf8')
    assert.equal(main(['--root=' + dir]), 1, '重复必须 rc=1')
    fs.writeFileSync(path.join(dir, 'CHANGELOG.md'), `P\n${E('A', 'x')}${E('B', 'y')}`, 'utf8')
    assert.equal(main(['--root=' + dir]), 0, '干净必须 rc=0')
    assert.equal(main(['--root=' + dir, '--path=nope.md']), 1, '取不到必须 rc=1（不得静默通过）')
  } finally {
    console.log = origLog
    console.error = origErr
    fs.rmSync(dir, { recursive: true, force: true })
  }
})

test('main --dedup --apply 写盘后独立回读为干净；且无重复时不产生任何写入', () => {
  const dir = tmpDir()
  const log = []
  const origLog = console.log
  const origErr = console.error
  try {
    console.log = (...a) => log.push(a.join(' '))
    console.error = (...a) => log.push('ERR:' + a.join(' '))
    const dirty = `P\n${E('A', 'x')}${E('A', 'y longer')}${E('B', 'b')}`
    const f = path.join(dir, 'CHANGELOG.md')
    fs.writeFileSync(f, dirty, 'utf8')
    assert.equal(main(['--root=' + dir, '--dedup', '--apply']), 0)
    assert.ok(log.join('\n').includes('removed=1'), '应报出去掉了 1 份')
    assert.equal(analyze(fs.readFileSync(f, 'utf8')).ok, true, '写盘后独立回读必须干净')

    // 幂等：再跑一次应"无改动不写盘"（用 mtime 变化以外的判据——内容必须逐字节相同）
    const before = fs.readFileSync(f)
    log.length = 0
    assert.equal(main(['--root=' + dir, '--dedup', '--apply']), 0)
    assert.ok(log.join('\n').includes('无改动'), '第二次应报无改动')
    assert.equal(Buffer.compare(fs.readFileSync(f), before), 0, '第二次不得改动文件字节')
  } finally {
    console.log = origLog
    console.error = origErr
    fs.rmSync(dir, { recursive: true, force: true })
  }
})
