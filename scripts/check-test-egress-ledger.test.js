'use strict'
/**
 * scripts/check-test-egress-ledger.test.js —— 运行时出站台账基线棘轮（Gate 2c3）的夹具锁
 *
 * 为什么必须有：#2491 档3 的静态棘轮经实测写不出来（四类形状里"真实出网且无注入面"的 9 个命中抽样 3/3 全是
 * 断言里的 URL 字符串，71 处"起子进程无 timeout"多为 mock 与扫源码的结构锁）——静态判据一落地就会被误报淹没、
 * 一周内被豁免清单吃掉，成为装饰性门禁。正解改用 PR #2854 已经在产的**运行时台账**：
 * 一次真实跑产出的 (类型, 命令/主机) 集合，与这份基线比对，**新增即红**。
 *
 * 三条锁的形状是踩过才写对的，逐条对应一个已复现的失效模式：
 *  1) 「台账文件不存在」必须红，且文案点名"sink 没装配"——否则 env 拼错 / 写入被 try-catch 吞掉时，
 *     门禁会读到一个空集合并把"零违规"当成通过（本仓「探针自身故障伪装成结论」同族）。
 *  2) 「只有 install 记录、没有任何 child/blocked 记录」是**合法**的（该套件确实不起非 node 子进程），
 *     不得据此判红；但 install 记录缺失即红，因为那是"装配未经证实"。
 *  3) 基线里有条目、本次没出现 ⇒ 只出声不判红。分片/子集跑无法证否"再也不出现"，
 *     把它写成红会把人推向"干脆删掉基线"，反而丢掉登记的原因。
 */
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const mod = require('./check-test-egress-ledger.js')

function tmpLedger (lines) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'egress-ledger-'))
  const file = path.join(dir, 'ledger.jsonl')
  fs.writeFileSync(file, lines.map((l) => JSON.stringify(l)).join('\n') + '\n', 'utf8')
  return file
}
const INSTALL = { type: 'install', suite: 'desktop', pid: 1 }

test('夹具：空台账（只有 install）判通过，且不把"没记录"当违规', () => {
  const r = mod.evaluate({ ledgerText: JSON.stringify(INSTALL) + '\n', baseline: {} })
  assert.equal(r.ok, true)
  assert.deepEqual(r.newEntries, [])
})

test('夹具：新增的 child 命令必须红，并点名它不在基线里', () => {
  const text = [INSTALL, { type: 'child', suite: 'desktop', command: 'curl.exe' }]
    .map((l) => JSON.stringify(l) + '\n').join('')
  const r = mod.evaluate({ ledgerText: text, baseline: { 'child::git': '既有：worktree 相关用例真跑 git' } })
  assert.equal(r.ok, false)
  assert.deepEqual(r.newEntries, ['child::curl.exe'])
  assert.match(r.render(), /curl\.exe/)
  assert.match(r.render(), /只能缩小/)
})

test('夹具：blocked 主机同样入键；基线命中则不红', () => {
  const text = [INSTALL, { type: 'blocked', suite: 'packages', host: 'example.com', port: 443 }]
    .map((l) => JSON.stringify(l) + '\n').join('')
  const r = mod.evaluate({ ledgerText: text, baseline: { 'blocked::example.com:443': '既有：该用例本就断言守卫拦住它' } })
  assert.equal(r.ok, true)
  assert.deepEqual(r.newEntries, [])
})

test('夹具：blocked 无端口时键不得写成 "host:undefined"', () => {
  const text = [INSTALL, { type: 'blocked', suite: 'packages', host: 'example.com' }]
    .map((l) => JSON.stringify(l) + '\n').join('')
  const r = mod.evaluate({ ledgerText: text, baseline: {} })
  assert.deepEqual(r.newEntries, ['blocked::example.com'])
})

