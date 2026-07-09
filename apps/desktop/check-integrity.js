/**
 * 构建前完整性自检
 * 在 electron-builder 前运行，检测 FUSE 空字节污染和缺失文件
 *
 * 用法: node check-integrity.js
 * 返回码: 0=通过, 1=失败
 */

const fs = require('fs')
const path = require('path')

const ROOT = path.resolve(__dirname, '..', '..')
const ERRORS = []

// ── 1. Null 字节检查 ──
function checkNullBytes(dir, depth = 0) {
  if (depth > 3) return
  const skip = new Set(['node_modules', '.git', 'dist', 'dist-electron', '__pycache__'])
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true })
    for (const entry of entries) {
      if (skip.has(entry.name)) continue
      const full = path.join(dir, entry.name)
      if (entry.isDirectory()) {
        checkNullBytes(full, depth + 1)
      } else if (entry.name.endsWith('.js') || entry.name.endsWith('.json') || entry.name.endsWith('.yaml')) {
        const stat = fs.statSync(full)
        if (stat.size === 0) {
          ERRORS.push(`[EMPTY] ${path.relative(ROOT, full)}`)
          continue
        }
        const buf = Buffer.alloc(Math.min(stat.size, 8192))
        const fd = fs.openSync(full, 'r')
        fs.readSync(fd, buf, 0, buf.length, Math.max(0, stat.size - buf.length))
        fs.closeSync(fd)
        if (buf.includes(0)) {
          ERRORS.push(`[NULLS] ${path.relative(ROOT, full)} (末尾 ${buf.length} 字节含 null)`)
        }
      }
    }
  } catch (e) {
    ERRORS.push(`[READ_ERR] ${path.relative(ROOT, dir)}: ${e.message}`)
  }
}

// ── 2. 关键文件存在性 ──
const CRITICAL_FILES = [
  'packages/rpa-engine/src/index.js',
  'packages/rpa-engine/src/publishers/registry.js',
  'packages/shared-utils/src/index.js',
  'packages/shared-utils/src/platform-config.js',
  'apps/desktop/electron/main.js',
  'apps/desktop/electron/services/publisher-router.js',
  'apps/desktop/electron/services/store.js',
  'apps/desktop/electron/services/rpa-view-manager.js',
  'config/platforms.yaml',
]

function checkFilesExist() {
  for (const cf of CRITICAL_FILES) {
    const full = path.join(ROOT, cf)
    if (!fs.existsSync(full)) {
      ERRORS.push(`[MISSING] ${cf}`)
    } else {
      const stat = fs.statSync(full)
      if (stat.size === 0) {
        ERRORS.push(`[EMPTY] ${cf}`)
      }
    }
  }
}

// ── 3. Workspace 软链 ──
function checkSymlinks() {
  const nm = path.join(ROOT, 'node_modules', '@multi-publish')
  if (!fs.existsSync(nm)) {
    ERRORS.push('[SYMLINK] node_modules/@multi-publish 不存在')
    return
  }
  for (const pkg of fs.readdirSync(nm)) {
    const pkgPath = path.join(nm, pkg)
    const stat = fs.lstatSync(pkgPath)
    if (!stat.isSymbolicLink()) {
      ERRORS.push(`[SYMLINK] @multi-publish/${pkg} 不是软链（可能被平铺安装）`)
      continue
    }
    const target = fs.readlinkSync(pkgPath)
    const resolved = path.resolve(nm, target)
    if (!fs.existsSync(resolved)) {
      ERRORS.push(`[SYMLINK] @multi-publish/${pkg} → ${target} (目标不存在)`)
    }
  }
}

// ── 4. package.json files 配置 ──
function checkPackageConfig() {
  const pkgPath = path.join(ROOT, 'apps', 'desktop', 'package.json')
  if (!fs.existsSync(pkgPath)) {
    ERRORS.push('[CONFIG] apps/desktop/package.json 缺失')
    return
  }
  try {
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'))
    const files = pkg.build?.files
    if (!files || !Array.isArray(files)) {
      ERRORS.push('[CONFIG] package.json 缺少 build.files')
      return
    }
    if (!files.some(f => f.includes('electron/**'))) {
      ERRORS.push('[CONFIG] build.files 缺少 electron/**/*')
    }
    // v2.3.44: config 从 build.files 移到 build.extraResources
    const extraResources = pkg.build?.extraResources
    if (!extraResources || !Array.isArray(extraResources) || !extraResources.some(e => e && e.to === 'config')) {
      ERRORS.push('[CONFIG] build.extraResources 缺少 config 配置')
    }
  } catch (e) {
    ERRORS.push(`[CONFIG] package.json 解析失败: ${e.message}`)
  }
}

console.log('=== Multi-Publish 构建前自检 ===\n')

checkNullBytes(ROOT)
checkFilesExist()
checkSymlinks()
checkPackageConfig()

if (ERRORS.length === 0) {
  console.log('✓ 全部通过，可以构建')
  process.exit(0)
} else {
  console.log(`\n发现 ${ERRORS.length} 个问题:`)
  for (const err of ERRORS) {
    console.log(`  ${err}`)
  }
  console.log('\n先运行 git reset --hard origin/main 修复损坏，再重新构建')
  process.exit(1)
}
