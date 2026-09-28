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
 * 端口空间（同 span=2800，各服务占互不重叠的带）：
 *   vite     5174-7973
 *   cdp      9222-12021
 *   backend 18300-21099   prompt   21100-23899   splitter 23900-26699
 *   aligner 26700-29499   callback 29500-32299
 * bridge 带同样按 worktree 派生（#2459）：以前只有 vite/cdp 派生、bridge 固定共用，
 * 于是并发实例的 python 后端必然撞 8299，而健康检查会被**别人的**后端应答成就绪。
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

/**
 * bridge 侧（Electron 主进程内部服务）端口带 —— #2459。
 *
 * 旧状态：这里只管 vite/cdp，注释还把 8002/8004/8013/8299 当作"vite 必须避开"的固定区，
 * 于是**所有 worktree 共用同一组 bridge 端口**。并发会话里第二个 dev 实例的 python 后端
 * 必然 bind 失败（uvicorn `[Errno 10048]`，实测反复重启），而主进程的健康检查只是
 * 对 `127.0.0.1:8299` 发一次 HTTP —— 那会被**第一个实例的后端**应答，
 * 于是启动器输出 `MAIN_BACKEND_LISTENING` / `START_CONTRACT_OK` 假报就绪，
 * 本实例的请求实际路由到别人的数据目录。
 *
 * 现在每个服务占一条独立带（宽 PORT_SPAN），同一 worktree 共享同一哈希偏移 ⇒
 * 五个端口整体可复现、彼此间距恒定，且与 vite(5174-7973)/cdp(9222-12021) 不重叠。
 * 全部落在 18300-32299：高于既有静态端口，低于 Windows 动态端口起始（49152）。
 */
const BRIDGE_PORT_BANDS = {
  backend: { env: 'BACKEND_PORT', base: 18300, fallback: 8299 },
  prompt: { env: 'PROMPT_PORT', base: 21100, fallback: 8013 },
  splitter: { env: 'SPLITTER_PORT', base: 23900, fallback: 8002 },
  aligner: { env: 'ALIGNER_PORT', base: 26700, fallback: 8004 },
  callback: { env: 'CALLBACK_SERVER_PORT', base: 29500, fallback: 16521 },
}

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
 * 解析端口环境变量（显式覆盖用）：必须为 1024-65535 的整数，否则 throw。
 *
 * 旧实现的守卫写成 `String(n) !== String(parseInt(raw, 10))`，而 `n` 就是
 * `parseInt(raw, 10)` —— 拿自己和自己比，恒为 false。后果是 `'8299.5'`、`'8299abc'`
 * 被静默接受成 8299。这条校验现在承载的是**撞车时唯一的逃生阀**（显式设 BACKEND_PORT
 * 绕开派生），所以它必须真的拒绝垃圾，否则用户以为换成了 8299.5、实际起了 8299。
 * @param {string} raw
 * @returns {number}
 */
function parsePort(raw) {
  const s = String(raw).trim()
  const n = Number(s)
  if (!/^\d+$/.test(s) || !Number.isInteger(n) || n < 1024 || n > 65535) {
    throw new Error('非法端口覆盖值: ' + raw + '（需要 1024-65535 的整数）')
  }
  return n
}

/**
 * 解析开发端口对 + bridge 端口组。
 * @param {string} worktreePath 仓库/工作区根目录绝对路径
 * @param {NodeJS.ProcessEnv} [env]
 * @returns {{ vite: number, cdp: number, backend: number, prompt: number,
 *   splitter: number, aligner: number, callback: number, derived: boolean }}
 */
function resolveDevPorts(worktreePath, env = process.env) {
  const root = (env && env.MP_WORKTREES_ROOT) || DEFAULT_WORKTREES_ROOT
  const dirKey = normalizeKey(worktreePath)
  const rootKey = normalizeKey(root)
  const isWorktree = dirKey.startsWith(rootKey + path.sep)

  let vite = DEFAULT_VITE_PORT
  let cdp = DEFAULT_CDP_PORT
  let derived = false
  const h = fnv1a(dirKey)
  if (isWorktree) {
    vite = VITE_PORT_BASE + (h % PORT_SPAN)
    cdp = CDP_PORT_BASE + (h % PORT_SPAN)
    derived = true
  }

  if (env && env.MP_VITE_PORT) { vite = parsePort(env.MP_VITE_PORT); derived = true }
  if (env && env.MP_CDP_PORT) { cdp = parsePort(env.MP_CDP_PORT); derived = true }

  // bridge 端口：显式的原生环境变量（app-config.js 认的那批）优先于派生。
  // 顺序反了就会出问题 —— dev.js 会把派生值写回 env，若它无条件覆写 BACKEND_PORT，
  // 用户手工指定的端口就被堵死，而那正是排障时绕开撞车的唯一逃生阀。
  const bridge = {}
  for (const [name, band] of Object.entries(BRIDGE_PORT_BANDS)) {
    if (env && env[band.env]) {
      bridge[name] = parsePort(env[band.env])
      derived = true
    } else if (isWorktree) {
      bridge[name] = band.base + (h % PORT_SPAN)
    } else {
      bridge[name] = band.fallback
    }
  }

  return { vite, cdp, ...bridge, derived }
}

module.exports = {
  resolveDevPorts,
  parsePort,
  DEFAULT_VITE_PORT,
  DEFAULT_CDP_PORT,
  DEFAULT_WORKTREES_ROOT,
  BRIDGE_PORT_BANDS,
  PORT_SPAN,
}