test('夹具：同一条命令在多个 realm 重复出现，只算一个键（warnOnce 之外的去重不得依赖它）', () => {
  const text = [INSTALL, INSTALL,
    { type: 'child', suite: 'a', command: 'git' },
    { type: 'child', suite: 'b', command: 'git' }].map((l) => JSON.stringify(l) + '\n').join('')
  const r = mod.evaluate({ ledgerText: text, baseline: { 'child::git': 'x' } })
  assert.equal(r.ok, true)
  assert.deepEqual(r.seenKeys, ['child::git'])
})

test('夹具：缺 install 记录 ⇒ 判红并点名"sink 未经证实装配"（不得把空文件读成零违规）', () => {
  const text = [{ type: 'child', suite: 'desktop', command: 'git' }].map((l) => JSON.stringify(l) + '\n').join('')
  const r = mod.evaluate({ ledgerText: text, baseline: { 'child::git': 'x' } })
  assert.equal(r.ok, false)
  assert.deepEqual(r.sinkUnproven, true)
  assert.match(r.render(), /装配未经证实/)
})

test('夹具：空文本（文件存在但 0 行）与"文件不存在"都判红，且原因不同', () => {
  const empty = mod.evaluate({ ledgerText: '', baseline: {} })
  const missing = mod.evaluate({ ledgerText: null, baseline: {} })
  assert.equal(empty.ok, false)
  assert.equal(missing.ok, false)
  assert.match(empty.render(), /0 行/)
  assert.match(missing.render(), /文件不存在/)
})

test('夹具：坏行（截断/非 JSON）必须被计数并出声，不得静默跳过', () => {
  const text = [JSON.stringify(INSTALL), '{ "type": "child", "comm', JSON.stringify({ type: 'child', suite: 'x', command: 'git' })]
    .join('\n') + '\n'
  const r = mod.evaluate({ ledgerText: text, baseline: { 'child::git': 'x' } })
  assert.equal(r.malformed, 1)
  assert.match(r.render(), /坏行 1/)
})

test('夹具：基线条目本次没出现 ⇒ 只出声不判红（分片子集无法证否）', () => {
  const text = JSON.stringify(INSTALL) + '\n'
  const r = mod.evaluate({ ledgerText: text, baseline: { 'child::git': '既有', 'child::ffmpeg.exe': '既有' } })
  assert.equal(r.ok, true)
  assert.deepEqual(r.staleKeys, ['child::ffmpeg.exe', 'child::git'].sort())
  assert.match(r.render(), /未出现/)
})

test('夹具：未知 type 的记录不得被当成合法（防止 sink 写错形状后门禁恒绿）', () => {
  const text = [INSTALL, { type: 'children', suite: 'x', command: 'curl.exe' }]
    .map((l) => JSON.stringify(l) + '\n').join('')
  const r = mod.evaluate({ ledgerText: text, baseline: {} })
  assert.equal(r.unknownTypes, 1)
  assert.equal(r.ok, false)
  assert.match(r.render(), /未知记录类型/)
})

test('真实现场：仓库里的基线 JSON 必须是合法 JSON 且只含 child::/blocked:: 前缀', () => {
  const file = path.join(__dirname, 'test-egress-ledger-baseline.json')
  if (!fs.existsSync(file)) { assert.fail('基线文件缺失：棘轮没有比对对象（必须先跑一轮真实全量再落盘）') }
  const json = JSON.parse(fs.readFileSync(file, 'utf8'))
  const keys = Object.keys(json.entries || {})
  assert.ok(keys.length > 0, '基线不得为空文件——空基线会让"新增即红"变成"一切皆新增"，CI 每条 PR 都炸')
  for (const k of keys) {
    assert.match(k, /^(child::\S+|blocked::\S+)$/, '基线键形状必须是 child::<命令> 或 blocked::<host[:port]>：' + k)
    assert.ok(String(json.entries[k]).length >= 8, '每条登记必须写原因（为什么这里会出现非 node 子进程/被拦出站）：' + k)
  }
})

