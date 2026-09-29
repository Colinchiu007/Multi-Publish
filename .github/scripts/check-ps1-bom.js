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
 * 反向偏置：枚举失败 / 读不到文件 / 仓库里没有 .ps1 一律 fail closed ——
 * 一次不完整的遍历报"全绿"，比报不出来更危险（同 worktree 链接扫描 R3 的教训）。
 */
'use strict'

const { execFileSync } = require('node:child_process')

const BOM = [0xEF, 0xBB, 0xBF]

/**
 * 纯判据：给一段字节，返回它是否守约。
 * @param {Buffer|Uint8Array} buf
 * @returns {{ok:boolean, nonAscii:number, hasBom:boolean}}
 */
function inspectBuffer (buf) {
  // 只收真 Buffer：字符串也有 .length，用 `typeof buf.length` 当类型检查会放过字符串，
  // 而 `buf[i] > 0x7f` 在字符串上比较的是字符而非字节 ⇒ 中文照样被判"干净"（本仓要防的正是这类静默放行）。
  if (!Buffer.isBuffer(buf)) {
    throw new TypeError('inspectBuffer 需要 Buffer，收到 ' + Object.prototype.toString.call(buf))
  }
  let nonAscii = 0
  for (let i = 0; i < buf.length; i++) if (buf[i] > 0x7f) nonAscii++
  const hasBom = buf.length >= 3 && buf[0] === BOM[0] && buf[1] === BOM[1] && buf[2] === BOM[2]
  // 判据只有一条：有非 ASCII 却没声明编码 ⇒ PS 5.1 会按 ANSI 猜
  return { ok: nonAscii === 0 || hasBom, nonAscii, hasBom }
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
 * @returns {{offenders:{file:string,nonAscii:number}[], scanned:number}}
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
      offenders.push({ file: f + '  <读取失败: ' + e.code + '>' , nonAscii: -1 })
      continue
    }
    const r = inspectBuffer(buf)
    if (!r.ok) offenders.push({ file: f, nonAscii: r.nonAscii })
  }
  return { offenders, scanned: files.length }
}

function main () {
  const cwd = process.argv.includes('--repo')
    ? process.argv[process.argv.indexOf('--repo') + 1]
    : process.cwd()
  const { offenders, scanned } = check(cwd)
  if (offenders.length === 0) {
    console.log(`[ps1-bom] OK：${scanned} 个 tracked .ps1 全部守约`
      + '（含非 ASCII 者均带 UTF-8 BOM）')
    return 0
  }
  console.error(`[ps1-bom] FAIL：${offenders.length}/${scanned} 个 .ps1 含非 ASCII 但缺 UTF-8 BOM`)
  console.error('  Windows PowerShell 5.1 会按 ANSI 码页解码它们 —— 轻则中文变问号，')
  console.error('  重则整脚本 tokenize 失败（实测：start-mp-task.ps1 因一行中文 throw 而 ParserError，')
  console.error('  导致所有新的隔离 worktree 都开不出来）。')
  console.error('  修法：给文件**前置** UTF-8 BOM 字节 EF BB BF（不改任何内容）。')
  console.error('  一键补法（保留每行原结尾，不做任何"统一行尾"）：')
  console.error('    node -e "const f=require(\'node:fs\'),p=<文件>;const b=f.readFileSync(p);'
    + 'if(!(b[0]===0xEF&&b[1]===0xBB&&b[2]===0xBF))f.writeFileSync(p,Buffer.concat([Buffer.from([0xEF,0xBB,0xBF]),b]))"')
  offenders.sort((a, b) => b.nonAscii - a.nonAscii)
  for (const o of offenders) console.error(`    nonASCII=${String(o.nonAscii).padStart(6)}  ${o.file}`)
  return 1
}

if (require.main === module) process.exitCode = main()

module.exports = { inspectBuffer, listPs1, check, BOM }
