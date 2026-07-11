// @ts-check
/**
 * Config Resolver — 配置文件路径解析（兼容 dev 和打包环境）
 *
 * dev: 从项目根目录 config/ 加载
 * 打包后: 从 process.resourcesPath/config/ 加载（extraResources 复制）
 * 远程部署: 通过 MULTI_PUBLISH_ROOT 环境变量覆盖
 */
const { getConfigPath } = require('./path-utils')

module.exports = { getConfigPath }