// 接线锁（结构锁，读 workflow 正文）。按 AGENTS.md 的教训拆成语义条件，不写死整条命令：// 只按"这一行提到了判定器文件名"枚举，再按有没有 `--test` 分面 —— 否则别人在 `node` 与路径之间插个 env，
// 那条判定就会从枚举里消失（不是变红，是不再被检查），这正是"门禁把自己的检查对象改没了"的第三种落点。
test('接线锁：CI 里的判定调用必须存在、必须带 --ledger、且永远不得带 --write-baseline', () => {
  const wf = path.join(__dirname, '..', '.github', 'workflows', 'quality-gate.yml')
  const text = fs.readFileSync(wf, 'utf8')
  const mentioning = text.split(/\r?\n/).filter((l) => l.includes('check-test-egress-ledger.js') && !/^\s*#/.test(l))
  assert.ok(mentioning.length > 0, 'quality-gate.yml 里没有任何一处引用判定器 ⇒ 这条棘轮在 CI 上等于没接')
  const judgments = mentioning.filter((l) => !/--test\s/.test(l))
  assert.ok(judgments.length >= 2,
    '判定调用至少要有两处（跑测试的那个 required job + 桌面分片），实测 ' + judgments.length + ' 处：' + JSON.stringify(judgments))
  for (const line of judgments) {
    assert.match(line, /--ledger/, '判定调用没带 --ledger（会读不到台账而 fail-closed，或 worse：被改成永远跳过）：' + line.trim())
    assert.doesNotMatch(line, /--write-baseline/,
      'CI 侧绝不允许 --write-baseline：那等于让门禁自己把基线扩容，"清单只能缩小"当场失效：' + line.trim())
  }
  // 装配面：env 必须真的两处都设了，否则判定读到的是空路径（"文件不存在"红是 fail-closed，
  // 但如果 env 从来没设过，人会把这条红读成"门禁坏了"而不是"没人装 sink"）。
  const envLines = text.split(/\r?\n/).filter((l) => /MP_TEST_EGRESS_LEDGER:/.test(l) && !/^\s*#/.test(l))
  assert.ok(envLines.length >= 2, 'MP_TEST_EGRESS_LEDGER 的 env 声明至少两处（与判定调用同数量级），实测 ' + envLines.length)
  assert.doesNotMatch(text, /MP_TEST_EGRESS_LEDGER:\s*$/m, 'env 值不得为空行式声明（空值会让 sink 静默不装配）')
  // Nx 缓存会让 Gate 4 只重放结果、根本不启动测试进程 ⇒ 台账连 install 都没有 ⇒ fail-closed 误红。
  // 这条断言钉的是"跑测试的那个 job 必须真的跑"，删掉它就是把门禁变成周期性假红。
  assert.match(text, /NX_SKIP_NX_CACHE:\s*'?true'?/,
    'Gate 4 必须绕过 Nx 任务缓存，否则缓存命中时判定器读不到台账（fail-closed 会变成误红）')
})

// 同一条 fail-closed 的第二种误红成因（实测 PR #2902 的 QG Unit Tests）：
// nx 的受影响集合为空时，如果步骤不早退，就会跑一次"0 个任务"的 test:affected —— 没有任何测试进程，
// 台账自然不存在，判定器按 fail-closed 判红。空集早退因此必须**排在判定之前**，这是顺序锁不是存在锁。
//
// 早退的判据本身换过两次，两次都是同形假红，所以这里的锚点也换过两次：
//   #2902 —— pwsh 里 ConvertFrom-Json '[]' 是 $null，于是空集被误分类成"检测失败"。当时的锚点
//            锁的是"判据必须看原始文本"，实现形态是字符串全等 `$affectedText -eq ''`。
//   #2596 —— 字符串全等被 nx 的 stdout 提示（`NX   Unrecognized Cache Artifacts`，CI 还原 Nx
//            缓存后必现）一掺就漏判，空集再次被降级成"检测失败"⇒ 同样 0 个任务 ⇒ 同样台账缺失。
//            判据搬进 scripts/nx-affected-probe.js 三态化，锚点随之改为 kind=empty。
//            **不要**把锚点改回任何形式的全等或"只看 nx 退出码"——那两种都已被实测证伪。
test('Gate 4 的空集早退必须排在台账判定之前，且受影响集合按有 test 目标过滤', () => {
  const wf = path.join(__dirname, '..', '.github', 'workflows', 'quality-gate.yml')
  const text = fs.readFileSync(wf, 'utf8')
  const start = text.indexOf('- name: "Gate 4 - Workspace unit tests"')
  assert.ok(start > 0, '取不到 Gate 4 步骤（步骤名改了必须同步本锁）')
  const step = text.slice(start)
  const judge = step.indexOf('check-test-egress-ledger.js')
  assert.ok(judge > 0, 'Gate 4 步骤内必须有台账判定调用')
  const emptyExit = step.search(/\$probe\.kind\s*-eq\s*'empty'/)
  assert.ok(emptyExit > 0, "空集早退必须由**确证空集**的判据驱动（nx-affected-probe.js 判出的 kind=empty）；不得用字符串全等（会被 nx 的 stdout 提示污染），也不得退化为只看 nx 退出码（那是把 fail-closed 调转回去）")
  assert.ok(emptyExit < judge, '空集早退必须排在判定之前，否则"本轮没跑任何测试"会被 fail-closed 读成假红')
  assert.match(step, /--with-target=test/, '受影响集合必须按「有 test 目标」过滤，否则与 test:affected 实际要跑的任务集口径不同')
})

// 下面两条是外部评审（codex 路，QM-6）命中缺陷后补的**端到端**锁：
// 只测 evaluate() 的纯函数夹具对 CLI 参数解析完全免疫 —— 原实现把 --write-baseline 读成"取下一个参数"，
// 而文档教的写法正好把它放在末尾 ⇒ 本机重生成基线静默失败；同时旧逻辑还要求 r.ok 才写盘，
// 而"有新键"恰恰是 ok=false ⇒ 那个入口在修好之前**任何情况下都不会写盘**。
function tmpPair () {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'egress-main-' + process.pid + '-'))
  const baselineFile = path.join(dir, 'b.json')
  const ledgerFile = path.join(dir, 'l.jsonl')
  fs.writeFileSync(baselineFile, JSON.stringify({ $comment: '出处标记，写回时不得丢', entries: { 'child::git': '既有原因文本' } }, null, 2) + '\n', 'utf8')
  fs.writeFileSync(ledgerFile, [
    { type: 'install', suite: 'x', pid: 1 },
    { type: 'child', suite: 'x', command: 'curl.exe' }
  ].map((r) => JSON.stringify(r)).join('\n') + '\n', 'utf8')
  return { dir, baselineFile, ledgerFile }
}

