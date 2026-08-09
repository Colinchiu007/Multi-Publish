// @ts-check
/**
 * window-close-policy.js — 窗口关闭行为平台策略（macOS 前瞻）
 *
 * 方案A「关闭窗口 → 隐藏到托盘后台运行」是 Windows/Linux 场景的 UX：
 * Windows 关闭窗口默认结束进程，所以运行任务时必须拦截 close 并隐藏到托盘，
 * 否则后台任务会随窗口关闭而终止。
 *
 * macOS 系统约定不同：关闭窗口不退出应用（app 留在 Dock，任务继续在后台运行），
 * `window-all-closed` 在 darwin 下不退出（见 shutdown.js），Dock 点击经
 * `app.on('activate')` 重建/聚焦窗口（见 main.js）。因此在 macOS 上关闭窗口
 * **不应**隐藏到托盘，让窗口正常关闭即可——避免菜单栏残留不可见窗口，
 * 也避免与 macOS 原生窗口生命周期冲突。
 *
 * 平台决策集中在此文件：未来新增平台（Linux 各桌面环境等）只需扩展本模块，
 * window.js 无需感知平台细节；替换/新增平台策略时只改这里。
 */
'use strict'

/**
 * 窗口关闭时是否应隐藏到托盘继续后台运行。
 * @param {object} [input]
 * @param {string} [input.platform] 目标平台（默认 process.platform，测试可注入）
 * @param {boolean} [input.hasRunningPipeline] 主进程是否存在运行中的编排流水线
 * @param {boolean} [input.trayAvailable] 系统托盘是否可用
 * @returns {boolean}
 */
function shouldHideToTrayOnClose({
  platform = process.platform,
  hasRunningPipeline = false,
  trayAvailable = false,
} = {}) {
  // macOS：关闭窗口不退出应用是系统约定，无需托盘拦截（窗口正常关闭，进程保留在 Dock）。
  if (platform === 'darwin') return false
  // Windows/Linux：运行任务 + 托盘可用 → 隐藏到托盘后台继续；任一缺失照旧关闭/退出。
  return Boolean(hasRunningPipeline && trayAvailable)
}

module.exports = { shouldHideToTrayOnClose }
