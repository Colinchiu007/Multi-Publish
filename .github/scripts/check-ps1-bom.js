#!/usr/bin/env node
/**
 * check-ps1-bom.js — 「含非 ASCII 的 .ps1 必须带 UTF-8 BOM」门禁
 *
 * 存在理由（2026-09-29 实测）：Windows PowerShell 5.1（`powershell.exe`，本仓所有 .ps1 入口
 * 的实际宿主）在读取 **无 BOM** 的 .ps1 时按系统 ANSI 码页（本机 cp936）解码，而不是 UTF-8。
 * 中文注释/字符串于是被逐字节重新解释成乱码，一旦某个多字节序列里含 `'` `"` `{` `}` 的字节，
 * **整个脚本就 tokenize 失败** —— 症状是"入口脚本一跑就 ParserError"，而不是某句中文显示不对。
 * 实测当天 `scripts/start-mp-task.ps1` 正是因此无法运行（⇒ 所有新的运行时代码任务都开不了
 * worktree），同批 15 个含非 ASCII 的 .ps1 里 **8 个** 处于该状态。
 *
 * 为什么判据是 BOM 而不是"实测能 parse"：`EF BB BF` 是 PS 5.1 选择 UTF-8 解码的**唯一**信号
 * （`pwsh` 7 默认 UTF-8 所以看不出来，这也是这类缺陷能长期存活的原因）。
 * 补 BOM 不改动任何一行内容，是把"按什么编码读"这件事显式写进文件，因此它是充分条件。
 * CI 侧本门禁同时断言"补 BOM 前后 parse 错误数由非 0 变 0"不现实（要起 PowerShell），
 * 所以等价性由本地一次性实测证明，写进 PR 与 docs，而不是伪装成门禁。
 *
 * 但"有 BOM"只是声明存在，不等于声明成立，所以判据有三条（后两条是 #2656 合并后由
 * QM-6 外部评审与本地实测各自独立命中后补的）：
 * ① missing-bom：含非 ASCII 而无 BOM ⇒ PS 5.1 按 ANSI 猜；
 * ② double-bom：前导 BOM 不止一个 ⇒ 第 2 个是内容字符 U+FEFF。实测双 BOM 在 PS 5.1 与 pwsh 7
 *    下都让脚本运行期 throw（中文正文连 ParseFile 都过不去，纯 ASCII 正文能 parse 但执行仍炸）；
 * ③ invalid-utf8：声明是 UTF-8 而正文不是合法 UTF-8（GBK 文件被"只补 BOM"的脚本放过的形态）。
 *    这条同时也是 ②③ 修复动作自身的守卫 —— 遇到 ③ 时正确做法是**转码**，不是再补一个 BOM。
 *
 * 反向偏置：枚举失败 / 读不到文件 / 仓库里没有 .ps1 一律 fail closed ——
 * 一次不完整的遍历报"全绿"，比报不出来更危险（同 worktree 链接扫描 R3 的教训）。
 */
'use strict'

const { execFileSync } = require('node:child_process')

const BOM = [0xEF, 0xBB, 0xBF]

/**
 * 数**开头连续**的 UTF-8 BOM 个数。
 * 只数前缀：出现在文件中部的 `EF BB BF` 是内容里的 U+FEFF 字符（本门禁不管，属正文语义问题），
 * 而第 2 个及以后的**前导** BOM 不是编码声明 —— PS 会把它当内容字符，实测足以让脚本运行期 throw。
 */
function leadingBomCount (buf) {
  let n = 0
  while (buf.length >= (n + 1) * BOM.length
    && buf[n * BOM.length] === BOM[0] && buf[n * BOM.length + 1] === BOM[1] && buf[n * BOM.length + 2] === BOM[2]) n++
  return n
}

/** 严格 UTF-8 解码（fatal）：overlong、孤立代理、非法延续字节一律失败。每次新建，不复用可能有状态的实例。 */
function isStrictUtf8 (buf) {
  try {
    new TextDecoder('utf-8', { fatal: true }).decode(buf)
    return true
  } catch (e) {
    return false
  }
}

/**
 * 纯判据：给一段字节，返回它是否守约。
 * @param {Buffer|Uint8Array} buf
 * @returns {{ok:boolean, nonAscii:number, hasBom:boolean, bomCount:number, reason:(string|null)}}
 */
function inspectBuffer (buf) {
  // 只收真 Buffer：字符串也有 .length，用 `typeof buf.length` 当类型检查会放过字符串，
  // 而 `buf[i] > 0x7f` 在字符串上比较的是字符而非字节 ⇒ 中文照样被判"干净"（本仓要防的正是这类静默放行）。
  if (!Buffer.isBuffer(buf)) {
    throw new TypeError('inspectBuffer 需要 Buffer，收到 ' + Object.prototype.toString.call(buf))
  }
  // nonAscii 统计的是**去掉前导 BOM 之后**的正文：BOM 自己就是 3 个 >0x7F 的字节，
  // 把它算进"这个文件有多少非 ASCII 字节"会让现场数字虚高、并让"只在含非 ASCII 时才查"这类
  // 收窄变异变成语义 no-op（反证跑不出红，等于白建一条锁）。
  const bomCount = leadingBomCount(buf)
  const body = buf.slice(bomCount * BOM.length)
  let nonAscii = 0
  for (let i = 0; i < body.length; i++) if (body[i] > 0x7f) nonAscii++
  const hasBom = bomCount >= 1

  // 三条判据按"先声明、后多重、再内容合法性"排：
  // ① 有非 ASCII 却没声明编码 ⇒ PS 5.1 会按 ANSI 猜（#2656 的原始缺陷）
  // ② 声明写了不止一遍 ⇒ 第 2 个 BOM 成了内容字符，实测运行期 throw
  // ③ 声明是 UTF-8 但正文不是合法 UTF-8 ⇒ 解码产出替换字符，注释/输出全乱
  //    （这条同时是"只前置 BOM、不转码"这类修复脚本自身的守卫：真遇 GBK 文件必须变红）
  let reason = null
  if (nonAscii > 0 && !hasBom) reason = 'missing-bom'
  else if (bomCount > 1) reason = 'double-bom'
  else if (hasBom && !isStrictUtf8(body)) reason = 'invalid-utf8'
  return { ok: reason === null, nonAscii, hasBom, bomCount, reason }
}

