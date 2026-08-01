// @ts-check
/**
 * dev-launcher.js — 开发模式 Electron 启动参数
 *
 * 与 scripts/dev.js 解耦，便于单元测试；不启动任何进程。
 */

/**
 * 构造 Electron 开发启动参数（不含 node/electron 可执行文件本身）。
 * @param {{ electronUserDataDir: string, electronCacheDir: string, desktopDir: string, platform?: NodeJS.Platform }} options
 * @returns {string[]}
 */
function buildElectronArgs({ electronUserDataDir, electronCacheDir, desktopDir, platform = process.platform }) {
  // Windows 无可用 GPU 时，进程内 GPU + SwiftShader 会让窗口只合成背景层。
  // 显式禁用 GPU 与 GPU 合成，走软件合成，否则 Electron 窗口显示空白。
  return [
    `--user-data-dir=${electronUserDataDir}`,
    `--disk-cache-dir=${electronCacheDir}`,
    '--no-sandbox',
    '--disable-gpu',
    '--disable-gpu-compositing',
    '--use-gl=angle',
    '--use-angle=swiftshader',
    '--enable-unsafe-swiftshader',
    desktopDir,
  ]
}

module.exports = { buildElectronArgs }
