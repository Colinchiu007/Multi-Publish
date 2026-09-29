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

const { inspectBuffer, listPs1, check, BOM, FIX_HINT } = require('./check-ps1-bom.js')

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

/**
 * 以下两条是 QM-6 外部评审（codex）与本地实测**各自独立**命中的同一个漏判面（#2656 合并后补）。
 * 原判据只看"开头有没有 UTF-8 BOM"，于是两类文件被判绿、实际照样坏：
 * ① 多重 BOM：第 2 个 BOM 不再是编码声明而是**内容字符** U+FEFF。
 *    实测（D:\tmp\bom-edge-probe2.ps1 / 3）：双 BOM + 中文正文 ⇒ PS 5.1 与 pwsh 7 都 ParseFileErr=1 且 throw；
 *    双 BOM + 纯 ASCII 正文 ⇒ ParseFile 过了但**运行仍 throw**（CommandNotFoundException）。
 * ② BOM 说"我是 UTF-8"而正文不是合法 UTF-8（例如历史用 GBK 保存的文件被"只补 BOM"的脚本放过）：
 *    PS 5.1 按 UTF-8 解码失败 ⇒ 中文变替换字符，注释里的字节撞不出语法但**输出的命令名是乱的**。
 * 第②条同时是"只前置 BOM 不转码"这个动作自身的守卫：真遇 GBK 文件时必须变红，而不是产出一个"有 BOM 的坏文件"。
 */
test('inspectBuffer — 多重 BOM 判红（第 2 个 BOM 是内容不是声明）', () => {
  const body = Buffer.from("# 中文注释\nWrite-Output 1\n", 'utf8')
  const B = Buffer.from(BOM)

  const one = inspectBuffer(Buffer.concat([B, body]))
  assert.equal(one.ok, true)
  assert.equal(one.bomCount, 1)

  const two = inspectBuffer(Buffer.concat([B, B, body]))
  assert.equal(two.ok, false, '双 BOM 实测会让 PS 5.1/pwsh7 运行期 throw，必须判红')
  assert.equal(two.bomCount, 2)
  assert.equal(two.reason, 'double-bom')

  const three = inspectBuffer(Buffer.concat([B, B, B, body]))
  assert.equal(three.ok, false)
  assert.equal(three.bomCount, 3)

  // 纯 ASCII 正文也不能放过：实测 ParseFile 不报错但执行 throw
  const twoAscii = inspectBuffer(Buffer.concat([B, B, Buffer.from('Write-Output 1\n', 'utf8')]))
  assert.equal(twoAscii.ok, false)
  assert.equal(twoAscii.reason, 'double-bom')

  // nonAscii 只数正文：BOM 自己是 3 个 >0x7F 字节，算进去会让现场数字虚高，
  // 更会让"②③ 只在含非 ASCII 时才查"这种收窄变异退化成语义 no-op（反证跑不出红）。
  assert.equal(inspectBuffer(Buffer.concat([B, Buffer.from('Write-Output 1\n', 'utf8')])).nonAscii, 0)
  assert.equal(inspectBuffer(Buffer.from('Write-Output 1\n', 'utf8')).nonAscii, 0)
  assert.equal(inspectBuffer(Buffer.concat([B, Buffer.from('# 中\n', 'utf8')])).nonAscii, 3,
    '一个「中」= 3 个 UTF-8 字节；只应数正文这 3 个，不含 BOM 自身的 3 个')
})

