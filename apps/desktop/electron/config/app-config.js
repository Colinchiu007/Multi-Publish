// @ts-check
/**
 * 应用统一配置 — host/port 抽取
 * 环境变量优先，其次默认值
 *
 * 集中管理主进程所有内部服务的 host/port，避免硬编码散落各处。
 * 外部本地服务（ComfyUI/Whisper/SD WebUI 等）的默认地址仍由各 adapter 自行管理，
 * 不在此处配置。
 */
const config = {
  devServer: {
    host: process.env.DEV_SERVER_HOST || 'localhost',
    port: parseInt(process.env.DEV_SERVER_PORT || '5174', 10),
  },
  callbackServer: {
    host: process.env.CALLBACK_SERVER_HOST || '127.0.0.1',
    port: parseInt(process.env.CALLBACK_SERVER_PORT || '16521', 10),
  },
  oauthServer: {
    host: process.env.OAUTH_SERVER_HOST || '127.0.0.1',
  },
  pythonBridge: {
    host: process.env.BACKEND_HOST || '127.0.0.1',
    port: parseInt(process.env.BACKEND_PORT || '8299', 10),
  },
  promptBridge: {
    host: process.env.PROMPT_HOST || '127.0.0.1',
    port: parseInt(process.env.PROMPT_PORT || '8013', 10),
  },
  splitterBridge: {
    host: process.env.SPLITTER_HOST || '127.0.0.1',
    port: parseInt(process.env.SPLITTER_PORT || '8002', 10),
  },
}

/**
 * 获取完整 URL
 * @param {{host: string, port: number}} svc
 * @returns {string}
 */
function getUrl(svc) {
  return `http://${svc.host}:${svc.port}`
}

module.exports = { config, getUrl }
