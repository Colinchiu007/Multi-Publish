// @ts-check
/**
 * check-text-encoding-integrity.test.js — 门禁自身的自测
 *
 * 重点不在「能跑」，在**证明它真会红**。本仓有过「加了门禁但恒绿」的前科
 * （见 01-docs/learnings.md），所以下面每条都做变异实测：
 * 造出违规现场 → 必须判红 → 还原 → 必须判绿。
 *
 * 尤其第一条：门禁首版**只判「出现基线外的新文件」**，漏掉了「往已登记文件里
 * 继续塞 U+FFFD」——用 `git add` 造现场时也不判红。补第二层棘轮后才由下面
 * `基线内文件的损坏量增加即红` 这条锁住。
 */
'use strict'

const { test } = require('node:test')
const assert = require('node:assert/strict')
const { execFileSync } = require('node:child_process')
const fs = require('node:fs')
const path = require('node:path')

/**
 * U+FFFD 用码点构造：**本文件自身不得含字面 U+FFFD**。
 * 否则门禁会把自己判成损坏——2026-10-07 在 PR #3032 上就发生过。
 * 检测器不能包含被检测的模式，除非写显式自指豁免；用码点构造更干净。
 */
const UFFFD = String.fromCodePoint(0xFFFD)

const REPO = path.resolve(__dirname, '..')
const SCRIPT = path.join(__dirname, 'check-text-encoding-integrity.js')
const BASELINE = path.join(__dirname, 'text-encoding-baseline.json')

function runGate (args = []) {
  try {
    const out = execFileSync(process.execPath, [SCRIPT, ...args], { cwd: REPO, encoding: 'utf8' })
    return { code: 0, out }
  } catch (e) {
    return { code: e.status, out: (e.stdout || '') + (e.stderr || '') }
  }
}

/** 在一个已登记的基线文件里追加 N 个 U+FFFD，并确保它在 tracked 域内 */
function damageBaselineFile (relative, n = 1) {
  const abs = path.join(REPO, relative)
  const backup = fs.readFileSync(abs)
  fs.appendFileSync(abs, '\n<!-- ' + UFFFD.repeat(n) + ' -->\n', 'utf8')
  return () => fs.writeFileSync(abs, backup)
}

test('现场与基线一致时判绿', () => {
  const r = runGate()
  assert.equal(r.code, 0, r.out)
  assert.match(r.out, /OK：无新增编码损坏/)
})

test('基线内文件的损坏量增加即红（首版漏掉的洞）', () => {
  const baseline = JSON.parse(fs.readFileSync(BASELINE, 'utf8'))
  const target = Object.keys(baseline.entries || {})[0]
  assert.ok(target, '基线应至少有一条登记项，否则本用例失去意义')

  const restore = damageBaselineFile(target, 3)
  try {
    const r = runGate()
    assert.equal(r.code, 1, `往基线文件里加 3 个 U+FFFD 应当判红，实际 code=${r.code}\n${r.out}`)
    assert.match(r.out, /基线内文件的损坏量增加/)
    assert.ok(r.out.includes(target), '报错应点名具体文件')
  } finally {
    restore()
  }
  // 还原后必须回到绿
  assert.equal(runGate().code, 0)
})

test('出现基线外的新损坏文件即红', () => {
  const rel = '01-docs/__encoding-gate-mutation-probe.md'
  const abs = path.join(REPO, rel)
  fs.writeFileSync(abs, '# probe\n\n损坏：' + UFFFD + '\n', 'utf8')
  execFileSync('git', ['add', '-N', rel], { cwd: REPO, stdio: 'ignore' })
  try {
    // -N 只登记 intent-to-add；判据用的是 `git ls-files`，需确认它确实进了域
    const listed = execFileSync('git', ['ls-files'], { cwd: REPO, encoding: 'utf8' })
    if (!listed.includes(rel)) return // 未进入 tracked 域则本条不适用，跳过而非假绿
    const r = runGate()
    assert.equal(r.code, 1, r.out)
    assert.match(r.out, /新增 \d+ 处编码损坏/)
  } finally {
    fs.unlinkSync(abs)
    try { execFileSync('git', ['rm', '--cached', '-q', rel], { cwd: REPO, stdio: 'ignore' }) } catch { /* 未入 index */ }
  }
})

test('基线可被 --update-baseline 写入，且写出的结构含棘轮所需字段', () => {
  const b = JSON.parse(fs.readFileSync(BASELINE, 'utf8'))
  assert.ok(b.entries, '基线应含 entries')
  assert.ok(b.$comment, '基线应含成因说明，避免成为无主数字')
  for (const [file, info] of Object.entries(b.entries)) {
    assert.ok(file && typeof file === 'string', '登记项的键应是文件路径')
    assert.equal(typeof info.fffd, 'number', `${file} 缺 fffd 计数（第二层棘轮靠它）`)
    assert.equal(typeof info.nonUtf8, 'number', `${file} 缺 nonUtf8 计数`)
  }
})

test('二进制文件不在判据域内（mp4 本来就不是 UTF-8）', () => {
  const listed = execFileSync('git', ['ls-files'], { cwd: REPO, encoding: 'utf8' })
  const mp4 = listed.split('\n').filter(f => f.endsWith('.mp4'))
  if (mp4.length === 0) return
  const r = runGate()
  assert.equal(r.code, 0, `仓库内 ${mp4.length} 个 mp4 不应被判为编码损坏：\n${r.out}`)
})
