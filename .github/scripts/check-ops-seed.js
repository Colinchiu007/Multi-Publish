#!/usr/bin/env node
/**
 * check-ops-seed.js —「打包内置种子数据」门禁（ops-center-resilience，design.md §4.4）
 *
 * 为什么需要它：L3 种子是三层降级里**最差情况**的兜底（断网 + 本地无快照时仍能用发版那一刻的
 * 运营配置）。它随安装包发给用户，因此必须有一道**独立于运行时**的闸门在 CI 里反复证明：
 *
 *  1. 13 个数据块齐全 —— 缺块 = 该功能在最差情况下静默退回代码默认值
 *  2. 每块类型与运行时一致 —— 结构坏掉的种子照样能被 JSON.parse 接受，只在用户断网时才炸
 *  3. 体积 ≤ 1MB —— 对齐运行时 MAX_CATALOG_BYTES
 *  4. UTF-8 无 BOM / 无 U+FFFD —— BOM 会让 JSON.parse 直接失败；U+FFFD 说明文件已被坏编码污染
 *  5. _meta.config_hash 与实算一致 —— 不一致说明种子被手改过而没重算指纹，ACK 判据会错
 *  6. **content_policy.word_list 必须已剔除** —— 安全硬约束：敏感词库进安装包 = 可被逆向提取，
 *     把封禁词库打进客户端等于公开词库
 *  7. _meta.exported_at 距今 > 90 天 —— **只警告不阻塞**（发版忘更新种子不该卡住构建）
 *
 * 反向偏置（与本仓 check-asar-test-files.js / check-ps1-bom.js 同口径）：
 *  - 种子文件读不到 / 解析失败 ⇒ 抛错退出，**绝不返回"通过"**；
 *  - 接线锁：只跑脚本不挂进 workflow 等于没门禁，本文件自带一条判据核对 quality-gate.yml 正文。
 *
 * 用法：
 *   node .github/scripts/check-ops-seed.js                 # 校验默认种子
 *   node .github/scripts/check-ops-seed.js --file=<path>   # 校验指定种子
 *   node .github/scripts/check-ops-seed.js --repo=<dir>    # 接线锁用：核对 workflow 接线
 */
'use strict'

const fs = require('node:fs')
const path = require('node:path')

// 校验判据的单一实现：与客户端运行时、导出脚本共用同一份代码，
// 三处各写一份必然漂移（而漂移的表现是「CI 说合格、用户断网时才炸」）。
const {
  validateSeedPayload,
} = require(path.join(path.resolve(__dirname, '..', '..'), 'apps', 'desktop', 'electron', 'services', 'ops-runtime-snapshot'))

const SEED_REL = path.join('apps', 'desktop', 'resources', 'ops-seed', 'runtime-bootstrap.json')

/** 读种子文件并把「文件层」证据（BOM / 体积 / 坏编码）一并交给校验器。fail closed：读不到即抛错。 */
function loadSeed (seedPath) {
  let buf
  try {
    buf = fs.readFileSync(seedPath)
  } catch (e) {
    throw new Error('读取种子文件失败：' + seedPath + '（读不到即无法证明，拒绝判定为通过）：' + (e.code || e.message))
  }
  // BOM 必须单独判：JSON.parse('\uFEFF{...}') 直接抛 SyntaxError，
  // 但我们希望报出「含 BOM」这个可操作的原因，而不是笼统的解析失败。
  const hasBom = buf.length >= 3 && buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf
  const text = buf.toString('utf8')
  let raw
  try {
    raw = JSON.parse(text)
  } catch (e) {
    throw new Error('种子文件不是合法 JSON：' + seedPath + '（含 BOM 或语法错误）— ' + e.message)
  }
  return {
    raw,
    bytes: buf.length,
    hasBom,
    hasReplacementChar: text.includes('�'),
  }
}

/**
 * 接线锁：本门禁必须真的挂在 quality-gate.yml 里跑。
 * 只测不接 = 恒绿门禁（AGENTS.md「看起来在守、实际恒绿」的装饰性链路教训）。
 * @param {string} qualityGateText quality-gate.yml 原文
 */
function checkWiring (qualityGateText) {
  const missing = []
  const text = String(qualityGateText || '')
  if (!text) throw new Error('quality-gate.yml 正文为空 —— 解析退化，拒绝判定为已接线')
  if (!text.includes('node --test .github/scripts/check-ops-seed.test.js')) {
    missing.push('quality-gate.yml 缺少本门禁的夹具回归点名（node --test .github/scripts/check-ops-seed.test.js）')
  }
  // 按可执行正文匹配：注释里提一句不算接线
  if (!/^[^\n#]*node \.github\/scripts\/check-ops-seed\.js[^\n]*$/m.test(text)) {
    missing.push('quality-gate.yml 缺少本门禁的执行行（node .github/scripts/check-ops-seed.js，注释里的不算）')
  }
  return { ok: missing.length === 0, missing }
}

function readQualityGate (repoRoot) {
  const p = path.join(repoRoot, '.github', 'workflows', 'quality-gate.yml')
  if (!fs.existsSync(p)) throw new Error('workflow 文件不存在：' + p + '（读不到即无法证明接线，拒绝通过）')
  return fs.readFileSync(p, 'utf8')
}

function parseCliArgs (argv) {
  const out = { repo: path.resolve(__dirname, '..', '..'), file: '' }
  for (const token of argv) {
    const m = /^--([a-z-]+)=(.*)$/.exec(String(token))
    if (!m) throw new Error('不接受位置参数：' + token + '（只认 --file=<path> / --repo=<dir>）')
    if (m[1] === 'file') out.file = path.resolve(m[2])
    else if (m[1] === 'repo') out.repo = path.resolve(m[2])
    else throw new Error('未知开关：' + token)
  }
  if (!out.file) out.file = path.join(out.repo, SEED_REL)
  return out
}

function main () {
  const args = parseCliArgs(process.argv.slice(2))
  const wiring = checkWiring(readQualityGate(args.repo))
  if (!wiring.ok) {
    console.error('接线失败（门禁没真跑起来 = 没有门禁）：')
    for (const m of wiring.missing) console.error('  [FAIL] ' + m)
    process.exit(1)
  }

  const { raw, bytes, hasBom, hasReplacementChar } = loadSeed(args.file)
  const result = validateSeedPayload(raw, {
    bytes, hasBom, hasReplacementChar, file: args.file,
  })

  for (const w of result.warnings) console.warn('  [WARN] ' + w)
  if (result.errors.length > 0) {
    console.error('种子校验失败：')
    for (const e of result.errors) console.error('  [FAIL] ' + e)
    process.exit(1)
  }
  const meta = (raw && raw._meta) || {}
  console.log('种子校验通过：' + args.file)
  console.log('  config_version = ' + meta.config_version)
  console.log('  config_hash    = ' + meta.config_hash)
  console.log('  exported_at    = ' + meta.exported_at)
  if (result.warnings.length) console.log('  （有警告，不阻塞构建）')
}

module.exports = { checkWiring, loadSeed, parseCliArgs, SEED_REL }

if (require.main === module) {
  try {
    main()
  } catch (e) {
    console.error('种子校验失败：' + ((e && e.message) || e))
    process.exit(1)
  }
}