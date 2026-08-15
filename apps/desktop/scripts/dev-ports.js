// @ts-check
/**
 * dev-ports.js — worktree 独立端口解析（唯一事实源）
 *
 * 背景：dev.js / start-desktop.ps1 / start-desktop-identity.js 原先各自硬编码
 * vite=5174、CDP=9222，多个并发 worktree 同时启动时会互相抢占同一端口，
 * 造成「启动空白 / 加载到别人的旧 Vite / 并发互杀」。这里把端口决策收敛为
 * 一个纯函数模块：
 *
 * - 默认（主仓库、CI、其他目录）→ vite 5174 / CDP 9222，行为与历史一致；
 * - mp-worktrees 目录下的 worktree → 按规范化绝对路径做稳定哈希派生，
 *   每个 worktree 得到独立且可复现的端口对，互不抢占；
 * - 显式环境变量 MP_VITE_PORT / MP_CDP_PORT 可单独覆盖（应急/测试），
 *   未覆盖的另一个端口仍按路径派生，不会回落共享默认端口。
 *
 * 端口空间（双端口同 span=2800，避免与既有服务端口重叠）：
 *   vite 5174-7973（上限低于 8002/8004/8013/8299 等 bridge 端口）
 *   cdp  9222-12021
 * 两个不同 worktree 理论上仍可能哈希撞车（每对约 1/2800）；此时
 * start-desktop.ps1 的端口归属检查会 fail-closed 报错（提示用 MP_VITE_PORT
 * 显式指定），而不是静默连到别人的 Vite——抢占被彻底阻断。
 */
'use strict'
const path = require('path')

const DEFAULT_VITE_PORT = 5174
const DEFAULT_CDP_PORT = 9222

// 本地并发 worktree 目录：只有该目录下的路径才触发端口派生（可用 env 覆盖）
const DEFAULT_WORKTREES_ROOT = 'D:/Data/projects/mp-worktrees'

const VITE_PORT_BASE = 5174
const CDP_PORT_BASE = 9222
const PORT_SPAN = 2800

/** FNV-1a 32-bit —— 纯实现、无依赖、跨 Node 版本稳定 */
function fnv1a(str) {
  let h = 0x811c9dc5
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return h >>> 0
}

/** Windows 路径大小写不敏感：统一 resolve + 小写，保证跨 shell 一致 */
function normalizeKey(p) {
  return path.resolve(p).toLowerCase()
}

/**
 * 解析端口环境变量（显式覆盖用）：必须为 1-65535 的整数，否则 throw。
 * @param {string} raw
 * @returns {number}
 */
function parsePort(raw) {
  const n = parseInt(raw, 10)
  if (!Number.isInteger(n) || String(n) !== String(parseInt(raw, 10)) || n < 1024 || n > 65535) {
    throw new Error('非法端口覆盖值: ' + raw + '（需要 1024-65535 的整数）')
  }
  return n
}

/**
 * 解析开发端口对。
 * @param {string} worktreePath 仓库/工作区根目录绝对路径
 * @param {NodeJS.ProcessEnv} [env]
 * @returns {{ vite: number, cdp: number, derived: boolean }}
 */
function resolveDevPorts(worktreePath, env = process.env) {
  const root = (env && env.MP_WORKTREES_ROOT) || DEFAULT_WORKTREES_ROOT
  const dirKey = normalizeKey(worktreePath)
  const rootKey = normalizeKey(root)
  const isWorktree = dirKey.startsWith(rootKey + path.sep)

  let vite = DEFAULT_VITE_PORT
  let cdp = DEFAULT_CDP_PORT
  let derived = false
  if (isWorktree) {
    const h = fnv1a(dirKey)
    vite = VITE_PORT_BASE + (h % PORT_SPAN)
    cdp = CDP_PORT_BASE + (h % PORT_SPAN)
    derived = true
  }

  if (env && env.MP_VITE_PORT) { vite = parsePort(env.MP_VITE_PORT); derived = true }
  if (env && env.MP_CDP_PORT) { cdp = parsePort(env.MP_CDP_PORT); derived = true }

  return { vite, cdp, derived }
}

module.exports = {
  resolveDevPorts,
  parsePort,
  DEFAULT_VITE_PORT,
  DEFAULT_CDP_PORT,
  DEFAULT_WORKTREES_ROOT,
}