test('inspectBuffer — 有 BOM 但正文不是合法 UTF-8 ⇒ 判红', () => {
  const B = Buffer.from(BOM)
  // 「中」的 GBK 编码是 D6 D0；作为 UTF-8 前两字节 D6 是 2 字节序列的首字节，
  // 而 D0 不是延续字节（不在 80..BF）⇒ 严格解码必失败。这正是"只补 BOM 不转码"的产物形态。
  const gbkBody = Buffer.from([0x43, 0x6F, 0x6D, 0x6D, 0x65, 0x6E, 0x74, 0x20, 0xD6, 0xD0, 0x0A])
  const r = inspectBuffer(Buffer.concat([B, gbkBody]))
  assert.equal(r.ok, false)
  assert.equal(r.reason, 'invalid-utf8')

  // 同一段中文按 UTF-8 编码 + BOM ⇒ 合规
  assert.equal(inspectBuffer(Buffer.concat([B, Buffer.from('# 评论 中\n', 'utf8')])).ok, true)

  // overlong 编码（C0 80）在严格解码下同样非法：判据必须用严格档而不是"能凑出个字符串"
  assert.equal(inspectBuffer(Buffer.concat([B, Buffer.from([0x41, 0xC0, 0x80, 0x0A])])).reason, 'invalid-utf8')

  // 没 BOM 的纯 ASCII 不在此判据内（原规则放过），且不得因为"没 BOM"就跳过合法性检查以外的事
  assert.equal(inspectBuffer(Buffer.from('Write-Output 1\n', 'utf8')).ok, true)
})

test('check — 临时目录里双 BOM / 非法 UTF-8 都被抓出并带上原因', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ps1-bom-hard-'))
  try {
    execGit(['init', '-q'], dir)
    const B = Buffer.from(BOM)
    fs.writeFileSync(path.join(dir, 'dbl.ps1'), Buffer.concat([B, B, Buffer.from('# 中文\nWrite-Output 1\n', 'utf8')]))
    fs.writeFileSync(path.join(dir, 'gbk.ps1'), Buffer.concat([B, Buffer.from([0x23, 0x20, 0xD6, 0xD0, 0x0A])]))
    fs.writeFileSync(path.join(dir, 'ok.ps1'), Buffer.concat([B, Buffer.from('# 中文\nWrite-Output 2\n', 'utf8')]))
    execGit(['add', '-A'], dir)
    const { offenders, scanned } = check(dir)
    assert.equal(scanned, 3)
    const byFile = Object.fromEntries(offenders.map(o => [o.file, o.reason]))
    assert.deepEqual(byFile, { 'dbl.ps1': 'double-bom', 'gbk.ps1': 'invalid-utf8' },
      '两条新判据都要在真实文件上生效，且不得误伤合规文件')
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
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

/**
 * 三条判据的**修法方向互不相同**（补 BOM / 删多余 BOM / 转码），报错时给错修法比不给更糟 ——
 * 尤其 invalid-utf8：对它"再补一个 BOM"会让文件离能用更远。所以每个 reason 都必须有对应提示，
 * 且提示里必须真的写着那条判据独有的动作词。这是"判据变红后现场可归因"的唯一锁。
 */
test('每个 reason 都要有对应修法提示，且提示写的是该判据自己的动作', () => {
  const B = Buffer.from(BOM)
  const cases = [
    { buf: Buffer.from('# 中文\n', 'utf8'), reason: 'missing-bom', hintMustContain: '前置' },
    { buf: Buffer.concat([B, B, Buffer.from('# 中文\n', 'utf8')]), reason: 'double-bom', hintMustContain: '删掉' },
    { buf: Buffer.concat([B, Buffer.from([0x23, 0x20, 0xD6, 0xD0, 0x0A])]), reason: 'invalid-utf8', hintMustContain: '转成' },
  ]
  for (const c of cases) {
    const r = inspectBuffer(c.buf)
    assert.equal(r.reason, c.reason)
    const hint = FIX_HINT[c.reason]
    assert.ok(hint, '缺 FIX_HINT.' + c.reason + ' ⇒ 现场只会打印"无预设提示"')
    assert.ok(hint.includes(c.hintMustContain),
      c.reason + ' 的提示里没有 "' + c.hintMustContain + '"，等于把三种修法拉回同一条错误建议')
  }
  assert.deepEqual(Object.keys(FIX_HINT).sort(),
    ['double-bom', 'invalid-utf8', 'missing-bom', 'unreadable'],
    'FIX_HINT 的键集合只能与判据同步增删；多写或漏写都说明判据和提示已经漂移')
})

function execGit (args, cwd) {
  const { execFileSync } = require('node:child_process')
  execFileSync('git', args, { cwd, stdio: 'ignore', env: Object.assign({}, process.env, {
    GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@t', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@t',
  }) })
}
