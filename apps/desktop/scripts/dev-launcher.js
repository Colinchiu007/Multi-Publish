// @ts-check
/**
 * dev-launcher.js — 开发模式 Electron 启动参数
 *
 * 与 scripts/dev.js 解耦，便于单元测试；不启动任何进程。
 */

/**
 * 构造 Electron 开发启动参数（不含 node/electron 可执行文件本身）。
 * @param {{ electronUserDataDir: string, electronCacheDir: string, desktopDir: string, cdpPort?: number, platform?: NodeJS.Platform, allowAllOrigins?: boolean }} options
 * @returns {string[]}
 */
function buildElectronArgs({ electronUserDataDir, electronCacheDir, desktopDir, cdpPort = 9222, platform = process.platform, allowAllOrigins = false, noSandbox = true, softwareGpu = true }) {
  // Windows 无可用 GPU 时，进程内 GPU + SwiftShader 会让窗口只合成背景层。
  // 显式禁用 GPU 与 GPU 合成，走软件合成，否则 Electron 窗口显示空白。
  const switches = [
    `--user-data-dir=${electronUserDataDir}`,
    `--disk-cache-dir=${electronCacheDir}`,
    `--remote-debugging-port=${cdpPort}`,
    '--disable-gpu',
    '--disable-gpu-compositing',
  ]
  // 2026-10-06：--no-sandbox 与 swiftshader 软件光栅化组合下，登录检测拉起的隐藏
  // BrowserWindow 会触发原生渲染崩溃（主进程 exit 0xFFFF7003 / 0xC0000005，无 minidump）。
  // 两者各自保留为可关旋钮，默认值不变（有 GPU 的机器仍按原样走软件合成）。
  if (noSandbox) switches.push('--no-sandbox')
  if (softwareGpu) {
    switches.push('--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader')
  }
  // 外部 CDP 客户端（诊断脚本 / agent）握手时带 Origin 头，Chromium 的 origin 校验会直接 403。
  // 只在显式开启时放行，且必须排在 desktopDir 之前 —— desktopDir 是应用路径，永远保持末位。
  if (allowAllOrigins === true) switches.push('--remote-allow-origins=*')
  return [...switches, desktopDir]
}

/**
 * 开发模式默认 userData 目录（固定 D 盘，避免 C 盘空间占用）。
 * 登录态（identity-session.json）与模型 key（multi-publish.db）都按 userData 隔离，
 * 固定默认目录可杜绝「随机临时目录 → 数据像丢失」的启动问题。
 */
const DEFAULT_USER_DATA_DIR = 'D:\\tmp\\Multi-Publish-debug-profile'

/**
 * 解析开发模式 userData 目录。
 * 显式设置 ELECTRON_USER_DATA_DIR 时优先（start-desktop.ps1 指定 profile / 并发会话隔离），
 * 否则使用固定默认 profile。
 * @param {NodeJS.ProcessEnv} [env]
 * @returns {string}
 */
function resolveUserDataDir(env = process.env) {
  const configured = typeof env.ELECTRON_USER_DATA_DIR === 'string' ? env.ELECTRON_USER_DATA_DIR.trim() : ''
  return configured || DEFAULT_USER_DATA_DIR
}

/**
 * 解析「外部 CDP 放行任意 Origin」开关，默认关。
 * 判据严格：trim 后必须恰好为 '1'。
 * trim 是因为 `cmd /c set "VAR=1 "` 会把尾随空格折进值里（本仓在 ELECTRON_USER_DATA_DIR
 * 上真踩过），宽松解析会让开关静默失效；不接受 'true' / 数字 1，是为了让「默认关」这条
 * 安全前提不能被随手绕过。
 * @param {NodeJS.ProcessEnv} [env]
 * @returns {boolean}
 */
function resolveAllowAllOrigins(env = process.env) {
  const raw = typeof env.MP_CDP_ALLOW_ALL_ORIGINS === 'string' ? env.MP_CDP_ALLOW_ALL_ORIGINS.trim() : ''
  return raw === '1'
}

/**
 * 解析「关闭 sandbox」开关，默认开启 --no-sandbox（保持既有 dev 行为）。
 * 判据与 resolveAllowAllOrigins 同构：trim 后接受 '0' 视为关闭，其余一律走默认。
 * @param {NodeJS.ProcessEnv} [env]
 * @returns {boolean}
 */
function resolveNoSandbox(env = process.env) {
  const raw = typeof env.MP_E2E_NO_SANDBOX === 'string' ? env.MP_E2E_NO_SANDBOX.trim() : ''
  return raw !== '0'
}

/**
 * 解析「关闭 swiftshader 软件光栅化」开关，默认开启（保持既有 dev 行为）。
 * @param {NodeJS.ProcessEnv} [env]
 * @returns {boolean}
 */
function resolveSoftwareGpu(env = process.env) {
  const raw = typeof env.MP_E2E_SOFTWARE_GPU === 'string' ? env.MP_E2E_SOFTWARE_GPU.trim() : ''
  return raw !== '0'
}

module.exports = { buildElectronArgs, resolveUserDataDir, resolveAllowAllOrigins, resolveNoSandbox, resolveSoftwareGpu, DEFAULT_USER_DATA_DIR }
