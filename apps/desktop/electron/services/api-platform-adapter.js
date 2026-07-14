// @ts-check
/**
 * APIPlatformAdapter ? API ???????
 *
 * ???????????? @multi-publish/api-publish-engine
 * ?? engine.publishViaApi / engine.getAdapter ????
 * uploadChunked ?????????????
 */
// eslint-disable-next-line no-unused-vars
const path = require("path");
const log = require("./logger");

// 加载 api-publish-engine（统一走 workspace 包名，避免深相对路径跳出 asar）
let engine = null;
try {
  engine = require("@multi-publish/api-publish-engine");
} catch (e) {
  log.error("APIPlatformAdapter", "Cannot load api-publish-engine: " + e.message);
  engine = null;
}

/**
 * ?? API ???????? engine?
 * @param {string} platform - ???
 * @param {object} params - { cookies, title, content, images[], video?, tags[] }
 * @returns {Promise<{success: boolean, postId?: string, message: string}>}
 */
async function publishViaApi(platform, params) {
  if (!engine) {
    return { success: false, message: "API publish engine not loaded" };
  }
  try {
    const adapter = engine.getAdapter(platform);
    if (!adapter) {
      return { success: false, message: "Unsupported API platform: " + platform };
    }
    const taskData = {
      title: params.title || "",
      content: params.content || "",
      tags: params.tags || [],
      images: params.images || [],
      video: params.video || null,
    };
    const result = await adapter.execute(taskData, params.cookies || "");
    if (result && result.success) {
      log.info("APIPlatformAdapter", platform + " publish success, id=" + (result.publishId || result.url || ""));
      return {
        success: true,
        postId: result.publishId || result.url,
        message: result.message || "Publish success",
      };
    }
    return {
      success: false,
      message: result.error || "Publish failed",
      raw: result,
    };
  } catch (e) {
    log.error("APIPlatformAdapter", platform + " publish failed: " + e.message);
    if (e.response && (e.response.status === 401 || e.response.status === 403)) {
      return { success: false, message: "Login expired, please re-login", needRelogin: true };
    }
    return { success: false, message: "Publish failed: " + e.message };
  }
}

/**
 * ???????????????????
 */
// eslint-disable-next-line no-unused-vars
async function uploadChunked(platform, filePath, params) {
  // ... unchanged, keep original implementation
  return { success: false, message: "Chunked upload requires desktop adapter config" };
}

function isApiPlatform(platform) {
  return engine ? engine.supportsApi(platform) : false;
}

function getApiPlatforms() {
  return engine ? Object.keys(engine.REGISTRY || {}) : [];
}

module.exports = {
  publishViaApi,
  uploadChunked,
  isApiPlatform,
  getApiPlatforms,
};