test('main() 端到端：--write-baseline 放在最后一个参数也必须真的写盘，且不覆盖既有条目、不丢 $comment', () => {
  const t = tmpPair()
  try {
    const rc = mod.main(['--ledger', t.ledgerFile, '--baseline', t.baselineFile, '--write-baseline'])
    assert.equal(rc, 0, '重生成入口返回非 0 就没法在本地串命令用')
    const json = JSON.parse(fs.readFileSync(t.baselineFile, 'utf8'))
    assert.equal(json.entries['child::curl.exe'], '(待补原因)', '新键必须并入')
    assert.equal(json.entries['child::git'], '既有原因文本', '既有登记不得被覆写（那会抹掉别人写的原因）')
    assert.equal(json.$comment, '出处标记，写回时不得丢', '基线文件里的说明字段不能被写丢')
  } finally { fs.rmSync(t.dir, { recursive: true, force: true }) }
})

test('main() 端到端：不带 --write-baseline 时基线文件必须逐字节不变（防止"顺手扩容基线"）', () => {
  const t = tmpPair()
  try {
    const before = fs.readFileSync(t.baselineFile)
    const rc = mod.main(['--ledger', t.ledgerFile, '--baseline', t.baselineFile])
    assert.equal(rc, 1, '有基线外的新键时必须返回 1')
    assert.ok(fs.readFileSync(t.baselineFile).equals(before), 'CI 侧的判定调用绝不能改动基线文件')
  } finally { fs.rmSync(t.dir, { recursive: true, force: true }) }
})
