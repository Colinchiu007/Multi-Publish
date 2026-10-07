#!/usr/bin/env node
/**
 * check-text-encoding-integrity.js — 文本文件编码完整性门禁（棘轮）
 *
 * 拦两类事故：
 *
 *   ① **字面 U+FFFD**（`EF BF BD`）——中文在某个环节被解码失败后写回文件。
 *      症状是「文件看着是 UTF-8，但中文变成一串 U+FFFD 替换字符」——git 显示 diff 正常、
 *      字节数合法、编辑器不报错，**只有内容坏了**。
 *
 *      ⚠️ **本文件自身不得出现字面 U+FFFD**（注释里也不许），否则门禁会把自己判成损坏
 *      ——2026-10-07 在 PR #3032 上就真发生过：注释里为举例写了四个替换字符，
 *      CI 直接把自己的门禁判红。**检测器不能包含被检测的模式**；需要构造时用码点。
 *   ② **非 UTF-8 的文本文件**——GBK/Big5/Latin-1 裸字节混进 tracked 文本文件。
 *      症状是「本机看着正常，别人 clone 下来是乱码」，且**不可逆**：
 *      一旦有人「顺手清理控制字节」（#2911 就是），合法中文会被替换成 U+FFFD。
 *
 * ## 为什么需要它（2026-10-07 事故复盘）
 *
 * `01-docs/learnings.md` 在 main 上有 **7212 个字面 U+FFFD、546 行受损**。
 * 溯源结论：
 *
 * | 版本 | 字面 U+FFFD | 非 UTF-8 文本行 |
 * |---|---|---|
 * | `003589a`（2026-07-12） | 0 | **273 行 GBK 裸字节** |
 * | origin/main（2026-10-06） | **7212** | 0 |
 *
 * 原始内容本来就是 GBK 编码的裸字节（`b5 da ce e5` = 「第五」），不是合法 UTF-8。
 * 有人把它当坏字符「清洗」了一遍：非法行数归零了，代价是中文永久变成 U+FFFD。
 * 2026-07-17 首批 3606 个、2026-08-13 再翻倍到 7212。
 *
 * **善意动作 + 错编码方向 = 静默损坏。** 没有门禁，下一个人还会这么干。
 *
 * ## 棘轮语义
 *
 * 与 `check-no-brand-residue.js` / `check-max-lines.js` 同构：
 * 基线在 `scripts/text-encoding-baseline.json`，**清单只能缩小**。
 * 存量问题登记在案不判红（否则无人能提交），**新增即红**。
 * 清干净一条用 `--update-baseline` 收口。
 *
 * ## 用法
 *
 *   node scripts/check-text-encoding-integrity.js                 # 门禁（CI）
 *   node scripts/check-text-encoding-integrity.js --update-baseline
 *
 * 二进制文件（mp4/png/woff…）不在判据域内——它们不是 UTF-8 是正常的。
 */
'use strict';

const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const REPO = path.resolve(__dirname, '..');
const BASELINE_PATH = path.join(__dirname, 'text-encoding-baseline.json');
const FFFD = Buffer.from([0xef, 0xbf, 0xbd]);

/** 判据域：只扫这些扩展名 / 基名的文本文件。二进制不在域内。 */
const TEXT_EXT = new Set([
  '.md', '.markdown', '.txt', '.csv',
  '.js', '.mjs', '.cjs', '.jsx', '.ts', '.tsx', '.mts', '.cts',
  '.vue', '.svelte',
  '.json', '.json5', '.jsonc',
  '.yml', '.yaml',
  '.css', '.scss', '.less', '.html',
  '.sh', '.bash', '.ps1', '.bat', '.cmd',
  '.toml', '.ini', '.cfg', '.conf', '.env',
  '.py', '.rb', '.go', '.rs', '.sql',
  '.xml', '.svg', '.properties', '.gradle',
]);
const TEXT_BASENAMES = new Set([
  '.gitignore', '.editorconfig', '.npmrc', '.nvmrc', 'LICENSE', 'Dockerfile', 'Makefile',
]);
/** 二进制噪声显式排除（即便后缀落在判据域内也不扫） */
const BINARY_EXT = new Set([
  '.mp4', '.mov', '.avi', '.mkv', '.webm', '.mp3', '.wav', '.flac', '.ogg',
  '.png', '.jpg', '.jpeg', '.gif', '.webp', '.ico', '.bmp', '.tiff', '.psd',
  '.woff', '.woff2', '.ttf', '.otf', '.eot',
  '.zip', '.gz', '.tar', '.7z', '.rar', '.pdf',
  '.exe', '.dll', '.so', '.dylib', '.bin', '.wasm', '.node',
  '.mpg', '.mpeg', '.ts', '.m4a', '.aac', '.flv', '.wmv',
]);

function isTextCandidate (file) {
  const base = path.basename(file);
  if (BINARY_EXT.has(path.extname(base).toLowerCase())) return false;
  if (TEXT_BASENAMES.has(base)) return true;
  return TEXT_EXT.has(path.extname(base).toLowerCase());
}

function listTrackedFiles () {
  const out = execFileSync('git', ['ls-files', '-z'], { cwd: REPO, maxBuffer: 64 * 1024 * 1024 })
    .toString('utf8')
    .split('\0')
    .filter(Boolean)
  return out.filter(isTextCandidate)
}

function countFffd (buf) {
  let n = 0
  for (let i = 0; i < buf.length - 2; i++) {
    if (buf[i] === 0xef && buf[i + 1] === 0xbf && buf[i + 2] === 0xbd) n++
  }
  return n
}

