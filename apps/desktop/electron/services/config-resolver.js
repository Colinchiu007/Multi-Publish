// @ts-check
/**
 * Config Resolver — 配置文件路径解析（兼容 dev 和打包环境）
 *
 * dev: 从项目根目录 config/ 加载
 * 打包后: 从 process.resourcesPath/config/ 加载（extraResources 复制）
 */
const path = require('path')

/**
 * 获取配置文件路径
 * @param {string} filename - 配置文件名（如 'platforms.yaml'）
 * @returns {string} 绝对路径
 */
function getConfigPath (filename) {
  try {
    const { app } = require('electron')
    if (app.isPackaged) {
      return path.join(process.resourcesPath, 'config', filename)
    }
  } catch { /* non-Electron env (tests) */ }
  // dev: 从项目根目录 config/ 加载
  return path.join(__dirname, '..', '..', '..', '..', 'config', filename)
}

module.exports = { getConfigPath }
