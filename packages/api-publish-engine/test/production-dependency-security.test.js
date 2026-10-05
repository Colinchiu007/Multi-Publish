const assert = require('assert')
const fs = require('fs')
const path = require('path')
const test = require('node:test')

const ROOT = path.resolve(__dirname, '../../..')
// 12 条 axios 公告（GHSA-3pq3/542g/9fr6/c29m/mghh/vh66/x97p 等）的修复版本下限（2026-10-01 实测）
const AXIOS_FLOOR = '1.20.0'
// npm 独立锁域：ops-center/frontend 不在 pnpm workspace（pnpm-workspace.yaml 的 packages 只有 apps/* 与 packages/*），
// 它用自己的 package-lock.json，所以它的"真实解析版本"只能从那把锁里读，不能 require.resolve。
const NPM_LOCKED_CONSUMERS = ['ops-center/frontend']
// 扫描退化时必须立刻变红的已知消费方清单（只能扩大，不能缩小）
const MUST_BE_COVERED = ['apps/desktop', 'packages/ai-writer', 'packages/api-publish-engine', 'ops-center/frontend']

function parseVersion(value) {
  const match = /^(?:\^|~)?(\d+)\.(\d+)\.(\d+)$/.exec(String(value).trim())
  assert(match, `无法解析稳定版本：${value}`)
  return match.slice(1).map(Number)
}

function isAtLeast(actual, minimum) {
  const current = parseVersion(actual)
  const expected = parseVersion(minimum)
  for (let index = 0; index < expected.length; index += 1) {
    if (current[index] > expected[index]) return true
    if (current[index] < expected[index]) return false
  }
  return true
}

function readJson(absPath) {
  return JSON.parse(fs.readFileSync(absPath, 'utf8'))
}

function listWorkspaceAxiosConsumers() {
  const consumers = []
  for (const group of ['apps', 'packages']) {
    const base = path.join(ROOT, group)
    assert(fs.existsSync(base), `扫描域不完整：缺少 ${group}/ 目录`)
    for (const name of fs.readdirSync(base)) {
      const manifest = path.join(base, name, 'package.json')
      if (!fs.existsSync(manifest)) continue
      const pkg = readJson(manifest)
      if (pkg.dependencies && pkg.dependencies.axios) consumers.push(`${group}/${name}`)
    }
  }
  return consumers
}

test('生产依赖不允许解析到存在高危公告的 Axios 版本', () => {
  const apiPackage = readJson(path.resolve(__dirname, '..', 'package.json'))
  // pnpm-lock.yaml 为唯一锁文件（2026-08-13 由 package-lock.json 迁移）
  const lockfile = fs.readFileSync(path.join(ROOT, 'pnpm-lock.yaml'), 'utf8')
  const axiosMatches = [...lockfile.matchAll(/axios@(\d+\.\d+\.\d+)/g)].map((m) => m[1])

  assert(isAtLeast(apiPackage.dependencies.axios, AXIOS_FLOOR))
  assert(axiosMatches.length > 0, 'pnpm-lock.yaml 未找到 axios 条目')
  // 断言锁文件中所有 axios 版本均 >= 地板，避免首个字典序匹配掩盖低危版本。
  // 整表地板抬得到 1.20.0 的前提是 pnpm-workspace.yaml 的 axios override：只升 workspace 包的区间抬不动
  // 这条断言，因为 dev 域 nx@20.8.4 自带一份 axios（实测 1.18.1），而门禁扫描面 `pnpm audit --prod` 看不见它。
  for (const version of axiosMatches) {
    assert(isAtLeast(version, AXIOS_FLOOR), `pnpm-lock.yaml 存在低危 axios 版本 ${version}`)
  }
  // override 必须还在，否则下一个人删掉它时这条锁会静默退回"只看 prod"。
  const workspace = fs.readFileSync(path.join(ROOT, 'pnpm-workspace.yaml'), 'utf8')
  const overrideMatch = /^\s+axios:\s*'([^']+)'\s*$/m.exec(workspace)
  assert(
    overrideMatch,
    'pnpm-workspace.yaml 缺 axios override：门禁只扫 --prod，dev 域副本（nx）会重新漂回低危版本',
  )
  const overrideRange = overrideMatch[1]
  // 无上界的写法（>=x.y.z）会允许下一次非 --frozen-lockfile 的 install 把 axios 静默 resolve 到新大版本。
  assert(
    /^\^?\d/.test(overrideRange),
    `axios override 区间 "${overrideRange}" 没有上界：改成带 ^ 的写法，或同步收紧 undici/fast-uri 两条`,
  )
  assert(isAtLeast(overrideRange, AXIOS_FLOOR), `axios override "${overrideRange}" 低于修复版本 ${AXIOS_FLOOR}`)
})

// 消费方清单由扫描得出，不写死：新增一个直接依赖 axios 的 workspace 包会自动进入判据，
// 而 MUST_BE_COVERED 保证"扫描退化成空集"是红的而不是绿的。
test('每一个 axios 直接消费方的声明区间与实际解析版本都必须 >= 修复版本', () => {
  const workspaceConsumers = listWorkspaceAxiosConsumers()
  assert(
    workspaceConsumers.length >= 3,
    `扫描到的 axios 直接消费方只有 ${workspaceConsumers.length} 个，扫描域疑似失效`,
  )
  const all = [...workspaceConsumers, ...NPM_LOCKED_CONSUMERS]
  for (const rel of MUST_BE_COVERED) {
    assert(all.includes(rel), `消费方清单漏掉了 ${rel}（判据覆盖面缩小）`)
  }

  for (const rel of workspaceConsumers) {
    const pkg = readJson(path.join(ROOT, rel, 'package.json'))
    assert(
      isAtLeast(pkg.dependencies.axios, AXIOS_FLOOR),
      `${rel} 声明的 axios ${pkg.dependencies.axios} 低于修复版本 ${AXIOS_FLOOR}`,
    )
    // 真解析而非只读文本：从消费方目录解析它实际会 require 到的 axios，防"声明升了但被别处旧版覆盖"。
    // 注意 node-linker=hoisted 下这几个包解析到同一份根 node_modules/axios，这条锁的是"覆盖"不是"每包一份"。
    const resolvedPath = require.resolve('axios/package.json', { paths: [path.join(ROOT, rel)] })
    const resolved = readJson(resolvedPath).version
    assert(
      isAtLeast(resolved, AXIOS_FLOOR),
      `${rel} 实际解析到的 axios 是 ${resolved}，低于 ${AXIOS_FLOOR}（${resolvedPath}）`,
    )
  }

  for (const rel of NPM_LOCKED_CONSUMERS) {
    const pkg = readJson(path.join(ROOT, rel, 'package.json'))
    assert(
      isAtLeast(pkg.dependencies.axios, AXIOS_FLOOR),
      `${rel} 声明的 axios ${pkg.dependencies.axios} 低于修复版本 ${AXIOS_FLOOR}`,
    )
    const lock = readJson(path.join(ROOT, rel, 'package-lock.json'))
    const entry = lock.packages && lock.packages['node_modules/axios']
    assert(entry, `${rel} 的 package-lock.json 缺少 node_modules/axios 条目（npm 布局变更，需同步本判据）`)
    assert(
      isAtLeast(entry.version, AXIOS_FLOOR),
      `${rel} 锁里的 axios 是 ${entry.version}，低于 ${AXIOS_FLOOR}（npm 域不受 pnpm override 约束）`,
    )
  }
})