/**
 * 枚举 tracked .ps1。git 失败或结果为空都按"无法证明"处理，不返回空清单当"全绿"。
 * @param {string} cwd
 */
function listPs1 (cwd) {
  let raw
  try {
    raw = execFileSync('git', ['-C', cwd, 'ls-files', '-z', '--', '*.ps1'],
      { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 })
  } catch (e) {
    throw new Error('无法枚举 tracked .ps1（git ls-files 失败 ⇒ 拒绝判定为通过）：' + e.message)
  }
  const files = raw.split('\0').filter(Boolean)
  if (files.length === 0) {
    throw new Error('git ls-files 返回 0 个 .ps1 —— 要么仓库结构与预期不符，要么 pathspec 失效；'
      + '这两种情况都不许报"全绿"')
  }
  return files
}

/**
 * @param {string} cwd 仓库根
 * @returns {{offenders:{file:string,nonAscii:number,reason:string}[], scanned:number}}
 */
function check (cwd) {
  const files = listPs1(cwd)
  const offenders = []
  for (const f of files) {
    let buf
    try {
      buf = require('node:fs').readFileSync(require('node:path').join(cwd, f))
    } catch (e) {
      // 读不到就是"没证明它守约"。列成 offender 而不是跳过。
      offenders.push({ file: f + '  <读取失败: ' + e.code + '>' , nonAscii: -1, reason: 'unreadable' })
      continue
    }
    const r = inspectBuffer(buf)
    if (!r.ok) offenders.push({ file: f, nonAscii: r.nonAscii, reason: r.reason })
  }
  return { offenders, scanned: files.length }
}

const FIX_HINT = {
  'missing-bom': '  修法：给文件**前置** UTF-8 BOM 字节 EF BB BF（不改任何内容）。',
  'double-bom': '  修法：删掉多余的 BOM，只保留开头**一个** EF BB BF。第 2 个不是编码声明而是 U+FEFF 字符，'
    + '实测 PS 5.1 与 pwsh 7 都会在运行期 throw。',
  'invalid-utf8': '  修法：把**正文转成合法 UTF-8**（只补 BOM 不够 —— 声明说是 UTF-8 而正文是 GBK 字节，'
    + 'PS 会解出替换字符）。转码时逐行保留原行尾。',
  'unreadable': '  修法：文件在 index 里但工作树读不到，先恢复文件本身。',
}

function main () {
  const cwd = process.argv.includes('--repo')
    ? process.argv[process.argv.indexOf('--repo') + 1]
    : process.cwd()
  const { offenders, scanned } = check(cwd)
  if (offenders.length === 0) {
    console.log(`[ps1-bom] OK：${scanned} 个 tracked .ps1 全部守约`
      + '（含非 ASCII 者均恰好带一个 UTF-8 BOM，且正文是合法 UTF-8）')
    return 0
  }
  console.error(`[ps1-bom] FAIL：${offenders.length}/${scanned} 个 .ps1 的编码声明不成立`)
  console.error('  Windows PowerShell 5.1（`powershell.exe`，本仓所有 .ps1 入口的实际宿主）会按 ANSI 码页')
  console.error('  解码无 BOM 的 .ps1 —— 轻则中文变问号，重则整脚本 tokenize 失败')
  console.error('  （实测：start-mp-task.ps1 因一行中文 throw 而 ParserError，导致所有新的隔离 worktree 都开不出来）。')
  offenders.sort((a, b) => b.nonAscii - a.nonAscii)
  for (const o of offenders) console.error(`    ${String(o.reason).padEnd(12)} nonASCII=${String(o.nonAscii).padStart(6)}  ${o.file}`)
  // 修法按原因分组打印：三条判据的修法方向不同，混在一起等于没给（"补个 BOM"对后两条是错的）
  const reasons = [...new Set(offenders.map(o => o.reason))]
  for (const r of reasons) console.error(FIX_HINT[r] || ('  修法：原因 ' + r + ' 无预设提示，请核对判据实现。'))
  console.error('  补 BOM 的一键写法（保留每行原结尾，不做任何"统一行尾"）：')
  console.error('    node -e "const f=require(\'node:fs\'),p=<文件>;const b=f.readFileSync(p);'
    + 'if(!(b[0]===0xEF&&b[1]===0xBB&&b[2]===0xBF))f.writeFileSync(p,Buffer.concat([Buffer.from([0xEF,0xBB,0xBF]),b]))"')
  return 1
}

if (require.main === module) process.exitCode = main()

module.exports = { inspectBuffer, leadingBomCount, isStrictUtf8, listPs1, check, BOM, FIX_HINT }
