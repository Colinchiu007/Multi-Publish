// @ts-check
/**
 * path-utils — 统一路径解析
 *
 * 兼容三种场景：
 *   1. 开发模式：monorepo 内 __dirname 相对路径
 *   2. 打包模式：Electron asar + resourcesPath
 *   3. 远程/自定义部署：通过 MULTI_PUBLISH_ROOT 环境变量覆盖
 *
 * 优先级：环境变量 > 打包路径 > 开发相对路径
 */

const path = require('path');
const fs = require('fs');

/**
 * 获取项目根目录
 * @returns {string} 项目根目录绝对路径
 */
function getProjectRoot() {
  // 1. 环境变量优先（远程部署 / 自定义路径）
  if (process.env.MULTI_PUBLISH_ROOT) {
    return process.env.MULTI_PUBLISH_ROOT;
  }

  // 2. 打包模式：从 resourcesPath 向上推导
  if (process.resourcesPath) {
    // resourcesPath = <install-dir>/resources
    // 项目根 = <install-dir>/resources/app.asar.unpacked (或 resources 本身)
    // packages 通常在 resources/packages 下
    const resourcesPackages = path.join(process.resourcesPath, 'packages');
    if (fs.existsSync(resourcesPackages)) {
      return process.resourcesPath;
    }
    // 如果 packages 直接在 resourcesPath 下
    return process.resourcesPath;
  }

  // 3. 开发模式：从 __dirname 向上推导
  // __dirname = <project>/apps/desktop/electron/services
  // 需要 3 级 .. 到达项目根
  return path.resolve(__dirname, '..', '..', '..');
}

/**
 * 获取 remotion-composer 目录
 * @returns {string}
 */
function getComposerDir() {
  const customPath = process.env.REMOTION_COMPOSER_DIR;
  if (customPath) return customPath;

  const root = getProjectRoot();
  const devPath = path.join(root, 'packages', 'remotion-composer');
  if (fs.existsSync(devPath)) return devPath;

  // 打包后可能在 resources/packages 下
  if (process.resourcesPath) {
    const packedPath = path.join(process.resourcesPath, 'packages', 'remotion-composer');
    if (fs.existsSync(packedPath)) return packedPath;
  }

  return devPath;
}

/**
 * 获取 python-backend 目录
 * @returns {string}
 */
function getPythonBackendDir() {
  const customPath = process.env.PYTHON_BACKEND_DIR;
  if (customPath) return customPath;

  // 打包模式
  if (process.resourcesPath) {
    const packedPath = path.join(process.resourcesPath, 'python-backend');
    if (fs.existsSync(packedPath)) return packedPath;
  }

  const root = getProjectRoot();
  return path.join(root, 'packages', 'python-backend', 'src');
}

/**
 * 获取配置文件路径（config/ 目录下的文件）
 * @param {string} filename - 配置文件名（如 'platforms.yaml'）
 * @returns {string}
 */
function getConfigPath(filename) {
  // 打包模式
  if (process.resourcesPath) {
    return path.join(process.resourcesPath, 'config', filename);
  }
  const root = getProjectRoot();
  return path.join(root, 'config', filename);
}

module.exports = {
  getProjectRoot,
  getComposerDir,
  getPythonBackendDir,
  getConfigPath,
};
