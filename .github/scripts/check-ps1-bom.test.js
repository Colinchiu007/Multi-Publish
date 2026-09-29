/**
 * check-ps1-bom 的回归测试（Gate 2b 跑）。
 *
 * 三条设计约束：
 * ① 判据用 fixture 逐条钉（含"ASCII-only 无 BOM 必须放过"，否则门禁会把一半文件误伤）；
 * ② 真仓库必须 0 offender —— 这是"门禁在真实数据上真的在跑"的证据，不只是自说自话；
 * ③ 枚举/读取失效一律 fail closed（有空清单、不可读文件两条），因为不完整的遍历报绿是假绿。
 */
'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const { inspectBuffer, listPs1, check, BOM } = require('./check-ps1-bom.js')

const REPO_ROOT = path.resolve(__dirname, '..', '..')

test('inspectBuffer — 判据本体', () => {
  // 含非 ASCII 且无 BOM ⇒ 违规（PS 5.1 按 ANSI 解码）
  const cnNoBom = Buffer.from('# 强制使用 Git for Windows Bash\n', 'utf8')
  assert.equal(inspectBuffer(cnNoBom).ok, false)
  assert.ok(inspectBuffer(cnNoBom).nonAscii > 0)

  // 同样的内容 + BOM ⇒ 合规（这是唯一被 PS 5.1 承认的 UTF-8 信号）
  assert.equal(inspectBuffer(Buffer.concat([Buffer.from(BOM), cnNoBom])).ok, true)

  // 纯 ASCII 无 BOM 必须放过：否则门禁会要求全仓 .ps1 都加 BOM，属无谓改动
  assert.equal(inspectBuffer(Buffer.from('# plain ascii only\n', 'utf8')).ok, true)

  // 空文件也放过（没有可被误解码的字节）
  assert.equal(inspectBuffer(Buffer.alloc(0)).ok, true)

  // 非 Buffer 入参必须抛，不能静默判过
  assert.throws(() => inspectBuffer(undefined), TypeError)
  assert.throws(() => inspectBuffer('# 中文'), TypeError)
})

test('check — 在真实临时目录上真的能抓出违规（不是只测纯函数）', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ps1-bom-'))
  try {
    execGit(['init', '-q'], dir)
    fs.writeFileSync(path.join(dir, 'bad.ps1'), "# 中文注释会让 PS5.1 崩\nWrite-Output 1\n")
    fs.writeFileSync(path.join(dir, 'good-bom.ps1'),
      Buffer.concat([Buffer.from(BOM), Buffer.from("# 中文注释\nWrite-Output 2\n", 'utf8')]))
    fs.writeFileSync(path.join(dir, 'ascii.ps1'), 'Write-Output 3\n')
    execGit(['add', '-A'], dir)
    const { offenders, scanned } = check(dir)
    assert.equal(scanned, 3, '枚举必须真的看见 3 个文件')
    assert.deepEqual(offenders.map(o => o.file).sort(), ['bad.ps1'])
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})

test('check — 读不到的文件算 offender，不得静默跳过', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ps1-bom-missing-'))
  try {
    execGit(['init', '-q'], dir)
    fs.writeFileSync(path.join(dir, 'ghost.ps1'), '# 中文\n')
    execGit(['add', '-A'], dir)
    fs.rmSync(path.join(dir, 'ghost.ps1')) // index 里有、工作树没有
    const { offenders } = check(dir)
    assert.equal(offenders.length, 1, '缺文件必须被列出来，而不是当"没有违规"')
    assert.match(offenders[0].file, /读取失败/)
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})

test('listPs1 — 空结果必须抛（不完整遍历不许报绿）', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ps1-bom-empty-'))
  try {
    execGit(['init', '-q'], dir)
    assert.throws(() => listPs1(dir), /返回 0 个 \.ps1/)
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})

test('真仓库 0 offender —— 且扫描规模要被打印出来（防"扫到 0"当通过）', () => {
  const { offenders, scanned } = check(REPO_ROOT)
  assert.ok(scanned >= 40, `tracked .ps1 只有 ${scanned} 个，疑似枚举范围被缩小了（历史上是 48）`)
  if (offenders.length) {
    console.error('违规清单：\n' + offenders.map(o => `  nonASCII=${o.nonAscii} ${o.file}`).join('\n'))
  }
  assert.deepEqual(offenders, [])
})

function execGit (args, cwd) {
  const { execFileSync } = require('node:child_process')
  execFileSync('git', args, { cwd, stdio: 'ignore', env: Object.assign({}, process.env, {
    GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@t', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@t',
  }) })
}