function firstOffendingLine (buf) {
  const lines = buf.toString('latin1').split('\n')
  for (let i = 0; i < lines.length; i++) {
    const b = Buffer.from(lines[i], 'latin1')
    if (countFffd(b) > 0) return i + 1
  }
  return 0
}

/** 扫一遍，返回 { file: { fffd, nonUtf8, line } } */
function scan () {
  const findings = {}
  for (const file of listTrackedFiles()) {
    const abs = path.join(REPO, file)
    let buf
    try { buf = fs.readFileSync(abs) } catch { continue }
    if (buf.length === 0) continue

    const fffd = countFffd(buf)
    let nonUtf8 = 0
    let badByteLine = 0
    try {
      new TextDecoder('utf-8', { fatal: true }).decode(buf)
    } catch (err) {
      // 逐行定位，便于给出可操作的位置
      const lines = buf.toString('latin1').split('\n')
      for (let i = 0; i < lines.length; i++) {
        const b = Buffer.from(lines[i], 'latin1')
        try { new TextDecoder('utf-8', { fatal: true }).decode(b) } catch {
          nonUtf8++
          if (!badByteLine) badByteLine = i + 1
        }
      }
    }
    if (fffd > 0 || nonUtf8 > 0) {
      findings[file] = { fffd, nonUtf8, line: fffd > 0 ? firstOffendingLine(buf) : badByteLine }
    }
  }
  return findings
}

function loadBaseline () {
  try {
    const j = JSON.parse(fs.readFileSync(BASELINE_PATH, 'utf8'))
    return j.entries || {}
  } catch {
    return {}
  }
}

function formatFinding (file, info) {
  const parts = []
  if (info.fffd > 0) parts.push(`U+FFFD × ${info.fffd}（首现行 ${info.line}）`)
  if (info.nonUtf8 > 0) parts.push(`非 UTF-8 行 × ${info.nonUtf8}（首现行 ${info.line}）`)
  return `${file}: ${parts.join(' / ')}`
}

function main () {
  const update = process.argv.includes('--update-baseline')
  const findings = scan()
  const baseline = loadBaseline()

  if (update) {
    const payload = {
      $comment: '文本编码完整性基线（scripts/check-text-encoding-integrity.js 比对对象，清单只能缩小）。' +
        '存量登记项均已在 openspec 或 CHANGELOG 记录成因与补救路径；新增即判红。' +
        '收口一条就删对应条目并跑 --update-baseline。根因与事故复盘见 01-docs/learnings.md。',
      $measuredAt: new Date().toISOString().slice(0, 10),
      entries: findings,
    }
    fs.writeFileSync(BASELINE_PATH, JSON.stringify(payload, null, 2) + '\n', 'utf8')
    console.log(`[text-encoding] 基线已更新：登记 ${Object.keys(findings).length} 个文件`)
    return
  }

  // 棘轮有两层：① 出现基线外的新文件 ② 基线内文件的损坏量**增加**。
  // 只判 ① 会漏掉「往已登记文件里继续塞 U+FFFD」——变异实测过这个洞。
  const added = Object.keys(findings).filter(f => !(f in baseline))
  const grown = Object.keys(findings).filter(f => {
    if (!(f in baseline)) return false
    const b = baseline[f] || {}
    const n = findings[f]
    return (n.fffd || 0) > (b.fffd || 0) || (n.nonUtf8 || 0) > (b.nonUtf8 || 0)
  })
  const resolved = Object.keys(baseline).filter(f => !(f in findings))

  console.log(`[text-encoding] 判据域 ${listTrackedFiles().length} 个文本文件；现场问题 ${Object.keys(findings).length} 个；基线登记 ${Object.keys(baseline).length} 个`)

  if (resolved.length) {
    console.log(`  ℹ 基线里 ${resolved.length} 条已修复（不判红，跑 --update-baseline 收口）：`)
    for (const f of resolved) console.log(`    - ${f}`)
  }

  if (grown.length) {
    console.error(`\n❌ 基线内文件的损坏量增加（棘轮只能持平或下降）：`)
    for (const f of grown) {
      const b = baseline[f] || {}
      const n = findings[f]
      const dF = (n.fffd || 0) - (b.fffd || 0)
      const dN = (n.nonUtf8 || 0) - (b.nonUtf8 || 0)
      const fPart = dF > 0 ? ` (+${dF})` : ''
      const nPart = dN > 0 ? ` (+${dN})` : ''
      console.error(`  ▲ ${f}: U+FFFD ${b.fffd || 0}→${n.fffd || 0}${fPart} / 非UTF-8行 ${b.nonUtf8 || 0}→${n.nonUtf8 || 0}${nPart}`)
    }
    process.exit(1)
  }

  if (added.length) {
    console.error(`\n❌ 新增 ${added.length} 处编码损坏（基线外，清单只能缩小）：`)
    for (const f of added) console.error(`  + ${formatFinding(f, findings[f])}`)
    console.error('\n成因判据：')
    console.error('  · 字面 U+FFFD = 中文在某环节解码失败后被写回文件。修法是**补回正确编码**，不是删字符。')
    console.error('  · 非 UTF-8 行 = GBK/Big5 裸字节混进 tracked 文本。**不要「顺手清理控制字节」**——')
    console.error('    #2911 正是这么把 273 行合法中文洗成 7212 个 U+FFFD 的。')
    process.exit(1)
  }

  if (Object.keys(findings).length) {
    console.log(`  存量 ${Object.keys(findings).length} 个文件仍带损坏，均已登记在案（不判红）：`)
    for (const f of Object.keys(findings).sort()) console.log(`    · ${formatFinding(f, findings[f])}`)
  }
  console.log('OK：无新增编码损坏')
}

main()
